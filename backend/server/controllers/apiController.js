import { z } from 'zod';
import { pool } from '../db/pool.js';
import { logAudit, listNotificationLogs, clearNotificationLogs } from '../services/auditService.js';
import {
  makeId,
  makeToken,
  sanitizeUser,
  hashPassword,
  verifyPassword,
  SESSION_TTL_HOURS,
} from '../services/security.js';
import { calculateBookingAmounts, bookingRentalDays, toDateTime } from '../services/bookingMath.js';

const bookingCreateSchema = z.object({
  carId: z.string().min(1),
  customerId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('00:00'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('23:59'),
  discountType: z.enum(['fixed', 'percent']).optional().default('fixed'),
  discountValue: z.number().min(0).optional().default(0),
});

const profileSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  title: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

function parsePagination(query) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 20);
  const paged = Number.isFinite(page) && Number.isFinite(pageSize) && query.page !== undefined;
  return {
    page: Math.max(1, page),
    pageSize: Math.max(1, Math.min(200, pageSize)),
    paged,
  };
}

function mapCar(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    ownerId: row.owner_id || undefined,
    ownerName: row.owner_name || undefined,
    ownerPhone: row.owner_phone || '',
    image: row.image || '',
    pricePerDay: Number(row.price_per_day),
    transmission: row.transmission,
    seats: Number(row.seats),
    fuelType: row.fuel_type,
    mpg: row.mpg,
    status: row.status,
    licensePlate: row.license_plate,
    createdAt: row.created_at,
  };
}

