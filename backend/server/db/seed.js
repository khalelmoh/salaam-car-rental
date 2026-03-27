import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyJsonPath = path.join(__dirname, '..', '..', 'db.json');

function fallbackSettings() {
  return {
    companyName: 'Salaam Car Rental',
    contactEmail: 'admin@salaam.com',
    currency: 'USD',
    taxRate: 0,
    bookingLeadHours: 0,
    bookingNotificationsEnabled: true,
    bookingReminderMinutes: 10,
    autoMarkOverdue: true,
  };
}

async function readLegacyAppState() {
  try {
    const appState = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (appState.rows.length > 0) return appState.rows[0].data || {};
  } catch {
    // app_state might not exist anymore.
  }

  try {
    const raw = await fs.readFile(legacyJsonPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function alreadySeeded() {
  const checks = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM users'),
    pool.query('SELECT COUNT(*)::int AS count FROM cars'),
    pool.query('SELECT COUNT(*)::int AS count FROM customers'),
    pool.query('SELECT COUNT(*)::int AS count FROM bookings'),
    pool.query('SELECT COUNT(*)::int AS count FROM payments'),
    pool.query('SELECT COUNT(*)::int AS count FROM expenses'),
  ]);
  return checks.some((r) => r.rows[0].count > 0);
}

function mapRoleName(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'manager') return 'manager';
  return 'staff';
}

function isTestEnv() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'test';
}

function resolveBootstrapPassword() {
  const configured = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '').trim();
  if (configured) return configured;
  return 'admin';
}

