// Subscription plans, trial and entitlements. Plans and payment details are edited by admins.
import { q, getSetting, setSetting } from './db.js';

// Toggleable features. Journal, Today/checklist, calendar, dashboard and CSV export are in every plan.
export const FEATURES = {
  analytics: 'Full analytics (strategies, psychology, mistakes, sessions, risk, rules)',
  reports: 'Reports and PDF export',
  import: 'CSV and Excel import',
  screenshots: 'Chart screenshots on trades',
  mt5: 'MT5 automatic sync',
  plan_notes: 'Trading plan, watchlist and daily notes',
  priority_support: 'Priority support',
};

export const PLAN_IDS = ['free', 'starter', 'pro', 'ultimate'];

export const DEFAULT_PLANS = {
  free: { name: 'Free', description: 'Keep journaling after your trial', price_month: 0, price_year: 0, price_month_etb: 0, price_year_etb: 0,
    features: {}, limits: { trades_month: 30, mt5_accounts: 0 } },
  starter: { name: 'Starter', description: 'Journal, calendar and dashboard for disciplined traders', price_month: 5, price_year: 50, price_month_etb: 0, price_year_etb: 0,
    features: {}, limits: { trades_month: 100, mt5_accounts: 0 } },
  pro: { name: 'Pro', description: 'Full analytics, reports, imports and MT5 sync', price_month: 15, price_year: 150, price_month_etb: 0, price_year_etb: 0, highlight: true,
    features: { analytics: true, reports: true, import: true, screenshots: true, mt5: true, plan_notes: true }, limits: { trades_month: 0, mt5_accounts: 1 } },
  ultimate: { name: 'Ultimate', description: 'Everything unlimited, several MT5 accounts, priority support', price_month: 30, price_year: 300, price_month_etb: 0, price_year_etb: 0,
    features: { analytics: true, reports: true, import: true, screenshots: true, mt5: true, plan_notes: true, priority_support: true }, limits: { trades_month: 0, mt5_accounts: 0 } },
};

export const DEFAULT_PAYMENTS = {
  telebirr: { enabled: true, account_name: '', number: '', merchant_code: '', instructions: 'Send the amount with telebirr, then enter the transaction number from the confirmation SMS and upload a screenshot.' },
  crypto: { enabled: true, wallets: [{ coin: 'USDT', network: 'TRC20', address: '' }], instructions: 'Send the exact amount to the wallet address shown, on the network shown, then enter the transaction hash (TxID) and upload a screenshot.' },
};

const num = (v, d, lo = 0, hi = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v, max) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);

export async function getPlans() {
  let saved = {};
  try { saved = JSON.parse((await getSetting('site:plans')) || '{}') || {}; } catch { saved = {}; }
  const out = {};
  PLAN_IDS.forEach((id) => {
    const d = DEFAULT_PLANS[id], s = saved[id] || {};
    const features = {};
    Object.keys(FEATURES).forEach((f) => { features[f] = !!(s.features && f in s.features ? s.features[f] : d.features[f]); });
    out[id] = {
      id, name: str(s.name, 30) || d.name, description: str(s.description != null ? s.description : d.description, 200),
      price_month: num(s.price_month, d.price_month), price_year: num(s.price_year, d.price_year),
      price_month_etb: num(s.price_month_etb, d.price_month_etb), price_year_etb: num(s.price_year_etb, d.price_year_etb),
      highlight: s.highlight != null ? !!s.highlight : !!d.highlight,
      features,
      limits: {
        trades_month: Math.round(num(s.limits && s.limits.trades_month, d.limits.trades_month, 0, 100000)),
        mt5_accounts: Math.round(num(s.limits && s.limits.mt5_accounts, d.limits.mt5_accounts, 0, 1000)),
      },
    };
  });
  return out;
}

