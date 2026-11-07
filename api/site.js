// /api/site            public site settings (name, logo, footer, colors, sign-up rules)
// /api/site?doc=terms  Terms and Conditions (Markdown)
// /api/site?doc=privacy Privacy Policy (Markdown)
import { ensureSchema } from '../lib/db.js';
import { getSite, publicSite, legalText } from '../lib/site.js';
import { send, fail, query } from '../lib/util.js';

export default async function handler(req, res) {
  try {
    await ensureSchema().catch(() => false);
    const s = await getSite();
    const doc = query(req).get('doc');
    if (doc === 'terms' || doc === 'privacy') return send(res, 200, { ...publicSite(s), doc, text: legalText(s, doc) });
    return send(res, 200, publicSite(s));
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'Server error');
  }
}
