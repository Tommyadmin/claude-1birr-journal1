// /api/app?action=...  The journal's data API (sign-in required).
import crypto from 'node:crypto';
import { q, getSetting, setSetting } from '../lib/db.js';
import { getSession, checkCsrf, csrfFor, verifyPassword, hashPassword, setSession } from '../lib/auth.js';
import { send, fail, query, readBody, readJson, localParts, numOrNull, clip, CHECK_KEYS } from '../lib/util.js';

const MAX_IMG = 4 * 1024 * 1024; // Vercel functions accept bodies up to about 4.5 MB

async function loadSettings() {
  return {
    start_balance: Number(await getSetting('start_balance', 0)),
    risk_pct: Number(await getSetting('risk_pct', 10)),
    goal: Number(await getSetting('goal', 1000)),
    run_start: await getSetting('run_start', localParts().date),
    run_size: Number(await getSetting('run_size', 20)),
  };
}

const TRADE_COLS = `id, trade_date::text AS trade_date, COALESCE(to_char(trade_time,'HH24:MI'),'') AS trade_time, session, pair, direction,
  entry::float8 AS entry, sl::float8 AS sl, tp::float8 AS tp, lot::float8 AS lot, risk_amount::float8 AS risk_amount,
  pnl::float8 AS pnl, r_multiple::float8 AS r_multiple, result, checklist, emotional, followed_plan, mood, notes, lessons,
  source, reviewed, mt5_account, mt5_position::text AS mt5_position, close_price::float8 AS close_price,
  to_char(close_time,'YYYY-MM-DD HH24:MI:SS') AS close_time`;

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
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(req, res) {
  try {
    const session = await getSession(req);
    if (!session) return fail(res, 401, 'Signed out. Reload to sign in.');
    const qs = query(req);
    const action = qs.get('action') || '';
    const now = localParts();

    if (req.method === 'POST' && !checkCsrf(req, session)) return fail(res, 403, 'Session expired. Reload the page.');
    const post = (fn) => (req.method === 'POST' ? fn() : fail(res, 405, 'POST only'));

    switch (action) {
      case 'bootstrap': {
        const trades = await q(`SELECT ${TRADE_COLS} FROM trades ORDER BY trade_date, trade_time NULLS LAST, id`);
        const shots = await q('SELECT id, trade_id, kind FROM screenshots ORDER BY id');
        const by = {};
        shots.forEach((s) => { (by[s.trade_id] = by[s.trade_id] || []).push({ id: s.id, kind: s.kind }); });
        trades.forEach((t) => { t.shots = by[t.id] || []; t.checklist = t.checklist || {}; });
        return send(res, 200, {
          trades,
          settings: await loadSettings(),
          today: now.date,
          now: now.hm,
          ts: Math.floor(Date.now() / 1000),
          tz_offset: now.offset,
          csrf: csrfFor(session),
          mt5: {
            key: await getSetting('mt5_key', ''),
            last_sync: await getSetting('mt5_last_sync', ''),
            last_account: await getSetting('mt5_last_account', ''),
            last_count: Number(await getSetting('mt5_last_count', 0)),
          },
        });
      }

      case 'save_trade': return post(async () => {
        const d = await readJson(req);
        let id = parseInt(d.id, 10) || 0;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trade_date || '')) return fail(res, 422, 'Enter a valid date.');
        const time = /^\d{2}:\d{2}$/.test(d.trade_time || '') ? d.trade_time + ':00' : null;
        const session_ = ['london', 'ny', 'other'].includes(d.session) ? d.session : 'other';
        const pair = String(d.pair || '').replace(/[^A-Za-z0-9/.]/g, '').toUpperCase().slice(0, 20);
        if (!pair) return fail(res, 422, 'Enter the pair, e.g. XAUUSD.');
        const direction = d.direction === 'sell' ? 'sell' : 'buy';
        const result = ['W', 'L', 'B'].includes(d.result) ? d.result : 'W';
        const pnl = numOrNull(d.pnl);
        if (pnl === null) return fail(res, 422, 'Enter the profit or loss in $ (negative for a loss).');
        const check = {};
        const inC = d.checklist && typeof d.checklist === 'object' ? d.checklist : {};
        CHECK_KEYS.forEach((k) => { check[k] = !!inC[k]; });

        const vals = [d.trade_date, time, session_, pair, direction,
          numOrNull(d.entry), numOrNull(d.sl), numOrNull(d.tp), numOrNull(d.lot), numOrNull(d.risk_amount),
          Math.round(pnl * 100) / 100, numOrNull(d.r_multiple), result, JSON.stringify(check),
          d.emotional ? 1 : 0, d.followed_plan ? 1 : 0, clip(d.mood, 30), clip(d.notes, 5000), clip(d.lessons, 5000), now.dt];

        if (id > 0) {
          vals.push(id);
          await q(`UPDATE trades SET trade_date=$1, trade_time=$2, session=$3, pair=$4, direction=$5, entry=$6, sl=$7, tp=$8, lot=$9,
            risk_amount=$10, pnl=$11, r_multiple=$12, result=$13, checklist=$14::jsonb, emotional=$15, followed_plan=$16, mood=$17,
            notes=$18, lessons=$19, updated_at=$20, reviewed=1 WHERE id=$21`, vals);
        } else {
          const r = await q(`INSERT INTO trades (trade_date, trade_time, session, pair, direction, entry, sl, tp, lot, risk_amount, pnl,
            r_multiple, result, checklist, emotional, followed_plan, mood, notes, lessons, updated_at, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$20) RETURNING id`, vals);
          id = r[0].id;
        }
        return send(res, 200, { ok: true, id });
      });

      case 'delete_trade': return post(async () => {
        const d = await readJson(req);
        const id = parseInt(d.id, 10) || 0;
        const t = await q('SELECT mt5_account, mt5_position FROM trades WHERE id = $1', [id]);
        if (t.length && t[0].mt5_position !== null) {
          await q('INSERT INTO mt5_ignored (mt5_account, mt5_position) VALUES ($1,$2) ON CONFLICT DO NOTHING', [t[0].mt5_account || '', t[0].mt5_position]);
        }
        const shots = await q('SELECT url FROM screenshots WHERE trade_id = $1', [id]);
        await blobDel(shots.map((s) => s.url));
        await q('DELETE FROM trades WHERE id = $1', [id]); // screenshots cascade
        return send(res, 200, { ok: true });
      });

      case 'upload': return post(async () => {
        const tradeId = parseInt(qs.get('trade_id'), 10) || 0;
        const kind = qs.get('kind') === 'after' ? 'after' : 'before';
        const t = await q('SELECT id FROM trades WHERE id = $1', [tradeId]);
        if (!t.length) return fail(res, 422, 'Save the trade first.');
        const buf = await readBody(req, MAX_IMG);
        const mime = sniffImage(buf);
        if (!mime) return fail(res, 422, 'Only JPG, PNG, WEBP or GIF images.');
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
        const url = await blobPut(`journal/${tradeId}-${kind}-${crypto.randomBytes(8).toString('hex')}.${ext}`, buf, mime);
        const r = await q('INSERT INTO screenshots (trade_id, kind, mime, url, data) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [tradeId, kind, mime, url, url ? null : buf]);
        return send(res, 200, { ok: true, id: r[0].id, kind });
      });

      case 'delete_shot': return post(async () => {
        const d = await readJson(req);
        const id = parseInt(d.id, 10) || 0;
        const r = await q('DELETE FROM screenshots WHERE id = $1 RETURNING url', [id]);
        if (r.length) await blobDel([r[0].url]);
        return send(res, 200, { ok: true });
      });

      case 'save_settings': return post(async () => {
        const d = await readJson(req);
        const n = (v) => v !== undefined && v !== '' && Number.isFinite(Number(v));
        if (n(d.start_balance)) await setSetting('start_balance', Math.max(0, Number(d.start_balance)));
        if (n(d.risk_pct)) await setSetting('risk_pct', Math.min(100, Math.max(0.1, Number(d.risk_pct))));
        if (n(d.goal)) await setSetting('goal', Math.max(0, Number(d.goal)));
        if (n(d.run_size)) await setSetting('run_size', Math.min(500, Math.max(1, parseInt(d.run_size, 10))));
        if (/^\d{4}-\d{2}-\d{2}$/.test(d.run_start || '')) await setSetting('run_start', d.run_start);
        if (d.new_password) {
          if (!verifyPassword(d.current_password || '', await getSetting('password_hash'))) return fail(res, 422, 'Current password is wrong.');
          if (String(d.new_password).length < 8) return fail(res, 422, 'New password needs at least 8 characters.');
          const hash = hashPassword(String(d.new_password));
          await setSetting('password_hash', hash);
          setSession(req, res, hash); // keep this device signed in; others are signed out
        }
        return send(res, 200, { ok: true, settings: await loadSettings() });
      });

      case 'mt5_key': return post(async () => {
        const key = crypto.randomBytes(20).toString('hex');
        await setSetting('mt5_key', key);
        return send(res, 200, { ok: true, key });
      });

      case 'export': {
        const rows = await q(`SELECT ${TRADE_COLS} FROM trades ORDER BY trade_date, trade_time NULLS LAST, id`);
        const head = ['date', 'time', 'session', 'pair', 'direction', 'entry', 'sl', 'tp', 'lot', 'risk_$', 'pnl_$', 'R', 'result',
          'followed_plan', 'emotional', 'mood', 'checklist_ok', 'source', 'mt5_position', 'notes', 'lessons'];
        const lines = [head.join(',')];
        rows.forEach((r) => {
          const c = r.checklist || {};
          const ok = Object.values(c).filter(Boolean).length + '/' + Object.keys(c).length;
          lines.push([r.trade_date, r.trade_time, r.session, r.pair, r.direction, r.entry, r.sl, r.tp, r.lot, r.risk_amount, r.pnl,
            r.r_multiple, r.result, r.followed_plan, r.emotional, r.mood, ok, r.source, r.mt5_position, r.notes, r.lessons].map(csvCell).join(','));
        });
        res.setHeader('Content-Disposition', `attachment; filename="trading-journal-${now.date}.csv"`);
        return send(res, 200, '﻿' + lines.join('\r\n'), 'text/csv; charset=utf-8');
      }

      default:
        return fail(res, 400, 'Unknown action');
    }
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error. Check the Vercel function logs.');
  }
}
