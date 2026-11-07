// /api/sync  Receives closed positions from the MT5 Expert Advisor.
// Auth: header "X-Api-Key: <key from Settings > MT5 sync>".
import { q, getSetting, setSetting } from '../lib/db.js';
import { safeEqual } from '../lib/auth.js';
import { send, fail, readJson, localParts, sessionOf, CHECK_KEYS } from '../lib/util.js';

const num = (v) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? Number(v) : null);

function cleanSymbol(s) {
  s = String(s || '').replace(/[^A-Za-z0-9].*$/, ''); // EURUSD.r, XAUUSD-ECN
  const base = s.replace(/[a-z]+$/, '');              // XAUUSDm, EURUSDz
  if (base.length >= 6) s = base;
  return s.toUpperCase().slice(0, 20);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return fail(res, 405, 'POST only');
    if (!(await getSetting('password_hash'))) return fail(res, 503, 'Journal is not set up yet.');

    const key = await getSetting('mt5_key', '');
    const sent = String(req.headers['x-api-key'] || '').trim();
    if (!key) return fail(res, 403, 'No sync key yet. Create one in the journal: Settings > MT5 sync.');
    if (!sent || !safeEqual(key, sent)) {
      await new Promise((r) => setTimeout(r, 300));
      return fail(res, 403, 'Wrong sync key. Copy it again from Settings > MT5 sync.');
    }

    const d = await readJson(req);
    const account = String(d.account || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 32);
    if (!account) return fail(res, 422, 'Missing account number');
    const positions = Array.isArray(d.positions) ? d.positions : [];
    if (positions.length > 500) return fail(res, 413, 'Send at most 500 positions per request');

    const emptyChecklist = JSON.stringify(Object.fromEntries(CHECK_KEYS.map((k) => [k, false])));
    const now = localParts();
    let ins = 0, upd = 0, skip = 0;

    for (const p of positions) {
      if (!p || typeof p !== 'object') { skip++; continue; }
      const pos = String(p.position || '').replace(/\D/g, '');
      const openTs = parseInt(p.open_time, 10) || 0;
      const closeTs = parseInt(p.close_time, 10) || 0;
      if (!pos || openTs <= 0 || closeTs <= 0) { skip++; continue; }

      const ignored = await q('SELECT 1 FROM mt5_ignored WHERE mt5_account=$1 AND mt5_position=$2', [account, pos]);
      if (ignored.length) { skip++; continue; }

      const symbol = cleanSymbol(p.symbol);
      if (!symbol) { skip++; continue; }
      const dir = p.type === 'sell' ? 'sell' : 'buy';
      const vol = num(p.volume), open = num(p.open_price), close = num(p.close_price);
      const sl = num(p.sl), tp = num(p.tp), risk = num(p.risk);
      const pnl = Number.isFinite(Number(p.profit)) ? Math.round(Number(p.profit) * 100) / 100 : 0;

      // times arrive as UTC seconds; store in the journal's time zone
      const o = localParts(new Date(openTs * 1000));
      const c = localParts(new Date(closeTs * 1000));

      let result;
      if (risk && Math.abs(pnl) < 0.1 * risk) result = 'B';
      else if (pnl > 0) result = 'W';
      else if (pnl < 0) result = 'L';
      else result = 'B';

      const row = await q('SELECT id, reviewed FROM trades WHERE mt5_account=$1 AND mt5_position=$2', [account, pos]);
      if (!row.length) {
        await q(`INSERT INTO trades (trade_date, trade_time, session, pair, direction, entry, sl, tp, lot, risk_amount, pnl, result,
            checklist, source, reviewed, mt5_account, mt5_position, close_price, close_time, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,'mt5',0,$14,$15,$16,$17,$18,$18)`,
          [o.date, o.time, sessionOf(o.hm), symbol, dir, open, sl, tp, vol, risk, pnl, result, emptyChecklist, account, pos, close, c.dt, now.dt]);
        ins++;
      } else if (!row[0].reviewed) {
        await q(`UPDATE trades SET trade_date=$1, trade_time=$2, session=$3, pair=$4, direction=$5, entry=$6, sl=$7, tp=$8, lot=$9,
            risk_amount=$10, pnl=$11, result=$12, close_price=$13, close_time=$14, updated_at=$15 WHERE id=$16`,
          [o.date, o.time, sessionOf(o.hm), symbol, dir, open, sl, tp, vol, risk, pnl, result, close, c.dt, now.dt, row[0].id]);
        upd++;
      } else {
        // reviewed: keep your edits, only refresh the broker's final money figures
        await q('UPDATE trades SET pnl=$1, close_price=$2, close_time=$3 WHERE id=$4', [pnl, close, c.dt, row[0].id]);
        upd++;
      }
    }

    const server = String(d.server || '').replace(/[^\w.\- ]/g, '').slice(0, 60);
    await setSetting('mt5_last_sync', now.dt);
    await setSetting('mt5_last_account', account + (server ? ' · ' + server : ''));
    await setSetting('mt5_last_count', ins);
    return send(res, 200, { ok: true, inserted: ins, updated: upd, skipped: skip });
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error. Check the Vercel function logs.');
  }
}
