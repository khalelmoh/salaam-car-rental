import { pool } from '../db/pool.js';
import { makeId } from './security.js';

export const BUSINESS_TIMEZONE = 'Africa/Mogadishu';

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function toPeriodBounds(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 3000) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  const start = `${y}-${pad2(m)}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const endDate = new Date(Date.UTC(nextY, nextM - 1, 0));
  const end = `${endDate.getUTCFullYear()}-${pad2(endDate.getUTCMonth() + 1)}-${pad2(endDate.getUTCDate())}`;
  return { year: y, month: m, start, end };
}

function mapDailyClose(row) {
  const closeDate = row.close_date instanceof Date
    ? `${row.close_date.getFullYear()}-${String(row.close_date.getMonth() + 1).padStart(2, '0')}-${String(row.close_date.getDate()).padStart(2, '0')}`
    : String(row.close_date || '').slice(0, 10);
  return {
    id: row.id,
    closeDate,
    openingBalance: Number(row.opening_balance || 0),
    totalDebits: Number(row.total_debits || 0),
    totalCredits: Number(row.total_credits || 0),
    closingBalance: Number(row.closing_balance || 0),
    status: row.status,
    isLocked: Boolean(row.is_locked),
    closedBy: row.closed_by || null,
    closedAt: row.closed_at,
  };
}

function mapMonthlyClose(row) {
  return {
    id: row.id,
    year: Number(row.close_year),
    month: Number(row.close_month),
    openingBalance: Number(row.opening_balance || 0),
    totalDebits: Number(row.total_debits || 0),
    totalCredits: Number(row.total_credits || 0),
    closingBalance: Number(row.closing_balance || 0),
    status: row.status,
    isLocked: Boolean(row.is_locked),
    closedBy: row.closed_by || null,
    closedAt: row.closed_at,
  };
}

async function getAccountId(code) {
  const { rows } = await pool.query('SELECT id FROM accounts WHERE code = $1 AND is_active = TRUE', [code]);
  if (!rows[0]) {
    const error = new Error(`Missing chart-of-accounts entry for ${code}.`);
    error.statusCode = 500;
    throw error;
  }
  return rows[0].id;
}

async function upsertJournalEntry({
  referenceType,
  referenceId,
  entryDate,
  description,
  createdBy = null,
  debitCode,
  creditCode,
  amount,
}) {
  const normalizedAmount = Number(amount || 0);
  if (normalizedAmount <= 0) {
    await pool.query(
      'DELETE FROM journal_entries WHERE reference_type = $1 AND reference_id = $2',
      [referenceType, referenceId]
    );
    return;
  }

  const debitAccountId = await getAccountId(debitCode);
  const creditAccountId = await getAccountId(creditCode);
  const existing = await pool.query(
    `SELECT id
     FROM journal_entries
     WHERE reference_type = $1 AND reference_id = $2`,
    [referenceType, referenceId]
  );
  const entryId = existing.rows[0]?.id || makeId('JRN');

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE journal_entries
       SET entry_date = $1::date, description = $2, created_by = COALESCE($3, created_by)
       WHERE id = $4`,
      [entryDate, description, createdBy, entryId]
    );
    await pool.query('DELETE FROM journal_lines WHERE entry_id = $1', [entryId]);
  } else {
    await pool.query(
      `INSERT INTO journal_entries (id, entry_date, reference_type, reference_id, description, created_by)
       VALUES ($1, $2::date, $3, $4, $5, $6)`,
      [entryId, entryDate, referenceType, referenceId, description, createdBy]
    );
  }

  await pool.query(
    `INSERT INTO journal_lines (entry_id, account_id, line_type, amount)
     VALUES
       ($1, $2, 'debit', $4::numeric),
       ($1, $3, 'credit', $4::numeric)`,
    [entryId, debitAccountId, creditAccountId, normalizedAmount.toFixed(2)]
  );
}

