// Per-user customization: checklist, trading windows, rules, lists, goals, time zone.
import { getUS, setUS } from './db.js';

export const DEFAULT_PREFS = {
  timezone: process.env.APP_TIMEZONE || 'Africa/Addis_Ababa',
  currency: 'USD',
  checklist: [
    { id: 'time', group: 'Before the session', text: 'Inside my trading window' },
    { id: 'news', group: 'Before the session', text: 'Checked the news calendar. No high-impact news during the trade' },
    { id: 'levels', group: 'Before the session', text: 'Marked the session highs and lows' },
    { id: 'calm', group: 'Before the session', text: 'Calm. No frustration from earlier trades' },
    { id: 'h4', group: 'Setup', text: 'Higher timeframe (H4) direction is clear' },
    { id: 'm15', group: 'Setup', text: '15M agrees with H4' },
    { id: 'sweep', group: 'Setup', text: 'Liquidity taken (high or low swept)' },
    { id: 'choch', group: 'Setup', text: 'Change of character (CHOCH) confirmed' },
    { id: 'ltf', group: 'Entry and risk', text: 'Entry on 5M or 1M' },
    { id: 'risk', group: 'Entry and risk', text: 'Risk matches my risk per trade' },
    { id: 'sl', group: 'Entry and risk', text: 'Stop loss placed' },
    { id: 'tp', group: 'Entry and risk', text: 'Take profit at my target RR' },
  ],
  windows: [
    { id: 'asia', name: 'Asia', start: '03:00', end: '06:00', active: false },
    { id: 'london', name: 'London', start: '11:00', end: '12:00', active: true },
    { id: 'ny', name: 'New York', start: '15:30', end: '17:30', active: true },
  ],
  rules: {
    max_losses_day: 2,      // 0 = off
    max_wins_window: 1,     // stop after this many wins in one window, 0 = off
    max_trades_day: 0,      // 0 = off
    daily_loss_pct: 0,      // stop when the day is down this % of balance, 0 = off
    target_rr: 3,
  },
  goals: { daily: 0, weekly: 0, monthly: 0 },      // profit targets in money, 0 = off
  emotions: ['Calm', 'Confident', 'Focused', 'Anxious', 'Fearful', 'Greedy', 'FOMO', 'Revenge', 'Impatient', 'Bored', 'Tired', 'Frustrated'],
  mistakes: ['Entered too early', 'Entered too late', 'Moved stop loss', 'Closed winner too early', 'Let loser run',
    'No confirmation', 'Broke trading rules', 'Boredom trade', 'Overtrading', 'Position too large'],
  strategies: ['Liquidity sweep + CHOCH', 'Breakout', 'Pullback', 'Reversal'],
  instruments: ['Forex', 'Metals', 'Indices', 'Crypto', 'Stocks', 'Commodities'],
  market_conditions: ['Trending', 'Ranging', 'Volatile', 'Quiet', 'News-driven'],
  contract_sizes: { Forex: 100000, Metals: 100, Indices: 1, Crypto: 1, Stocks: 1, Commodities: 1000 },
  mindset: 'NO REVENGE TRADE. NO EMOTIONAL TRADE.',
  plan: '',
  watchlist: [],
};

const str = (v, max) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);
const hm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const list = (a, d, maxItems = 40, maxLen = 60) => {
  if (!Array.isArray(a)) return d;
  const out = [];
  a.forEach((x) => { const s = str(x, maxLen); if (s && !out.includes(s)) out.push(s); });
  return out.slice(0, maxItems);
};
const slug = (s, i) => (str(s, 24).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'item' + i);

