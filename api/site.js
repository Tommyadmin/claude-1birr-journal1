// /api/site            public site settings (name, logo, footer, colors, sign-up rules)
// /api/site?doc=terms  Terms and Conditions (Markdown)
// /api/site?doc=privacy Privacy Policy (Markdown)
import { ensureSchema } from '../lib/db.js';
import { getSite, publicSite, legalText, siteQuotes } from '../lib/site.js';
import { getPlans, FEATURES, trialConfig } from '../lib/plans.js';
import { send, fail, query } from '../lib/util.js';

export default async function handler(req, res) {
  try {
    await ensureSchema().catch(() => false);
    const s = await getSite();
    const doc = query(req).get('doc');
    if (doc === 'terms' || doc === 'privacy') return send(res, 200, { ...publicSite(s), doc, text: legalText(s, doc) });
    if (doc === 'landing') {
      const plans = await getPlans().catch(() => null);
      return send(res, 200, { ...publicSite(s), title: s.landing_title, text: s.landing_text, quotes: siteQuotes(s),
        plans, features: FEATURES, trial: await trialConfig().catch(() => ({ days: 0 })) });
    }
    return send(res, 200, publicSite(s));
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'Server error');
  }
}