async function resolveCarOwnerId(client, payload, fallbackOwnerId = null) {
  const ownerName = String(payload.ownerName ?? payload.owner_name ?? '').trim();
  const explicitOwnerId = String(payload.ownerId ?? payload.owner_id ?? fallbackOwnerId ?? '').trim();
  const allowOwnerRename = payload.allowOwnerRename === true || payload.allow_owner_rename === true;
  const ownerPhone = String(payload.ownerPhone ?? payload.owner_phone ?? '').trim();

  const isPlaceholderOwnerName = (value) => {
    const normalized = String(value ?? '').trim();
    return (
      !normalized ||
      /^OWN-[A-Za-z0-9_-]+$/.test(normalized) ||
      /^Owner [0-9]{4}$/.test(normalized)
    );
  };

  const findOwnerByName = async (fullName) => {
    const normalized = String(fullName || '').trim();
    if (!normalized) return null;
    const byName = await client.query(
      `SELECT id, full_name
       FROM owners
       WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [normalized]
    );
    return byName.rows[0] || null;
  };

  const canRenameOwner = async (ownerId, currentName) => {
    if (isPlaceholderOwnerName(currentName)) {
      return true;
    }
    if (!allowOwnerRename) {
      return false;
    }
    const usage = await client.query('SELECT COUNT(*)::int AS count FROM cars WHERE owner_id = $1', [ownerId]);
    return Number(usage.rows[0]?.count || 0) <= 1;
  };

  if (explicitOwnerId) {
    const owner = await client.query('SELECT id, full_name FROM owners WHERE id = $1 LIMIT 1', [explicitOwnerId]);
    if (!owner.rows[0]) {
      const error = new Error('Selected owner does not exist.');
      error.statusCode = 400;
      throw error;
    }
    if (ownerName && ownerName !== owner.rows[0].full_name) {
      const byName = await findOwnerByName(ownerName);
      if (byName?.id && byName.id !== explicitOwnerId) {
        return byName.id;
      }
      if (await canRenameOwner(explicitOwnerId, owner.rows[0].full_name)) {
        await client.query('UPDATE owners SET full_name = $1, updated_at = NOW() WHERE id = $2', [ownerName, explicitOwnerId]);
      }
    }
    return explicitOwnerId;
  }

  if (!ownerPhone) {
    const byName = await findOwnerByName(ownerName);
    return byName?.id || fallbackOwnerId || null;
  }

  const existingOwner = await client.query('SELECT id, full_name FROM owners WHERE phone = $1 LIMIT 1', [ownerPhone]);
  if (existingOwner.rows[0]?.id) {
    if (ownerName && ownerName !== existingOwner.rows[0].full_name) {
      const byName = await findOwnerByName(ownerName);
      if (byName?.id && byName.id !== existingOwner.rows[0].id) {
        return byName.id;
      }
      if (await canRenameOwner(existingOwner.rows[0].id, existingOwner.rows[0].full_name)) {
        await client.query('UPDATE owners SET full_name = $1, updated_at = NOW() WHERE id = $2', [ownerName, existingOwner.rows[0].id]);
      }
    }
    return existingOwner.rows[0].id;
  }

  const ownerId = makeId('OWN');
  await client.query(
    `INSERT INTO owners (id, full_name, phone, email)
     VALUES ($1, $2, $3, $4)`,
    [
      ownerId,
      ownerName || `Owner ${ownerPhone.slice(-4) || '0000'}`,
      ownerPhone,
      payload.ownerEmail || null,
    ]
  );
  return ownerId;
}

function mapCustomer(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    nationalId: row.national_id,
    driverLicenseNumber: row.license_number,
    damiin: row.damiin_name || '',
    address: row.address,
  };
}

async function nextCustomerId(client = pool) {
  const { rows } = await client.query(
    `
      WITH existing AS (
        SELECT (substring(id from '^CUST-(\\d+)$'))::int AS n
        FROM customers
        WHERE id ~ '^CUST-[0-9]+$'
      ),
      bounds AS (
        SELECT COALESCE(MAX(n), 1000) + 1 AS upper_bound
        FROM existing
      ),
      next_gap AS (
        SELECT gs AS n
        FROM generate_series(1001, (SELECT upper_bound FROM bounds)) AS gs
        LEFT JOIN existing e ON e.n = gs
        WHERE e.n IS NULL
        ORDER BY gs
        LIMIT 1
      )
      SELECT 'CUST-' || n AS id
      FROM next_gap
    `
  );

  return rows[0]?.id || 'CUST-1001';
}

function mapBooking(row) {
  const normalizeDate = (value) => {
    if (value instanceof Date) {
      const yyyy = value.getFullYear();
      const mm = String(value.getMonth() + 1).padStart(2, '0');
      const dd = String(value.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const raw = String(value ?? '').trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    return raw.includes('T') ? raw.slice(0, 10) : raw;
  };

  return {
    id: row.id,
    carId: row.car_id,
    customerId: row.customer_id,
    startDate: normalizeDate(row.start_date),
    startTime: String(row.start_time).slice(0, 5),
    endDate: normalizeDate(row.end_date),
    endTime: String(row.end_time).slice(0, 5),
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    discountAmount: Number(row.discount_amount),
    subtotalAmount: Number(row.subtotal_amount),
    totalAmount: Number(row.total_amount),
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  };
}

function toDateOnly(value) {
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  return raw.includes('T') ? raw.slice(0, 10) : raw;
}

async function findUserByIdentifier(identifier) {
  const { rows } = await pool.query(
    `SELECT u.*, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.email) = LOWER($1) OR LOWER(COALESCE(u.username, '')) = LOWER($1)
     LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

async function hasBookingOverlap({ carId, startDate, startTime, endDate, endTime, excludeId = null }) {
  const query = `
    SELECT 1
    FROM bookings
    WHERE car_id = $1
      AND status IN ('reserved', 'active', 'overdue')
      AND ($2::date + $3::time) <= (end_date + end_time)
      AND (start_date + start_time) <= ($4::date + $5::time)
      AND ($6::text IS NULL OR id <> $6)
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [carId, startDate, startTime, endDate, endTime, excludeId]);
  return rows.length > 0;
}

async function syncBookingIncomePayment(client, booking, customerName, carName) {
  const { rows } = await client.query('SELECT id FROM payments WHERE booking_id = $1 LIMIT 1', [booking.id]);
  if (booking.status === 'cancelled') {
    if (rows[0]) {
      await client.query('DELETE FROM payments WHERE id = $1', [rows[0].id]);
    }
    return;
  }

  const payload = {
    id: rows[0]?.id || makeId('PAY'),
    bookingId: booking.id,
    amount: Number(booking.totalAmount),
    method: booking.paymentStatus === 'paid' ? 'cash' : 'accrual',
    note: `Booking ${booking.id}: ${carName} (${customerName})`,
    paidAt: `${booking.startDate}T00:00:00Z`,
  };

  if (rows[0]) {
    await client.query(
      `UPDATE payments
       SET amount = $1, payment_method = $2, note = $3, paid_at = $4::timestamptz, system_generated = TRUE
       WHERE id = $5`,
      [payload.amount, payload.method, payload.note, payload.paidAt, payload.id]
    );
  } else {
    await client.query(
      `INSERT INTO payments (id, booking_id, amount, payment_method, note, system_generated, paid_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6::timestamptz)`,
      [payload.id, payload.bookingId, payload.amount, payload.method, payload.note, payload.paidAt]
    );
  }
}

function normalizeSettings(raw = {}) {
  return {
    companyName: raw.companyName || 'Salaam Car Rental',
    contactEmail: raw.contactEmail || 'admin@salaam.com',
    currency: raw.currency || 'USD',
    taxRate: Number(raw.taxRate || 0),
    bookingLeadHours: Number(raw.bookingLeadHours || 0),
    bookingNotificationsEnabled: raw.bookingNotificationsEnabled !== false,
    bookingReminderMinutes: Number(raw.bookingReminderMinutes ?? 10),
    autoMarkOverdue: raw.autoMarkOverdue !== false,
  };
}

export async function health(_req, res) {
  res.json({ status: 'ok' });
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Field "email" and "password" are required.' });
    }

    const user = await findUserByIdentifier(String(email));
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await verifyPassword(String(password), user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!String(user.password_hash || '').startsWith('$2')) {
      const upgraded = await hashPassword(String(password));
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgraded, user.id]);
      user.password_hash = upgraded;
    }

    const token = makeToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3::timestamptz)',
      [token, user.id, expiresAt.toISOString()]
    );

    await logAudit({ userId: user.id, action: 'login', entity: 'auth', entityId: user.id });

    res.json({
      token,
      user: sanitizeUser(user),
      expiresAt: expiresAt.getTime(),
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res) {
  res.json({ user: req.auth.user });
}

export async function logout(req, res, next) {
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [req.auth.token]);
    await logAudit({ userId: req.auth.userId, action: 'logout', entity: 'auth', entityId: req.auth.userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const parsed = profileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile payload.' });
    }

    const payload = parsed.data;
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.auth.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

    const user = rows[0];
    if (payload.newPassword) {
      const ok = await verifyPassword(payload.currentPassword || '', user.password_hash);
      if (!ok) return res.status(400).json({ error: 'Current password is invalid.' });
      user.password_hash = await hashPassword(payload.newPassword);
    }

    user.username = payload.username ?? user.username;
    user.email = payload.email ? payload.email.toLowerCase() : user.email;
    user.name = payload.name ?? user.name;
    user.title = payload.title ?? user.title;

    await pool.query(
      `UPDATE users
       SET username = $1, email = $2, name = $3, title = $4, password_hash = $5
       WHERE id = $6`,
      [user.username, user.email, user.name, user.title, user.password_hash, user.id]
    );

    const joined = await pool.query(
      `SELECT u.id, u.username, u.email, u.name, u.title, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [user.id]
    );

    await logAudit({ userId: req.auth.userId, action: 'profile_update', entity: 'user', entityId: user.id });
    res.json({ user: sanitizeUser(joined.rows[0]) });
  } catch (error) {
    next(error);
  }
}

