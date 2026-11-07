// /api/auth?action=status|setup|register|verify_otp|resend_verify|login|complete_phone|forgot|reset|logout (+ legacy verify link)
import { q, ensureSchema, installFresh } from '../lib/db.js';
import {
  secret, safeEqual, hashPassword, verifyPassword, clearSession, getAuth, setSession,
  getPreUser, makeToken, useToken, peekToken, appUrl, makeOtp, checkOtp, otpCooldown, setMarker,
} from '../lib/auth.js';
import { startTrial } from '../lib/plans.js';
import { mails } from '../lib/mail.js';
import { normEmail, validEmail, normPhone, cleanName, newUserDefaults, notifyAdmins, finishLogin, approvalRequired } from '../lib/users.js';
import { getSite, publicSite } from '../lib/site.js';
import { send, fail, query, readJson } from '../lib/util.js';

// Email a fresh 6-digit code unless one was sent in the last minute. Returns seconds to wait.
async function sendOtp(user) {
  const wait = await otpCooldown(user.id);
  if (wait > 0) return wait;
  const code = await makeOtp(user.id);
  await mails.otp(user, code);
  return 0;
}

// After the email is proven: activate (unless approval is required), start the trial, tell admins.
async function afterVerified(req, uid) {
  let r = await q('UPDATE users SET email_verified = true WHERE id = $1 RETURNING *', [uid]);
  if (r[0].status === 'pending' && !(await approvalRequired()) && r[0].phone) {
    r = await q(`UPDATE users SET status = 'active' WHERE id = $1 RETURNING *`, [uid]);
  }
  if (r[0].status === 'active') await startTrial(uid);
  await notifyAdmins(req, r[0]);
  return (await q('SELECT * FROM users WHERE id = $1', [uid]))[0];
}

