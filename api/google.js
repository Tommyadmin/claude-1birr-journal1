// /api/google  "Continue with Google" (OAuth 2.0 / OpenID Connect).
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Authorized redirect URI in Google Cloud:
//   https://YOUR-APP.vercel.app/api/google
import crypto from 'node:crypto';
import { q, ensureSchema } from '../lib/db.js';
import { sign, unsign, parseCookies, addCookie, cookieStr, appUrl } from '../lib/auth.js';
import { normEmail, cleanName, newUserDefaults, finishLogin } from '../lib/users.js';
import { query } from '../lib/util.js';
import { getSite } from '../lib/site.js';

const STATE = 'wtj_oauth';

function back(res, msg) {
  res.statusCode = 302;
  res.setHeader('Location', '/login.html?msg=' + msg);
  return res.end();
}

export default async function handler(req, res) {
  try {
    const id = process.env.GOOGLE_CLIENT_ID, sec = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !sec) return back(res, 'google_off');
    if (!(await ensureSchema())) return back(res, 'not_setup');
    const qs = query(req);
    const redirectUri = appUrl(req) + '/api/google';

    // step 1: send the visitor to Google
    if (!qs.get('code')) {
      if (qs.get('error')) return back(res, 'google_cancel');
      const nonce = crypto.randomBytes(16).toString('base64url');
      addCookie(res, cookieStr(req, STATE, sign({ n: nonce, exp: Date.now() + 10 * 60 * 1000 }), 600));
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({
        client_id: id, redirect_uri: redirectUri, response_type: 'code',
        scope: 'openid email profile', state: nonce, prompt: 'select_account',
      }).toString();
      res.statusCode = 302;
      res.setHeader('Location', u.toString());
      return res.end();
    }

    // step 2: Google sent the visitor back
    const st = unsign(parseCookies(req)[STATE]);
    addCookie(res, cookieStr(req, STATE, '', 0));
    if (!st || st.n !== qs.get('state')) return back(res, 'google_expired');

    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: qs.get('code'), client_id: id, client_secret: sec, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tok = await tr.json().catch(() => ({}));
    if (!tr.ok || !tok.access_token) { console.error('google token', tr.status, tok); return back(res, 'google_failed'); }
    const ir = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const info = await ir.json().catch(() => ({}));
    if (!ir.ok || !info.sub || !info.email) return back(res, 'google_failed');
    if (!info.email_verified) return back(res, 'google_unverified');

    const email = normEmail(info.email);
    let r = await q('SELECT * FROM users WHERE google_sub = $1', [info.sub]);
    let user = r[0];
    if (!user) {
      r = await q('SELECT * FROM users WHERE email = $1', [email]);
      if (r.length) {
        // same email already registered: link Google to it (Google has verified the address)
        // if the earlier sign-up was never confirmed, drop its password: it may not belong to the email owner
        r = await q(`UPDATE users SET google_sub = $2, email_verified = true,
            password_hash = CASE WHEN email_verified THEN password_hash ELSE NULL END,
            pw_version = pw_version + CASE WHEN email_verified THEN 0 ELSE 1 END
          WHERE id = $1 RETURNING *`, [r[0].id, info.sub]);
        user = r[0];
      } else {
        if ((await getSite()).registration_open === '0') return back(res, 'closed');
        r = await q(`INSERT INTO users (email, name, google_sub, email_verified) VALUES ($1,$2,$3,true) RETURNING *`,
          [email, cleanName(info.name) || email.split('@')[0], info.sub]);
        user = r[0];
        await newUserDefaults(user.id, 0);
      }
    }
    return finishLogin(req, res, user, true);
  } catch (e) {
    console.error(e);
    return back(res, 'google_failed');
  }
}
