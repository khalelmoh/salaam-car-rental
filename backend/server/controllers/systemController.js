import { pool } from '../db/pool.js';
import { logAudit, listNotificationLogs, clearNotificationLogs } from '../services/auditService.js';
import { bookingRentalDays } from '../services/bookingMath.js';
import { normalizeSettings } from './common.js';

function toDateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  return raw.includes('T') ? raw.slice(0, 10) : raw;
}

export async function dashboard(_req, res, next) {
  try {
    const [fleet, active, revenue, statuses, activities, monthly] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM cars'),
      pool.query("SELECT COUNT(*)::int AS count FROM bookings WHERE status IN ('active', 'overdue')"),
      pool.query(
        `SELECT COALESCE(SUM(p.amount), 0) AS total
         FROM payments p
         LEFT JOIN bookings b ON b.id = p.booking_id
         WHERE p.booking_id IS NULL OR b.payment_status = 'paid'`
      ),
      pool.query('SELECT status, COUNT(*)::int AS count FROM cars GROUP BY status'),
      pool.query(
        `SELECT id, action, entity, details, created_at
         FROM audit_logs
         ORDER BY created_at DESC
         LIMIT 20`
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('month', p.paid_at), 'Mon') AS month, COALESCE(SUM(p.amount), 0) AS revenue
         FROM payments p
         LEFT JOIN bookings b ON b.id = p.booking_id
         WHERE p.booking_id IS NULL OR b.payment_status = 'paid'
         GROUP BY date_trunc('month', p.paid_at)
         ORDER BY date_trunc('month', p.paid_at)`
      ),
    ]);

    const totalFleet = fleet.rows[0].count;
    const activeRentals = active.rows[0].count;
    const totalRevenue = Number(revenue.rows[0].total || 0);

    const statusColor = {
      Available: '#10b981',
      Rented: '#f59e0b',
      Maintenance: '#ef4444',
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