export async function savePlans(input) {
  const cur = await getPlans(), out = {};
  PLAN_IDS.forEach((id) => {
    const s = (input && input[id]) || {}, c = cur[id];
    const features = {};
    Object.keys(FEATURES).forEach((f) => { features[f] = s.features && f in s.features ? !!s.features[f] : c.features[f]; });
    out[id] = {
      name: str(s.name != null ? s.name : c.name, 30) || c.name, description: str(s.description != null ? s.description : c.description, 200),
      price_month: num(s.price_month, c.price_month), price_year: num(s.price_year, c.price_year),
      price_month_etb: num(s.price_month_etb, c.price_month_etb), price_year_etb: num(s.price_year_etb, c.price_year_etb),
      highlight: s.highlight != null ? !!s.highlight : c.highlight,
      features, limits: {
        trades_month: Math.round(num(s.limits && s.limits.trades_month, c.limits.trades_month, 0, 100000)),
        mt5_accounts: Math.round(num(s.limits && s.limits.mt5_accounts, c.limits.mt5_accounts, 0, 1000)),
      },
    };
  });
  await setSetting('site:plans', JSON.stringify(out));
  return getPlans();
}

export async function getPaymentConfig() {
  let s = {};
  try { s = JSON.parse((await getSetting('site:payments')) || '{}') || {}; } catch { s = {}; }
  const t = { ...DEFAULT_PAYMENTS.telebirr, ...(s.telebirr || {}) }, c = { ...DEFAULT_PAYMENTS.crypto, ...(s.crypto || {}) };
  return {
    telebirr: { enabled: !!t.enabled, account_name: str(t.account_name, 80), number: str(t.number, 30), merchant_code: str(t.merchant_code, 30), instructions: str(t.instructions, 600) },
    crypto: {
      enabled: !!c.enabled, instructions: str(c.instructions, 600),
      wallets: (Array.isArray(c.wallets) ? c.wallets : []).slice(0, 10).map((w) => ({ coin: str(w && w.coin, 12).toUpperCase(), network: str(w && w.network, 24), address: str(w && w.address, 120) })).filter((w) => w.coin),
    },
  };
}

export async function savePaymentConfig(d) {
  const cur = await getPaymentConfig();
  const merged = { telebirr: { ...cur.telebirr, ...((d && d.telebirr) || {}) }, crypto: { ...cur.crypto, ...((d && d.crypto) || {}) } };
  await setSetting('site:payments', JSON.stringify(merged));
  return getPaymentConfig();
}

export async function trialConfig() {
  return {
    days: Math.round(num(await getSetting('site:trial_days', 7), 7, 0, 365)),
    plan: PLAN_IDS.includes(await getSetting('site:trial_plan', 'pro')) ? await getSetting('site:trial_plan', 'pro') : 'pro',
  };
}

// Start the free trial once per user (no-op if already used or trial is 0 days).
export async function startTrial(userId) {
  const t = await trialConfig();
  if (!t.days) return;
  await q(`UPDATE users SET plan = $2, plan_expires_at = now() + ($3 || ' days')::interval, on_trial = true, trial_used = true
    WHERE id = $1 AND trial_used = false`, [userId, t.plan, String(t.days)]);
}

// What the user can use right now.
export function effectivePlanId(u) {
  if (u.role === 'admin') return 'ultimate';
  if (!u.plan || u.plan === 'free') return 'free';
  if (!u.plan_expires_at) return u.plan; // no end date = lifetime (set by admin)
  return new Date(u.plan_expires_at).getTime() > Date.now() ? u.plan : 'free';
}

export async function entitlements(u, plans) {
  plans = plans || (await getPlans());
  const id = effectivePlanId(u), p = plans[id] || plans.free;
  const exp = u.plan_expires_at ? new Date(u.plan_expires_at) : null;
  const active = id !== 'free' && id === u.plan;
  return {
    plan: id, name: p.name, features: p.features, limits: p.limits,
    expires_at: active && exp ? exp.toISOString() : null,
    days_left: active && exp ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000)) : null,
    on_trial: active && !!u.on_trial, admin: u.role === 'admin',
    lapsed: id === 'free' && u.plan && u.plan !== 'free' ? { plan: u.plan, name: (plans[u.plan] || {}).name || u.plan } : null,
  };
}

export function planError(feature, ent) {
  const what = (FEATURES[feature] || 'this feature').replace(/^./, (c) => c.toLowerCase());
  return Object.assign(new Error(`Your ${ent.name} plan does not include ${what}. Upgrade on the Subscription page.`), { status: 402, code: 'upgrade' });
}
