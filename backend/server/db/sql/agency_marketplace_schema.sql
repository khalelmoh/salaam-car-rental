-- Agency/Marketplace ownership schema and ledger hardening
-- Compatible with PostgreSQL 13+

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  payout_account TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_owners_phone ON owners(phone);

ALTER TABLE cars
ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES owners(id) ON DELETE SET NULL;

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS is_outsider BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS office_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 5 CHECK (office_commission_amount >= 0);

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS referral_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 5 CHECK (referral_fee_amount >= 0);

CREATE TABLE IF NOT EXISTS owner_ledger_transactions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  vehicle_id TEXT REFERENCES cars(id) ON DELETE SET NULL,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('RENTAL_INCOME', 'OFFICE_COMMISSION', 'REFERRAL_FEE', 'MAINTENANCE_DEDUCTION')),
  entry_direction TEXT NOT NULL CHECK (entry_direction IN ('credit', 'debit')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_ledger_owner_date ON owner_ledger_transactions(owner_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_owner_ledger_booking_id ON owner_ledger_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_owner_ledger_category ON owner_ledger_transactions(category);
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_ledger_booking_category
  ON owner_ledger_transactions(booking_id, category)
  WHERE booking_id IS NOT NULL;

CREATE OR REPLACE VIEW owner_payout_summaries AS
SELECT
  o.id AS owner_id,
  o.full_name AS owner_name,
  COALESCE(SUM(CASE WHEN olt.category = 'RENTAL_INCOME' THEN olt.amount ELSE 0 END), 0)::NUMERIC(14,2) AS gross_total,
  COALESCE(SUM(CASE WHEN olt.category = 'OFFICE_COMMISSION' THEN olt.amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_commissions,
  COALESCE(SUM(CASE WHEN olt.category = 'REFERRAL_FEE' THEN olt.amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_referral_fees,
  COALESCE(SUM(CASE WHEN olt.category = 'MAINTENANCE_DEDUCTION' THEN olt.amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_maintenance_deductions,
  (
    COALESCE(SUM(CASE WHEN olt.category = 'RENTAL_INCOME' THEN olt.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN olt.category IN ('OFFICE_COMMISSION', 'REFERRAL_FEE', 'MAINTENANCE_DEDUCTION') THEN olt.amount ELSE 0 END), 0)
  )::NUMERIC(14,2) AS net_owner_payout
FROM owners o
LEFT JOIN owner_ledger_transactions olt ON olt.owner_id = o.id
GROUP BY o.id, o.full_name;
