import { pool } from '../db/pool.js';
import { makeId } from '../services/security.js';
import { removeJournalForReference, syncPaymentJournal } from '../services/accountingService.js';

function toHHMM(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return fallback;
  const match = raw.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function toISODate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  return raw.includes('T') ? raw.slice(0, 10) : raw;
}

export function parsePagination(query) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 20);
  const paged = Number.isFinite(page) && Number.isFinite(pageSize) && query.page !== undefined;
  return {
    page: Math.max(1, page),
    pageSize: Math.max(1, Math.min(200, pageSize)),
    paged,
  };
}

export function mapBooking(row) {
  return {
    id: row.id,
    carId: row.car_id,
    customerId: row.customer_id,
    startDate: toISODate(row.start_date),
    startTime: toHHMM(row.start_time, '00:00'),
    endDate: toISODate(row.end_date),
    endTime: toHHMM(row.end_time, '23:59'),
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

export function normalizeSettings(raw = {}) {
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

export async function hasBookingOverlap({ carId, startDate, startTime, endDate, endTime, excludeId = null }) {
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

export async function syncBookingIncomePayment(client, booking, customerName, carName, userId = null) {
  const { rows } = await client.query('SELECT id FROM payments WHERE booking_id = $1 LIMIT 1', [booking.id]);

  if (booking.status === 'cancelled') {
    if (rows[0]) {
      await client.query('DELETE FROM payments WHERE id = $1', [rows[0].id]);
      await removeJournalForReference('payment', rows[0].id);
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

  await syncPaymentJournal(payload.id, userId);
}