export async function listUsers(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.email, u.name, u.title, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    );
    res.json(rows.map(sanitizeUser));
  } catch (error) {
    next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    const payload = req.body || {};
    const required = ['username', 'email', 'password', 'role', 'name'];
    for (const f of required) {
      if (!payload[f]) return res.status(400).json({ error: `Field "${f}" is required.` });
    }

    const { rows: roleRows } = await pool.query('SELECT id, name FROM roles WHERE name = $1', [String(payload.role).toLowerCase()]);
    if (!roleRows[0]) return res.status(400).json({ error: 'Invalid role.' });

    const id = makeId('USR');
    const passwordHash = await hashPassword(payload.password);
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, role_id, name, title)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, payload.username, String(payload.email).toLowerCase(), passwordHash, roleRows[0].id, payload.name, payload.title || '']
    );

    const created = await pool.query(
      `SELECT u.id, u.username, u.email, u.name, u.title, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [id]
    );

    await logAudit({ userId: req.auth.userId, action: 'create', entity: 'user', entityId: id });
    res.status(201).json(sanitizeUser(created.rows[0]));
  } catch (error) {
    if (String(error?.message || '').includes('users_email_key')) {
      return res.status(409).json({ error: 'User email already exists.' });
    }
    next(error);
  }
}

export async function updateUser(req, res, next) {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'User not found.' });

    const user = existing.rows[0];
    if (payload.role) {
      const role = await pool.query('SELECT id FROM roles WHERE name = $1', [String(payload.role).toLowerCase()]);
      if (!role.rows[0]) return res.status(400).json({ error: 'Invalid role.' });
      user.role_id = role.rows[0].id;
    }

    user.username = payload.username ?? user.username;
    user.email = payload.email ? String(payload.email).toLowerCase() : user.email;
    user.name = payload.name ?? user.name;
    user.title = payload.title ?? user.title;
    if (payload.password) {
      user.password_hash = await hashPassword(payload.password);
    }

    await pool.query(
      `UPDATE users
       SET username = $1, email = $2, name = $3, title = $4, password_hash = $5, role_id = $6
       WHERE id = $7`,
      [user.username, user.email, user.name, user.title, user.password_hash, user.role_id, id]
    );

    const updated = await pool.query(
      `SELECT u.id, u.username, u.email, u.name, u.title, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [id]
    );

    await logAudit({ userId: req.auth.userId, action: 'update', entity: 'user', entityId: id });
    res.json(sanitizeUser(updated.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const id = req.params.id;
    if (id === req.auth.userId) return res.status(400).json({ error: 'You cannot delete your own account.' });

    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });

    await logAudit({ userId: req.auth.userId, action: 'delete', entity: 'user', entityId: id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function listCars(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination.paged) {
      const { rows } = await pool.query(
        `SELECT c.*, o.full_name AS owner_name
         FROM cars c
         LEFT JOIN owners o ON o.id = c.owner_id
         ORDER BY c.created_at DESC`
      );
      return res.json(rows.map(mapCar));
    }

    const count = await pool.query('SELECT COUNT(*)::int AS count FROM cars');
    const { rows } = await pool.query(
      `SELECT c.*, o.full_name AS owner_name
       FROM cars c
       LEFT JOIN owners o ON o.id = c.owner_id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );
    return res.json({
      data: rows.map(mapCar),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: count.rows[0].count,
        totalPages: Math.max(1, Math.ceil(count.rows[0].count / pagination.pageSize)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCar(req, res, next) {
  try {
    const body = req.body || {};
    const required = ['name', 'category', 'pricePerDay', 'licensePlate', 'status'];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null || body[f] === '') {
        return res.status(400).json({ error: `Field "${f}" is required.` });
      }
    }

    const id = makeId('CAR');
    const ownerId = await resolveCarOwnerId(pool, body, null);
    await pool.query(
      `INSERT INTO cars (
        id, branch_id, name, category, owner_id, owner_phone, image, price_per_day, transmission, seats,
        fuel_type, mpg, status, license_plate
      ) VALUES ($1, 'BR-001', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        body.name,
        body.category,
        ownerId,
        body.ownerPhone || '',
        body.image || '',
        Number(body.pricePerDay),
        body.transmission || 'Automatic',
        Number(body.seats || 5),
        body.fuelType || 'Petrol',
        body.mpg || '',
        body.status,
        body.licensePlate,
      ]
    );

    const created = await pool.query(
      `SELECT c.*, o.full_name AS owner_name
       FROM cars c
       LEFT JOIN owners o ON o.id = c.owner_id
       WHERE c.id = $1`,
      [id]
    );
    await logAudit({ userId: req.auth.userId, action: 'create', entity: 'car', entityId: id });
    res.status(201).json(mapCar(created.rows[0]));
  } catch (error) {
    if (String(error?.message || '').includes('cars_license_plate_key')) {
      return res.status(409).json({ error: 'License plate already exists.' });
    }
    next(error);
  }
}

