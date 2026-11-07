// Site-wide settings the admin can change: name, logo, footer, colors, sign-up rules, legal pages.
import { q, getSetting, setSetting } from './db.js';

export const SITE_DEFAULTS = {
  name: '1birr Trade',
  tagline: 'Trading journal',
  footer: '',
  support_email: '',
  accent: '#b07d12',
  registration_open: '1',
  require_approval: '0',
  trial_days: '7',
  trial_plan: 'pro',
  terms: '',      // empty = use the generic text below
  privacy: '',
  legal_entity: '',
  country: 'Ethiopia',
};

let cache = null, cacheAt = 0;

export async function getSite(fresh = false) {
  if (!fresh && cache && Date.now() - cacheAt < 30000) return cache;
  const rows = await q(`SELECT k, v FROM settings WHERE k LIKE 'site:%'`).catch(() => []);
  const s = { ...SITE_DEFAULTS };
  rows.forEach((r) => { s[r.k.slice(5)] = r.v; });
  const logo = await q(`SELECT to_char(updated_at, 'YYYYMMDDHH24MISS') AS v FROM site_assets WHERE k = 'logo'`).catch(() => []);
  s.logo_version = logo.length ? logo[0].v : '';
  cache = s; cacheAt = Date.now();
  return s;
}

export async function saveSite(d) {
  const str = (v, max) => String(v == null ? '' : v).replace(/<\/?script/gi, '').slice(0, max);
  const fields = {
    name: (v) => str(v, 60).replace(/[<>]/g, '').trim() || SITE_DEFAULTS.name,
    tagline: (v) => str(v, 80).replace(/[<>]/g, ''),
    footer: (v) => str(v, 300).replace(/[<>]/g, ''),
    support_email: (v) => str(v, 120).replace(/[<>\s]/g, ''),
    accent: (v) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : SITE_DEFAULTS.accent),
    registration_open: (v) => (v === '0' || v === false || v === 0 ? '0' : '1'),
    require_approval: (v) => (v === '0' || v === false || v === 0 ? '0' : '1'),
    terms: (v) => str(v, 40000),
    privacy: (v) => str(v, 40000),
    legal_entity: (v) => str(v, 120).replace(/[<>]/g, ''),
    country: (v) => str(v, 60).replace(/[<>]/g, ''),
    trial_days: (v) => String(Math.max(0, Math.min(365, Math.round(Number(v) || 0)))),
    trial_plan: (v) => (['starter', 'pro', 'ultimate'].includes(v) ? v : 'pro'),
  };
  for (const k of Object.keys(fields)) {
    if (d[k] !== undefined) await setSetting('site:' + k, fields[k](d[k]));
  }
  cache = null;
  return getSite(true);
}

export function publicSite(s) {
  return {
    name: s.name, tagline: s.tagline, footer: s.footer, support_email: s.support_email, accent: s.accent,
    registration_open: s.registration_open === '1', require_approval: s.require_approval === '1',
    logo: s.logo_version ? '/api/media?type=logo&v=' + s.logo_version : '',
  };
}

