import { z } from 'zod';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import { makeId } from '../services/security.js';
import { calculateBookingAmounts, toDateTime } from '../services/bookingMath.js';
import { assertAccountingPeriodOpen, getPaymentAccountingDate, removeJournalForReference } from '../services/accountingService.js';
import { hasBookingOverlap, mapBooking, parsePagination, syncBookingIncomePayment } from './common.js';

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

function toHHMM(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'null' || raw === 'undefined') return fallback;
  const match = raw.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
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
        carResult.rows[0].name,
        req.auth.userId
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
    const body = req.body || {};
    const payload = {
      ...current,
      ...body,
      startTime: toHHMM(body.startTime ?? current.startTime ?? existing.rows[0].start_time, '00:00'),
      endTime: toHHMM(body.endTime ?? current.endTime ?? existing.rows[0].end_time, '23:59'),
    };

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
        carResult.rows[0].name,
        req.auth.userId
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
    const paymentRows = await pool.query('SELECT id FROM payments WHERE booking_id = $1', [id]);
    for (const payment of paymentRows.rows) {
      const paymentDate = await getPaymentAccountingDate(payment.id);
      if (paymentDate) await assertAccountingPeriodOpen(paymentDate);
    }

    await pool.query('BEGIN');
    try {
      await pool.query('DELETE FROM payments WHERE booking_id = $1', [id]);
      for (const payment of paymentRows.rows) {
        await removeJournalForReference('payment', payment.id);
      }
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