export async function updateCar(req, res, next) {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cars WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Vehicle not found.' });

    const payload = { ...existing.rows[0], ...(req.body || {}) };
    const ownerId = await resolveCarOwnerId(pool, payload, existing.rows[0].owner_id || null);
    await pool.query(
      `UPDATE cars SET
        name = $1, category = $2, owner_id = $3, owner_phone = $4, image = $5, price_per_day = $6,
        transmission = $7, seats = $8, fuel_type = $9, mpg = $10, status = $11, license_plate = $12
       WHERE id = $13`,
      [
        payload.name,
        payload.category,
        ownerId,
        payload.ownerPhone ?? payload.owner_phone ?? '',
        payload.image || '',
        Number(payload.pricePerDay ?? payload.price_per_day),
        payload.transmission || 'Automatic',
        Number(payload.seats || 5),
        payload.fuelType ?? payload.fuel_type ?? 'Petrol',
        payload.mpg || '',
        payload.status,
        payload.licensePlate ?? payload.license_plate,
        id,
      ]
    );

    const updated = await pool.query(
      `SELECT c.*, o.full_name AS owner_name
       FROM cars c
       LEFT JOIN owners o ON o.id = c.owner_id
       WHERE c.id = $1`,
      [id]
    );
    await logAudit({ userId: req.auth.userId, action: 'update', entity: 'car', entityId: id });
    res.json(mapCar(updated.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function deleteCar(req, res, next) {
  try {
    const id = req.params.id;
    const active = await pool.query(
      `SELECT 1
       FROM bookings
       WHERE car_id = $1
         AND COALESCE(LOWER(TRIM(status)), '') <> 'cancelled'
       LIMIT 1`,
      [id]
    );
    if (active.rows[0]) {
      return res.status(409).json({ error: 'Cannot delete a vehicle linked to non-cancelled bookings.' });
    }

    const deleted = await pool.query('DELETE FROM cars WHERE id = $1', [id]);
    if (deleted.rowCount === 0) return res.status(404).json({ error: 'Vehicle not found.' });

    await logAudit({ userId: req.auth.userId, action: 'delete', entity: 'car', entityId: id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function carReport(req, res, next) {
  try {
    const carId = req.params.id;
    const carResult = await pool.query('SELECT * FROM cars WHERE id = $1', [carId]);
    if (!carResult.rows[0]) return res.status(404).json({ error: 'Vehicle not found.' });

    const period = req.query.period || 'all';
    const from = req.query.from || '';
    const to = req.query.to || '';
    const month = req.query.month ? Number(req.query.month) : null;
    const year = req.query.year ? Number(req.query.year) : null;
    const allRows = req.query.all === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Math.min(500, Number(req.query.pageSize || 20)));

    const where = [`b.car_id = $1`];
    const params = [carId];

    if (period === 'range' && from && to) {
      params.push(from, to);
      where.push(`b.start_date >= $${params.length - 1}::date AND b.end_date <= $${params.length}::date`);
    }
    if (period === 'monthly' && month && year) {
      params.push(year, month);
      where.push(`EXTRACT(YEAR FROM b.start_date) = $${params.length - 1} AND EXTRACT(MONTH FROM b.start_date) = $${params.length}`);
    }
    if (period === 'yearly' && year) {
      params.push(year);
      where.push(`EXTRACT(YEAR FROM b.start_date) = $${params.length}`);
    }

    const reportQuery = `
      SELECT b.*, c.full_name
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY b.start_date DESC, b.created_at DESC
    `;

    const { rows } = await pool.query(reportQuery, params);
    const mapped = rows.map((r) => {
      const startDate = toDateOnly(r.start_date);
      const endDate = toDateOnly(r.end_date);
      return {
      bookingId: r.id,
      customerName: r.full_name,
      startDate,
      endDate,
      rentalDays: bookingRentalDays(startDate, endDate, String(r.start_time || '').slice(0, 5), String(r.end_time || '').slice(0, 5)),
      amountPaid: Number(r.total_amount || 0),
      status: r.status,
      paymentStatus: r.payment_status,
    };
    });

    const totalRevenue = mapped.reduce((sum, row) => sum + row.amountPaid, 0);
    const rentedRows = mapped.filter((row) => String(row.status || '').toLowerCase() !== 'cancelled');
    const totalDaysRented = rentedRows.reduce((sum, row) => sum + row.rentalDays, 0);
    const paginated = allRows ? mapped : mapped.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      car: {
        id: carResult.rows[0].id,
        name: carResult.rows[0].name,
        status: carResult.rows[0].status,
        licensePlate: carResult.rows[0].license_plate,
        category: carResult.rows[0].category,
      },
      filters: { period, from, to, month, year },
      summary: {
        totalRentals: mapped.length,
        totalDaysRented,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        averageRevenuePerRental: mapped.length ? Number((totalRevenue / mapped.length).toFixed(2)) : 0,
      },
      pagination: {
        page: allRows ? 1 : page,
        pageSize: allRows ? mapped.length || 1 : pageSize,
        total: mapped.length,
        totalPages: allRows ? 1 : Math.max(1, Math.ceil(mapped.length / pageSize)),
      },
      rows: paginated,
    });
  } catch (error) {
    next(error);
  }
}

export async function listCustomers(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination.paged) {
      const { rows } = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
      return res.json(rows.map(mapCustomer));
    }

    const count = await pool.query('SELECT COUNT(*)::int AS count FROM customers');
    const { rows } = await pool.query(
      'SELECT * FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return res.json({
      data: rows.map(mapCustomer),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: count.rows[0].count,
        totalPages: Math.max(1, Math.ceil(count.rows[0].count / pagination.pageSize)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createCustomer(req, res, next) {
  try {
    const body = req.body || {};
    const required = ['fullName', 'phone', 'email', 'nationalId', 'driverLicenseNumber', 'damiin', 'address'];
    for (const f of required) {
      if (!body[f]) return res.status(400).json({ error: `Field "${f}" is required.` });
    }

    await pool.query('BEGIN');
    let id = 'CUST-1001';
    try {
      // Serialize customer-id assignment to keep IDs monotonic and collision-free.
      await pool.query('LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE');
      id = await nextCustomerId(pool);
      await pool.query(
        `INSERT INTO customers (id, full_name, phone, email, national_id, license_number, damiin_name, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, body.fullName, body.phone, String(body.email).toLowerCase(), body.nationalId, body.driverLicenseNumber, body.damiin, body.address]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    const created = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    await logAudit({ userId: req.auth.userId, action: 'create', entity: 'customer', entityId: id });
    res.status(201).json(mapCustomer(created.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function updateCustomer(req, res, next) {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Customer not found.' });

    const payload = { ...existing.rows[0], ...(req.body || {}) };
    await pool.query(
      `UPDATE customers
       SET full_name = $1, phone = $2, email = $3, national_id = $4, license_number = $5, damiin_name = $6, address = $7
       WHERE id = $8`,
      [
        payload.fullName ?? payload.full_name,
        payload.phone,
        String(payload.email).toLowerCase(),
        payload.nationalId ?? payload.national_id,
        payload.driverLicenseNumber ?? payload.license_number,
        payload.damiin ?? payload.damiin_name ?? '',
        payload.address,
        id,
      ]
    );

    const updated = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    await logAudit({ userId: req.auth.userId, action: 'update', entity: 'customer', entityId: id });
    res.json(mapCustomer(updated.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomer(req, res, next) {
  try {
    const id = req.params.id;
    const active = await pool.query(
      `SELECT 1
       FROM bookings
       WHERE customer_id = $1
         AND COALESCE(LOWER(TRIM(status)), '') <> 'cancelled'
       LIMIT 1`,
      [id]
    );
    if (active.rows[0]) {
      return res.status(409).json({ error: 'Cannot delete customer with non-cancelled bookings.' });
    }

    const deleted = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    if (deleted.rowCount === 0) return res.status(404).json({ error: 'Customer not found.' });

    await logAudit({ userId: req.auth.userId, action: 'delete', entity: 'customer', entityId: id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function listBookings(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination.paged) {
      const { rows } = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');
      return res.json(rows.map(mapBooking));
    }

    const count = await pool.query('SELECT COUNT(*)::int AS count FROM bookings');
    const { rows } = await pool.query(
      'SELECT * FROM bookings ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return res.json({
      data: rows.map(mapBooking),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: count.rows[0].count,
        totalPages: Math.max(1, Math.ceil(count.rows[0].count / pagination.pageSize)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createBooking(req, res, next) {
  try {
    const parsed = bookingCreateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid booking payload.' });
    }

    const payload = parsed.data;
    const start = toDateTime(payload.startDate, payload.startTime, '00:00');
    const end = toDateTime(payload.endDate, payload.endTime, '23:59');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Invalid start/end date or time.' });
    }

    const carResult = await pool.query('SELECT * FROM cars WHERE id = $1', [payload.carId]);
    if (!carResult.rows[0]) return res.status(404).json({ error: 'Selected vehicle does not exist.' });
    if (carResult.rows[0].status === 'Maintenance') {
      return res.status(409).json({ error: 'This vehicle is in maintenance and cannot be booked.' });
    }

    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [payload.customerId]);
    if (!customerResult.rows[0]) return res.status(404).json({ error: 'Selected customer does not exist.' });

    const overlap = await hasBookingOverlap(payload);
    if (overlap) {
      return res.status(409).json({ error: 'This vehicle is already rented/reserved for the selected dates.' });
    }

    const totals = calculateBookingAmounts(
      Number(carResult.rows[0].price_per_day),
      payload.startDate,
      payload.endDate,
      payload.startTime,
      payload.endTime,
      payload.discountType,
      payload.discountValue
    );

    const id = makeId('BK');
    await pool.query('BEGIN');
    try {
      await pool.query(
        `INSERT INTO bookings (
          id, car_id, customer_id, start_date, start_time, end_date, end_time,
          discount_type, discount_value, discount_amount, subtotal_amount, total_amount,
          status, payment_status, created_by
        ) VALUES ($1, $2, $3, $4::date, $5::time, $6::date, $7::time, $8, $9, $10, $11, $12, 'reserved', 'pending', $13)`,
        [
          id,
          payload.carId,
          payload.customerId,
          payload.startDate,
          payload.startTime,
          payload.endDate,
          payload.endTime,
          totals.discountType,
          totals.discountValue,
          totals.discountAmount,
          totals.subtotalAmount,
          totals.totalAmount,
          req.auth.userId,
        ]
      );

      await syncBookingIncomePayment(
        pool,
        {
          id,
          startDate: payload.startDate,
          totalAmount: totals.totalAmount,
          paymentStatus: 'pending',
          status: 'reserved',
        },
        customerResult.rows[0].full_name,
        carResult.rows[0].name
      );

      await logAudit({
        userId: req.auth.userId,
        action: 'create',
        entity: 'booking',
        entityId: id,
        details: { carId: payload.carId, customerId: payload.customerId },
      });

      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    const created = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    res.status(201).json(mapBooking(created.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function updateBooking(req, res, next) {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Booking not found.' });

    const current = mapBooking(existing.rows[0]);
    const payload = { ...current, ...(req.body || {}) };

    const start = toDateTime(payload.startDate, payload.startTime || '00:00', '00:00');
    const end = toDateTime(payload.endDate, payload.endTime || '23:59', '23:59');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Invalid start/end date or time.' });
    }

    const carResult = await pool.query('SELECT * FROM cars WHERE id = $1', [payload.carId]);
    if (!carResult.rows[0]) return res.status(404).json({ error: 'Selected vehicle does not exist.' });

    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [payload.customerId]);
    if (!customerResult.rows[0]) return res.status(404).json({ error: 'Selected customer does not exist.' });

    if (payload.status !== 'cancelled') {
      const overlap = await hasBookingOverlap({
        carId: payload.carId,
        startDate: payload.startDate,
        startTime: payload.startTime || '00:00',
        endDate: payload.endDate,
        endTime: payload.endTime || '23:59',
        excludeId: id,
      });
      if (overlap) {
        return res.status(409).json({ error: 'This vehicle is already rented/reserved for the selected dates.' });
      }
    }

    const totals = calculateBookingAmounts(
      Number(carResult.rows[0].price_per_day),
      payload.startDate,
      payload.endDate,
      payload.startTime,
      payload.endTime,
      payload.discountType,
      payload.discountValue
    );

    await pool.query('BEGIN');
    try {
      await pool.query(
        `UPDATE bookings SET
          car_id = $1,
          customer_id = $2,
          start_date = $3::date,
          start_time = $4::time,
          end_date = $5::date,
          end_time = $6::time,
          discount_type = $7,
          discount_value = $8,
          discount_amount = $9,
          subtotal_amount = $10,
          total_amount = $11,
          status = $12,
          payment_status = $13,
          end_reminder_notified_at = CASE WHEN ($5::date <> end_date OR $6::time <> end_time) THEN NULL ELSE end_reminder_notified_at END,
          overdue_notified_at = CASE WHEN ($5::date <> end_date OR $6::time <> end_time) THEN NULL ELSE overdue_notified_at END
        WHERE id = $14`,
        [
          payload.carId,
          payload.customerId,
          payload.startDate,
          payload.startTime || '00:00',
          payload.endDate,
          payload.endTime || '23:59',
          payload.discountType === 'percent' ? 'percent' : 'fixed',
          Number(payload.discountValue || 0),
          totals.discountAmount,
          totals.subtotalAmount,
          totals.totalAmount,
          payload.status,
          payload.paymentStatus,
          id,
        ]
      );

      await syncBookingIncomePayment(
        pool,
        {
          id,
          startDate: payload.startDate,
          totalAmount: totals.totalAmount,
          paymentStatus: payload.paymentStatus,
          status: payload.status,
        },
        customerResult.rows[0].full_name,
        carResult.rows[0].name
      );

      await logAudit({ userId: req.auth.userId, action: 'update', entity: 'booking', entityId: id });
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    const updated = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    res.json(mapBooking(updated.rows[0]));
  } catch (error) {
    next(error);
  }
}

export async function deleteBooking(req, res, next) {
  try {
    const id = req.params.id;
    await pool.query('BEGIN');
    try {
      await pool.query('DELETE FROM payments WHERE booking_id = $1', [id]);
      const deleted = await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
      if (deleted.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found.' });
      }
      await logAudit({ userId: req.auth.userId, action: 'delete', entity: 'booking', entityId: id });
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

function mapTransactionRow(row) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    type: row.type,
    amount: Number(row.amount || 0),
    category: row.category,
    bookingId: row.booking_id || undefined,
    systemGenerated: Boolean(row.system_generated),
    createdAt: row.created_at,
  };
}

export async function listTransactions(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const union = `
      SELECT
        p.id,
        TO_CHAR(p.paid_at::date, 'YYYY-MM-DD') AS date,
        COALESCE(p.note, 'Payment') AS description,
        CASE WHEN p.payment_method = 'commission' THEN 'Commission' ELSE 'Income' END AS type,
        p.amount,
        CASE WHEN p.booking_id IS NULL THEN COALESCE(NULLIF(p.payment_method, ''), 'General') ELSE 'Rental' END AS category,
        p.booking_id,
        p.system_generated,
        p.created_at
      FROM payments p
      UNION ALL
      SELECT
        e.id,
        TO_CHAR(e.expense_date, 'YYYY-MM-DD') AS date,
        e.description,
        'Expense' AS type,
        e.amount,
        e.category,
        NULL::text AS booking_id,
        FALSE AS system_generated,
        e.created_at
      FROM expenses e
    `;

    if (!pagination.paged) {
      const { rows } = await pool.query(`${union} ORDER BY date DESC, created_at DESC`);
      return res.json(rows.map(mapTransactionRow));
    }

    const countRows = await pool.query(`SELECT COUNT(*)::int AS count FROM (${union}) x`);
    const { rows } = await pool.query(
      `${union} ORDER BY date DESC, created_at DESC LIMIT $1 OFFSET $2`,
      [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return res.json({
      data: rows.map(mapTransactionRow),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: countRows.rows[0].count,
        totalPages: Math.max(1, Math.ceil(countRows.rows[0].count / pagination.pageSize)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createTransaction(req, res, next) {
  try {
    const body = req.body || {};
    const required = ['date', 'description', 'type', 'amount', 'category'];
    for (const f of required) {
      if (!body[f]) return res.status(400).json({ error: `Field "${f}" is required.` });
    }

    const type = String(body.type);
    const amount = Number(body.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a number greater than zero.' });
    }

    if (type === 'Expense') {
      const id = makeId('TRX');
      await pool.query(
        `INSERT INTO expenses (id, amount, description, category, expense_date, created_by)
         VALUES ($1, $2, $3, $4, $5::date, $6)`,
        [id, amount, body.description, body.category, body.date, req.auth.userId]
      );
      await logAudit({ userId: req.auth.userId, action: 'create', entity: 'expense', entityId: id });
      return res.status(201).json({
        id,
        date: body.date,
        description: body.description,
        type: 'Expense',
        amount,
        category: body.category,
      });
    }

    if (!['Income', 'Commission'].includes(type)) {
      return res.status(400).json({ error: 'type must be Income, Expense, or Commission.' });
    }

    const id = makeId('TRX');
    const method = type === 'Commission' ? 'commission' : 'cash';
    await pool.query(
      `INSERT INTO payments (id, booking_id, amount, payment_method, note, system_generated, created_by, paid_at)
       VALUES ($1, NULL, $2, $3, $4, FALSE, $5, $6::timestamptz)`,
      [id, amount, method, body.description, req.auth.userId, `${body.date}T00:00:00Z`]
    );

    await logAudit({ userId: req.auth.userId, action: 'create', entity: 'payment', entityId: id });
    res.status(201).json({
      id,
      date: body.date,
      description: body.description,
      type,
      amount,
      category: body.category,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTransaction(req, res, next) {
  try {
    const id = req.params.id;
    const body = req.body || {};

    const payment = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (payment.rows[0]) {
      if (payment.rows[0].booking_id) {
        return res.status(409).json({ error: 'Booking-linked transactions must be edited from Booking Management.' });
      }
      const type = body.type || (payment.rows[0].payment_method === 'commission' ? 'Commission' : 'Income');
      const method = type === 'Commission' ? 'commission' : 'cash';
      await pool.query(
        `UPDATE payments
         SET amount = $1, payment_method = $2, note = $3, paid_at = $4::timestamptz
         WHERE id = $5`,
        [Number(body.amount || payment.rows[0].amount), method, body.description || payment.rows[0].note, `${(body.date || payment.rows[0].paid_at.toISOString().slice(0, 10))}T00:00:00Z`, id]
      );
      await logAudit({ userId: req.auth.userId, action: 'update', entity: 'payment', entityId: id });
      return res.json({
        id,
        date: body.date || payment.rows[0].paid_at.toISOString().slice(0, 10),
        description: body.description || payment.rows[0].note || '',
        type,
        amount: Number(body.amount || payment.rows[0].amount),
        category: body.category || 'General',
      });
    }

    const expense = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
    if (!expense.rows[0]) return res.status(404).json({ error: 'Transaction not found.' });

    await pool.query(
      `UPDATE expenses
       SET amount = $1, description = $2, category = $3, expense_date = $4::date
       WHERE id = $5`,
      [
        Number(body.amount || expense.rows[0].amount),
        body.description || expense.rows[0].description,
        body.category || expense.rows[0].category,
        body.date || expense.rows[0].expense_date,
        id,
      ]
    );
    await logAudit({ userId: req.auth.userId, action: 'update', entity: 'expense', entityId: id });

    res.json({
      id,
      date: body.date || expense.rows[0].expense_date,
      description: body.description || expense.rows[0].description,
      type: 'Expense',
      amount: Number(body.amount || expense.rows[0].amount),
      category: body.category || expense.rows[0].category,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTransaction(req, res, next) {
  try {
    const id = req.params.id;
    const payment = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (payment.rows[0]) {
      if (payment.rows[0].booking_id) {
        return res.status(409).json({ error: 'Booking-linked transactions must be removed from Booking Management.' });
      }
      await pool.query('DELETE FROM payments WHERE id = $1', [id]);
      await logAudit({ userId: req.auth.userId, action: 'delete', entity: 'payment', entityId: id });
      return res.json({ success: true });
    }

    const expense = await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
    if (expense.rowCount === 0) return res.status(404).json({ error: 'Transaction not found.' });
    await logAudit({ userId: req.auth.userId, action: 'delete', entity: 'expense', entityId: id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function dashboard(_req, res, next) {
  try {
    const [fleet, active, revenue, statuses, activities, monthly] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM cars'),
      pool.query("SELECT COUNT(*)::int AS count FROM bookings WHERE status IN ('active', 'overdue')"),
      pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM payments'),
      pool.query('SELECT status, COUNT(*)::int AS count FROM cars GROUP BY status'),
      pool.query(
        `SELECT id, action, entity, details, created_at
         FROM audit_logs
         ORDER BY created_at DESC
         LIMIT 20`
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('month', paid_at), 'Mon') AS month, COALESCE(SUM(amount), 0) AS revenue
         FROM payments
         GROUP BY date_trunc('month', paid_at)
         ORDER BY date_trunc('month', paid_at)`
      ),
    ]);

    const totalFleet = fleet.rows[0].count;
    const activeRentals = active.rows[0].count;
    const totalRevenue = Number(revenue.rows[0].total || 0);

    const statusColor = {
      Available: '#22c55e',
      Rented: '#ef4444',
      Maintenance: '#f59e0b',
    };

    const fleetStatusData = statuses.rows.map((r) => ({
      name: r.status,
      value: Number(r.count),
      color: statusColor[r.status] || '#6b7280',
    }));

    const revenueData = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => ({
      name: m,
      revenue: 0,
    }));

    for (const row of monthly.rows) {
      const idx = revenueData.findIndex((m) => m.name === row.month.trim());
      if (idx >= 0) revenueData[idx].revenue = Number(row.revenue || 0);
    }

    const activitiesMapped = activities.rows.map((a) => ({
      id: `ACT-${a.id}`,
      message: a.details?.message || `${a.action} ${a.entity}`,
      timestamp: new Date(a.created_at).getTime(),
      type: a.entity,
    }));

    const rentedCount = statuses.rows.find((r) => r.status === 'Rented')?.count || 0;

    res.json({
      totalFleet,
      activeRentals,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      utilization: totalFleet ? Number(((Number(rentedCount) / totalFleet) * 100).toFixed(1)) : 0,
      utilizationOccupied: Number(rentedCount),
      utilizationTotal: totalFleet,
      activities: activitiesMapped,
      revenueData,
      fleetStatusData,
    });
  } catch (error) {
    next(error);
  }
}

export async function listNotifications(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50);
    const notifications = await listNotificationLogs(limit);
    res.json(notifications);
  } catch (error) {
    next(error);
  }
}

export async function deleteNotifications(_req, res, next) {
  try {
    const deleted = await clearNotificationLogs();
    res.json({ success: true, deleted });
  } catch (error) {
    next(error);
  }
}

export async function getSettings(_req, res, next) {
  try {
    const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
    res.json(normalizeSettings(rows[0]?.data || {}));
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const merged = normalizeSettings(req.body || {});
    if (!merged.companyName) return res.status(400).json({ error: 'Company name is required.' });
    if (!merged.contactEmail) return res.status(400).json({ error: 'Contact email is required.' });
    if (merged.taxRate < 0 || merged.taxRate > 100) return res.status(400).json({ error: 'Tax rate must be between 0 and 100.' });

    await pool.query(
      `INSERT INTO settings (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(merged)]
    );

    await logAudit({ userId: req.auth.userId, action: 'update', entity: 'settings', entityId: '1' });
    res.json(merged);
  } catch (error) {
    next(error);
  }
}

export async function processBookingNotifications() {
  const settingsRows = await pool.query('SELECT data FROM settings WHERE id = 1');
  const settings = normalizeSettings(settingsRows.rows[0]?.data || {});

  const alertsEnabled = settings.bookingNotificationsEnabled !== false;
  const reminderMinutes = Math.max(0, Number(settings.bookingReminderMinutes ?? 10));
  const autoMarkOverdue = settings.autoMarkOverdue !== false;

  if (!alertsEnabled) return;

  const now = new Date();
  const { rows } = await pool.query(
    `SELECT id, status, end_date, end_time, end_reminder_notified_at, overdue_notified_at
     FROM bookings
     WHERE status IN ('reserved', 'active', 'overdue')`
  );

  for (const booking of rows) {
    const endAt = new Date(`${booking.end_date}T${String(booking.end_time).slice(0, 5)}:00`);
    if (Number.isNaN(endAt.getTime())) continue;

    const msUntilEnd = endAt.getTime() - now.getTime();

    if (reminderMinutes > 0 && msUntilEnd > 0 && msUntilEnd <= reminderMinutes * 60 * 1000 && !booking.end_reminder_notified_at) {
      await pool.query('UPDATE bookings SET end_reminder_notified_at = NOW() WHERE id = $1', [booking.id]);
      await logAudit({
        action: 'booking_reminder',
        entity: 'booking_notification',
        entityId: booking.id,
        details: { message: `Reminder: Booking ${booking.id} ends in ${reminderMinutes} minutes.` },
      });
    }

    if (msUntilEnd <= 0 && !booking.overdue_notified_at) {
      const message = autoMarkOverdue
        ? `Overdue: Booking ${booking.id} passed end time and was marked overdue.`
        : `Alert: Booking ${booking.id} reached end time and is pending return.`;

      await pool.query(
        `UPDATE bookings
         SET overdue_notified_at = NOW(),
             status = CASE WHEN $2::boolean AND status <> 'completed' AND status <> 'cancelled' THEN 'overdue' ELSE status END
         WHERE id = $1`,
        [booking.id, autoMarkOverdue]
      );

      await logAudit({
        action: 'booking_overdue',
        entity: 'booking_notification',
        entityId: booking.id,
        details: { message },
      });
    }
  }
}
