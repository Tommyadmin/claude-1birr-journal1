// Passwords (scrypt), per-user signed session cookies, CSRF, one-time tokens.
import crypto from 'node:crypto';
import { q, ensureSchema } from './db.js';

const COOKIE = 'wtj';
const PRE = 'wtj_pre';            // short-lived cookie while a Google user adds a phone number
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export function secret() {
  const s = process.env.APP_SECRET || '';
  if (s.length < 16) {
    throw Object.assign(new Error('APP_SECRET is missing or shorter than 16 characters. Add it in Vercel > Settings > Environment Variables, then redeploy.'), { status: 503 });
  }
  return s;
}

export const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(hashHex, 'hex');
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}

export function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return (isHttps(req) ? 'https://' : 'http://') + req.headers.host;
}

export function addCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value);
}

export function cookieStr(req, name, val, maxAge) {
  return `${name}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

export function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return body + '.' + hmac(body);
}

export function unsign(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sig, hmac(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// pv ties a session to the user's password version: a password change or reset signs out other devices.
const pv = (u) => hmac(`pv:${u.id}:${u.pw_version}`).slice(0, 12);

export function setSession(req, res, user) {
  const p = { uid: user.id, iat: Date.now(), exp: Date.now() + MAX_AGE * 1000, pv: pv(user) };
  addCookie(res, cookieStr(req, COOKIE, sign(p), MAX_AGE));
  addCookie(res, cookieStr(req, PRE, '', 0));
  setMarker(req, res, true);
  return p;
}

export function clearSession(req, res) {
  addCookie(res, cookieStr(req, COOKIE, '', 0));
  addCookie(res, cookieStr(req, PRE, '', 0));
  setMarker(req, res, false);
}

// Readable (not HttpOnly) hint that this browser is signed in. Holds no secret; only used to pick
// the landing page or the app on "/". The real check is always the signed session cookie.
export function setMarker(req, res, on) {
  addCookie(res, `wtj_in=${on ? 1 : ''}; Path=/; SameSite=Lax; Max-Age=${on ? MAX_AGE : 0}${isHttps(req) ? '; Secure' : ''}`);
}

export function setPre(req, res, user) {
  addCookie(res, cookieStr(req, PRE, sign({ uid: user.id, exp: Date.now() + 30 * 60 * 1000 }), 1800));
}

export async function getPreUser(req) {
  const p = unsign(parseCookies(req)[PRE]);
  if (!p) return null;
  const r = await q('SELECT * FROM users WHERE id = $1', [p.uid]);
  return r[0] || null;
}

// Returns { session, user } for a signed-in, active user, or null.
export async function getAuth(req) {
  if (!(await ensureSchema())) return null;
  const p = unsign(parseCookies(req)[COOKIE]);
  if (!p || !p.uid) return null;
  const r = await q('SELECT * FROM users WHERE id = $1', [p.uid]);
  const user = r[0];
  if (!user || user.status !== 'active' || !safeEqual(p.pv, pv(user))) return null;
  return { session: p, user };
}

export function csrfFor(session) {
  return hmac('csrf:' + session.uid + ':' + session.iat);
}

export function checkCsrf(req, session) {
  return safeEqual(req.headers['x-csrf'] || '', csrfFor(session));
}

// One-time tokens for email verification and password reset (stored hashed).
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

export async function makeToken(userId, kind, ttlMs) {
  const t = crypto.randomBytes(32).toString('base64url');
  await q('DELETE FROM tokens WHERE user_id = $1 AND kind = $2', [userId, kind]);
  await q('INSERT INTO tokens (token_hash, user_id, kind, expires_at) VALUES ($1,$2,$3,$4)', [tokenHash(t), userId, kind, Date.now() + ttlMs]);
  return t;
}

// Returns the user id if the token is valid, and marks it used.
export async function useToken(t, kind) {
  const r = await q(`UPDATE tokens SET used = true WHERE token_hash = $1 AND kind = $2 AND used = false AND expires_at > $3
    RETURNING user_id`, [tokenHash(String(t || '')), kind, Date.now()]);
  return r.length ? r[0].user_id : null;
}

export async function peekToken(t, kind) {
  const r = await q('SELECT user_id FROM tokens WHERE token_hash = $1 AND kind = $2 AND used = false AND expires_at > $3',
    [tokenHash(String(t || '')), kind, Date.now()]);
  return r.length ? r[0].user_id : null;
}

// ---------- email one-time codes (6 digits, 15 minutes, 5 tries) ----------
const otpHash = (uid, code) => crypto.createHash('sha256').update(`otp:${uid}:${String(code).trim()}:${secret()}`).digest('hex');

export async function otpCooldown(userId) {
  const r = await q(`SELECT created_ms FROM tokens WHERE user_id = $1 AND kind = 'otp' ORDER BY created_ms DESC LIMIT 1`, [userId]);
  const wait = r.length ? Math.ceil((Number(r[0].created_ms) + 60000 - Date.now()) / 1000) : 0;
  return Math.max(0, wait);
}

export async function makeOtp(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await q(`DELETE FROM tokens WHERE user_id = $1 AND kind = 'otp'`, [userId]);
  await q(`INSERT INTO tokens (token_hash, user_id, kind, expires_at, created_ms) VALUES ($1, $2, 'otp', $3, $4)`,
    [otpHash(userId, code), userId, Date.now() + 15 * 60 * 1000, Date.now()]);
  return code;
}

// Returns 'ok', 'wrong' (with left), 'expired' or 'locked'.
export async function checkOtp(userId, code) {
  const r = await q(`SELECT token_hash, attempts, expires_at FROM tokens WHERE user_id = $1 AND kind = 'otp' AND used = false ORDER BY created_ms DESC LIMIT 1`, [userId]);
  if (!r.length || Number(r[0].expires_at) < Date.now()) return { result: 'expired' };
  if (r[0].attempts >= 5) return { result: 'locked' };
  if (!/^\d{6}$/.test(String(code || '').trim()) || !safeEqual(r[0].token_hash, otpHash(userId, code))) {
    await q(`UPDATE tokens SET attempts = attempts + 1 WHERE token_hash = $1`, [r[0].token_hash]);
    const left = 4 - r[0].attempts;
    return left > 0 ? { result: 'wrong', left } : { result: 'locked' };
  }
  await q(`UPDATE tokens SET used = true WHERE token_hash = $1`, [r[0].token_hash]);
  return { result: 'ok' };
}
