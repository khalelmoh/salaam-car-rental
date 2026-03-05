import http from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { initDb, readDb, writeDb } from './db.js';

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
    username: user.username || '',
    email: user.email,
    role: user.role,
    name: user.name,
    title: user.title || '',
  };
}

function toFlatSettings(raw = {}) {
  if (raw.company || raw.regional || raw.finance || raw.booking) {
    return {
      companyName: raw.company?.name || 'Salaam Car Rental',
      contactEmail: raw.company?.contactEmail || 'admin@salaam.com',
      currency: raw.regional?.currency || 'USD',
      taxRate: Number(raw.finance?.taxRate || 0),
      bookingLeadHours: Number(raw.booking?.leadHours || 0),
      bookingNotificationsEnabled: raw.notifications?.bookingEndAlerts?.enabled !== false,
      bookingReminderMinutes: Number(raw.notifications?.bookingEndAlerts?.reminderMinutes ?? 10),
      autoMarkOverdue: raw.notifications?.bookingEndAlerts?.autoMarkOverdue !== false,
    };
  }

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

function makeId(prefix) {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function toDateTime(date, time, fallbackTime = '00:00') {
  return new Date(`${date}T${time || fallbackTime}:00`);
}

const SETTINGS_VERSION = 2;

const defaultSettings = () => ({
  company: {
    name: 'Salaam Car Rental',
    contactEmail: 'admin@salaam.com',
  },
  regional: {
    currency: 'USD',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    language: 'en',
  },
  booking: {
    leadHours: 1,
    allowOverbooking: false,
    maxActiveBookingsPerCustomer: 3,
  },
  finance: {
    taxRate: 0,
    commissionRate: 0,
    invoicePrefix: 'INV',
    roundingMode: 'round',
  },
  notifications: {
    emailEnabled: true,
    smsEnabled: false,
    dailyDigestHour: 8,
    bookingEndAlerts: {
      enabled: true,
      reminderMinutes: 10,
      autoMarkOverdue: true,
    },
  },
  security: {
    sessionTtlHours: 12,
    passwordMinLength: 8,
    mfaRequired: false,
  },
  meta: {
    version: SETTINGS_VERSION,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, patch) {
  const output = { ...base };
  for (const key of Object.keys(patch || {})) {
    const nextValue = patch[key];
    if (nextValue === undefined) continue;
    const currentValue = output[key];
    if (isPlainObject(currentValue) && isPlainObject(nextValue)) {
      output[key] = deepMerge(currentValue, nextValue);
    } else {
      output[key] = nextValue;
    }
  }
  return output;
}

function normalizeSettings(rawSettings = {}) {
  const defaults = defaultSettings();
  const picked = {
    company: rawSettings.company,
    regional: rawSettings.regional,
    booking: rawSettings.booking,
    finance: rawSettings.finance,
    notifications: rawSettings.notifications,
    security: rawSettings.security,
    meta: rawSettings.meta,
  };

  // Backward compatibility: support legacy flat settings shape.
  const legacyPatch = {};
  if (rawSettings.companyName !== undefined || rawSettings.contactEmail !== undefined) {
    legacyPatch.company = {
      name: rawSettings.companyName ?? defaults.company.name,
      contactEmail: rawSettings.contactEmail ?? defaults.company.contactEmail,
    };
  }
  if (rawSettings.currency !== undefined) {
    legacyPatch.regional = { currency: rawSettings.currency };
  }
  if (rawSettings.taxRate !== undefined) {
    legacyPatch.finance = { taxRate: Number(rawSettings.taxRate) };
  }
  if (rawSettings.bookingLeadHours !== undefined) {
    legacyPatch.booking = { leadHours: Number(rawSettings.bookingLeadHours) };
  }

  const merged = deepMerge(defaults, deepMerge(picked, legacyPatch));

  merged.company.name = String(merged.company.name || '').trim();
  merged.company.contactEmail = String(merged.company.contactEmail || '').trim();
  merged.regional.currency = String(merged.regional.currency || 'USD').trim().toUpperCase();
  merged.regional.timezone = String(merged.regional.timezone || 'UTC').trim();
  merged.regional.dateFormat = String(merged.regional.dateFormat || 'YYYY-MM-DD').trim();
  merged.regional.language = String(merged.regional.language || 'en').trim().toLowerCase();

  merged.booking.leadHours = Number(merged.booking.leadHours || 0);
  merged.booking.maxActiveBookingsPerCustomer = Number(merged.booking.maxActiveBookingsPerCustomer || 0);
  merged.booking.allowOverbooking = Boolean(merged.booking.allowOverbooking);

  merged.finance.taxRate = Number(merged.finance.taxRate || 0);
  merged.finance.commissionRate = Number(merged.finance.commissionRate || 0);
  merged.finance.invoicePrefix = String(merged.finance.invoicePrefix || 'INV').trim().toUpperCase();
  merged.finance.roundingMode = ['round', 'floor', 'ceil'].includes(merged.finance.roundingMode)
    ? merged.finance.roundingMode
    : 'round';

  merged.notifications.emailEnabled = Boolean(merged.notifications.emailEnabled);
  merged.notifications.smsEnabled = Boolean(merged.notifications.smsEnabled);
  merged.notifications.dailyDigestHour = Number(merged.notifications.dailyDigestHour ?? 8);

  merged.security.sessionTtlHours = Number(merged.security.sessionTtlHours || 12);
  merged.security.passwordMinLength = Number(merged.security.passwordMinLength || 8);
  merged.security.mfaRequired = Boolean(merged.security.mfaRequired);

  merged.meta = {
    version: SETTINGS_VERSION,
    updatedAt: String(merged.meta?.updatedAt || new Date().toISOString()),
    updatedBy: String(merged.meta?.updatedBy || 'system'),
  };

  return merged;
}

function validateSettings(settings) {
  if (!settings.company.name) return 'Company name is required.';
  if (!settings.company.contactEmail) return 'Contact email is required.';
  if (settings.finance.taxRate < 0 || settings.finance.taxRate > 100) return 'Tax rate must be between 0 and 100.';
  if (settings.finance.commissionRate < 0 || settings.finance.commissionRate > 100) return 'Commission rate must be between 0 and 100.';
  if (settings.booking.leadHours < 0) return 'Booking lead hours must be zero or greater.';
  if (settings.booking.maxActiveBookingsPerCustomer < 1) return 'Max active bookings per customer must be at least 1.';
  if (settings.notifications.dailyDigestHour < 0 || settings.notifications.dailyDigestHour > 23) return 'Daily digest hour must be between 0 and 23.';
  const bookingEndAlerts = settings.notifications.bookingEndAlerts || {};
  if (Number(bookingEndAlerts.reminderMinutes) < 0 || Number(bookingEndAlerts.reminderMinutes) > 120) return 'Booking reminder minutes must be between 0 and 120.';
  if (settings.security.sessionTtlHours < 1) return 'Session TTL must be at least 1 hour.';
  if (settings.security.passwordMinLength < 6) return 'Password minimum length must be at least 6.';
  return null;
}

function bookingSubtotal(car, startDate, endDate, startTime = '00:00', endTime = '23:59') {
  const start = toDateTime(startDate, startTime, '00:00');
  const end = toDateTime(endDate, endTime, '23:59');
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const days = Math.max(1, diff);
  return days * car.pricePerDay;
}

function bookingRentalDays(startDate, endDate, startTime = '00:00', endTime = '23:59') {
  const start = toDateTime(startDate, startTime, '00:00');
  const end = toDateTime(endDate, endTime, '23:59');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

function calculateBookingAmounts(car, startDate, endDate, startTime = '00:00', endTime = '23:59', discountType = 'fixed', discountValue = 0) {
  const subtotalAmount = bookingSubtotal(car, startDate, endDate, startTime, endTime);
  const normalizedType = discountType === 'percent' ? 'percent' : 'fixed';
  const normalizedValue = Number(discountValue || 0);
  let discountAmount = 0;

  if (normalizedType === 'percent') {
    discountAmount = subtotalAmount * (normalizedValue / 100);
  } else {
    discountAmount = normalizedValue;
  }

  discountAmount = Math.max(0, Math.min(subtotalAmount, discountAmount));
  const totalAmount = Math.max(0, subtotalAmount - discountAmount);

  return {
    discountType: normalizedType,
    discountValue: normalizedValue,
    discountAmount: Number(discountAmount.toFixed(2)),
    subtotalAmount: Number(subtotalAmount.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
  };
}

function hasBookingOverlap(db, carId, startDate, endDate, startTime = '00:00', endTime = '23:59', excludeBookingId = null) {
  const start = toDateTime(startDate, startTime, '00:00');
  const end = toDateTime(endDate, endTime, '23:59');

  return db.bookings.some((booking) => {
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    if (booking.carId !== carId) return false;
    if (!['reserved', 'active', 'overdue'].includes(booking.status)) return false;

    const bookingStart = toDateTime(booking.startDate, booking.startTime, '00:00');
    const bookingEnd = toDateTime(booking.endDate, booking.endTime, '23:59');
    if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime())) return false;

    return start <= bookingEnd && bookingStart <= end;
  });
}

function syncBookingIncomeTransaction(db, booking, car, customer) {
  const existingIdx = db.transactions.findIndex((t) => t.bookingId === booking.id);
  const shouldKeep = booking.status !== 'cancelled';

  if (!shouldKeep) {
    if (existingIdx >= 0) {
      db.transactions.splice(existingIdx, 1);
    }
    return;
  }

  const payload = {
    id: existingIdx >= 0 ? db.transactions[existingIdx].id : makeId('TRX'),
    date: booking.startDate,
    description: `Booking ${booking.id}: ${car.name} (${customer.fullName})`,
    type: 'Income',
    amount: Number(booking.totalAmount || 0),
    category: 'Rental',
    bookingId: booking.id,
    systemGenerated: true,
  };

  if (existingIdx >= 0) {
    db.transactions[existingIdx] = payload;
  } else {
    db.transactions.unshift(payload);
  }
}

function revenueByMonth(transactions) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = new Map(months.map((m) => [m, 0]));
  for (const trx of transactions) {
    if (!['Income', 'Commission'].includes(trx.type)) continue;
    const d = new Date(trx.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = months[d.getMonth()];
    map.set(key, (map.get(key) || 0) + Number(trx.amount || 0));
  }
  return months.map((m) => ({ name: m, revenue: map.get(m) || 0 }));
}

function inDateRange(date, from, to) {
  const current = new Date(`${date}T00:00:00`);
  if (Number.isNaN(current.getTime())) return false;
  if (from) {
    const fromDate = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(fromDate.getTime()) && current < fromDate) {
      return false;
    }
  }
  if (to) {
    const toDate = new Date(`${to}T23:59:59`);
    if (!Number.isNaN(toDate.getTime()) && current > toDate) {
      return false;
    }
  }
  return true;
}

function bookingOverlapsNow(booking, now = new Date()) {
  if (!booking?.startDate || !booking?.endDate) return false;
  const start = toDateTime(booking.startDate, booking.startTime || '00:00', '00:00');
  const end = toDateTime(booking.endDate, booking.endTime || '23:59', '23:59');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start <= now && now <= end;
}

function addSystemActivity(db, message, type = 'booking') {
  db.activities = Array.isArray(db.activities) ? db.activities : [];
  db.activities.unshift({
    id: makeId('ACT'),
    message,
    type,
    timestamp: Date.now(),
  });
  db.activities = db.activities.slice(0, 200);
}

function isBookingNotificationActivity(activity) {
  if (!activity) return false;
  if (activity.type === 'booking') return true;
  const message = String(activity.message || '');
  return /^(Reminder:|Overdue:|Alert:)/.test(message);
}

function processBookingEndNotifications(db, now = new Date()) {
  const settings = toFlatSettings(db.settings || {});
  const alertsEnabled = settings.bookingNotificationsEnabled !== false;
  const reminderMinutes = Math.max(0, Number(settings.bookingReminderMinutes ?? 10));
  const autoMarkOverdue = settings.autoMarkOverdue !== false;
  let changed = false;

  for (const booking of db.bookings || []) {
    if (!booking || !['reserved', 'active', 'overdue'].includes(booking.status)) continue;

    const endAt = toDateTime(booking.endDate, booking.endTime || '23:59', '23:59');
    if (Number.isNaN(endAt.getTime())) continue;
    const msUntilEnd = endAt.getTime() - now.getTime();

    if (alertsEnabled && reminderMinutes > 0 && msUntilEnd > 0 && msUntilEnd <= reminderMinutes * 60 * 1000) {
      if (!booking.endReminderNotifiedAt) {
        addSystemActivity(db, `Reminder: Booking ${booking.id} ends in ${reminderMinutes} minutes.`);
        booking.endReminderNotifiedAt = new Date().toISOString();
        changed = true;
      }
    }

    const notReturned = !['completed', 'cancelled'].includes(booking.status);
    if (alertsEnabled && notReturned && msUntilEnd <= 0) {
      if (!booking.overdueNotifiedAt) {
        addSystemActivity(
          db,
          autoMarkOverdue
            ? `Overdue: Booking ${booking.id} passed end time and was marked overdue.`
            : `Alert: Booking ${booking.id} reached end time and is pending return.`
        );
        booking.overdueNotifiedAt = new Date().toISOString();
        changed = true;
      }
      if (autoMarkOverdue && booking.status !== 'overdue') {
        booking.status = 'overdue';
        changed = true;
      }
    }
  }

  return changed;
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
    const monitorChanged = processBookingEndNotifications(db);
    if (monitorChanged) {
      await writeDb(db);
    }

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

      const identifier = String(body.email).toLowerCase();
      const user = db.users.find((u) =>
        u.email.toLowerCase() === identifier || String(u.username || '').toLowerCase() === identifier
      );
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

    if (pathname === '/api/auth/profile' && req.method === 'PUT') {
      const body = await parseBody(req);
      const userIdx = db.users.findIndex((u) => u.id === auth.user.id);
      if (userIdx < 0) {
        json(res, 404, { error: 'User not found.' });
        return;
      }

      const user = db.users[userIdx];
      const nextUsername = body.username !== undefined ? String(body.username).trim() : String(user.username || '');
      const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : String(user.email).trim().toLowerCase();
      const nextName = body.name !== undefined ? String(body.name).trim() : String(user.name || '');
      const nextTitle = body.title !== undefined ? String(body.title).trim() : String(user.title || '');

      if (!nextUsername) {
        json(res, 400, { error: 'Username is required.' });
        return;
      }
      if (!nextEmail) {
        json(res, 400, { error: 'Email is required.' });
        return;
      }
      const duplicate = db.users.find(
        (u) => u.id !== user.id && (String(u.username || '').toLowerCase() === nextUsername.toLowerCase() || u.email.toLowerCase() === nextEmail)
      );
      if (duplicate) {
        json(res, 409, { error: 'Username or email already exists.' });
        return;
      }

      if (body.newPassword !== undefined) {
        if (!body.currentPassword) {
          json(res, 400, { error: 'Current password is required to set a new password.' });
          return;
        }
        const currentValid = user.passwordHash
          ? verifyPassword(body.currentPassword, user.passwordHash)
          : user.password === body.currentPassword;
        if (!currentValid) {
          json(res, 401, { error: 'Current password is incorrect.' });
          return;
        }
        if (String(body.newPassword).length < 6) {
          json(res, 400, { error: 'New password must be at least 6 characters.' });
          return;
        }
        user.passwordHash = hashPassword(String(body.newPassword));
        delete user.password;
      }

      user.username = nextUsername;
      user.email = nextEmail;
      user.name = nextName;
      user.title = nextTitle;
      db.users[userIdx] = user;
      await writeDb(db);
      json(res, 200, { user: sanitizeUser(user) });
      return;
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      if (auth.user.role !== 'admin') {
        json(res, 403, { error: 'Admin role required.' });
        return;
      }
      json(res, 200, db.users.map(sanitizeUser));
      return;
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      if (auth.user.role !== 'admin') {
        json(res, 403, { error: 'Admin role required.' });
        return;
      }
      const body = await parseBody(req);
      const validationError = requireFields(body, ['username', 'email', 'password', 'role', 'name']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      const username = String(body.username).trim();
      const email = String(body.email).trim().toLowerCase();
      const exists = db.users.some(
        (u) => String(u.username || '').toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email
      );
      if (exists) {
        json(res, 409, { error: 'Username or email already exists.' });
        return;
      }
      const user = {
        id: makeId('USR'),
        username,
        email,
        role: String(body.role || 'staff'),
        name: String(body.name || '').trim(),
        title: String(body.title || '').trim(),
        passwordHash: hashPassword(String(body.password)),
      };
      db.users.push(user);
      await writeDb(db);
      json(res, 201, sanitizeUser(user));
      return;
    }

    if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
      if (auth.user.role !== 'admin') {
        json(res, 403, { error: 'Admin role required.' });
        return;
      }
      const id = pathname.split('/').pop();
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx < 0) {
        json(res, 404, { error: 'User not found.' });
        return;
      }
      const body = await parseBody(req);
      const user = db.users[idx];
      const nextUsername = body.username !== undefined ? String(body.username).trim() : String(user.username || '');
      const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : String(user.email).trim().toLowerCase();
      const duplicate = db.users.find(
        (u) => u.id !== user.id && (String(u.username || '').toLowerCase() === nextUsername.toLowerCase() || u.email.toLowerCase() === nextEmail)
      );
      if (duplicate) {
        json(res, 409, { error: 'Username or email already exists.' });
        return;
      }
      user.username = nextUsername;
      user.email = nextEmail;
      user.role = body.role !== undefined ? String(body.role) : user.role;
      user.name = body.name !== undefined ? String(body.name).trim() : user.name;
      user.title = body.title !== undefined ? String(body.title).trim() : (user.title || '');
      if (body.password !== undefined) {
        if (String(body.password).length < 6) {
          json(res, 400, { error: 'Password must be at least 6 characters.' });
          return;
        }
        user.passwordHash = hashPassword(String(body.password));
        delete user.password;
      }
      db.users[idx] = user;
      await writeDb(db);
      json(res, 200, sanitizeUser(user));
      return;
    }

    if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
      if (auth.user.role !== 'admin') {
        json(res, 403, { error: 'Admin role required.' });
        return;
      }
      const id = pathname.split('/').pop();
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx < 0) {
        json(res, 404, { error: 'User not found.' });
        return;
      }
      if (id === auth.user.id) {
        json(res, 400, { error: 'You cannot delete your own account.' });
        return;
      }

      const targetUser = db.users[idx];
      const adminCount = db.users.filter((u) => u.role === 'admin').length;
      if (targetUser.role === 'admin' && adminCount <= 1) {
        json(res, 409, { error: 'Cannot delete the last admin user.' });
        return;
      }

      db.users.splice(idx, 1);
      db.sessions = db.sessions.filter((session) => session.userId !== id);
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const now = new Date();
      const bookingOccupiedCarIds = new Set(
        db.bookings
          .filter((b) => ['active', 'reserved', 'overdue'].includes(b.status) && bookingOverlapsNow(b, now))
          .map((b) => b.carId)
      );
      const statusOccupiedCarIds = new Set(
        db.cars
          .filter((car) => car.status === 'Rented')
          .map((car) => car.id)
      );
      const occupiedCarIds = new Set([...bookingOccupiedCarIds, ...statusOccupiedCarIds]);
      const activeRentals = occupiedCarIds.size;
      const totalRevenue = db.transactions
        .filter((t) => ['Income', 'Commission'].includes(t.type))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalFleet = db.cars.length;
      const utilization = totalFleet ? Number(((activeRentals / totalFleet) * 100).toFixed(1)) : 0;

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
        utilizationOccupied: activeRentals,
        utilizationTotal: totalFleet,
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

    if (pathname.startsWith('/api/cars/') && pathname.endsWith('/report') && req.method === 'GET') {
      const parts = pathname.split('/').filter(Boolean);
      const carId = parts[2];
      const car = db.cars.find((c) => c.id === carId);
      if (!car) {
        json(res, 404, { error: 'Vehicle not found.' });
        return;
      }

      const period = String(url.searchParams.get('period') || 'all');
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const month = Number(url.searchParams.get('month') || 0);
      const year = Number(url.searchParams.get('year') || 0);
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize') || 10)));
      const allRows = url.searchParams.get('all') === 'true';

      const filtered = db.bookings.filter((booking) => {
        if (booking.carId !== carId) return false;
        if (booking.status === 'cancelled') return false;
        const date = booking.startDate;
        if (period === 'range') {
          return inDateRange(date, from, to);
        }
        if (period === 'monthly') {
          const d = new Date(`${date}T00:00:00`);
          if (Number.isNaN(d.getTime())) return false;
          if (!year || !month) return false;
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        }
        if (period === 'yearly') {
          const d = new Date(`${date}T00:00:00`);
          if (Number.isNaN(d.getTime())) return false;
          if (!year) return false;
          return d.getFullYear() === year;
        }
        return true;
      });

      // Aggregations: SUM(total_amount), SUM(rental_days), COUNT(rentals)
      let totalRevenue = 0;
      let totalDaysRented = 0;
      for (const booking of filtered) {
        totalRevenue += Number(booking.totalAmount || 0);
        totalDaysRented += bookingRentalDays(
          booking.startDate,
          booking.endDate,
          booking.startTime || '00:00',
          booking.endTime || '23:59'
        );
      }

      const rows = filtered
        .slice()
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .map((booking) => {
          const customer = db.customers.find((c) => c.id === booking.customerId);
          const rentalDays = bookingRentalDays(
            booking.startDate,
            booking.endDate,
            booking.startTime || '00:00',
            booking.endTime || '23:59'
          );
          return {
            bookingId: booking.id,
            customerName: customer?.fullName || booking.customerId,
            startDate: booking.startDate,
            endDate: booking.endDate,
            rentalDays,
            amountPaid: Number(booking.totalAmount || 0),
            status: booking.status,
            paymentStatus: booking.paymentStatus,
          };
        });

      const paginatedRows = allRows
        ? rows
        : rows.slice((page - 1) * pageSize, page * pageSize);

      json(res, 200, {
        car: {
          id: car.id,
          name: car.name,
          status: car.status,
          licensePlate: car.licensePlate,
          category: car.category,
        },
        filters: {
          period,
          from,
          to,
          month: month || null,
          year: year || null,
        },
        summary: {
          totalRentals: rows.length,
          totalDaysRented,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          averageRevenuePerRental: rows.length ? Number((totalRevenue / rows.length).toFixed(2)) : 0,
        },
        pagination: {
          page: allRows ? 1 : page,
          pageSize: allRows ? rows.length || 1 : pageSize,
          total: rows.length,
          totalPages: allRows ? 1 : Math.max(1, Math.ceil(rows.length / pageSize)),
        },
        rows: paginatedRows,
      });
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
        ownerPhone: body.ownerPhone || '',
        image: body.image || '',
        pricePerDay: Number(body.pricePerDay),
        transmission: body.transmission || 'Automatic',
        seats: Number(body.seats || 5),
        fuelType: body.fuelType || 'Petrol',
        mpg: body.mpg || '',
        status: body.status,
        licensePlate: body.licensePlate,
        createdAt: new Date().toISOString(),
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
      const validationError = requireFields(body, ['carId', 'customerId', 'startDate', 'startTime', 'endDate', 'endTime']);
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
      if (car.status === 'Rented') {
        json(res, 409, { error: 'This vehicle is currently rented and cannot be booked.' });
        return;
      }
      if (car.status === 'Maintenance') {
        json(res, 409, { error: 'This vehicle is in maintenance and cannot be booked.' });
        return;
      }
      const start = toDateTime(body.startDate, body.startTime, '00:00');
      const end = toDateTime(body.endDate, body.endTime, '23:59');
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        json(res, 400, { error: 'Invalid start/end date or time.' });
        return;
      }
      const discountType = body.discountType === 'percent' ? 'percent' : 'fixed';
      const discountValue = Number(body.discountValue || 0);
      if (Number.isNaN(discountValue) || discountValue < 0) {
        json(res, 400, { error: 'Discount value must be a number greater than or equal to zero.' });
        return;
      }
      if (discountType === 'percent' && discountValue > 100) {
        json(res, 400, { error: 'Percentage discount cannot exceed 100.' });
        return;
      }
      if (hasBookingOverlap(db, body.carId, body.startDate, body.endDate, body.startTime, body.endTime)) {
        json(res, 409, { error: 'This vehicle is already rented/reserved for the selected dates.' });
        return;
      }

      const totals = calculateBookingAmounts(
        car,
        body.startDate,
        body.endDate,
        body.startTime,
        body.endTime,
        discountType,
        discountValue
      );
      const booking = {
        id: makeId('BK'),
        carId: body.carId,
        customerId: body.customerId,
        startDate: body.startDate,
        startTime: body.startTime,
        endDate: body.endDate,
        endTime: body.endTime,
        discountType: totals.discountType,
        discountValue: totals.discountValue,
        discountAmount: totals.discountAmount,
        subtotalAmount: totals.subtotalAmount,
        totalAmount: totals.totalAmount,
        status: 'reserved',
        paymentStatus: 'pending',
        createdAt: new Date().toISOString(),
      };
      db.bookings.unshift(booking);
      syncBookingIncomeTransaction(db, booking, car, customer);
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
      const existingBooking = db.bookings[idx];
      const merged = { ...existingBooking, ...body };
      if (!['reserved', 'active', 'overdue', 'completed', 'cancelled'].includes(merged.status)) {
        json(res, 400, { error: 'Invalid booking status.' });
        return;
      }
      if (!['pending', 'paid'].includes(merged.paymentStatus)) {
        json(res, 400, { error: 'Invalid payment status.' });
        return;
      }
      const car = db.cars.find((c) => c.id === merged.carId);
      if (!car) {
        json(res, 404, { error: 'Selected vehicle does not exist.' });
        return;
      }
      const customer = db.customers.find((c) => c.id === merged.customerId);
      if (!customer) {
        json(res, 404, { error: 'Selected customer does not exist.' });
        return;
      }
      merged.startTime = merged.startTime || '00:00';
      merged.endTime = merged.endTime || '23:59';
      const start = toDateTime(merged.startDate, merged.startTime, '00:00');
      const end = toDateTime(merged.endDate, merged.endTime, '23:59');
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        json(res, 400, { error: 'Invalid start/end date or time.' });
        return;
      }
      merged.discountType = merged.discountType === 'percent' ? 'percent' : 'fixed';
      merged.discountValue = Number(merged.discountValue || 0);
      if (Number.isNaN(merged.discountValue) || merged.discountValue < 0) {
        json(res, 400, { error: 'Discount value must be a number greater than or equal to zero.' });
        return;
      }
      if (merged.discountType === 'percent' && merged.discountValue > 100) {
        json(res, 400, { error: 'Percentage discount cannot exceed 100.' });
        return;
      }
      if (merged.status !== 'cancelled') {
        if (car.status === 'Rented') {
          json(res, 409, { error: 'This vehicle is currently rented and cannot be booked.' });
          return;
        }
        if (car.status === 'Maintenance') {
          json(res, 409, { error: 'This vehicle is in maintenance and cannot be booked.' });
          return;
        }
        if (hasBookingOverlap(db, merged.carId, merged.startDate, merged.endDate, merged.startTime, merged.endTime, id)) {
          json(res, 409, { error: 'This vehicle is already rented/reserved for the selected dates.' });
          return;
        }
      }
      const totals = calculateBookingAmounts(
        car,
        merged.startDate,
        merged.endDate,
        merged.startTime,
        merged.endTime,
        merged.discountType,
        merged.discountValue
      );
      merged.discountType = totals.discountType;
      merged.discountValue = totals.discountValue;
      merged.discountAmount = totals.discountAmount;
      merged.subtotalAmount = totals.subtotalAmount;
      merged.totalAmount = totals.totalAmount;
      const endChanged = merged.endDate !== existingBooking.endDate || merged.endTime !== existingBooking.endTime;
      if (endChanged) {
        delete merged.endReminderNotifiedAt;
        delete merged.overdueNotifiedAt;
      }
      db.bookings[idx] = merged;
      syncBookingIncomeTransaction(db, merged, car, customer);
      await writeDb(db);
      json(res, 200, merged);
      return;
    }

    if (pathname.startsWith('/api/bookings/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const booking = db.bookings.find((b) => b.id === id);
      if (!booking) {
        json(res, 404, { error: 'Booking not found.' });
        return;
      }
      db.bookings = db.bookings.filter((b) => b.id !== id);
      db.transactions = db.transactions.filter((t) => t.bookingId !== booking.id);
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
      if (!['Income', 'Expense', 'Commission'].includes(body.type)) {
        json(res, 400, { error: 'type must be Income, Expense, or Commission.' });
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
        createdAt: new Date().toISOString(),
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
      if (!['Income', 'Expense', 'Commission'].includes(merged.type)) {
        json(res, 400, { error: 'type must be Income, Expense, or Commission.' });
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
      const transaction = db.transactions.find((t) => t.id === id);
      if (!transaction) {
        json(res, 404, { error: 'Transaction not found.' });
        return;
      }
      if (transaction.bookingId) {
        json(res, 409, { error: 'Booking-linked transactions must be removed from Booking Management.' });
        return;
      }
      db.transactions = db.transactions.filter((t) => t.id !== id);
      await writeDb(db);
      json(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/notifications' && req.method === 'GET') {
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)));
      const notifications = (db.activities || [])
        .filter(isBookingNotificationActivity)
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
        .slice(0, limit);
      json(res, 200, notifications);
      return;
    }

    if (pathname === '/api/notifications' && req.method === 'DELETE') {
      const before = (db.activities || []).length;
      db.activities = (db.activities || []).filter((activity) => !isBookingNotificationActivity(activity));
      const deleted = before - db.activities.length;
      await writeDb(db);
      json(res, 200, { success: true, deleted });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      json(res, 200, toFlatSettings(db.settings));
      return;
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await parseBody(req);
      const merged = { ...toFlatSettings(db.settings), ...body };
      const validationError = requireFields(merged, ['companyName', 'contactEmail', 'currency', 'taxRate', 'bookingLeadHours']);
      if (validationError) {
        json(res, 400, { error: validationError });
        return;
      }
      merged.taxRate = Number(merged.taxRate);
      merged.bookingLeadHours = Number(merged.bookingLeadHours);
      merged.bookingNotificationsEnabled = merged.bookingNotificationsEnabled !== false;
      merged.bookingReminderMinutes = Number(merged.bookingReminderMinutes ?? 10);
      merged.autoMarkOverdue = merged.autoMarkOverdue !== false;
      if (Number.isNaN(merged.taxRate) || Number.isNaN(merged.bookingLeadHours) || Number.isNaN(merged.bookingReminderMinutes)) {
        json(res, 400, { error: 'taxRate, bookingLeadHours, and bookingReminderMinutes must be numeric.' });
        return;
      }
      if (merged.bookingReminderMinutes < 0 || merged.bookingReminderMinutes > 120) {
        json(res, 400, { error: 'bookingReminderMinutes must be between 0 and 120.' });
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

async function startServer() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

setInterval(async () => {
  try {
    const db = await readDb();
    const changed = processBookingEndNotifications(db);
    if (changed) {
      await writeDb(db);
    }
  } catch {
    // Keep interval resilient; request handlers still validate and persist state.
  }
}, 30 * 1000);
