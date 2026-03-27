import { pool } from '../db/pool.js';
import { makeId } from '../services/security.js';

const BOOKING_SPLIT_CATEGORIES = ['RENTAL_INCOME', 'OFFICE_COMMISSION', 'REFERRAL_FEE'];

function toMoney(value, fallback = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return Number(fallback || 0);
  return Number(parsed.toFixed(2));
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  return raw.includes('T') ? raw.slice(0, 10) : raw;
}

function mapOwnerPayoutRow(row) {
  return {
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    grossTotal: Number(row.gross_total || 0),
    totalCommissions: Number(row.total_commissions || 0),
    totalReferralFees: Number(row.total_referral_fees || 0),
    totalMaintenanceDeductions: Number(row.total_maintenance_deductions || 0),
    netOwnerPayout: Number(row.net_owner_payout || 0),
  };
}

async function loadBookingForLedger(client, bookingId) {
  const { rows } = await client.query(
    `SELECT
       b.id,
       b.total_amount,
       b.start_date,
       b.is_outsider,
       b.office_commission_amount,
       b.referral_fee_amount,
       c.id AS vehicle_id,
       c.owner_id
     FROM bookings b
     JOIN cars c ON c.id = b.car_id
     WHERE b.id = $1
     LIMIT 1`,
    [bookingId]
  );
  return rows[0] || null;
}

async function upsertBookingSplitRows(client, {
  bookingId,
  ownerId,
  vehicleId,
  effectiveDate,
  grossAmount,
  baseOfficeCommission,
  isOutsider,
  referralFee,
  userId = null,
}) {
  await client.query(
    `DELETE FROM owner_ledger_transactions
     WHERE booking_id = $1
       AND category = ANY($2::text[])`,
    [bookingId, BOOKING_SPLIT_CATEGORIES]
  );

  const sharedMeta = JSON.stringify({
    bookingId,
    isOutsider,
    formula: 'owner_share = gross - office_commission - referral_fee',
  });

  await client.query(
    `INSERT INTO owner_ledger_transactions (
       id, owner_id, vehicle_id, booking_id, category, entry_direction,
       amount, effective_date, note, metadata, created_by
     ) VALUES ($1, $2, $3, $4, 'RENTAL_INCOME', 'credit', $5, $6::date, $7, $8::jsonb, $9)`,
    [
      makeId('LTX'),
      ownerId,
      vehicleId,
      bookingId,
      grossAmount,
      effectiveDate,
      `Gross rental income for booking ${bookingId}`,
      sharedMeta,
      userId,
    ]
  );

  await client.query(
    `INSERT INTO owner_ledger_transactions (
       id, owner_id, vehicle_id, booking_id, category, entry_direction,
       amount, effective_date, note, metadata, created_by
     ) VALUES ($1, $2, $3, $4, 'OFFICE_COMMISSION', 'debit', $5, $6::date, $7, $8::jsonb, $9)`,
    [
      makeId('LTX'),
      ownerId,
      vehicleId,
      bookingId,
      baseOfficeCommission,
      effectiveDate,
      `Base office commission for booking ${bookingId}`,
      sharedMeta,
      userId,
    ]
  );

  if (isOutsider && referralFee > 0) {
    await client.query(
      `INSERT INTO owner_ledger_transactions (
         id, owner_id, vehicle_id, booking_id, category, entry_direction,
         amount, effective_date, note, metadata, created_by
       ) VALUES ($1, $2, $3, $4, 'REFERRAL_FEE', 'debit', $5, $6::date, $7, $8::jsonb, $9)`,
      [
        makeId('LTX'),
        ownerId,
        vehicleId,
        bookingId,
        referralFee,
        effectiveDate,
        `Outsider referral fee for booking ${bookingId}`,
        sharedMeta,
        userId,
      ]
    );
  }
}