export async function syncPaymentJournal(paymentId, createdBy = null) {
  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.amount,
       p.payment_method,
       p.note,
       p.booking_id,
       TO_CHAR((p.paid_at AT TIME ZONE '${BUSINESS_TIMEZONE}')::date, 'YYYY-MM-DD') AS entry_date,
       b.payment_status
     FROM payments p
     LEFT JOIN bookings b ON b.id = p.booking_id
     WHERE p.id = $1`,
    [paymentId]
  );
  const payment = rows[0];
  if (!payment) {
    await removeJournalForReference('payment', paymentId);
    return;
  }

  if (payment.booking_id && payment.payment_status !== 'paid') {
    await removeJournalForReference('payment', payment.id);
    return;
  }

  const isCommission = String(payment.payment_method || '').toLowerCase() === 'commission';
  await upsertJournalEntry({
    referenceType: 'payment',
    referenceId: payment.id,
    entryDate: payment.entry_date,
    description: payment.note || (isCommission ? 'Commission' : 'Payment'),
    createdBy,
    debitCode: isCommission ? 'COMMISSION_EXPENSE' : 'CASH',
    creditCode: isCommission ? 'CASH' : 'RENTAL_INCOME',
    amount: payment.amount,
  });
}

export async function syncExpenseJournal(expenseId, createdBy = null) {
  const { rows } = await pool.query(
    `SELECT id, amount, description, expense_date
     FROM expenses
     WHERE id = $1`,
    [expenseId]
  );
  const expense = rows[0];
  if (!expense) {
    await removeJournalForReference('expense', expenseId);
    return;
  }
  await upsertJournalEntry({
    referenceType: 'expense',
    referenceId: expense.id,
    entryDate: expense.expense_date,
    description: expense.description || 'Expense',
    createdBy,
    debitCode: 'OPERATING_EXPENSE',
    creditCode: 'CASH',
    amount: expense.amount,
  });
}

export async function removeJournalForReference(referenceType, referenceId) {
  await pool.query(
    'DELETE FROM journal_entries WHERE reference_type = $1 AND reference_id = $2',
    [referenceType, referenceId]
  );
}

export async function assertAccountingPeriodOpen(dateValue) {
  if (!isIsoDate(dateValue)) return;
  const dailyLock = await pool.query(
    `SELECT 1
     FROM daily_closes
     WHERE close_date = $1::date AND is_locked = TRUE
     LIMIT 1`,
    [dateValue]
  );
  if (dailyLock.rows[0]) {
    const error = new Error(`Date ${dateValue} is locked by daily close.`);
    error.statusCode = 409;
    throw error;
  }

  const monthlyLock = await pool.query(
    `SELECT 1
     FROM monthly_closes
     WHERE close_year = EXTRACT(YEAR FROM $1::date)::int
       AND close_month = EXTRACT(MONTH FROM $1::date)::int
       AND is_locked = TRUE
     LIMIT 1`,
    [dateValue]
  );
  if (monthlyLock.rows[0]) {
    const error = new Error(`Month for ${dateValue} is locked by monthly close.`);
    error.statusCode = 409;
    throw error;
  }
}

export async function getPaymentAccountingDate(paymentId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR((paid_at AT TIME ZONE '${BUSINESS_TIMEZONE}')::date, 'YYYY-MM-DD') AS entry_date
     FROM payments
     WHERE id = $1`,
    [paymentId]
  );
  return rows[0]?.entry_date || null;
}

export async function getExpenseAccountingDate(expenseId) {
  const { rows } = await pool.query('SELECT TO_CHAR(expense_date, \'YYYY-MM-DD\') AS entry_date FROM expenses WHERE id = $1', [expenseId]);
  return rows[0]?.entry_date || null;
}

