// Postgres connection (Neon on Vercel, or any Postgres) and the schema.
import pg from 'pg';

let pool;

// Finds the Postgres connection string even when Vercel added it with a custom
// prefix (e.g. STORAGE_DATABASE_URL, NEON_POSTGRES_URL).
function findConnectionString() {
  const env = process.env;
  const isPg = (v) => typeof v === 'string' && /^postgres(ql)?:\/\//.test(v);
  const exact = ['DATABASE_URL', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'];
  for (const k of exact) if (isPg(env[k])) return env[k];
  const keys = Object.keys(env).sort();
  const pooled = keys.find((k) => /(DATABASE_URL|POSTGRES_URL)$/.test(k) && isPg(env[k]));
  if (pooled) return env[pooled];
  const any = keys.find((k) => /(DATABASE|POSTGRES|NEON)/.test(k) && isPg(env[k]));
  return any ? env[any] : null;
}

export function db() {
  if (!pool) {
    const cs = findConnectionString();
    if (!cs) {
      const seen = Object.keys(process.env).filter((k) => /^PG|DATABASE|POSTGRES|NEON/.test(k));
      throw Object.assign(new Error('Database is not connected. In Vercel: Storage tab > your Neon database > Connect Project (tick Production), then Deployments > Redeploy.'
        + (seen.length ? ' Found these settings but none had a postgres:// address: ' + seen.join(', ') : ' No database settings were found in this deployment.')), { status: 503 });
    }
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(cs);
    pool = new pg.Pool({ connectionString: cs, max: 3, ssl: local ? false : { rejectUnauthorized: true }, options: '-c timezone=UTC' });
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

// ---------- per-user settings ----------
export async function getUS(uid, k, def = null) {
  const rows = await q('SELECT v FROM user_settings WHERE user_id = $1 AND k = $2', [uid, k]);
  return rows.length ? rows[0].v : def;
}

export async function setUS(uid, k, v) {
  await q(`INSERT INTO user_settings (user_id, k, v) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, k) DO UPDATE SET v = EXCLUDED.v`, [uid, k, String(v)]);
}

export const DEFAULT_USER_SETTINGS = { start_balance: 0, risk_pct: 10, goal: 1000 };

// ---------- schema version 3: many users ----------
// Adds users, per-user settings and tokens, and moves an existing single-user
// journal into the admin account named by ADMIN_EMAIL.
async function migrateV3() {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const x = (sql, p) => client.query(sql, p);
    await x(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NULL,
      google_sub TEXT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'pending',
      role TEXT NOT NULL DEFAULT 'user',
      pw_version INT NOT NULL DEFAULT 1,
      fail_count INT NOT NULL DEFAULT 0,
      lock_until BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      last_login TIMESTAMP NULL
    )`);
    await x(`CREATE TABLE IF NOT EXISTS user_settings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      k TEXT NOT NULL, v TEXT NOT NULL,
      PRIMARY KEY (user_id, k)
    )`);
    await x(`CREATE INDEX IF NOT EXISTS idx_us_mt5key ON user_settings (v) WHERE k = 'mt5_key'`);
    await x(`CREATE TABLE IF NOT EXISTS tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false
    )`);

    // existing single-user data -> admin account
    const legacy = await x(`SELECT v FROM settings WHERE k = 'password_hash'`);
    const users = await x('SELECT count(*)::int AS n FROM users');
    let adminId = null;
    if (legacy.rows.length && users.rows[0].n === 0) {
      const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw Object.assign(new Error('Upgrade needed: add ADMIN_EMAIL (your email) in Vercel > Settings > Environment Variables, then redeploy. Your existing journal will move into that account.'), { status: 503 });
      }
      const r = await x(`INSERT INTO users (email, name, password_hash, email_verified, status, role)
        VALUES ($1, 'Admin', $2, true, 'active', 'admin') RETURNING id`, [email, legacy.rows[0].v]);
      adminId = r.rows[0].id;
      const keys = ['start_balance', 'risk_pct', 'goal', 'run_start', 'run_size', 'mt5_key', 'mt5_last_sync', 'mt5_last_account', 'mt5_last_count'];
      await x(`INSERT INTO user_settings (user_id, k, v) SELECT $1, k, v FROM settings WHERE k = ANY($2)`, [adminId, keys]);
    }

    await x('ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id INT NULL REFERENCES users(id) ON DELETE CASCADE');
    if (adminId) await x('UPDATE trades SET user_id = $1 WHERE user_id IS NULL', [adminId]);
    await x('DELETE FROM trades WHERE user_id IS NULL');
    await x('ALTER TABLE trades ALTER COLUMN user_id SET NOT NULL');
    await x('ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_mt5_account_mt5_position_key');
    await x(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_user_mt5_key') THEN
        ALTER TABLE trades ADD CONSTRAINT trades_user_mt5_key UNIQUE (user_id, mt5_account, mt5_position);
      END IF; END $$`);
    await x('CREATE INDEX IF NOT EXISTS idx_trades_user ON trades (user_id, trade_date)');

    await x('ALTER TABLE mt5_ignored ADD COLUMN IF NOT EXISTS user_id INT NULL REFERENCES users(id) ON DELETE CASCADE');
    if (adminId) await x('UPDATE mt5_ignored SET user_id = $1 WHERE user_id IS NULL', [adminId]);
    await x('DELETE FROM mt5_ignored WHERE user_id IS NULL');
    await x('ALTER TABLE mt5_ignored ALTER COLUMN user_id SET NOT NULL');
    await x('ALTER TABLE mt5_ignored DROP CONSTRAINT IF EXISTS mt5_ignored_pkey');
    await x('ALTER TABLE mt5_ignored ADD PRIMARY KEY (user_id, mt5_account, mt5_position)');

    // the old single-user login and keys now live on the user
    await x(`DELETE FROM settings WHERE k IN ('password_hash','fail_count','lock_until','mt5_key','mt5_last_sync','mt5_last_account','mt5_last_count','start_balance','risk_pct','goal','run_start','run_size')`);
    await x(`INSERT INTO settings (k, v) VALUES ('schema', '3') ON CONFLICT (k) DO UPDATE SET v = '3'`);
    await x('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------- schema version 4: customization, profile, inbox, site settings ----------
async function migrateV4() {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const x = (sql, p) => client.query(sql, p);
    const cols = [
      "instrument_type TEXT NOT NULL DEFAULT ''", "strategy TEXT NOT NULL DEFAULT ''",
      "mistakes JSONB NOT NULL DEFAULT '[]'::jsonb", "tags JSONB NOT NULL DEFAULT '[]'::jsonb",
      "emotion_during TEXT NOT NULL DEFAULT ''", "emotion_after TEXT NOT NULL DEFAULT ''",
      'confidence SMALLINT NULL', 'gross_pnl NUMERIC(12,2) NULL', 'commission NUMERIC(12,2) NULL', 'swap NUMERIC(12,2) NULL',
      'leverage INT NULL', "market_condition TEXT NOT NULL DEFAULT ''", "exit_reason TEXT NOT NULL DEFAULT ''",
      "went_right TEXT NOT NULL DEFAULT ''", "went_wrong TEXT NOT NULL DEFAULT ''",
      'favorite SMALLINT NOT NULL DEFAULT 0', "partials JSONB NOT NULL DEFAULT '[]'::jsonb",
      "account_type TEXT NOT NULL DEFAULT 'live'", 'import_key TEXT NULL',
    ];
    for (const c of cols) await x(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS ${c}`);
    await x(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_user_import_key') THEN
        ALTER TABLE trades ADD CONSTRAINT trades_user_import_key UNIQUE (user_id, import_key);
      END IF; END $$`);
    await x(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await x('ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP NULL');
    await x(`CREATE TABLE IF NOT EXISTS avatars (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mime TEXT NOT NULL, data BYTEA NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`);
    await x(`CREATE TABLE IF NOT EXISTS site_assets (
      k TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT now()
    )`);
    await x(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INT NULL REFERENCES users(id) ON DELETE CASCADE,  -- NULL = everyone
      sender_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`);
    await x('CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, created_at)');
    await x(`CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (notification_id, user_id)
    )`);
    await x(`CREATE TABLE IF NOT EXISTS day_notes (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL, text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, day)
    )`);
    // the 20-trade run is gone
    await x(`DELETE FROM user_settings WHERE k IN ('run_start','run_size')`);
    await x(`INSERT INTO settings (k, v) VALUES ('schema', '4') ON CONFLICT (k) DO UPDATE SET v = '4'`);
    await x('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

let schemaOk = false;

// Returns true when the app is installed and on the current schema.
export async function ensureSchema() {
  if (schemaOk) return true;
  const v = Number(await getSetting('schema', 0));
  if (!v) return false;                // not installed yet
  if (v < 3) await migrateV3();
  if (v < 4) await migrateV4();
  schemaOk = true;
  return true;
}

// Fresh install: create every table at the current version.
export async function installFresh() {
  await createSchema();
  await migrateV3();
  await migrateV4();
  schemaOk = true;
}