export async function seedFromLegacyIfEmpty() {
  if (await alreadySeeded()) {
    return;
  }

  const legacy = await readLegacyAppState();

  const roleRows = await pool.query('SELECT id, name FROM roles');
  const roleIdByName = new Map(roleRows.rows.map((r) => [r.name, r.id]));

  await pool.query('BEGIN');
  try {
    for (const user of legacy.users || []) {
      const roleName = mapRoleName(user.role);
      await pool.query(
        `INSERT INTO users (id, name, username, email, password_hash, must_change_password, role_id, title, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [
          user.id,
          user.name || user.username || 'User',
          user.username || null,
          String(user.email || '').toLowerCase(),
          user.passwordHash || user.password || '',
          false,
          roleIdByName.get(roleName),
          user.title || '',
          user.createdAt || null,
        ]
      );
    }

    // Reset bootstrap admin credentials during first seed only.
    const adminHash = await bcrypt.hash(resolveBootstrapPassword(), 12);
    const mustChangePassword = !isTestEnv();
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = $2
       WHERE LOWER(email) = 'admin@salaam.com'`,
      [adminHash, mustChangePassword]
    );

    const reservedPlates = new Set();
    for (const car of legacy.cars || []) {
      const basePlate = String(car.licensePlate || '').trim() || `UNKNOWN-${car.id}`;
      let candidatePlate = basePlate;
      let suffix = 1;

      // Legacy JSON can contain duplicate license plates. Keep uniqueness deterministic during migration.
      while (true) {
        if (reservedPlates.has(candidatePlate)) {
          suffix += 1;
          candidatePlate = `${basePlate}-${suffix}`;
          continue;
        }
        const existingPlate = await pool.query('SELECT 1 FROM cars WHERE license_plate = $1 LIMIT 1', [candidatePlate]);
        if (existingPlate.rows.length > 0) {
          suffix += 1;
          candidatePlate = `${basePlate}-${suffix}`;
          continue;
        }
        break;
      }

      reservedPlates.add(candidatePlate);

      await pool.query(
        `INSERT INTO cars (
          id, branch_id, name, category, owner_phone, image, price_per_day, transmission, seats,
          fuel_type, mpg, status, license_plate, created_at
        )
        VALUES ($1, 'BR-001', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, NOW()))
        ON CONFLICT (id) DO NOTHING`,
        [
          car.id,
          car.name,
          car.category,
          car.ownerPhone || '',
          car.image || '',
          Number(car.pricePerDay || 0),
          car.transmission || 'Automatic',
          Number(car.seats || 5),
          car.fuelType || 'Petrol',
          car.mpg || '',
          ['Available', 'Rented', 'Maintenance'].includes(car.status) ? car.status : 'Available',
          candidatePlate,
          car.createdAt || null,
        ]
      );
    }

    for (const customer of legacy.customers || []) {
      await pool.query(
        `INSERT INTO customers (id, full_name, phone, email, national_id, license_number, damiin_name, address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [
          customer.id,
          customer.fullName,
          customer.phone,
          String(customer.email || '').toLowerCase(),
          customer.nationalId || '',
          customer.driverLicenseNumber || '',
          customer.damiin || '',
          customer.address || '',
          customer.createdAt || null,
        ]
      );
    }

    for (const booking of legacy.bookings || []) {
      await pool.query(
        `INSERT INTO bookings (
          id, car_id, customer_id, start_date, start_time, end_date, end_time, subtotal_amount,
          discount_type, discount_value, discount_amount, total_amount, status, payment_status,
          end_reminder_notified_at, overdue_notified_at, created_at
        )
        VALUES (
          $1, $2, $3, $4::date, COALESCE($5::time, '00:00'), $6::date, COALESCE($7::time, '23:59'),
          $8, $9, $10, $11, $12, $13, $14,
          $15::timestamptz, $16::timestamptz, COALESCE($17::timestamptz, NOW())
        )
        ON CONFLICT (id) DO NOTHING`,
        [
          booking.id,
          booking.carId,
          booking.customerId,
          booking.startDate,
          booking.startTime || null,
          booking.endDate,
          booking.endTime || null,
          Number(booking.subtotalAmount || booking.totalAmount || 0),
          booking.discountType === 'percent' ? 'percent' : 'fixed',
          Number(booking.discountValue || 0),
          Number(booking.discountAmount || 0),
          Number(booking.totalAmount || 0),
          ['reserved', 'active', 'overdue', 'completed', 'cancelled'].includes(booking.status)
            ? booking.status
            : 'reserved',
          ['pending', 'paid'].includes(booking.paymentStatus) ? booking.paymentStatus : 'pending',
          booking.endReminderNotifiedAt || null,
          booking.overdueNotifiedAt || null,
          booking.createdAt || null,
        ]
      );
    }

    for (const trx of legacy.transactions || []) {
      const type = String(trx.type || 'Income');
      if (type === 'Expense') {
        await pool.query(
          `INSERT INTO expenses (id, amount, description, category, expense_date)
           VALUES ($1, $2, $3, $4, $5::date)
           ON CONFLICT (id) DO NOTHING`,
          [
            trx.id,
            Number(trx.amount || 0),
            trx.description || 'Expense',
            trx.category || 'General',
            trx.date,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO payments (id, booking_id, amount, payment_method, note, system_generated, paid_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
           ON CONFLICT (id) DO NOTHING`,
          [
            trx.id,
            trx.bookingId || null,
            Number(trx.amount || 0),
            type === 'Commission' ? 'commission' : 'cash',
            trx.description || '',
            Boolean(trx.systemGenerated),
            `${trx.date}T00:00:00Z`,
          ]
        );
      }
    }

    const activities = Array.isArray(legacy.activities) ? legacy.activities : [];
    for (const activity of activities) {
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
         VALUES (NULL, $1, $2, $3, $4::jsonb, to_timestamp($5 / 1000.0))`,
        [
          activity.type || 'activity',
          activity.type || 'system',
          activity.id || null,
          JSON.stringify({ message: activity.message || '' }),
          Number(activity.timestamp || Date.now()),
        ]
      );
    }

    await pool.query(
      `INSERT INTO settings (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(legacy.settings || fallbackSettings())]
    );

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function ensureAdminBootstrapPassword() {
  const { rows } = await pool.query(
    `SELECT id, password_hash, must_change_password
     FROM users
     WHERE LOWER(email) = 'admin@salaam.com'
     LIMIT 1`
  );
  if (!rows[0]) return;

  const row = rows[0];
  const current = String(row.password_hash || '');
  const bootstrapPassword = resolveBootstrapPassword();
  const mustChangePassword = !isTestEnv();

  // Keep tests deterministic even against long-lived local databases.
  if (isTestEnv()) {
    const isAlreadyBootstrapHash =
      current.startsWith('$2') && (await bcrypt.compare(bootstrapPassword, current));
    if (!isAlreadyBootstrapHash || Boolean(row.must_change_password)) {
      const adminHash = await bcrypt.hash(bootstrapPassword, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
        [adminHash, row.id]
      );
    }
    return;
  }

  if (!current.startsWith('$2')) {
    const adminHash = await bcrypt.hash(bootstrapPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = $2 WHERE id = $3',
      [adminHash, mustChangePassword, row.id]
    );
    return;
  }

  const usesLegacyDefault = await bcrypt.compare('admin', current);
  const shouldRequireRotation = mustChangePassword && usesLegacyDefault;
  if (Boolean(row.must_change_password) !== shouldRequireRotation) {
    await pool.query('UPDATE users SET must_change_password = $1 WHERE id = $2', [shouldRequireRotation, row.id]);
  }
}