async function summarizeJournal(fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN jl.line_type = 'debit' THEN jl.amount ELSE 0 END), 0)::numeric AS total_debits,
       COALESCE(SUM(CASE WHEN jl.line_type = 'credit' THEN jl.amount ELSE 0 END), 0)::numeric AS total_credits
     FROM journal_entries je
     JOIN journal_lines jl ON jl.entry_id = je.id
     JOIN accounts a ON a.id = jl.account_id
     WHERE je.entry_date >= $1::date
       AND je.entry_date <= $2::date
       AND a.code = 'CASH'`,
    [fromDate, toDate]
  );
  return {
    debits: Number(rows[0]?.total_debits || 0),
    credits: Number(rows[0]?.total_credits || 0),
  };
}

async function getPreviousDailyBalance(closeDate) {
  const { rows } = await pool.query(
    `SELECT closing_balance
     FROM daily_closes
     WHERE close_date < $1::date
     ORDER BY close_date DESC
     LIMIT 1`,
    [closeDate]
  );
  return Number(rows[0]?.closing_balance || 0);
}

async function getPreviousMonthlyBalance(year, month) {
  const current = new Date(Date.UTC(year, month - 1, 1));
  const previous = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1));
  const { rows } = await pool.query(
    `SELECT closing_balance
     FROM monthly_closes
     WHERE close_year = $1 AND close_month = $2
     LIMIT 1`,
    [previous.getUTCFullYear(), previous.getUTCMonth() + 1]
  );
  return Number(rows[0]?.closing_balance || 0);
}

export async function upsertDailyClose(closeDate, userId) {
  if (!isIsoDate(closeDate)) {
    const error = new Error('Invalid close date. Expected YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }
  const openingBalance = await getPreviousDailyBalance(closeDate);
  const totals = await summarizeJournal(closeDate, closeDate);
  const closingBalance = openingBalance + totals.debits - totals.credits;

  const existing = await pool.query('SELECT id FROM daily_closes WHERE close_date = $1::date', [closeDate]);
  const id = existing.rows[0]?.id || makeId('DCL');
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE daily_closes
       SET opening_balance = $1,
           total_debits = $2,
           total_credits = $3,
           closing_balance = $4,
           status = 'closed',
           is_locked = TRUE,
           closed_by = $5,
           closed_at = NOW()
       WHERE id = $6`,
      [openingBalance, totals.debits, totals.credits, closingBalance, userId, id]
    );
  } else {
    await pool.query(
      `INSERT INTO daily_closes (
        id, close_date, opening_balance, total_debits, total_credits, closing_balance,
        status, is_locked, closed_by, closed_at
      ) VALUES ($1, $2::date, $3, $4, $5, $6, 'closed', TRUE, $7, NOW())`,
      [id, closeDate, openingBalance, totals.debits, totals.credits, closingBalance, userId]
    );
  }

  const { rows } = await pool.query('SELECT * FROM daily_closes WHERE id = $1', [id]);
  return mapDailyClose(rows[0]);
}

export async function upsertMonthlyClose(year, month, userId) {
  const period = toPeriodBounds(year, month);
  if (!period) {
    const error = new Error('Invalid month close period.');
    error.statusCode = 400;
    throw error;
  }
  const openingBalance = await getPreviousMonthlyBalance(period.year, period.month);
  const totals = await summarizeJournal(period.start, period.end);
  const closingBalance = openingBalance + totals.debits - totals.credits;

  const existing = await pool.query(
    'SELECT id FROM monthly_closes WHERE close_year = $1 AND close_month = $2',
    [period.year, period.month]
  );
  const id = existing.rows[0]?.id || makeId('MCL');
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE monthly_closes
       SET opening_balance = $1,
           total_debits = $2,
           total_credits = $3,
           closing_balance = $4,
           status = 'closed',
           is_locked = TRUE,
           closed_by = $5,
           closed_at = NOW()
       WHERE id = $6`,
      [openingBalance, totals.debits, totals.credits, closingBalance, userId, id]
    );
  } else {
    await pool.query(
      `INSERT INTO monthly_closes (
        id, close_year, close_month, opening_balance, total_debits, total_credits, closing_balance,
        status, is_locked, closed_by, closed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'closed', TRUE, $8, NOW())`,
      [id, period.year, period.month, openingBalance, totals.debits, totals.credits, closingBalance, userId]
    );
  }

  const { rows } = await pool.query('SELECT * FROM monthly_closes WHERE id = $1', [id]);
  return mapMonthlyClose(rows[0]);
}

export async function getCloseOverview() {
  const [dailyRes, monthlyRes] = await Promise.all([
    pool.query(
      `SELECT *
       FROM daily_closes
       ORDER BY close_date DESC
       LIMIT 14`
    ),
    pool.query(
      `SELECT *
       FROM monthly_closes
       ORDER BY close_year DESC, close_month DESC
       LIMIT 12`
    ),
  ]);

  return {
    daily: dailyRes.rows.map(mapDailyClose),
    monthly: monthlyRes.rows.map(mapMonthlyClose),
    latestDaily: dailyRes.rows[0] ? mapDailyClose(dailyRes.rows[0]) : null,
    latestMonthly: monthlyRes.rows[0] ? mapMonthlyClose(monthlyRes.rows[0]) : null,
  };
}

export async function getBusinessTodayDate() {
  const { rows } = await pool.query(
    `SELECT TO_CHAR((NOW() AT TIME ZONE '${BUSINESS_TIMEZONE}')::date, 'YYYY-MM-DD') AS today`
  );
  return rows[0]?.today || new Date().toISOString().slice(0, 10);
}

export async function syncLedgerFromSources() {
  const [paymentRows, expenseRows] = await Promise.all([
    pool.query('SELECT id FROM payments'),
    pool.query('SELECT id FROM expenses'),
  ]);

  for (const row of paymentRows.rows) {
    await syncPaymentJournal(row.id, null);
  }
  for (const row of expenseRows.rows) {
    await syncExpenseJournal(row.id, null);
  }
}
