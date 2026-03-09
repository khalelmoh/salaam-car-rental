import { pool } from './pool.js';

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      title TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cars (
      id TEXT PRIMARY KEY,
      branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      owner_phone TEXT DEFAULT '',
      image TEXT DEFAULT '',
      price_per_day NUMERIC(12,2) NOT NULL,
      transmission TEXT DEFAULT 'Automatic',
      seats INTEGER DEFAULT 5,
      fuel_type TEXT DEFAULT 'Petrol',
      mpg TEXT DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('Available', 'Rented', 'Maintenance')),
      license_plate TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      national_id TEXT DEFAULT '',
      license_number TEXT NOT NULL,
      damiin_name TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      car_id TEXT NOT NULL REFERENCES cars(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      start_date DATE NOT NULL,
      start_time TIME NOT NULL DEFAULT '00:00',
      end_date DATE NOT NULL,
      end_time TIME NOT NULL DEFAULT '23:59',
      subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
      discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12,2) NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'active', 'overdue', 'completed', 'cancelled')),
      payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      end_reminder_notified_at TIMESTAMPTZ,
      overdue_notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL,
      payment_method TEXT NOT NULL,
      note TEXT DEFAULT '',
      system_generated BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      paid_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      entry_date DATE NOT NULL,
      reference_type TEXT NOT NULL CHECK (reference_type IN ('payment', 'expense')),
      reference_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (reference_type, reference_id)
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      line_type TEXT NOT NULL CHECK (line_type IN ('debit', 'credit')),
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_closes (
      id TEXT PRIMARY KEY,
      close_date DATE NOT NULL UNIQUE,
      opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_debits NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_credits NUMERIC(14,2) NOT NULL DEFAULT 0,
      closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('draft', 'closed', 'reconciled')),
      is_locked BOOLEAN NOT NULL DEFAULT TRUE,
      closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS monthly_closes (
      id TEXT PRIMARY KEY,
      close_year INTEGER NOT NULL CHECK (close_year >= 2000),
      close_month INTEGER NOT NULL CHECK (close_month BETWEEN 1 AND 12),
      opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_debits NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_credits NUMERIC(14,2) NOT NULL DEFAULT 0,
      closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('draft', 'closed', 'reconciled')),
      is_locked BOOLEAN NOT NULL DEFAULT TRUE,
      closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (close_year, close_month)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount NUMERIC(12,2) NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      car_id TEXT REFERENCES cars(id) ON DELETE SET NULL,
      expense_date DATE NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS report_presets (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('finance', 'customers', 'fleet')),
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS report_jobs (
      id TEXT PRIMARY KEY,
      report_type TEXT NOT NULL CHECK (report_type IN ('finance', 'customers', 'fleet')),
      format TEXT NOT NULL CHECK (format IN ('json', 'pdf', 'xlsx')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      error_message TEXT,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_car_id ON bookings(car_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
    CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bookings_car_status_dates ON bookings(car_id, status, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
    CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_presets_by_user_scope ON report_presets(created_by, scope);
    CREATE INDEX IF NOT EXISTS idx_report_jobs_by_user_status ON report_jobs(created_by, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON journal_entries(entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
    CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(entry_id);
    CREATE INDEX IF NOT EXISTS idx_daily_closes_date ON daily_closes(close_date DESC);
    CREATE INDEX IF NOT EXISTS idx_monthly_closes_period ON monthly_closes(close_year DESC, close_month DESC);
  `);

  await pool.query(`
    ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS damiin_name TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS car_id TEXT REFERENCES cars(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_car_id ON expenses(car_id);
  `);

  await pool.query(
    `INSERT INTO roles(name)
     VALUES ('admin'), ('manager'), ('staff')
     ON CONFLICT (name) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO branches (id, name, location)
     VALUES ('BR-001', 'Main Branch', 'Hargeisa')
     ON CONFLICT (id) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO accounts (id, code, name, account_type)
     VALUES
       ('ACC-CASH', 'CASH', 'Cash on Hand', 'asset'),
       ('ACC-RIN', 'RENTAL_INCOME', 'Rental Income', 'revenue'),
       ('ACC-OPEX', 'OPERATING_EXPENSE', 'Operating Expense', 'expense'),
       ('ACC-COMX', 'COMMISSION_EXPENSE', 'Commission Expense', 'expense')
     ON CONFLICT (code) DO NOTHING`
  );
}
