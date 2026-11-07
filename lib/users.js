// Shared account helpers: validation, defaults, admin notice, post-sign-in routing.
import { q, setUS, getUS, DEFAULT_USER_SETTINGS } from './db.js';
import { setSession, setPre, appUrl } from './auth.js';
import { mails } from './mail.js';
import { getSite } from './site.js';
import { send, fail, localParts } from './util.js';

export const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 200);
export const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e);
export function normPhone(p) {
  let s = String(p || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}
export const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 80);

export async function newUserDefaults(uid, balance) {
  await setUS(uid, 'start_balance', Math.max(0, Number(balance) || DEFAULT_USER_SETTINGS.start_balance));
  await setUS(uid, 'risk_pct', DEFAULT_USER_SETTINGS.risk_pct);
  await setUS(uid, 'goal', DEFAULT_USER_SETTINGS.goal);
  await setUS(uid, 'run_start', localParts().date);
  await setUS(uid, 'run_size', DEFAULT_USER_SETTINGS.run_size);
}

export async function approvalRequired() {
  return (await getSite()).require_approval !== '0';
}

// Tell admins once that someone is waiting for approval.
export async function notifyAdmins(req, user) {
  if (user.status !== 'pending' || !user.email_verified || !user.phone) return;
  if (await getUS(user.id, 'admin_notified')) return;
  await setUS(user.id, 'admin_notified', 1);
  const admins = await q(`SELECT email FROM users WHERE role = 'admin' AND status = 'active'`);
  const list = new Set(admins.map((a) => a.email));
  if (process.env.ADMIN_EMAIL) list.add(normEmail(process.env.ADMIN_EMAIL));
  for (const e of list) await mails.adminNewUser(e, user, appUrl(req) + '/#admin');
}

// Decide what happens after a correct password or Google sign-in.
// JSON for the sign-in form, or a redirect for the Google flow.
export async function finishLogin(req, res, user, redirect = false) {
  const go = (next, extra) => {
    if (!redirect) return send(res, 200, { ok: true, next, ...(extra || {}) });
    res.statusCode = 302;
    res.setHeader('Location', next === 'app' ? '/' : '/login.html?msg=' + next);
    return res.end();
  };
  if (user.status === 'disabled') {
    return redirect ? go('disabled') : fail(res, 403, 'This account is disabled. Contact the journal owner.');
  }
  if (!user.email_verified) {
    return redirect ? go('unverified') : send(res, 403, { error: 'Confirm your email first. Check your inbox for the link.', code: 'unverified' });
  }
  if (!user.phone) { setPre(req, res, user); return go('phone'); }
  if (user.status === 'pending') return go('pending');
  await q('UPDATE users SET last_login = now(), fail_count = 0 WHERE id = $1', [user.id]);
  setSession(req, res, user);
  return go('app');
}
