import pg from "pg";
const { Pool } = pg;
let pool;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: { rejectUnauthorized: false }
  });
  return pool;
}

export async function ensureUsers() {
  await db().query("CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
}

export async function ensureFinanceSchema() {
  await ensureUsers();
  const sql = [
    "CREATE TABLE IF NOT EXISTS wallets (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, balance NUMERIC(14,2) NOT NULL DEFAULT 0, withdrawable_balance NUMERIC(14,2) NOT NULL DEFAULT 0, bonus_balance NUMERIC(14,2) NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "ALTER TABLE wallets ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2) NOT NULL DEFAULT 0",
    "ALTER TABLE wallets ADD COLUMN IF NOT EXISTS withdrawable_balance NUMERIC(14,2) NOT NULL DEFAULT 0",
    "ALTER TABLE wallets ADD COLUMN IF NOT EXISTS bonus_balance NUMERIC(14,2) NOT NULL DEFAULT 0",
    "CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_uidx ON wallets(user_id)",
    "CREATE TABLE IF NOT EXISTS investment_plans (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', min_amount NUMERIC(14,2) NOT NULL DEFAULT 5, duration_days INTEGER NOT NULL DEFAULT 30, return_percent NUMERIC(8,2) NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "CREATE TABLE IF NOT EXISTS investments (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), plan_id BIGINT REFERENCES investment_plans(id), plan_name TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "ALTER TABLE investments ADD COLUMN IF NOT EXISTS plan_name TEXT",
    "CREATE TABLE IF NOT EXISTS finance_requests (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), type TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, network TEXT, reference TEXT, mobile_number TEXT, status TEXT NOT NULL DEFAULT 'pending', admin_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ)",
    "ALTER TABLE finance_requests ADD COLUMN IF NOT EXISTS network TEXT",
    "ALTER TABLE finance_requests ADD COLUMN IF NOT EXISTS reference TEXT",
    "ALTER TABLE finance_requests ADD COLUMN IF NOT EXISTS mobile_number TEXT",
    "ALTER TABLE finance_requests ADD COLUMN IF NOT EXISTS admin_note TEXT",
    "ALTER TABLE finance_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ",
    "CREATE TABLE IF NOT EXISTS wallet_transactions (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), type TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, balance_type TEXT NOT NULL DEFAULT 'withdrawable', description TEXT, admin_note TEXT, status TEXT NOT NULL DEFAULT 'completed', network TEXT, mobile_number TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS balance_type TEXT NOT NULL DEFAULT 'withdrawable'",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS admin_note TEXT",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS network TEXT",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS mobile_number TEXT",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS payout_id BIGINT",
    "CREATE TABLE IF NOT EXISTS admin_payouts (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), amount NUMERIC(14,2) NOT NULL, network TEXT NOT NULL, mobile_number TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', admin_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)"
  ];
  for (const statement of sql) await db().query(statement);
  await db().query("INSERT INTO wallets(user_id) SELECT id FROM users ON CONFLICT(user_id) DO NOTHING");
}