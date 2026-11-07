// /api/app?action=...  The journal's data API (sign-in required; every query is limited to the signed-in user).
import crypto from 'node:crypto';
import { q, getUS, setUS } from '../lib/db.js';
import { getAuth, checkCsrf, csrfFor, verifyPassword, hashPassword, setSession, clearSession, appUrl } from '../lib/auth.js';
import { normPhone, cleanName } from '../lib/users.js';
import { getPrefs, savePrefs, windowOf, guessInstrument } from '../lib/prefs.js';
import { getSite, publicSite } from '../lib/site.js';
import { getPlans, entitlements, planError, getPaymentConfig, trialConfig, FEATURES, PLAN_IDS } from '../lib/plans.js';
import { mails } from '../lib/mail.js';
import { send, fail, query, readBody, readJson, localParts, numOrNull, clip, strList } from '../lib/util.js';

const MAX_IMG = 4 * 1024 * 1024; // Vercel functions accept bodies up to about 4.5 MB

async function loadSettings(uid) {
  return {
    start_balance: Number(await getUS(uid, 'start_balance', 0)),
    risk_pct: Number(await getUS(uid, 'risk_pct', 10)),
    goal: Number(await getUS(uid, 'goal', 1000)),
  };
}

const publicUser = (u, avatarV) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
  has_password: !!u.password_hash, google: !!u.google_sub, profile: u.profile || {},
  avatar: avatarV ? '/api/media?type=avatar&v=' + avatarV : '',
});

async function avatarVersion(uid) {
  const r = await q(`SELECT to_char(updated_at,'YYYYMMDDHH24MISS') AS v FROM avatars WHERE user_id = $1`, [uid]);
  return r.length ? r[0].v : '';
}

const TRADE_COLS = `id, trade_date::text AS trade_date, COALESCE(to_char(trade_time,'HH24:MI'),'') AS trade_time, session, pair, direction,
  entry::float8 AS entry, sl::float8 AS sl, tp::float8 AS tp, lot::float8 AS lot, risk_amount::float8 AS risk_amount,
  pnl::float8 AS pnl, gross_pnl::float8 AS gross_pnl, commission::float8 AS commission, swap::float8 AS swap,
  r_multiple::float8 AS r_multiple, result, checklist, emotional, followed_plan, mood, emotion_during, emotion_after, confidence,
  notes, lessons, exit_reason, went_right, went_wrong, market_condition, strategy, instrument_type, mistakes, tags, leverage,
  favorite, partials, account_type, source, reviewed, mt5_account, mt5_position::text AS mt5_position, close_price::float8 AS close_price,
  to_char(close_time,'YYYY-MM-DD HH24:MI') AS close_time`;

// Columns written from the trade form and from imports, in a fixed order.
const FIELDS = ['trade_date', 'trade_time', 'session', 'pair', 'direction', 'entry', 'sl', 'tp', 'lot', 'risk_amount', 'pnl',
  'gross_pnl', 'commission', 'swap', 'r_multiple', 'result', 'checklist', 'emotional', 'followed_plan', 'mood', 'emotion_during',
  'emotion_after', 'confidence', 'notes', 'lessons', 'exit_reason', 'went_right', 'went_wrong', 'market_condition', 'strategy',
  'instrument_type', 'mistakes', 'tags', 'leverage', 'partials', 'account_type', 'close_price', 'close_time'];
const JSONB = new Set(['checklist', 'mistakes', 'tags', 'partials']);
const ph = (i, f) => '$' + i + (JSONB.has(f) ? '::jsonb' : '');

