import http from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { readDb, writeDb } from './db.js';

const PORT = Number(process.env.PORT || 4000);
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hashed = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = String(storedHash).split(':');
  if (!salt || !key) return false;
  const hashBuffer = Buffer.from(key, 'hex');
  const supplied = scryptSync(password, salt, 64);
  if (hashBuffer.length !== supplied.length) return false;
  return timingSafeEqual(hashBuffer, supplied);
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function requireFields(payload, fields) {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      return `Field "${field}" is required.`;
    }
  }
  return null;
}

function withAuth(req, db) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return { error: 'Missing bearer token.' };
  }

  const session = db.sessions.find((s) => s.token === token);
  if (!session) {
    return { error: 'Invalid session.' };
  }

  if (Date.now() > session.expiresAt) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    return { error: 'Session expired.' };
  }

  const user = db.users.find((u) => u.id === session.userId);
  if (!user) {
    return { error: 'User not found.' };
  }

  return { token, user };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
}

function makeId(prefix) {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function bookingAmount(car, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const days = Math.max(1, diff);
  return days * car.pricePerDay;
}

function revenueByMonth(transactions) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = new Map(months.map((m) => [m, 0]));
  for (const trx of transactions) {
    if (trx.type !== 'Income') continue;
    const d = new Date(trx.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = months[d.getMonth()];
    map.set(key, (map.get(key) || 0) + Number(trx.amount || 0));
  }
  return months.map((m) => ({ name: m, revenue: map.get(m) || 0 }));
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    json(res, 400, { error: 'Invalid request.' });
    return;
  }

  if (req.method === 'OPTIONS') {
    json(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    const db = await readDb();

    if (pathname === '/api/health' && req.method === 'GET') {
      json(res, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const validationError = requireFields(body, ['email', 'password']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }

      const user = db.users.find((u) => u.email.toLowerCase() === String(body.email).toLowerCase());
      if (!user) {
        json(res, 401, { error: 'Invalid email or password.' });
        return;
      }

      let validPassword = false;
      if (user.passwordHash) {
        validPassword = verifyPassword(body.password, user.passwordHash);
      } else if (user.password) {
        validPassword = user.password === body.password;
        if (validPassword) {
          user.passwordHash = hashPassword(user.password);
          delete user.password;
        }
      }

      if (!validPassword) {
        json(res, 401, { error: 'Invalid email or password.' });
        return;
      }

      const token = randomUUID();
      const expiresAt = Date.now() + SESSION_TTL_MS;
      db.sessions.push({ token, userId: user.id, expiresAt });
      await writeDb(db);
      json(res, 200, { token, user: sanitizeUser(user), expiresAt });
      return;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = withAuth(req, db);
      if (auth.error) {
        json(res, 401, { error: auth.error });
        return;
      }
      json(res, 200, { user: sanitizeUser(auth.user) });
      return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const auth = withAuth(req, db);
      if (auth.error) {
        json(res, 401, { error: auth.error });
        return;
      }
      db.sessions = db.sessions.filter((s) => s.token !== auth.token);
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    const auth = withAuth(req, db);
    if (pathname.startsWith('/api/') && pathname !== '/api/auth/login' && pathname !== '/api/health') {
      if (auth.error) {
        json(res, 401, { error: auth.error });
        return;
      }
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const activeRentals = db.bookings.filter((b) => b.status === 'active').length;
      const totalRevenue = db.transactions
        .filter((t) => t.type === 'Income')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalFleet = db.cars.length;
      const utilization = totalFleet ? Math.round((activeRentals / totalFleet) * 100) : 0;

      const statusCounts = { Available: 0, Rented: 0, Maintenance: 0 };
      for (const car of db.cars) {
        if (car.status in statusCounts) {
          statusCounts[car.status] += 1;
        }
      }

      const fleetStatusData = [
        { name: 'Available', value: statusCounts.Available, color: '#10b981' },
        { name: 'Rented', value: statusCounts.Rented, color: '#f59e0b' },
        { name: 'Maintenance', value: statusCounts.Maintenance, color: '#ef4444' },
      ];

      json(res, 200, {
        totalFleet,
        activeRentals,
        totalRevenue,
        utilization,
        activities: db.activities.slice(0, 50),
        revenueData: revenueByMonth(db.transactions),
        fleetStatusData,
      });
      return;
    }

    if (pathname === '/api/cars' && req.method === 'GET') {
      json(res, 200, db.cars);
      return;
    }

    if (pathname === '/api/cars' && req.method === 'POST') {
      const body = await parseBody(req);
      const validationError = requireFields(body, ['name', 'category', 'pricePerDay', 'licensePlate', 'status']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }

      const car = {
        id: makeId('CAR'),
        name: body.name,
        category: body.category,
        image: body.image || '',
        pricePerDay: Number(body.pricePerDay),
        transmission: body.transmission || 'Automatic',
        seats: Number(body.seats || 5),
        fuelType: body.fuelType || 'Petrol',
        mpg: body.mpg || '',
        status: body.status,
        licensePlate: body.licensePlate,
      };
      if (Number.isNaN(car.pricePerDay) || car.pricePerDay <= 0) {
        json(res, 400, { error: 'pricePerDay must be a number greater than zero.' });
        return;
      }
      db.cars.unshift(car);
      db.activities.unshift({ id: makeId('ACT'), message: `Vehicle ${car.name} added`, type: 'fleet', timestamp: Date.now() });
      await writeDb(db);
      json(res, 201, car);
      return;
    }

    if (pathname.startsWith('/api/cars/') && req.method === 'PUT') {
      const id = pathname.split('/').pop();
      const idx = db.cars.findIndex((car) => car.id === id);
      if (idx < 0) {
        json(res, 404, { error: 'Vehicle not found.' });
        return;
      }

      const body = await parseBody(req);
      const merged = { ...db.cars[idx], ...body };
      const validationError = requireFields(merged, ['name', 'category', 'pricePerDay', 'licensePlate', 'status']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      merged.pricePerDay = Number(merged.pricePerDay);
      if (Number.isNaN(merged.pricePerDay) || merged.pricePerDay <= 0) {
        json(res, 400, { error: 'pricePerDay must be a number greater than zero.' });
        return;
      }
      db.cars[idx] = merged;
      await writeDb(db);
      json(res, 200, merged);
      return;
    }

    if (pathname.startsWith('/api/cars/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const hasBookings = db.bookings.some((booking) => booking.carId === id && booking.status !== 'cancelled');
      if (hasBookings) {
        json(res, 409, { error: 'Cannot delete a vehicle linked to active/reserved/completed bookings.' });
        return;
      }
      const before = db.cars.length;
      db.cars = db.cars.filter((car) => car.id !== id);
      if (db.cars.length === before) {
        json(res, 404, { error: 'Vehicle not found.' });
        return;
      }
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/customers' && req.method === 'GET') {
      json(res, 200, db.customers);
      return;
    }

    if (pathname === '/api/customers' && req.method === 'POST') {
      const body = await parseBody(req);
      const validationError = requireFields(body, ['fullName', 'phone', 'email', 'nationalId', 'driverLicenseNumber', 'address']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      const exists = db.customers.some((c) => c.email.toLowerCase() === String(body.email).toLowerCase());
      if (exists) {
        json(res, 409, { error: 'Customer email already exists.' });
        return;
      }
      const customer = { id: makeId('CUST'), ...body };
      db.customers.unshift(customer);
      await writeDb(db);
      json(res, 201, customer);
      return;
    }

    if (pathname.startsWith('/api/customers/') && req.method === 'PUT') {
      const id = pathname.split('/').pop();
      const idx = db.customers.findIndex((c) => c.id === id);
      if (idx < 0) {
        json(res, 404, { error: 'Customer not found.' });
        return;
      }
      const body = await parseBody(req);
      const merged = { ...db.customers[idx], ...body };
      const validationError = requireFields(merged, ['fullName', 'phone', 'email', 'nationalId', 'driverLicenseNumber', 'address']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      db.customers[idx] = merged;
      await writeDb(db);
      json(res, 200, merged);
      return;
    }

    if (pathname.startsWith('/api/customers/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const hasBookings = db.bookings.some((booking) => booking.customerId === id && booking.status !== 'cancelled');
      if (hasBookings) {
        json(res, 409, { error: 'Cannot delete customer with non-cancelled bookings.' });
        return;
      }
      const before = db.customers.length;
      db.customers = db.customers.filter((c) => c.id !== id);
      if (db.customers.length === before) {
        json(res, 404, { error: 'Customer not found.' });
        return;
      }
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/bookings' && req.method === 'GET') {
      json(res, 200, db.bookings);
      return;
    }

    if (pathname === '/api/bookings' && req.method === 'POST') {
      const body = await parseBody(req);
      const validationError = requireFields(body, ['carId', 'customerId', 'startDate', 'endDate']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      const car = db.cars.find((c) => c.id === body.carId);
      if (!car) {
        json(res, 404, { error: 'Selected vehicle does not exist.' });
        return;
      }
      const customer = db.customers.find((c) => c.id === body.customerId);
      if (!customer) {
        json(res, 404, { error: 'Selected customer does not exist.' });
        return;
      }
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        json(res, 400, { error: 'Invalid start/end date.' });
        return;
      }

      const booking = {
        id: makeId('BK'),
        carId: body.carId,
        customerId: body.customerId,
        startDate: body.startDate,
        endDate: body.endDate,
        totalAmount: bookingAmount(car, body.startDate, body.endDate),
        status: 'reserved',
        paymentStatus: 'pending',
      };
      db.bookings.unshift(booking);
      await writeDb(db);
      json(res, 201, booking);
      return;
    }

    if (pathname.startsWith('/api/bookings/') && req.method === 'PUT') {
      const id = pathname.split('/').pop();
      const idx = db.bookings.findIndex((b) => b.id === id);
      if (idx < 0) {
        json(res, 404, { error: 'Booking not found.' });
        return;
      }
      const body = await parseBody(req);
      const merged = { ...db.bookings[idx], ...body };
      if (!['reserved', 'active', 'completed', 'cancelled'].includes(merged.status)) {
        json(res, 400, { error: 'Invalid booking status.' });
        return;
      }
      if (!['pending', 'paid'].includes(merged.paymentStatus)) {
        json(res, 400, { error: 'Invalid payment status.' });
        return;
      }
      db.bookings[idx] = merged;
      await writeDb(db);
      json(res, 200, merged);
      return;
    }

    if (pathname.startsWith('/api/bookings/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const before = db.bookings.length;
      db.bookings = db.bookings.filter((b) => b.id !== id);
      if (db.bookings.length === before) {
        json(res, 404, { error: 'Booking not found.' });
        return;
      }
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/transactions' && req.method === 'GET') {
      json(res, 200, db.transactions);
      return;
    }

    if (pathname === '/api/transactions' && req.method === 'POST') {
      const body = await parseBody(req);
      const validationError = requireFields(body, ['date', 'description', 'type', 'amount', 'category']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      if (!['Income', 'Expense'].includes(body.type)) {
        json(res, 400, { error: 'type must be Income or Expense.' });
        return;
      }
      const amount = Number(body.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        json(res, 400, { error: 'amount must be a number greater than zero.' });
        return;
      }
      const transaction = {
        id: makeId('TRX'),
        date: body.date,
        description: body.description,
        type: body.type,
        amount,
        category: body.category,
      };
      db.transactions.unshift(transaction);
      await writeDb(db);
      json(res, 201, transaction);
      return;
    }

    if (pathname.startsWith('/api/transactions/') && req.method === 'PUT') {
      const id = pathname.split('/').pop();
      const idx = db.transactions.findIndex((t) => t.id === id);
      if (idx < 0) {
        json(res, 404, { error: 'Transaction not found.' });
        return;
      }
      const body = await parseBody(req);
      const merged = { ...db.transactions[idx], ...body };
      const validationError = requireFields(merged, ['date', 'description', 'type', 'amount', 'category']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      merged.amount = Number(merged.amount);
      if (Number.isNaN(merged.amount) || merged.amount <= 0) {
        json(res, 400, { error: 'amount must be a number greater than zero.' });
        return;
      }
      db.transactions[idx] = merged;
      await writeDb(db);
      json(res, 200, merged);
      return;
    }

    if (pathname.startsWith('/api/transactions/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const before = db.transactions.length;
      db.transactions = db.transactions.filter((t) => t.id !== id);
      if (db.transactions.length === before) {
        json(res, 404, { error: 'Transaction not found.' });
        return;
      }
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      json(res, 200, db.settings);
      return;
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await parseBody(req);
      const merged = { ...db.settings, ...body };
      const validationError = requireFields(merged, ['companyName', 'contactEmail', 'currency', 'taxRate', 'bookingLeadHours']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      merged.taxRate = Number(merged.taxRate);
      merged.bookingLeadHours = Number(merged.bookingLeadHours);
      if (Number.isNaN(merged.taxRate) || Number.isNaN(merged.bookingLeadHours)) {
        json(res, 400, { error: 'taxRate and bookingLeadHours must be numeric.' });
        return;
      }
      db.settings = merged;
      await writeDb(db);
      json(res, 200, merged);
      return;
    }

    json(res, 404, { error: 'Route not found.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    json(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
