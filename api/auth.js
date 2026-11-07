// /api/auth?action=status|setup|login|logout
import { getSetting, setSetting, createSchema } from '../lib/db.js';
import { secret, safeEqual, hashPassword, verifyPassword, setSession, clearSession, getSession } from '../lib/auth.js';
import { send, fail, query, readJson, localParts } from '../lib/util.js';

export default async function handler(req, res) {
  try {
    const action = query(req).get('action') || '';

    if (action === 'status') {
      const installed = !!(await getSetting('password_hash'));
      const s = installed ? await getSession(req) : null;
      return send(res, 200, { installed, logged_in: !!s });
    }

    if (action === 'logout') {
      clearSession(req, res);
      res.statusCode = 302;
      res.setHeader('Location', '/login.html');
      return res.end();
    }

    if (req.method !== 'POST') return fail(res, 405, 'POST only');
    const d = await readJson(req);

    if (action === 'setup') {
      if (await getSetting('password_hash')) return fail(res, 409, 'Already set up. Sign in instead.');
      if (!safeEqual(String(d.code || '').trim(), secret())) return fail(res, 403, 'The setup code does not match APP_SECRET in your Vercel settings.');
      const pw = String(d.password || '');
      if (pw.length < 8) return fail(res, 422, 'Use a password with at least 8 characters.');
      if (pw !== String(d.password2 || '')) return fail(res, 422, 'The two passwords do not match.');
      const bal = Math.max(0, Number(d.balance) || 0);
      await createSchema();
      await setSetting('start_balance', bal);
      await setSetting('risk_pct', 10);
      await setSetting('goal', 1000);
      await setSetting('run_start', localParts().date);
      await setSetting('run_size', 20);
      const hash = hashPassword(pw);
      await setSetting('password_hash', hash);
      setSession(req, res, hash);
      return send(res, 200, { ok: true });
    }

    if (action === 'login') {
      const hash = await getSetting('password_hash');
      if (!hash) return fail(res, 409, 'Not set up yet.');
      const lockUntil = Number(await getSetting('lock_until', 0));
      if (lockUntil > Date.now()) {
        return fail(res, 429, `Too many wrong attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 60000)} min.`);
      }
      if (verifyPassword(d.password || '', hash)) {
        await setSetting('fail_count', 0);
        setSession(req, res, hash);
        return send(res, 200, { ok: true });
      }
      await new Promise((r) => setTimeout(r, 400));
      const fails = Number(await getSetting('fail_count', 0)) + 1;
      if (fails >= 5) {
        await setSetting('lock_until', Date.now() + 10 * 60 * 1000);
        await setSetting('fail_count', 0);
        return fail(res, 429, 'Too many wrong attempts. Locked for 10 minutes.');
      }
      await setSetting('fail_count', fails);
      return fail(res, 401, `Wrong password. ${5 - fails} tries left.`);
    }

    return fail(res, 400, 'Unknown action');
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error. Check the Vercel function logs.');
  }
}

