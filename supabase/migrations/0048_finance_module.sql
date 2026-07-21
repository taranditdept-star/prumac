-- 0048_finance_module.sql
-- ---------------------------------------------------------------------------
-- Finance module foundation: a chart of accounts + a general journal
-- (double-entry) that overlays the operational subledgers already in the
-- system (invoices = revenue/AR, invoice_payments = cash, fuel_logs +
-- service_records = expenses, vehicles = fixed assets). Reports group by
-- account, combining operational figures with manual journal postings so the
-- accountant can complete the picture (opening balances, capital, loans, bank,
-- creditors, other income/expense).
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TYPE app.account_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');

CREATE TABLE app.chart_of_accounts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code           text NOT NULL UNIQUE,
    name           text NOT NULL,
    type           app.account_type NOT NULL,
    subtype        text,                       -- 'current_asset','fixed_asset','current_liability','non_current_liability',...
    normal_balance text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    description    text,
    is_system      boolean NOT NULL DEFAULT false,   -- fed automatically from operational data
    is_active      boolean NOT NULL DEFAULT true,
    sort_order     integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER coa_touch BEFORE UPDATE ON app.chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();
CREATE INDEX coa_type_idx ON app.chart_of_accounts (type, sort_order);

-- General journal — manual double-entry postings (adjustments, capital, loans,
-- bank movements, opening balances, anything not captured operationally).
CREATE TABLE app.journal_entries (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date     date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Harare')::date,
    memo           text,
    reference      text,
    source         text NOT NULL DEFAULT 'manual',   -- 'manual','opening_balance'
    subsidiary_id  uuid REFERENCES app.subsidiaries(id) ON DELETE SET NULL,
    created_by     uuid REFERENCES app.profiles(id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER je_touch BEFORE UPDATE ON app.journal_entries
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();
CREATE INDEX je_date_idx ON app.journal_entries (entry_date DESC);

CREATE TABLE app.journal_lines (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id    uuid NOT NULL REFERENCES app.journal_entries(id) ON DELETE CASCADE,
    account_id  uuid NOT NULL REFERENCES app.chart_of_accounts(id) ON DELETE RESTRICT,
    debit       numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
    credit      numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    memo        text,
    sort_order  integer NOT NULL DEFAULT 0,
    CONSTRAINT jl_one_side CHECK ((debit = 0) <> (credit = 0))   -- exactly one side non-zero
);
CREATE INDEX jl_entry_idx   ON app.journal_lines (entry_id);
CREATE INDEX jl_account_idx ON app.journal_lines (account_id);

SELECT app.fn_attach_audit('app.chart_of_accounts');
SELECT app.fn_attach_audit('app.journal_entries');

-- ---------------------------------------------------------------------------
-- RLS — finance is management-level. Managers/admins manage; nobody else.
-- ---------------------------------------------------------------------------
ALTER TABLE app.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.journal_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.journal_lines     ENABLE ROW LEVEL SECURITY;

CREATE POLICY coa_read_managers ON app.chart_of_accounts
    FOR SELECT TO authenticated USING (app.role_is('fleet_manager') OR app.role_is('admin'));
CREATE POLICY coa_write_managers ON app.chart_of_accounts
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY je_read_managers ON app.journal_entries
    FOR SELECT TO authenticated USING (app.role_is('fleet_manager') OR app.role_is('admin'));
CREATE POLICY je_write_managers ON app.journal_entries
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY jl_read_managers ON app.journal_lines
    FOR SELECT TO authenticated USING (app.role_is('fleet_manager') OR app.role_is('admin'));
CREATE POLICY jl_write_managers ON app.journal_lines
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- Seed: standard fleet-transport chart of accounts.
-- Codes are referenced by lib/finance to map operational data to accounts.
-- ---------------------------------------------------------------------------
INSERT INTO app.chart_of_accounts (code, name, type, subtype, normal_balance, is_system, sort_order) VALUES
  -- Assets
  ('1000', 'Motor Vehicles',                 'asset',     'fixed_asset',           'debit',  true, 10),
  ('1010', 'Accumulated Depreciation',       'asset',     'fixed_asset',           'credit', true, 11),
  ('1100', 'Accounts Receivable (Debtors)',  'asset',     'current_asset',         'debit',  true, 20),
  ('1200', 'Cash & Bank',                    'asset',     'current_asset',         'debit',  true, 30),
  ('1210', 'Cash on Hand',                   'asset',     'current_asset',         'debit',  false, 31),
  ('1300', 'Inventory — Parts & Tyres',      'asset',     'current_asset',         'debit',  true, 40),
  -- Liabilities
  ('2000', 'Accounts Payable (Creditors)',   'liability', 'current_liability',     'credit', true, 10),
  ('2100', 'Accrued Expenses',               'liability', 'current_liability',     'credit', false, 20),
  ('2200', 'VAT / Tax Payable',              'liability', 'current_liability',     'credit', false, 30),
  ('2300', 'Loans Payable',                  'liability', 'non_current_liability', 'credit', false, 40),
  -- Equity
  ('3000', 'Owner''s Capital',               'equity',    'equity',                'credit', false, 10),
  ('3100', 'Retained Earnings',              'equity',    'equity',                'credit', true, 20),
  ('3200', 'Drawings',                       'equity',    'equity',                'debit',  false, 30),
  -- Income
  ('4000', 'Transport / Trip Revenue',       'income',    'operating_income',      'credit', true, 10),
  ('4100', 'Other Income',                   'income',    'other_income',          'credit', false, 20),
  -- Expenses
  ('5000', 'Fuel',                           'expense',   'operating_expense',     'debit',  true, 10),
  ('5100', 'Maintenance & Repairs',          'expense',   'operating_expense',     'debit',  true, 20),
  ('5200', 'Parts & Tyres',                  'expense',   'operating_expense',     'debit',  false, 30),
  ('5300', 'Salaries & Wages',               'expense',   'operating_expense',     'debit',  false, 40),
  ('5400', 'Insurance',                      'expense',   'operating_expense',     'debit',  false, 50),
  ('5500', 'Licensing & Compliance',         'expense',   'operating_expense',     'debit',  false, 60),
  ('5600', 'Depreciation',                   'expense',   'operating_expense',     'debit',  true, 70),
  ('5700', 'Administrative Expenses',        'expense',   'operating_expense',     'debit',  false, 80),
  ('5900', 'Other Expenses',                 'expense',   'other_expense',         'debit',  false, 90);

COMMIT;