export default async function handler(req, res) {
  try {
    const qs = query(req);
    const action = qs.get('action') || '';

    if (action === 'status') {
      const installed = (await ensureSchema()) && (await q('SELECT 1 FROM users LIMIT 1')).length > 0;
      const auth = installed ? await getAuth(req) : null;
      setMarker(req, res, !!auth);
      const pre = installed && !auth ? await getPreUser(req) : null;
      return send(res, 200, {
        installed, logged_in: !!auth,
        google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        needs_phone: !!(pre && !pre.phone),
        email_enabled: !!process.env.RESEND_API_KEY,
        site: publicSite(await getSite()),
      });
    }

    if (action === 'logout') {
      clearSession(req, res);
      res.statusCode = 302;
      res.setHeader('Location', '/login.html');
      return res.end();
    }

    if (action === 'verify') {
      await ensureSchema();
      const uid = await useToken(qs.get('token'), 'verify');
      res.statusCode = 302;
      if (!uid) { res.setHeader('Location', '/login.html?msg=link_invalid'); return res.end(); }
      const u = await afterVerified(req, uid);
      res.setHeader('Location', '/login.html?msg=' + (u.status === 'active' ? 'verified' : 'verified_pending'));
      return res.end();
    }

    if (req.method !== 'POST') return fail(res, 405, 'POST only');
    const d = await readJson(req);

    if (action === 'setup') {
      const exists = (await ensureSchema()) && (await q('SELECT 1 FROM users LIMIT 1')).length > 0;
      if (exists) return fail(res, 409, 'Already set up. Sign in instead.');
      if (!safeEqual(String(d.code || '').trim(), secret())) return fail(res, 403, 'The setup code does not match APP_SECRET in your Vercel settings.');
      const email = normEmail(d.email), phone = normPhone(d.phone), name = cleanName(d.name);
      if (!name) return fail(res, 422, 'Enter your name.');
      if (!validEmail(email)) return fail(res, 422, 'Enter a valid email address.');
      if (!phone) return fail(res, 422, 'Enter your phone number with country code, e.g. +251911234567.');
      if (String(d.password || '').length < 8) return fail(res, 422, 'Use a password with at least 8 characters.');
      if (d.password !== d.password2) return fail(res, 422, 'The two passwords do not match.');
      await installFresh();
      const r = await q(`INSERT INTO users (email, name, phone, password_hash, email_verified, status, role, last_login, terms_accepted_at)
        VALUES ($1,$2,$3,$4,true,'active','admin',now(),now()) RETURNING *`, [email, name, phone, hashPassword(d.password)]);
      await newUserDefaults(r[0].id, d.balance);
      await q(`UPDATE users SET plan = 'ultimate', plan_expires_at = NULL, trial_used = true WHERE id = $1`, [r[0].id]);
      setSession(req, res, r[0]);
      return send(res, 200, { ok: true, next: 'app' });
    }

    if (!(await ensureSchema())) return fail(res, 409, 'The journal is not set up yet.');

    if (action === 'register') {
      if (d.website) return send(res, 200, { ok: true, next: 'otp' }); // bot trap
      if ((await getSite()).registration_open === '0') return fail(res, 403, 'Sign-up is closed right now.');
      if (!d.terms) return fail(res, 422, 'Please accept the Terms and Conditions and Privacy Policy.');
      const email = normEmail(d.email), phone = normPhone(d.phone), name = cleanName(d.name);
      if (!name) return fail(res, 422, 'Enter your name.');
      if (!validEmail(email)) return fail(res, 422, 'Enter a valid email address.');
      if (!phone) return fail(res, 422, 'Enter your phone number with country code, e.g. +251911234567.');
      if (String(d.password || '').length < 8) return fail(res, 422, 'Use a password with at least 8 characters.');
      if (d.password !== d.password2) return fail(res, 422, 'The two passwords do not match.');
      const ex = await q('SELECT * FROM users WHERE email = $1', [email]);
      if (ex.length) {
        const u = ex[0];
        if (!u.email_verified) {
          // never confirmed: the newest sign-up wins, so only the real email owner can finish it
          const r2 = await q('UPDATE users SET name = $2, phone = $3, password_hash = $4, pw_version = pw_version + 1, terms_accepted_at = now() WHERE id = $1 RETURNING *',
            [u.id, name, phone, hashPassword(d.password)]);
          const wait = await sendOtp(r2[0]);
          return send(res, 200, { ok: true, next: 'otp', email, wait });
        }
        return fail(res, 409, 'An account with this email already exists. Sign in, or use "Forgot password".');
      }
      const r = await q(`INSERT INTO users (email, name, phone, password_hash, terms_accepted_at) VALUES ($1,$2,$3,$4,now()) RETURNING *`,
        [email, name, phone, hashPassword(d.password)]);
      await newUserDefaults(r[0].id, 0);
      await sendOtp(r[0]);
      return send(res, 200, { ok: true, next: 'otp', email });
    }

    if (action === 'resend_verify') {
      const r = await q('SELECT * FROM users WHERE email = $1', [normEmail(d.email)]);
      let wait = 0;
      if (r.length && !r[0].email_verified) wait = await sendOtp(r[0]);
      if (wait) return fail(res, 429, `Wait ${wait} seconds before asking for a new code.`);
      return send(res, 200, { ok: true });
    }

    if (action === 'verify_otp') {
      const r = await q('SELECT * FROM users WHERE email = $1', [normEmail(d.email)]);
      const u = r[0];
      if (!u) return fail(res, 404, 'No sign-up found for this email. Create your account again.');
      if (u.email_verified) return finishLogin(req, res, u);
      const c = await checkOtp(u.id, d.code);
      if (c.result === 'wrong') return fail(res, 422, `That code is not right. ${c.left} ${c.left === 1 ? 'try' : 'tries'} left.`);
      if (c.result === 'locked') return fail(res, 429, 'Too many wrong codes. Ask for a new code.');
      if (c.result === 'expired') return fail(res, 410, 'This code has expired. Ask for a new code.');
      return finishLogin(req, res, await afterVerified(req, u.id));
    }

    if (action === 'login') {
      const r = await q('SELECT * FROM users WHERE email = $1', [normEmail(d.email)]);
      const u = r[0];
      const bad = 'Wrong email or password.';
      if (!u) { await new Promise((ok) => setTimeout(ok, 400)); return fail(res, 401, bad); }
      if (Number(u.lock_until) > Date.now()) {
        return fail(res, 429, `Too many wrong attempts. Try again in ${Math.ceil((u.lock_until - Date.now()) / 60000)} min.`);
      }
      if (!u.password_hash) return fail(res, 401, 'This account uses Google. Click "Continue with Google", or use "Forgot password" to set a password.');
      if (!verifyPassword(d.password || '', u.password_hash)) {
        await new Promise((ok) => setTimeout(ok, 400));
        const fails = u.fail_count + 1;
        if (fails >= 5) {
          await q('UPDATE users SET fail_count = 0, lock_until = $2 WHERE id = $1', [u.id, Date.now() + 10 * 60 * 1000]);
          return fail(res, 429, 'Too many wrong attempts. Locked for 10 minutes.');
        }
        await q('UPDATE users SET fail_count = $2 WHERE id = $1', [u.id, fails]);
        return fail(res, 401, bad);
      }
      if (!u.email_verified) await sendOtp(u);   // a fresh code is waiting when they reach the code screen
      return finishLogin(req, res, u);
    }

    if (action === 'complete_phone') {
      const u = await getPreUser(req);
      if (!u) return fail(res, 401, 'Your sign-in expired. Sign in again.');
      const phone = normPhone(d.phone);
      if (!phone) return fail(res, 422, 'Enter your phone number with country code, e.g. +251911234567.');
      if (u.status === 'pending' && !d.terms && !u.terms_accepted_at) return fail(res, 422, 'Please accept the Terms and Conditions and Privacy Policy.');
      let r = await q('UPDATE users SET phone = $2, terms_accepted_at = COALESCE(terms_accepted_at, now()) WHERE id = $1 RETURNING *', [u.id, phone]);
      if (r[0].status === 'pending' && !(await approvalRequired())) r = await q(`UPDATE users SET status = 'active' WHERE id = $1 RETURNING *`, [u.id]);
      if (r[0].status === 'active' && r[0].email_verified) await startTrial(u.id);
      await notifyAdmins(req, r[0]);
      return finishLogin(req, res, r[0]);
    }

    if (action === 'forgot') {
      const r = await q('SELECT * FROM users WHERE email = $1', [normEmail(d.email)]);
      if (r.length && r[0].status !== 'disabled') {
        const t = await makeToken(r[0].id, 'reset', 3600 * 1000);
        await mails.reset(r[0], `${appUrl(req)}/login.html?reset=${t}`);
      }
      return send(res, 200, { ok: true }); // same answer either way
    }

    if (action === 'check_reset') {
      return send(res, 200, { ok: !!(await peekToken(d.token, 'reset')) });
    }

    if (action === 'reset') {
      if (String(d.password || '').length < 8) return fail(res, 422, 'Use a password with at least 8 characters.');
      if (d.password !== d.password2) return fail(res, 422, 'The two passwords do not match.');
      const uid = await useToken(d.token, 'reset');
      if (!uid) return fail(res, 410, 'This reset link has expired or was already used. Ask for a new one.');
      // a working reset link also proves the email address
      const r = await q(`UPDATE users SET password_hash = $2, pw_version = pw_version + 1, fail_count = 0, lock_until = 0
        WHERE id = $1 RETURNING *`, [uid, hashPassword(d.password)]);
      return finishLogin(req, res, r[0].email_verified ? r[0] : await afterVerified(req, uid));
    }

    return fail(res, 400, 'Unknown action');
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error. Check the Vercel function logs.');
  }
}