// Generic legal text. Admins can replace it on the Admin page. Not legal advice.
export function legalText(s, doc) {
  const custom = doc === 'terms' ? s.terms : s.privacy;
  if (custom && custom.trim()) return custom;
  const name = s.name, owner = s.legal_entity || `the operator of ${name}`, country = s.country || 'the country where the operator is based';
  const contact = s.support_email ? `email ${s.support_email}` : 'use the contact details on the website';
  const date = 'Last updated: ' + new Date().toISOString().slice(0, 10).replace(/-\d\d$/, '');
  if (doc === 'terms') return `# Terms and Conditions

${date}

These terms apply to your use of ${name} (the "Service"), provided by ${owner} ("we", "us"). By creating an account or using the Service you agree to these terms. If you do not agree, do not use the Service.

## 1. What the Service is
${name} is a trading journal. It lets you record trades, notes and screenshots, import or sync trade history, and see statistics about your own trading. The Service does not place trades, hold money or connect to your broker in a way that can trade for you.

## 2. Not financial advice
Nothing in the Service is investment, financial, tax or legal advice. Statistics, checklists, reports and any insights are based only on the data you enter and are provided for your own review. Trading foreign exchange, metals, indices, crypto and other leveraged products carries a high risk of losing money. You are solely responsible for your trading decisions.

## 3. Eligibility and accounts
You must be at least 18 years old and able to enter into a binding agreement. You must give accurate information when you sign up and keep it up to date. You are responsible for keeping your password and your MT5 sync key secret and for all activity on your account. Tell us straight away if you think someone else has used your account. We may approve, refuse, suspend or close accounts at our discretion.

## 4. Your content
You keep ownership of the trades, notes, images and other content you add ("Your Content"). You give us a limited permission to store, process and display Your Content only to provide the Service to you. You must have the right to upload Your Content and it must not break any law or anyone else's rights.

## 5. Acceptable use
You agree not to: use the Service for anything unlawful; try to access other users' data or our systems without permission; upload malware or harmful files; overload, scrape or reverse engineer the Service; resell the Service without our written permission; or use it to harass or impersonate anyone.

## 6. MT5 sync and third-party services
If you use the MT5 sync tool, it runs in your own MetaTrader terminal and only reads your closed-trade history. You choose to install and run it. Sign-in with Google, email delivery and hosting are provided by third parties whose own terms also apply. We are not responsible for third-party services, brokers or trading platforms.

## 7. Availability and changes
We try to keep the Service available and accurate but provide it "as is" and "as available", without warranties of any kind. Features may change or stop. Keep your own backups; you can export your trades as CSV at any time.

## 8. Limitation of liability
To the fullest extent allowed by law, we are not liable for any trading losses, lost profits, lost data or indirect or consequential damages arising from your use of the Service. Where liability cannot be excluded, our total liability is limited to the amount you paid us for the Service in the 12 months before the claim, or zero if the Service was free.

## 9. Ending your use
You can delete your account at any time in Settings. We may suspend or end your access if you break these terms or if we stop the Service. Sections 2, 4, 8 and 10 continue after your account ends.

## 10. Governing law
These terms are governed by the laws of ${country}. Disputes will be handled by the competent courts there, unless the law where you live gives you other rights.

## 11. Changes to these terms
We may update these terms. If we make important changes we will tell you in the app. Continuing to use the Service after a change means you accept the new terms.

## 12. Contact
Questions about these terms: ${contact}.
`;
  return `# Privacy Policy

${date}

This policy explains how ${owner} ("we", "us") collects and uses personal data when you use ${name} (the "Service").

## 1. Data we collect
- **Account data:** your name, email address, phone number and password (stored only as a secure hash). If you sign in with Google, we receive your Google account name, email address and account ID.
- **Profile data:** anything you choose to add to your profile, such as a photo, country, city, bio, experience level and broker.
- **Trading data:** trades, prices, results, notes, checklists, emotions, mistakes, tags, screenshots and settings you enter, import or sync from MT5.
- **Technical data:** a sign-in cookie that keeps you signed in, and basic server logs (such as time, page and IP address) used for security and fixing errors. We do not use advertising or tracking cookies.

## 2. How we use your data
To create and run your account, show you your journal and statistics, sync and import your trades, send you service emails (email confirmation, approval, password reset) and in-app messages, keep the Service secure, and comply with the law. We do not sell your personal data and we do not use it for advertising.

## 3. Who can see your data
Your trading data is private to your account. Administrators of the Service can see your account details (name, email, phone, sign-up date, trade count) to approve and manage accounts and to give support. We use service providers that process data for us: hosting (Vercel), database (Neon), file storage (Vercel Blob), email delivery (Resend) and, if you choose it, Google sign-in. They may store data outside your country. We may share data if the law requires it.

## 4. How long we keep it
We keep your data while your account is open. When you delete your account in Settings, your account, trades, screenshots and profile are deleted from our live systems. Backups held by our providers are removed on their normal schedule.

## 5. Security
We use encrypted connections (HTTPS), hashed passwords, signed session cookies and access checks so each user can only reach their own data. No system is completely secure, so please use a strong, unique password.

## 6. Your choices and rights
You can view and change your profile, export your trades as CSV and delete your account at any time. Depending on where you live, you may have the right to access, correct or delete your data, or to object to some processing. To make a request, ${contact}.

## 7. Children
The Service is not for anyone under 18, and we do not knowingly collect their data.

## 8. Changes
We may update this policy. If we make important changes we will tell you in the app.

## 9. Contact
Questions about privacy: ${contact}.
`;
}

export async function getLogo() {
  const r = await q(`SELECT mime, data FROM site_assets WHERE k = 'logo'`);
  return r[0] || null;
}