function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export function sanitizePrefs(p) {
  const d = DEFAULT_PREFS;
  p = p && typeof p === 'object' ? p : {};
  const out = {};
  out.timezone = typeof p.timezone === 'string' && validTz(p.timezone) ? p.timezone : d.timezone;
  out.currency = /^[A-Z]{3}$/.test(p.currency || '') ? p.currency : d.currency;

  if (Array.isArray(p.checklist)) {
    const seen = new Set();
    out.checklist = p.checklist.slice(0, 40).map((c, i) => {
      let id = slug(c && c.id, i);
      while (seen.has(id)) id += 'x';
      seen.add(id);
      return { id, group: str(c && c.group, 40) || 'Checklist', text: str(c && c.text, 160) };
    }).filter((c) => c.text);
  } else out.checklist = d.checklist;

  if (Array.isArray(p.windows)) {
    const seen = new Set();
    out.windows = p.windows.slice(0, 8).map((w, i) => {
      let id = slug(w && (w.id || w.name), i);
      while (seen.has(id)) id += 'x';
      seen.add(id);
      return { id, name: str(w && w.name, 30) || 'Window ' + (i + 1), start: hm(w && w.start, '00:00'), end: hm(w && w.end, '00:00'), active: !!(w && w.active) };
    });
  } else out.windows = d.windows;

  const r = p.rules || {};
  out.rules = {
    max_losses_day: num(r.max_losses_day, d.rules.max_losses_day, 0, 50),
    max_wins_window: num(r.max_wins_window, d.rules.max_wins_window, 0, 50),
    max_trades_day: num(r.max_trades_day, d.rules.max_trades_day, 0, 100),
    daily_loss_pct: num(r.daily_loss_pct, d.rules.daily_loss_pct, 0, 100),
    target_rr: num(r.target_rr, d.rules.target_rr, 0.1, 50),
  };
  const g = p.goals || {};
  out.goals = { daily: num(g.daily, 0, 0, 1e9), weekly: num(g.weekly, 0, 0, 1e9), monthly: num(g.monthly, 0, 0, 1e9) };

  out.emotions = list(p.emotions, d.emotions);
  out.mistakes = list(p.mistakes, d.mistakes);
  out.strategies = list(p.strategies, d.strategies);
  out.instruments = list(p.instruments, d.instruments, 20, 30);
  out.market_conditions = list(p.market_conditions, d.market_conditions, 20, 40);
  out.contract_sizes = {};
  out.instruments.forEach((k) => {
    const v = p.contract_sizes && p.contract_sizes[k];
    out.contract_sizes[k] = num(v, d.contract_sizes[k] || 1, 0, 1e9);
  });
  out.mindset = str(p.mindset, 300);
  out.plan = String(p.plan == null ? '' : p.plan).slice(0, 10000);
  out.watchlist = Array.isArray(p.watchlist)
    ? p.watchlist.slice(0, 60).map((w) => ({ symbol: str(w && w.symbol, 20).toUpperCase(), note: str(w && w.note, 200) })).filter((w) => w.symbol)
    : [];
  return out;
}

export async function getPrefs(uid) {
  const raw = await getUS(uid, 'prefs');
  let p = null;
  try { p = raw ? JSON.parse(raw) : null; } catch { p = null; }
  if (!p) return JSON.parse(JSON.stringify(DEFAULT_PREFS));
  return sanitizePrefs({ ...DEFAULT_PREFS, ...p });
}

export async function savePrefs(uid, p) {
  const clean = sanitizePrefs(p);
  await setUS(uid, 'prefs', JSON.stringify(clean));
  return clean;
}

// Which of the user's trading windows a local "HH:MM" time falls in ('other' if none).
export function windowOf(prefs, hhmm) {
  if (!hhmm) return 'other';
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m;
  for (const w of prefs.windows) {
    const [sh, sm] = w.start.split(':').map(Number), [eh, em] = w.end.split(':').map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    if (s <= e ? t >= s && t < e : t >= s || t < e) return w.id;
  }
  return 'other';
}

export function guessInstrument(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (/^(XAU|XAG|XPT|XPD|GOLD|SILVER)/.test(s)) return 'Metals';
  if (/(BTC|ETH|XRP|SOL|LTC|DOGE|ADA|BNB)/.test(s)) return 'Crypto';
  if (/(US30|US100|US500|NAS|SPX|DJ|GER|DE40|DAX|UK100|FTSE|JP225|NIK|HK50|AUS200|FRA40|STOXX|USTEC)/.test(s)) return 'Indices';
  if (/(OIL|WTI|BRENT|USOIL|UKOIL|NGAS|XNG)/.test(s)) return 'Commodities';
  if (/^[A-Z]{6}$/.test(s)) return 'Forex';
  return 'Other';
}
