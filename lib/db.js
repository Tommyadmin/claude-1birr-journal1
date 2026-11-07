// Postgres connection (Neon on Vercel, or any Postgres) and the schema.
import pg from 'pg';

let pool;

export function db() {
  if (!pool) {
    const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!cs) {
      throw Object.assign(new Error('Database is not connected. In Vercel, add a Neon Postgres database to this project (Storage tab), then redeploy.'), { status: 503 });
    }
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(cs);
    pool = new pg.Pool({ connectionString: cs, max: 3, ssl: local ? false : { rejectUnauthorized: true } });
  }
  return pool;
}

export async function q(text, params = []) {
  const r = await db().query(text, params);
  return r.rows;
}

export async function getSetting(k, def = null) {
  try {
    const rows = await q('SELECT v FROM settings WHERE k = $1', [k]);
    return rows.length ? rows[0].v : def;
  } catch (e) {
    if (e.code === '42P01') return def; // table missing = not installed yet
    throw e;
  }
}

export async function setSetting(k, v) {
  await q('INSERT INTO settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v', [k, String(v)]);
}

export async function createSchema() {
  await q(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    trade_time TIME NULL,
    session TEXT NOT NULL DEFAULT 'london',
    pair TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'buy',
    entry NUMERIC(18,5), sl NUMERIC(18,5), tp NUMERIC(18,5),
    lot NUMERIC(10,2), risk_amount NUMERIC(12,2),
    pnl NUMERIC(12,2) NOT NULL DEFAULT 0,
    r_multiple NUMERIC(8,2),
    result CHAR(1) NOT NULL DEFAULT 'W',
    checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    emotional SMALLINT NOT NULL DEFAULT 0,
    followed_plan SMALLINT NOT NULL DEFAULT 1,
    mood TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    lessons TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    reviewed SMALLINT NOT NULL DEFAULT 1,
    mt5_account TEXT NULL,
    mt5_position BIGINT NULL,
    close_price NUMERIC(18,5) NULL,
    close_time TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (mt5_account, mt5_position)
  )`);
  await q(`CREATE INDEX IF NOT EXISTS idx_trades_date ON trades (trade_date)`);
  await q(`CREATE TABLE IF NOT EXISTS screenshots (
    id SERIAL PRIMARY KEY,
    trade_id INT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'before',
    mime TEXT NOT NULL,
    url TEXT NULL,
    data BYTEA NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`);
  await q(`CREATE INDEX IF NOT EXISTS idx_shots_trade ON screenshots (trade_id)`);
  await q(`CREATE TABLE IF NOT EXISTS mt5_ignored (
    mt5_account TEXT NOT NULL,
    mt5_position BIGINT NOT NULL,
    PRIMARY KEY (mt5_account, mt5_position)
  )`);
  await setSetting('schema', 2);
}
