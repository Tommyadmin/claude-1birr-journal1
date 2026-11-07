// /api/admin?action=list|set_status|set_role|send_reset|delete_user|messages|send_message|delete_message|site|save_site|upload_logo|delete_logo  (admins only)
import { q } from '../lib/db.js';
import { getAuth, checkCsrf, makeToken, appUrl } from '../lib/auth.js';
import { mails } from '../lib/mail.js';
import { send, fail, query, readJson, readBody, TZ } from '../lib/util.js';
import { getSite, saveSite, publicSite, legalText } from '../lib/site.js';

export default async function handler(req, res) {
  try {
    const auth = await getAuth(req);
    if (!auth) return fail(res, 401, 'Signed out. Reload to sign in.');
    if (auth.user.role !== 'admin') return fail(res, 403, 'Admins only.');
    const me = auth.user;
    const action = query(req).get('action') || '';

    if (action === 'list') {
      const users = await q(`SELECT u.id, u.name, u.email, u.phone, u.status, u.role, u.email_verified,
          (u.google_sub IS NOT NULL) AS google, (u.password_hash IS NOT NULL) AS has_password,
          to_char((u.created_at AT TIME ZONE 'UTC') AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS created_at,
          to_char((u.last_login AT TIME ZONE 'UTC') AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS last_login,
          (SELECT count(*)::int FROM trades t WHERE t.user_id = u.id) AS trades,
          EXISTS (SELECT 1 FROM avatars a WHERE a.user_id = u.id) AS has_avatar
        FROM users u
        ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, u.created_at DESC`, [TZ]);
      return send(res, 200, { users, me: me.id, email_enabled: !!process.env.RESEND_API_KEY });
    }

    if (action === 'messages') {
      const rows = await q(`SELECT n.id, n.title, n.body, n.user_id, u.name AS to_name, u.email AS to_email,
          to_char((n.created_at AT TIME ZONE 'UTC') AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS created_at,
          (SELECT count(*)::int FROM notification_reads r WHERE r.notification_id = n.id) AS reads
        FROM notifications n LEFT JOIN users u ON u.id = n.user_id
        ORDER BY n.created_at DESC LIMIT 100`, [TZ]);
      const active = await q(`SELECT count(*)::int AS n FROM users WHERE status = 'active'`);
      return send(res, 200, { messages: rows, active_users: active[0].n });
    }

    if (action === 'site') {
      const s = await getSite(true);
      return send(res, 200, {
        site: { ...publicSite(s), legal_entity: s.legal_entity, country: s.country,
          terms: s.terms, privacy: s.privacy, terms_default: legalText({ ...s, terms: '' }, 'terms'), privacy_default: legalText({ ...s, privacy: '' }, 'privacy') },
      });
    }

    if (req.method !== 'POST') return fail(res, 405, 'POST only');
    if (!checkCsrf(req, auth.session)) return fail(res, 403, 'Session expired. Reload the page.');

    if (action === 'upload_logo') {
      const buf = await readBody(req, 1024 * 1024);
      let mime = null;
      if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') mime = 'image/png';
      else if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
      else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') mime = 'image/webp';
      if (!mime) return fail(res, 422, 'Use a PNG, JPG or WEBP logo (up to 1 MB).');
      await q(`INSERT INTO site_assets (k, mime, data, updated_at) VALUES ('logo', $1, $2, now())
        ON CONFLICT (k) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`, [mime, buf]);
      return send(res, 200, { ok: true, site: publicSite(await getSite(true)) });
    }

    const d = await readJson(req);

    if (action === 'delete_logo') {
      await q(`DELETE FROM site_assets WHERE k = 'logo'`);
      return send(res, 200, { ok: true, site: publicSite(await getSite(true)) });
    }

    if (action === 'save_site') {
      const s = await saveSite(d);
      return send(res, 200, { ok: true, site: publicSite(s) });
    }

    if (action === 'send_message') {
      const title = String(d.title || '').replace(/[<>]/g, '').trim().slice(0, 140);
      const body = String(d.body || '').replace(/<\/?script/gi, '').trim().slice(0, 5000);
      if (!title) return fail(res, 422, 'Add a title.');
      let targets = [];
      if (d.to === 'all') {
        await q('INSERT INTO notifications (user_id, sender_id, title, body) VALUES (NULL, $1, $2, $3)', [me.id, title, body]);
        if (d.email) targets = await q(`SELECT * FROM users WHERE status = 'active'`);
      } else {
        const t = await q(`SELECT * FROM users WHERE id = $1`, [parseInt(d.to, 10) || 0]);
        if (!t.length) return fail(res, 404, 'User not found.');
        await q('INSERT INTO notifications (user_id, sender_id, title, body) VALUES ($1, $2, $3, $4)', [t[0].id, me.id, title, body]);
        if (d.email) targets = t;
      }
      let emailed = 0;
      for (const u of targets.slice(0, 500)) { const m = await mails.message(u, title, body, appUrl(req) + '/#inbox'); if (m.ok) emailed++; }
      return send(res, 200, { ok: true, emailed });
    }

    if (action === 'delete_message') {
      await q('DELETE FROM notifications WHERE id = $1', [parseInt(d.id, 10) || 0]);
      return send(res, 200, { ok: true });
    }

    const id = parseInt(d.id, 10) || 0;
    const r = await q('SELECT * FROM users WHERE id = $1', [id]);
    const u = r[0];
    if (!u) return fail(res, 404, 'User not found.');

    if (action === 'set_status') {
      const status = d.status === 'active' ? 'active' : d.status === 'disabled' ? 'disabled' : null;
      if (!status) return fail(res, 422, 'Unknown status.');
      if (u.id === me.id) return fail(res, 409, 'You cannot change your own status.');
      if (status === 'active' && !u.email_verified) return fail(res, 409, 'This user has not confirmed their email yet.');
      await q('UPDATE users SET status = $2, pw_version = pw_version + CASE WHEN $2 = \'disabled\' THEN 1 ELSE 0 END WHERE id = $1', [id, status]);
      if (status === 'active' && u.status === 'pending') await mails.approved(u, appUrl(req) + '/login.html');
      return send(res, 200, { ok: true });
    }

    if (action === 'set_role') {
      const role = d.role === 'admin' ? 'admin' : 'user';
      if (u.id === me.id && role !== 'admin') {
        const others = await q(`SELECT 1 FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1 LIMIT 1`, [me.id]);
        if (!others.length) return fail(res, 409, 'You are the only admin.');
      }
      if (role === 'admin' && u.status !== 'active') return fail(res, 409, 'Approve the account first.');
      await q('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
      return send(res, 200, { ok: true });
    }

    if (action === 'send_reset') {
      const t = await makeToken(u.id, 'reset', 24 * 3600 * 1000);
      const link = `${appUrl(req)}/login.html?reset=${t}`;
      const m = await mails.reset(u, link);
      // without email set up, show the link so you can send it yourself (WhatsApp, Telegram...)
      return send(res, 200, { ok: true, emailed: !!m.ok, link: m.ok ? undefined : link });
    }

    if (action === 'delete_user') {
      if (u.id === me.id) return fail(res, 409, 'Delete your own account from Settings.');
      if (d.confirm !== u.email) return fail(res, 422, 'Type the user\'s email to confirm.');
      const shots = await q('SELECT s.url FROM screenshots s JOIN trades t ON t.id = s.trade_id WHERE t.user_id = $1 AND s.url IS NOT NULL', [id]);
      if (shots.length && process.env.BLOB_READ_WRITE_TOKEN) {
        try { const { del } = await import('@vercel/blob'); await del(shots.map((s) => s.url)); } catch (e) { console.error(e); }
      }
      await q('DELETE FROM users WHERE id = $1', [id]);
      return send(res, 200, { ok: true });
    }

    return fail(res, 400, 'Unknown action');
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error. Check the Vercel function logs.');
  }
}