export async function processBookingCompletion({
  bookingId,
  grossAmount = null,
  baseOfficeCommission = null,
  isOutsider = null,
  referralFee = null,
  effectiveDate = null,
  userId = null,
}) {
  if (!bookingId) {
    const error = new Error('bookingId is required.');
    error.statusCode = 400;
    throw error;
  }

  const booking = await loadBookingForLedger(pool, bookingId);
  if (!booking) {
    const error = new Error('Booking not found.');
    error.statusCode = 404;
    throw error;
  }
  if (!booking.owner_id) {
    const error = new Error('Vehicle owner is missing. Assign an owner to this vehicle before completion.');
    error.statusCode = 409;
    throw error;
  }

  const gross = toMoney(grossAmount, booking.total_amount);
  const commission = toMoney(baseOfficeCommission, booking.office_commission_amount ?? 5);
  const outsider = isOutsider ?? Boolean(booking.is_outsider);
  const referral = outsider ? toMoney(referralFee, booking.referral_fee_amount ?? 5) : 0;
  const ownerShare = toMoney(gross - commission - referral);

  if (gross <= 0) {
    const error = new Error('Gross amount must be greater than zero.');
    error.statusCode = 400;
    throw error;
  }
  if (commission < 0 || referral < 0) {
    const error = new Error('Commission and referral fee cannot be negative.');
    error.statusCode = 400;
    throw error;
  }
  if (ownerShare < 0) {
    const error = new Error('Owner share cannot be negative. Check commission/referral values.');
    error.statusCode = 400;
    throw error;
  }

  await pool.query(
    `UPDATE bookings
     SET is_outsider = $1,
         office_commission_amount = $2,
         referral_fee_amount = $3
     WHERE id = $4`,
    [outsider, commission, referral, bookingId]
  );

  await upsertBookingSplitRows(pool, {
    bookingId,
    ownerId: booking.owner_id,
    vehicleId: booking.vehicle_id,
    effectiveDate: toIsoDate(effectiveDate || booking.start_date),
    grossAmount: gross,
    baseOfficeCommission: commission,
    isOutsider: outsider,
    referralFee: referral,
    userId,
  });

  return {
    bookingId,
    ownerId: booking.owner_id,
    vehicleId: booking.vehicle_id,
    grossAmount: gross,
    baseOfficeCommission: commission,
    referralFee: referral,
    ownerShare,
    isOutsider: outsider,
    effectiveDate: toIsoDate(effectiveDate || booking.start_date),
  };
}

export async function listOwnerPayoutSummaries(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         owner_id,
         owner_name,
         gross_total,
         total_commissions,
         total_referral_fees,
         total_maintenance_deductions,
         net_owner_payout
       FROM owner_payout_summaries
       ORDER BY owner_name ASC`
    );
    res.json(rows.map(mapOwnerPayoutRow));
  } catch (error) {
    next(error);
  }
}

export async function getOfficeFinanceSummary(req, res, next) {
  try {
    const [ledgerIncomeRes, manualIncomeRes, expenseRes, commissionExpenseRes, pendingOfficeRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM owner_ledger_transactions
         WHERE category = 'OFFICE_COMMISSION'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM payments
         WHERE booking_id IS NULL
           AND LOWER(COALESCE(payment_method, '')) <> 'commission'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM expenses`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM payments
         WHERE booking_id IS NULL
           AND LOWER(COALESCE(payment_method, '')) = 'commission'`
      ),
      pool.query(
        `SELECT
           COALESCE(
             SUM(office_commission_amount),
             0
           )::numeric AS total
         FROM bookings
         WHERE payment_status = 'pending'
           AND status <> 'cancelled'`
      ),
    ]);

    const officeIncome =
      Number(ledgerIncomeRes.rows[0]?.total || 0) +
      Number(manualIncomeRes.rows[0]?.total || 0);
    const officeExpenses =
      Number(expenseRes.rows[0]?.total || 0) +
      Number(commissionExpenseRes.rows[0]?.total || 0);
    const pendingOfficeAmount = Number(pendingOfficeRes.rows[0]?.total || 0);

    return res.json({
      officeIncome: Number(officeIncome.toFixed(2)),
      officeExpenses: Number(officeExpenses.toFixed(2)),
      netProfit: Number((officeIncome - officeExpenses).toFixed(2)),
      pendingOfficeAmount: Number(pendingOfficeAmount.toFixed(2)),
    });
  } catch (error) {
    next(error);
  }
}

export async function clearBookingCompletionLedger(bookingId) {
  if (!bookingId) return;
  await pool.query(
    `DELETE FROM owner_ledger_transactions
     WHERE booking_id = $1
       AND category = ANY($2::text[])`,
    [bookingId, BOOKING_SPLIT_CATEGORIES]
  );
}

export async function recordMaintenanceDeduction({
  ownerId,
  vehicleId,
  bookingId = null,
  amount,
  note = 'Owner-paid maintenance deduction',
  effectiveDate = null,
  userId = null,
}) {
  const normalizedAmount = toMoney(amount);
  if (!ownerId || !vehicleId) {
    const error = new Error('ownerId and vehicleId are required.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedAmount <= 0) {
    const error = new Error('amount must be greater than zero.');
    error.statusCode = 400;
    throw error;
  }

  const id = makeId('LTX');
  await pool.query(
    `INSERT INTO owner_ledger_transactions (
       id, owner_id, vehicle_id, booking_id, category, entry_direction,
       amount, effective_date, note, metadata, created_by
     ) VALUES ($1, $2, $3, $4, 'MAINTENANCE_DEDUCTION', 'debit', $5, $6::date, $7, $8::jsonb, $9)`,
    [
      id,
      ownerId,
      vehicleId,
      bookingId,
      normalizedAmount,
      toIsoDate(effectiveDate),
      note,
      JSON.stringify({ ownerPaid: true }),
      userId,
    ]
  );
  return id;
}
