// Password hashing (scrypt), signed session cookie, CSRF token.
import crypto from 'node:crypto';
import { getSetting } from './db.js';

const COOKIE = 'wtj';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export function secret() {
  const s = process.env.APP_SECRET || '';
  if (s.length < 16) {
    throw Object.assign(new Error('APP_SECRET is missing or shorter than 16 characters. Add it in Vercel > Settings > Environment Variables, then redeploy.'), { status: 503 });
  }
  return s;
}

const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(hashHex, 'hex');
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}

// "pv" ties a session to the current password, so changing it signs out other devices.
const pv = (pwHash) => hmac('pv:' + pwHash).slice(0, 12);

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

export function setSession(req, res, pwHash) {
  const payload = { iat: Date.now(), exp: Date.now() + MAX_AGE * 1000, pv: pv(pwHash) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = body + '.' + hmac(body);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${isHttps(req) ? '; Secure' : ''}`);
  return payload;
}

export function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}`);
}

// Returns the session payload, or null when signed out.
export async function getSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sig, hmac(body))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || p.exp < Date.now()) return null;
  const pwHash = await getSetting('password_hash');
  if (!pwHash || !safeEqual(p.pv, pv(pwHash))) return null;
  return p;
}

export function csrfFor(session) {
  return hmac('csrf:' + session.iat);
}

export function checkCsrf(req, session) {
  return safeEqual(req.headers['x-csrf'] || '', csrfFor(session));
}
