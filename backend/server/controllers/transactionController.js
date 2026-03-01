import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import { makeId } from '../services/security.js';
import { parsePagination } from './common.js';

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
      LEFT JOIN bookings b ON b.id = p.booking_id
      WHERE p.booking_id IS NULL OR b.payment_status = 'paid'
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
