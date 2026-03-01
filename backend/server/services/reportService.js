import { pool } from '../db/pool.js';

function toDateOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function transactionCte() {
  return `
    WITH transactions AS (
      SELECT
        p.id,
        TO_CHAR(p.paid_at::date, 'YYYY-MM-DD') AS date,
        COALESCE(p.note, 'Payment') AS description,
        CASE WHEN p.payment_method = 'commission' THEN 'Commission' ELSE 'Income' END AS type,
        p.amount::numeric AS amount,
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
        e.amount::numeric AS amount,
        e.category,
        NULL::text AS booking_id,
        FALSE AS system_generated,
        e.created_at
      FROM expenses e
    )
  `;
}

function dateFilterClause() {
  return `
    WHERE ($1::date IS NULL OR t.date::date >= $1::date)
      AND ($2::date IS NULL OR t.date::date <= $2::date)
  `;
}

export async function buildFinanceReport({ from, to, page = 1, pageSize = 50, includeDetails = true }) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize || 50)));
  const fromDate = toDateOrNull(from);
  const toDate = toDateOrNull(to);

  const summarySql = `
    ${transactionCte()}
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'Income' THEN t.amount ELSE 0 END), 0)::numeric AS income,
      COALESCE(SUM(CASE WHEN t.type IN ('Expense', 'Commission') THEN t.amount ELSE 0 END), 0)::numeric AS expenses
    FROM transactions t
    ${dateFilterClause()}
  `;

  const summaryRes = await pool.query(summarySql, [fromDate, toDate]);
  const income = Number(summaryRes.rows[0]?.income || 0);
  const expenses = Number(summaryRes.rows[0]?.expenses || 0);

  const pendingSql = `
    SELECT COALESCE(SUM(b.total_amount), 0)::numeric AS pending
    FROM bookings b
    WHERE b.payment_status = 'pending'
      AND b.status <> 'cancelled'
      AND ($1::date IS NULL OR b.start_date >= $1::date)
      AND ($2::date IS NULL OR b.start_date <= $2::date)
  `;
  const pendingRes = await pool.query(pendingSql, [fromDate, toDate]);
  const pendingAmount = Number(pendingRes.rows[0]?.pending || 0);

  let rows = [];
  const countSql = `
    ${transactionCte()}
    SELECT COUNT(*)::int AS total
    FROM transactions t
    ${dateFilterClause()}
  `;
  const countRes = await pool.query(countSql, [fromDate, toDate]);
  const total = Number(countRes.rows[0]?.total || 0);

  if (includeDetails) {
    const detailsSql = `
      ${transactionCte()}
      SELECT
        t.id,
        t.date,
        t.description,
        t.type,
        t.amount,
        t.category,
        t.booking_id,
        t.system_generated,
        t.created_at
      FROM transactions t
      ${dateFilterClause()}
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const detailsRes = await pool.query(detailsSql, [fromDate, toDate, safePageSize, (safePage - 1) * safePageSize]);
    rows = detailsRes.rows.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      type: r.type,
      amount: Number(r.amount || 0),
      category: r.category,
      bookingId: r.booking_id || undefined,
      systemGenerated: Boolean(r.system_generated),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
    }));
  }

  const generatedAt = new Date().toISOString();
  const timezone = 'UTC';
  const filters = {
      from: fromDate,
      to: toDate,
      includeDetails: Boolean(includeDetails),
      page: safePage,
      pageSize: safePageSize,
    };
  const summary = {
      income: Number(income.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      netProfit: Number((income - expenses).toFixed(2)),
      pendingAmount: Number(pendingAmount.toFixed(2)),
    };
  const pagination = {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };

  return {
    reportVersion: '1.1',
    generatedAt,
    timezone,
    filters,
    metadata: {
      generatedAt,
      timezone,
      filters,
      rowCount: pagination.total,
      pageRowCount: rows.length,
    },
    summary,
    pagination,
    rows,
  };
}

export async function buildCustomerReport({ customerId = null, from, to, page = 1, pageSize = 50 }) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize || 50)));
  const fromDate = toDateOrNull(from);
  const toDate = toDateOrNull(to);

  if (customerId) {
    const customerRes = await pool.query(
      `SELECT id, full_name, phone, email, damiin_name
       FROM customers
       WHERE id = $1`,
      [customerId]
    );
    const customer = customerRes.rows[0] || null;

    const bookingQuery = `
      SELECT
        b.id AS booking_id,
        TO_CHAR(b.start_date, 'YYYY-MM-DD') AS start_date,
        TO_CHAR(b.end_date, 'YYYY-MM-DD') AS end_date,
        b.status,
        b.payment_status,
        b.total_amount::numeric AS total_amount,
        c.name AS car_name
      FROM bookings b
      JOIN cars c ON c.id = b.car_id
      WHERE b.customer_id = $1
        AND ($2::date IS NULL OR b.start_date >= $2::date)
        AND ($3::date IS NULL OR b.start_date <= $3::date)
      ORDER BY b.start_date DESC, b.created_at DESC
      LIMIT $4 OFFSET $5
    `;
    const bookingCount = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM bookings b
       WHERE b.customer_id = $1
         AND ($2::date IS NULL OR b.start_date >= $2::date)
         AND ($3::date IS NULL OR b.start_date <= $3::date)`,
      [customerId, fromDate, toDate]
    );
    const bookingRows = await pool.query(bookingQuery, [customerId, fromDate, toDate, safePageSize, (safePage - 1) * safePageSize]);

    const summaryRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total_bookings,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0)::numeric AS total_paid,
         COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END), 0)::numeric AS total_pending
       FROM bookings
       WHERE customer_id = $1
         AND ($2::date IS NULL OR start_date >= $2::date)
         AND ($3::date IS NULL OR start_date <= $3::date)`,
      [customerId, fromDate, toDate]
    );

    const total = Number(bookingCount.rows[0]?.total || 0);
    const generatedAt = new Date().toISOString();
    const timezone = 'UTC';
    const filters = { customerId, from: fromDate, to: toDate, page: safePage, pageSize: safePageSize };
    const summary = {
        totalCustomers: customer ? 1 : 0,
        totalBookings: Number(summaryRes.rows[0]?.total_bookings || 0),
        totalPaid: Number(summaryRes.rows[0]?.total_paid || 0),
        totalPending: Number(summaryRes.rows[0]?.total_pending || 0),
      };
    const resultRows = bookingRows.rows.map((r) => ({
      bookingId: r.booking_id,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      paymentStatus: r.payment_status,
      amount: Number(r.total_amount || 0),
      carName: r.car_name,
    }));
    const pagination = {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };

    return {
      reportVersion: '1.1',
      generatedAt,
      timezone,
      filters,
      metadata: {
        generatedAt,
        timezone,
        filters,
        rowCount: pagination.total,
        pageRowCount: resultRows.length,
      },
      summary,
      customer: customer
        ? {
            id: customer.id,
            fullName: customer.full_name,
            phone: customer.phone,
            damiinkaNumber: customer.email,
            damiinkaName: customer.damiin_name || '',
          }
        : null,
      pagination,
      rows: resultRows,
    };
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM customers`
  );

  const rowsRes = await pool.query(
    `SELECT
      c.id,
      c.full_name,
      c.phone,
      c.email,
      c.damiin_name,
      COALESCE(COUNT(b.id), 0)::int AS total_bookings,
      COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount ELSE 0 END), 0)::numeric AS total_paid,
      COALESCE(SUM(CASE WHEN b.payment_status = 'pending' THEN b.total_amount ELSE 0 END), 0)::numeric AS total_pending
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
      AND ($1::date IS NULL OR b.start_date >= $1::date)
      AND ($2::date IS NULL OR b.start_date <= $2::date)
    GROUP BY c.id, c.full_name, c.phone, c.email, c.damiin_name
    ORDER BY c.full_name ASC
    LIMIT $3 OFFSET $4`,
    [fromDate, toDate, safePageSize, (safePage - 1) * safePageSize]
  );

  const summaryRes = await pool.query(
    `SELECT
      COUNT(*)::int AS total_customers,
      COALESCE(COUNT(b.id), 0)::int AS total_bookings,
      COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount ELSE 0 END), 0)::numeric AS total_paid,
      COALESCE(SUM(CASE WHEN b.payment_status = 'pending' THEN b.total_amount ELSE 0 END), 0)::numeric AS total_pending
     FROM customers c
     LEFT JOIN bookings b ON b.customer_id = c.id
      AND ($1::date IS NULL OR b.start_date >= $1::date)
      AND ($2::date IS NULL OR b.start_date <= $2::date)`,
    [fromDate, toDate]
  );

  const total = Number(countRes.rows[0]?.total || 0);
  const generatedAt = new Date().toISOString();
  const timezone = 'UTC';
  const filters = { from: fromDate, to: toDate, page: safePage, pageSize: safePageSize };
  const summary = {
      totalCustomers: Number(summaryRes.rows[0]?.total_customers || 0),
      totalBookings: Number(summaryRes.rows[0]?.total_bookings || 0),
      totalPaid: Number(summaryRes.rows[0]?.total_paid || 0),
      totalPending: Number(summaryRes.rows[0]?.total_pending || 0),
    };
  const resultRows = rowsRes.rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    damiinkaNumber: r.email,
    damiinkaName: r.damiin_name || '',
    totalBookings: Number(r.total_bookings || 0),
    totalPaid: Number(r.total_paid || 0),
    totalPending: Number(r.total_pending || 0),
  }));
  const pagination = {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };

  return {
    reportVersion: '1.1',
    generatedAt,
    timezone,
    filters,
    metadata: {
      generatedAt,
      timezone,
      filters,
      rowCount: pagination.total,
      pageRowCount: resultRows.length,
    },
    summary,
    pagination,
    rows: resultRows,
  };
}

