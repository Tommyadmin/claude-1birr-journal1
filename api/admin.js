// /api/admin?action=list|set_status|set_role|send_reset|delete_user|messages|send_message|delete_message|site|save_site|upload_logo|delete_logo  (admins only)
import { q } from '../lib/db.js';
import { getAuth, checkCsrf, makeToken, appUrl } from '../lib/auth.js';
import { mails } from '../lib/mail.js';
import { send, fail, query, readJson, readBody, TZ } from '../lib/util.js';
import { getSite, saveSite, publicSite, legalText } from '../lib/site.js';
import { startTrial, getPlans, savePlans, getPaymentConfig, savePaymentConfig, trialConfig, effectivePlanId, PLAN_IDS, FEATURES } from '../lib/plans.js';

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
          EXISTS (SELECT 1 FROM avatars a WHERE a.user_id = u.id) AS has_avatar,
          u.plan, u.on_trial, u.plan_expires_at
        FROM users u
        ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, u.created_at DESC`, [TZ]);
      const plans = await getPlans();
      users.forEach((u) => {
        const eff = effectivePlanId({ ...u, role: u.role });
        u.plan_effective = eff; u.plan_name = (plans[eff] || {}).name || eff;
        u.days_left = u.plan_expires_at && eff !== 'free' && u.role !== 'admin' ? Math.max(0, Math.ceil((new Date(u.plan_expires_at) - Date.now()) / 86400000)) : null;
        u.lifetime = !u.plan_expires_at && eff !== 'free';
        delete u.plan_expires_at;
      });
      const pending_payments = (await q(`SELECT count(*)::int AS n FROM payments WHERE status = 'pending'`))[0].n;
      return send(res, 200, { users, me: me.id, email_enabled: !!process.env.RESEND_API_KEY, pending_payments, plans: PLAN_IDS.map((id) => ({ id, name: plans[id].name })) });
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

    if (action === 'billing') {
      const pays = await q(`SELECT p.id, p.user_id, u.name, u.email, p.plan, p.period, p.method, p.amount::float8 AS amount, p.currency,
          p.reference, p.payer, p.note, p.status, p.admin_note, (p.proof IS NOT NULL) AS has_proof,
          to_char(p.created_at AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS created_at,
          to_char(p.reviewed_at AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS reviewed_at
        FROM payments p JOIN users u ON u.id = p.user_id
        ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.created_at DESC LIMIT 200`, [TZ]);
      const counts = await q(`SELECT u.plan, count(*)::int AS n FROM users u WHERE u.role <> 'admin' AND (u.plan_expires_at IS NULL OR u.plan_expires_at > now()) GROUP BY u.plan`);
      const s2 = await getSite(true);
      return send(res, 200, { payments: pays, plans: await getPlans(), features: FEATURES, payment: await getPaymentConfig(), trial: await trialConfig(),
        counts, trial_days: s2.trial_days, trial_plan: s2.trial_plan });
    }

    if (action === 'site') {
      const s = await getSite(true);
      return send(res, 200, {
        integrations: {
          email: !!process.env.RESEND_API_KEY, mail_from: !!process.env.MAIL_FROM,
          google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          blob: !!process.env.BLOB_READ_WRITE_TOKEN, admin_email: !!process.env.ADMIN_EMAIL,
        },
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

    if (action === 'approve_all') {
      const r = await q(`UPDATE users SET status = 'active', email_verified = true WHERE status = 'pending' RETURNING *`);
      for (const u of r) { await startTrial(u.id); await mails.approved(u, appUrl(req) + '/login.html'); }
      return send(res, 200, { ok: true, approved: r.length });
    }

    if (action === 'save_plans') {
      return send(res, 200, { ok: true, plans: await savePlans(d.plans || {}) });
    }

    if (action === 'save_payment_config') {
      return send(res, 200, { ok: true, payment: await savePaymentConfig(d.payment || {}) });
    }

    if (action === 'review_payment') {
      const pid = parseInt(d.id, 10) || 0;
      const r = await q(`SELECT * FROM payments WHERE id = $1`, [pid]);
      const p = r[0];
      if (!p) return fail(res, 404, 'Payment not found.');
      if (p.status !== 'pending') return fail(res, 409, 'This payment was already reviewed.');
      const note = String(d.note || '').replace(/[<>]/g, '').slice(0, 500);
      const pu = (await q('SELECT * FROM users WHERE id = $1', [p.user_id]))[0];
      const plans = await getPlans(), plan = plans[p.plan];
      if (d.decision === 'approve') {
        const days = p.period === 'year' ? 365 : 30;
        // same plan and still active (not a trial): extend; otherwise start from now
        const extend = pu.plan === p.plan && !pu.on_trial && pu.plan_expires_at && new Date(pu.plan_expires_at) > new Date();
        await q(`UPDATE users SET plan = $2, on_trial = false, trial_used = true,
            plan_expires_at = ${extend ? 'plan_expires_at' : 'now()'} + ($3 || ' days')::interval WHERE id = $1`, [pu.id, p.plan, String(days)]);
        await q(`UPDATE payments SET status = 'approved', admin_note = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1`, [pid, note, me.id]);
        const until = (await q(`SELECT to_char(plan_expires_at AT TIME ZONE $2, 'DD Mon YYYY') AS d FROM users WHERE id = $1`, [pu.id, TZ]))[0].d;
        const title = `Your ${plan.name} plan is active`;
        const body = `Thanks for your payment. Your ${plan.name} plan is active until ${until}.` + (note ? '\n\n' + note : '');
        await q('INSERT INTO notifications (user_id, sender_id, title, body) VALUES ($1, $2, $3, $4)', [pu.id, me.id, title, body]);
        await mails.subscription(pu, title, `<p>${body.replace(/\n/g, '<br>')}</p>`, appUrl(req) + '/#billing');
      } else {
        await q(`UPDATE payments SET status = 'rejected', admin_note = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1`, [pid, note, me.id]);
        const title = 'We could not confirm your payment';
        const body = `We could not confirm your ${plan.name} payment (reference ${p.reference}).` + (note ? '\n\nReason: ' + note : '') + '\n\nCheck the details and submit it again, or reply to support.';
        await q('INSERT INTO notifications (user_id, sender_id, title, body) VALUES ($1, $2, $3, $4)', [pu.id, me.id, title, body]);
        await mails.subscription(pu, title, `<p>${body.replace(/\n/g, '<br>')}</p>`, appUrl(req) + '/#billing');
      }
      return send(res, 200, { ok: true });
    }

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
      // approving also confirms the email: the admin vouches for the account
      await q(`UPDATE users SET status = $2,
          email_verified = CASE WHEN $2 = 'active' THEN true ELSE email_verified END,
          pw_version = pw_version + CASE WHEN $2 = 'disabled' THEN 1 ELSE 0 END WHERE id = $1`, [id, status]);
      if (status === 'active') await startTrial(id);
      if (status === 'active' && u.status === 'pending') await mails.approved(u, appUrl(req) + '/login.html');
      return send(res, 200, { ok: true });
    }

    if (action === 'set_plan') {
      const plan = PLAN_IDS.includes(d.plan) ? d.plan : null;
      if (!plan) return fail(res, 422, 'Unknown plan.');
      const days = parseInt(d.days, 10);
      if (plan === 'free') await q(`UPDATE users SET plan = 'free', plan_expires_at = NULL, on_trial = false WHERE id = $1`, [id]);
      else if (!days) await q(`UPDATE users SET plan = $2, plan_expires_at = NULL, on_trial = false, trial_used = true WHERE id = $1`, [id, plan]);
      else await q(`UPDATE users SET plan = $2, plan_expires_at = now() + ($3 || ' days')::interval, on_trial = false, trial_used = true WHERE id = $1`, [id, plan, String(Math.min(3650, Math.max(1, days)))]);
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