// Validates one trade. Returns { values } in FIELDS order, or { error }.
function cleanTrade(d, prefs) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trade_date || '')) return { error: 'Enter a valid entry date.' };
  const time = /^\d{2}:\d{2}$/.test(d.trade_time || '') ? d.trade_time + ':00' : null;
  let raw = String(d.pair || '').trim().replace(/[.\-_][A-Za-z0-9]{1,6}$/, '');   // broker suffix: EURUSD.r, XAUUSD-ECN
  const base = raw.replace(/[a-z]+$/, '');                                     // XAUUSDm, EURUSDz
  if (base.length >= 6) raw = base;
  const pair = raw.replace(/[^A-Za-z0-9/!]/g, '').toUpperCase().slice(0, 20);
  if (!pair) return { error: 'Enter the instrument, e.g. XAUUSD.' };
  const ids = prefs.windows.map((w) => w.id).concat('other');
  const session = ids.includes(d.session) ? d.session : windowOf(prefs, (d.trade_time || '').slice(0, 5));
  const direction = d.direction === 'sell' ? 'sell' : 'buy';
  const gross = numOrNull(d.gross_pnl), commission = numOrNull(d.commission), swap = numOrNull(d.swap);
  let pnl = numOrNull(d.pnl);
  if (pnl === null && gross !== null) pnl = gross - Math.abs(commission || 0) + (swap || 0);
  if (pnl === null) return { error: 'Enter the profit or loss (negative for a loss).' };
  pnl = Math.round(pnl * 100) / 100;
  const risk = numOrNull(d.risk_amount);
  let result = ['W', 'L', 'B'].includes(d.result) ? d.result : null;
  if (!result) result = risk && Math.abs(pnl) < 0.1 * risk ? 'B' : pnl > 0 ? 'W' : pnl < 0 ? 'L' : 'B';
  const check = {};
  const inC = d.checklist && typeof d.checklist === 'object' ? d.checklist : {};
  Object.keys(inC).slice(0, 60).forEach((k) => { if (/^[a-z0-9_]{1,30}$/.test(k)) check[k] = !!inC[k]; });
  const partials = (Array.isArray(d.partials) ? d.partials : []).slice(0, 30).map((p) => ({
    kind: p && p.kind === 'in' ? 'in' : 'out', lot: numOrNull(p && p.lot), price: numOrNull(p && p.price), time: clip(p && p.time, 16),
  })).filter((p) => p.lot && p.price);
  let closeTime = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.close_date || '')) closeTime = d.close_date + ' ' + (/^\d{2}:\d{2}$/.test(d.close_time || '') ? d.close_time : '00:00') + ':00';
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(d.close_time || '')) closeTime = d.close_time.slice(0, 16) + ':00';
  const conf = numOrNull(d.confidence), lev = numOrNull(d.leverage);
  const v = {
    trade_date: d.trade_date, trade_time: time, session, pair, direction,
    entry: numOrNull(d.entry), sl: numOrNull(d.sl), tp: numOrNull(d.tp), lot: numOrNull(d.lot), risk_amount: risk, pnl,
    gross_pnl: gross, commission, swap, r_multiple: numOrNull(d.r_multiple), result,
    checklist: JSON.stringify(check), emotional: d.emotional ? 1 : 0, followed_plan: d.followed_plan === false || d.followed_plan === 0 ? 0 : 1,
    mood: clip(d.mood, 30), emotion_during: clip(d.emotion_during, 30), emotion_after: clip(d.emotion_after, 30),
    confidence: conf === null ? null : Math.min(5, Math.max(1, Math.round(conf))),
    notes: clip(d.notes, 5000), lessons: clip(d.lessons, 5000), exit_reason: clip(d.exit_reason, 3000),
    went_right: clip(d.went_right, 3000), went_wrong: clip(d.went_wrong, 3000), market_condition: clip(d.market_condition, 40),
    strategy: clip(d.strategy, 60), instrument_type: clip(d.instrument_type, 30) || guessInstrument(pair),
    mistakes: JSON.stringify(strList(d.mistakes, 20, 60)), tags: JSON.stringify(strList(d.tags, 20, 30)),
    leverage: lev === null ? null : Math.min(10000, Math.max(1, Math.round(lev))),
    partials: JSON.stringify(partials), account_type: ['live', 'demo', 'backtest'].includes(d.account_type) ? d.account_type : 'live',
    close_price: numOrNull(d.close_price), close_time: closeTime,
  };
  return { values: FIELDS.map((f) => v[f]) };
}

function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.slice(0, 6).toString())) return 'image/gif';
  return null;
}

async function blobPut(name, buf, mime) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null; // no Blob store: keep the image in Postgres
  const { put } = await import('@vercel/blob');
  const r = await put(name, buf, { access: 'public', contentType: mime, addRandomSuffix: true });
  return r.url;
}

async function blobDel(urls) {
  urls = urls.filter(Boolean);
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { del } = await import('@vercel/blob');
    await del(urls);
  } catch (e) {
    console.error('blob delete failed', e);
  }
}