export async function buildFleetReport({ carId = null, from, to, page = 1, pageSize = 50 }) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize || 50)));
  const fromDate = toDateOrNull(from);
  const toDate = toDateOrNull(to);

  const baseWhere = carId ? 'WHERE c.id = $3' : '';
  const params = carId
    ? [fromDate, toDate, carId, safePageSize, (safePage - 1) * safePageSize]
    : [fromDate, toDate, safePageSize, (safePage - 1) * safePageSize];

  const countQuery = carId
    ? 'SELECT COUNT(*)::int AS total FROM cars WHERE id = $1'
    : 'SELECT COUNT(*)::int AS total FROM cars';
  const countRes = await pool.query(countQuery, carId ? [carId] : []);

  const rowsQuery = `
    SELECT
      c.id,
      c.name,
      c.status,
      c.license_plate,
      COALESCE(COUNT(b.id), 0)::int AS total_bookings,
      COALESCE(COUNT(CASE WHEN b.status IN ('active', 'overdue') THEN 1 END), 0)::int AS active_bookings,
      COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount ELSE 0 END), 0)::numeric AS paid_revenue,
      COALESCE(SUM(CASE WHEN b.payment_status = 'pending' THEN b.total_amount ELSE 0 END), 0)::numeric AS pending_revenue
    FROM cars c
    LEFT JOIN bookings b ON b.car_id = c.id
      AND ($1::date IS NULL OR b.start_date >= $1::date)
      AND ($2::date IS NULL OR b.start_date <= $2::date)
    ${baseWhere}
    GROUP BY c.id, c.name, c.status, c.license_plate
    ORDER BY c.name ASC
    LIMIT $${carId ? 4 : 3} OFFSET $${carId ? 5 : 4}
  `;
  const rowsRes = await pool.query(rowsQuery, params);

  const summaryQuery = `
    SELECT
      COUNT(DISTINCT c.id)::int AS total_cars,
      COALESCE(COUNT(b.id), 0)::int AS total_bookings,
      COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount ELSE 0 END), 0)::numeric AS total_paid_revenue,
      COALESCE(SUM(CASE WHEN b.payment_status = 'pending' THEN b.total_amount ELSE 0 END), 0)::numeric AS total_pending_revenue
    FROM cars c
    LEFT JOIN bookings b ON b.car_id = c.id
      AND ($1::date IS NULL OR b.start_date >= $1::date)
      AND ($2::date IS NULL OR b.start_date <= $2::date)
    ${carId ? 'WHERE c.id = $3' : ''}
  `;
  const summaryRes = await pool.query(summaryQuery, carId ? [fromDate, toDate, carId] : [fromDate, toDate]);

  const total = Number(countRes.rows[0]?.total || 0);
  const generatedAt = new Date().toISOString();
  const timezone = 'UTC';
  const filters = { carId, from: fromDate, to: toDate, page: safePage, pageSize: safePageSize };
  const summary = {
      totalCars: Number(summaryRes.rows[0]?.total_cars || 0),
      totalBookings: Number(summaryRes.rows[0]?.total_bookings || 0),
      totalPaidRevenue: Number(summaryRes.rows[0]?.total_paid_revenue || 0),
      totalPendingRevenue: Number(summaryRes.rows[0]?.total_pending_revenue || 0),
    };
  const resultRows = rowsRes.rows.map((r) => ({
    carId: r.id,
    carName: r.name,
    status: r.status,
    licensePlate: r.license_plate,
    totalBookings: Number(r.total_bookings || 0),
    activeBookings: Number(r.active_bookings || 0),
    paidRevenue: Number(r.paid_revenue || 0),
    pendingRevenue: Number(r.pending_revenue || 0),
  }));
  const pagination = {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };

  return {
    reportVersion: '1.1',
    generatedAt,
    timezone,
    filters,
    metadata: {
      generatedAt,
      timezone,
      filters,
      rowCount: pagination.total,
      pageRowCount: resultRows.length,
    },
    summary,
    pagination,
    rows: resultRows,
  };
}