function csvCell(v) {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function inbox(uid, tz) {
  return q(`SELECT n.id, n.title, n.body, (n.user_id IS NULL) AS broadcast,
      to_char((n.created_at AT TIME ZONE 'UTC') AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS created_at,
      (r.user_id IS NOT NULL) AS read
    FROM notifications n
    JOIN users u ON u.id = $1
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
    WHERE n.user_id = $1 OR (n.user_id IS NULL AND n.created_at >= u.created_at - interval '30 days')
    ORDER BY n.created_at DESC LIMIT 200`, [uid, tz]);
}

export default async function handler(req, res) {
  try {
    const auth = await getAuth(req);
    if (!auth) return fail(res, 401, 'Signed out. Reload to sign in.');
    const { session, user } = auth;
    const uid = user.id;
    const qs = query(req);
    const action = qs.get('action') || '';

    if (req.method === 'POST' && !checkCsrf(req, session)) return fail(res, 403, 'Session expired. Reload the page.');
    const post = (fn) => (req.method === 'POST' ? fn() : fail(res, 405, 'POST only'));
    const prefs = await getPrefs(uid);
    const now = localParts(new Date(), prefs.timezone);
    const plans = await getPlans();
    const ent = await entitlements(user, plans);
    const need = (f) => { if (!ent.features[f]) throw planError(f, ent); };
    // trades added this calendar month (journal time zone), for the plan's monthly limit
    const monthCount = async () => (await q(`SELECT count(*)::int AS n FROM trades WHERE user_id = $1 AND created_at >= $2::date`, [uid, now.date.slice(0, 8) + '01']))[0].n;

    switch (action) {
      case 'bootstrap': {
        const trades = await q(`SELECT ${TRADE_COLS} FROM trades WHERE user_id = $1 ORDER BY trade_date, trade_time NULLS LAST, id`, [uid]);
        const shots = await q(`SELECT s.id, s.trade_id, s.kind FROM screenshots s JOIN trades t ON t.id = s.trade_id
          WHERE t.user_id = $1 ORDER BY s.id`, [uid]);
        const by = {};
        shots.forEach((s) => { (by[s.trade_id] = by[s.trade_id] || []).push({ id: s.id, kind: s.kind }); });
        trades.forEach((t) => { t.shots = by[t.id] || []; t.checklist = t.checklist || {}; });
        const notes = await q(`SELECT day::text AS day, text FROM day_notes WHERE user_id = $1 ORDER BY day DESC LIMIT 400`, [uid]);
        return send(res, 200, {
          trades,
          settings: await loadSettings(uid),
          prefs,
          user: publicUser(user, await avatarVersion(uid)),
          site: publicSite(await getSite()),
          inbox: await inbox(uid, prefs.timezone),
          notes,
          today: now.date,
          now: now.hm,
          ts: Math.floor(Date.now() / 1000),
          tz_offset: now.offset,
          csrf: csrfFor(session),
          ent, trades_this_month: await monthCount(),
          admin_pending: user.role === 'admin' ? (await q(`SELECT count(*)::int AS n FROM users WHERE status = 'pending'`))[0].n : 0,
          mt5: {
            key: await getUS(uid, 'mt5_key', ''),
            last_sync: await getUS(uid, 'mt5_last_sync', ''),
            last_account: await getUS(uid, 'mt5_last_account', ''),
            last_count: Number(await getUS(uid, 'mt5_last_count', 0)),
          },
        });
      }

      case 'save_trade': return await post(async () => {
        const d = await readJson(req);
        let id = parseInt(d.id, 10) || 0;
        if (!id && ent.limits.trades_month && (await monthCount()) >= ent.limits.trades_month) {
          return send(res, 402, { error: `Your ${ent.name} plan allows ${ent.limits.trades_month} new trades a month. Upgrade on the Subscription page to add more.`, code: 'upgrade' });
        }
        const c = cleanTrade(d, prefs);
        if (c.error) return fail(res, 422, c.error);
        const n = FIELDS.length;
        const vals = c.values.concat([now.dt]);
        if (id > 0) {
          vals.push(id, uid);
          const set = FIELDS.map((f, i) => `${f}=${ph(i + 1, f)}`).join(', ');
          const u = await q(`UPDATE trades SET ${set}, updated_at=$${n + 1}, reviewed=1 WHERE id=$${n + 2} AND user_id=$${n + 3} RETURNING id`, vals);
          if (!u.length) return fail(res, 404, 'Trade not found.');
        } else {
          vals.push(uid);
          const r = await q(`INSERT INTO trades (${FIELDS.join(', ')}, updated_at, created_at, user_id)
            VALUES (${FIELDS.map((f, i) => ph(i + 1, f)).join(', ')}, $${n + 1}, $${n + 1}, $${n + 2}) RETURNING id`, vals);
          id = r[0].id;
        }
        return send(res, 200, { ok: true, id });
      });

      case 'import_trades': return await post(async () => {
        need('import');
        const d = await readJson(req);
        const rows = Array.isArray(d.rows) ? d.rows.slice(0, 300) : [];
        let inserted = 0, duplicates = 0;
        const errors = [];
        const n = FIELDS.length;
        for (let i = 0; i < rows.length; i++) {
          const c = cleanTrade(rows[i] || {}, prefs);
          if (c.error) { errors.push({ row: (rows[i] && rows[i]._row) || i + 1, error: c.error }); continue; }
          const v = c.values;
          // same date, time, instrument, side, entry, exit and result = the same trade
          const key = crypto.createHash('sha1').update([v[0], v[1], v[3], v[4], v[5], v[36], v[10]].join('|')).digest('hex');
          const r = await q(`INSERT INTO trades (${FIELDS.join(', ')}, updated_at, created_at, user_id, source, import_key)
            VALUES (${FIELDS.map((f, j) => ph(j + 1, f)).join(', ')}, $${n + 1}, $${n + 1}, $${n + 2}, 'import', $${n + 3})
            ON CONFLICT (user_id, import_key) DO NOTHING RETURNING id`, v.concat([now.dt, uid, key]));
          if (r.length) inserted++; else duplicates++;
        }
        return send(res, 200, { ok: true, inserted, duplicates, errors });
      });

      case 'toggle_favorite': return await post(async () => {
        const d = await readJson(req);
        const r = await q('UPDATE trades SET favorite = 1 - favorite WHERE id = $1 AND user_id = $2 RETURNING favorite', [parseInt(d.id, 10) || 0, uid]);
        if (!r.length) return fail(res, 404, 'Trade not found.');
        return send(res, 200, { ok: true, favorite: r[0].favorite });
      });

      case 'delete_trade': return await post(async () => {
        const d = await readJson(req);
        const id = parseInt(d.id, 10) || 0;
        const t = await q('SELECT mt5_account, mt5_position FROM trades WHERE id = $1 AND user_id = $2', [id, uid]);
        if (!t.length) return fail(res, 404, 'Trade not found.');
        if (t[0].mt5_position !== null) {
          await q('INSERT INTO mt5_ignored (user_id, mt5_account, mt5_position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, t[0].mt5_account || '', t[0].mt5_position]);
        }
        const shots = await q('SELECT url FROM screenshots WHERE trade_id = $1', [id]);
        await blobDel(shots.map((s) => s.url));
        await q('DELETE FROM trades WHERE id = $1 AND user_id = $2', [id, uid]); // screenshots cascade
        return send(res, 200, { ok: true });
      });

      case 'upload': return await post(async () => {
        need('screenshots');
        const tradeId = parseInt(qs.get('trade_id'), 10) || 0;
        const kind = qs.get('kind') === 'after' ? 'after' : 'before';
        const t = await q('SELECT id FROM trades WHERE id = $1 AND user_id = $2', [tradeId, uid]);
        if (!t.length) return fail(res, 422, 'Save the trade first.');
        const buf = await readBody(req, MAX_IMG);
        const mime = sniffImage(buf);
        if (!mime) return fail(res, 422, 'Only JPG, PNG, WEBP or GIF images.');
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
        const url = await blobPut(`journal/${uid}/${tradeId}-${kind}-${crypto.randomBytes(8).toString('hex')}.${ext}`, buf, mime);
        const r = await q('INSERT INTO screenshots (trade_id, kind, mime, url, data) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [tradeId, kind, mime, url, url ? null : buf]);
        return send(res, 200, { ok: true, id: r[0].id, kind });
      });

      case 'delete_shot': return await post(async () => {
        const d = await readJson(req);
        const r = await q(`DELETE FROM screenshots s USING trades t
          WHERE s.id = $1 AND t.id = s.trade_id AND t.user_id = $2 RETURNING s.url`, [parseInt(d.id, 10) || 0, uid]);
        if (r.length) await blobDel([r[0].url]);
        return send(res, 200, { ok: true });
      });

      case 'save_settings': return await post(async () => {
        const d = await readJson(req);
        const n = (v) => v !== undefined && v !== '' && Number.isFinite(Number(v));
        if (n(d.start_balance)) await setUS(uid, 'start_balance', Math.max(0, Number(d.start_balance)));
        if (n(d.risk_pct)) await setUS(uid, 'risk_pct', Math.min(100, Math.max(0.1, Number(d.risk_pct))));
        if (n(d.goal)) await setUS(uid, 'goal', Math.max(0, Number(d.goal)));
        if (d.new_password) {
          if (user.password_hash && !verifyPassword(d.current_password || '', user.password_hash)) return fail(res, 422, 'Current password is wrong.');
          if (String(d.new_password).length < 8) return fail(res, 422, 'New password needs at least 8 characters.');
          const r = await q('UPDATE users SET password_hash = $2, pw_version = pw_version + 1 WHERE id = $1 RETURNING *', [uid, hashPassword(String(d.new_password))]);
          setSession(req, res, r[0]); // keep this device signed in; others are signed out
        }
        return send(res, 200, { ok: true, settings: await loadSettings(uid) });
      });

      case 'save_prefs': return await post(async () => {
        const d = await readJson(req);
        const merged = { ...prefs, ...(d.prefs && typeof d.prefs === 'object' ? d.prefs : {}) };
        return send(res, 200, { ok: true, prefs: await savePrefs(uid, merged) });
      });

      case 'save_profile': return await post(async () => {
        const d = await readJson(req);
        const name = cleanName(d.name), phone = normPhone(d.phone);
        if (!name) return fail(res, 422, 'Enter your name.');
        if (!phone) return fail(res, 422, 'Enter your phone number with country code, e.g. +251911234567.');
        const p = d.profile && typeof d.profile === 'object' ? d.profile : {};
        const keys = { country: 60, city: 60, bio: 600, experience: 30, trading_since: 4, broker: 60, platform: 30, website: 200, telegram: 60, x: 60, birthday: 10 };
        const profile = {};
        Object.keys(keys).forEach((k) => { const v = clip(p[k], keys[k]).replace(/[<>"]/g, ''); if (v) profile[k] = v; });
        if (profile.website && !/^https?:\/\//i.test(profile.website)) profile.website = 'https://' + profile.website;
        if (profile.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthday)) delete profile.birthday;
        const r = await q('UPDATE users SET name = $2, phone = $3, profile = $4::jsonb WHERE id = $1 RETURNING *', [uid, name, phone, JSON.stringify(profile)]);
        return send(res, 200, { ok: true, user: publicUser(r[0], await avatarVersion(uid)) });
      });

      case 'upload_avatar': return await post(async () => {
        const buf = await readBody(req, 1.5 * 1024 * 1024);
        const mime = sniffImage(buf);
        if (!mime || mime === 'image/gif') return fail(res, 422, 'Use a JPG, PNG or WEBP photo.');
        await q(`INSERT INTO avatars (user_id, mime, data, updated_at) VALUES ($1,$2,$3,now())
          ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`, [uid, mime, buf]);
        return send(res, 200, { ok: true, avatar: '/api/media?type=avatar&v=' + (await avatarVersion(uid)) });
      });

      case 'delete_avatar': return await post(async () => {
        await q('DELETE FROM avatars WHERE user_id = $1', [uid]);
        return send(res, 200, { ok: true });
      });

      case 'inbox':
        return send(res, 200, { inbox: await inbox(uid, prefs.timezone) });

      case 'mark_read': return await post(async () => {
        const d = await readJson(req);
        if (d.all) {
          await q(`INSERT INTO notification_reads (notification_id, user_id)
            SELECT n.id, $1 FROM notifications n JOIN users u ON u.id = $1
            WHERE n.user_id = $1 OR (n.user_id IS NULL AND n.created_at >= u.created_at - interval '30 days')
            ON CONFLICT DO NOTHING`, [uid]);
        } else {
          const ids = (Array.isArray(d.ids) ? d.ids : []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 200);
          if (ids.length) {
            await q(`INSERT INTO notification_reads (notification_id, user_id)
              SELECT id, $1 FROM notifications WHERE id = ANY($2) AND (user_id = $1 OR user_id IS NULL)
              ON CONFLICT DO NOTHING`, [uid, ids]);
          }
        }
        return send(res, 200, { ok: true, inbox: await inbox(uid, prefs.timezone) });
      });

      case 'save_note': return await post(async () => {
        const d = await readJson(req);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day || '')) return fail(res, 422, 'Bad date.');
        const text = clip(d.text, 10000);
        if (text) await q(`INSERT INTO day_notes (user_id, day, text) VALUES ($1,$2,$3) ON CONFLICT (user_id, day) DO UPDATE SET text = EXCLUDED.text`, [uid, d.day, text]);
        else await q('DELETE FROM day_notes WHERE user_id = $1 AND day = $2', [uid, d.day]);
        return send(res, 200, { ok: true });
      });

      case 'delete_account': return await post(async () => {
        const d = await readJson(req);
        if (d.confirm !== 'DELETE') return fail(res, 422, 'Type DELETE to confirm.');
        if (user.password_hash && !verifyPassword(d.password || '', user.password_hash)) return fail(res, 422, 'Password is wrong.');
        if (user.role === 'admin') {
          const others = await q(`SELECT 1 FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1 LIMIT 1`, [uid]);
          if (!others.length) return fail(res, 409, 'You are the only admin. Make another user admin first.');
        }
        const shots = await q('SELECT s.url FROM screenshots s JOIN trades t ON t.id = s.trade_id WHERE t.user_id = $1', [uid]);
        await blobDel(shots.map((x) => x.url));
        await q('DELETE FROM users WHERE id = $1', [uid]); // trades, screenshots, settings, avatar cascade
        clearSession(req, res);
        return send(res, 200, { ok: true });
      });

      case 'mt5_key': return await post(async () => {
        need('mt5');
        const key = crypto.randomBytes(20).toString('hex');
        await setUS(uid, 'mt5_key', key);
        return send(res, 200, { ok: true, key });
      });

      case 'export': {
        const from = /^\d{4}-\d{2}-\d{2}$/.test(qs.get('from') || '') ? qs.get('from') : '0001-01-01';
        const to = /^\d{4}-\d{2}-\d{2}$/.test(qs.get('to') || '') ? qs.get('to') : '9999-12-31';
        const rows = await q(`SELECT ${TRADE_COLS} FROM trades WHERE user_id = $1 AND trade_date BETWEEN $2 AND $3
          ORDER BY trade_date, trade_time NULLS LAST, id`, [uid, from, to]);
        const head = ['date', 'time', 'close_time', 'account_type', 'instrument_type', 'pair', 'direction', 'lot', 'leverage', 'entry', 'sl', 'tp',
          'close_price', 'risk', 'gross_pnl', 'commission', 'swap', 'pnl', 'r_multiple', 'result', 'session', 'strategy', 'market_condition',
          'mistakes', 'tags', 'emotion_before', 'emotion_during', 'emotion_after', 'confidence', 'followed_plan', 'emotional',
          'checklist_ok', 'notes', 'exit_reason', 'went_right', 'went_wrong', 'lessons', 'source', 'mt5_position'];
        const lines = [head.join(',')];
        rows.forEach((r) => {
          const c = r.checklist || {};
          const ok = Object.values(c).filter(Boolean).length + '/' + Object.keys(c).length;
          lines.push([r.trade_date, r.trade_time, r.close_time, r.account_type, r.instrument_type, r.pair, r.direction, r.lot, r.leverage, r.entry, r.sl, r.tp,
            r.close_price, r.risk_amount, r.gross_pnl, r.commission, r.swap, r.pnl, r.r_multiple, r.result, r.session, r.strategy, r.market_condition,
            (r.mistakes || []).join('; '), (r.tags || []).join('; '), r.mood, r.emotion_during, r.emotion_after, r.confidence, r.followed_plan, r.emotional,
            ok, r.notes, r.exit_reason, r.went_right, r.went_wrong, r.lessons, r.source, r.mt5_position].map(csvCell).join(','));
        });
        res.setHeader('Content-Disposition', `attachment; filename="trading-journal-${now.date}.csv"`);
        return send(res, 200, '﻿' + lines.join('\r\n'), 'text/csv; charset=utf-8');
      }

      // ---------- subscription ----------
      case 'billing': {
        const pays = await q(`SELECT id, plan, period, method, amount::float8 AS amount, currency, reference, status, admin_note,
            to_char((created_at AT TIME ZONE $2), 'YYYY-MM-DD HH24:MI') AS created_at, (proof IS NOT NULL) AS has_proof
          FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [uid, prefs.timezone]);
        return send(res, 200, { plans, features: FEATURES, payment: await getPaymentConfig(), ent, trial: await trialConfig(), payments: pays });
      }

      case 'submit_payment': return await post(async () => {
        const d = await readJson(req);
        const plan = ['starter', 'pro', 'ultimate'].includes(d.plan) ? d.plan : null;
        const period = d.period === 'year' ? 'year' : 'month';
        const method = d.method === 'crypto' ? 'crypto' : d.method === 'telebirr' ? 'telebirr' : null;
        if (!plan || !method) return fail(res, 422, 'Choose a plan and a payment method.');
        const cfg = await getPaymentConfig();
        if (!cfg[method].enabled) return fail(res, 422, 'This payment method is not available right now.');
        const ref = clip(d.reference, 120).replace(/[<>]/g, '');
        if (ref.length < 4) return fail(res, 422, method === 'crypto' ? 'Enter the transaction hash (TxID).' : 'Enter the telebirr transaction number.');
        const dup = await q(`SELECT 1 FROM payments WHERE lower(reference) = lower($1) AND status <> 'rejected' LIMIT 1`, [ref]);
        if (dup.length) return fail(res, 409, 'This transaction was already submitted.');
        const open = await q(`SELECT count(*)::int AS n FROM payments WHERE user_id = $1 AND status = 'pending'`, [uid]);
        if (open[0].n >= 3) return fail(res, 429, 'You have 3 payments waiting for review. Wait until they are checked.');
        const p = plans[plan];
        const amount = method === 'telebirr' && (period === 'year' ? p.price_year_etb : p.price_month_etb)
          ? (period === 'year' ? p.price_year_etb : p.price_month_etb) : (period === 'year' ? p.price_year : p.price_month);
        const currency = method === 'telebirr' && (period === 'year' ? p.price_year_etb : p.price_month_etb) ? 'ETB' : 'USD';
        const coin = method === 'crypto' ? clip(d.coin, 30).replace(/[<>]/g, '') : '';
        const r = await q(`INSERT INTO payments (user_id, plan, period, method, amount, currency, reference, payer, note)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [uid, plan, period, method, amount, currency, ref, clip(d.payer, 80).replace(/[<>]/g, ''), [coin, clip(d.note, 500).replace(/[<>]/g, '')].filter(Boolean).join(' · ')]);
        const admins = await q(`SELECT email FROM users WHERE role = 'admin' AND status = 'active'`);
        const list = new Set(admins.map((a) => a.email)); if (process.env.ADMIN_EMAIL) list.add(String(process.env.ADMIN_EMAIL).toLowerCase());
        for (const e of list) {
          await mails.subscription({ email: e, name: 'admin' }, `Payment to review: ${user.name}`,
            `<p><b>${user.name}</b> (${user.email}) paid for <b>${p.name}</b> (${period === 'year' ? 'yearly' : 'monthly'}) with ${method}.</p><p>Amount: ${amount} ${currency}<br>Reference: ${ref}</p>`, appUrl(req) + '/#admin');
        }
        return send(res, 200, { ok: true, id: r[0].id });
      });

      case 'upload_proof': return await post(async () => {
        const id = parseInt(qs.get('id'), 10) || 0;
        const pr = await q(`SELECT id FROM payments WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [id, uid]);
        if (!pr.length) return fail(res, 404, 'Payment not found.');
        const buf = await readBody(req, MAX_IMG);
        const mime = sniffImage(buf);
        if (!mime) return fail(res, 422, 'Upload the screenshot as JPG, PNG or WEBP.');
        await q('UPDATE payments SET proof = $2, proof_mime = $3 WHERE id = $1', [id, buf, mime]);
        return send(res, 200, { ok: true });
      });

      default:
        return fail(res, 400, 'Unknown action');
    }
  } catch (e) {
    if (e.code === 'upgrade') return send(res, 402, { error: e.message, code: 'upgrade' });
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error. Check the Vercel function logs.');
  }
}
