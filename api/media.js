// /api/media?type=shot&id=N | type=avatar[&uid=N] | type=logo
// Screenshots: owner only. Avatars: owner, or admins. Logo: public.
import { q } from '../lib/db.js';
import { getAuth } from '../lib/auth.js';
import { getLogo } from '../lib/site.js';
import { fail, query } from '../lib/util.js';

function out(res, mime, buf, cache) {
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buf);
}

export default async function handler(req, res) {
  try {
    const qs = query(req);
    const type = qs.get('type');

    if (type === 'logo') {
      const l = await getLogo().catch(() => null);
      if (!l) return fail(res, 404, 'No logo');
      return out(res, l.mime, l.data, 'public, max-age=86400');
    }

    const auth = await getAuth(req);
    if (!auth) return fail(res, 403, 'Signed out');

    if (type === 'avatar') {
      let uid = parseInt(qs.get('uid'), 10) || auth.user.id;
      if (uid !== auth.user.id && auth.user.role !== 'admin') uid = auth.user.id;
      const r = await q('SELECT mime, data FROM avatars WHERE user_id = $1', [uid]);
      if (!r.length) return fail(res, 404, 'No photo');
      return out(res, r[0].mime, r[0].data, 'private, max-age=86400');
    }

    const id = parseInt(qs.get('id'), 10) || 0;
    const rows = await q(`SELECT s.mime, s.url, s.data FROM screenshots s JOIN trades t ON t.id = s.trade_id
      WHERE s.id = $1 AND t.user_id = $2`, [id, auth.user.id]);
    if (!rows.length) return fail(res, 404, 'Not found');
    let buf = rows[0].data;
    if (!buf && rows[0].url) {
      const r = await fetch(rows[0].url);
      if (!r.ok) return fail(res, 404, 'Image missing from storage');
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (!buf) return fail(res, 404, 'Not found');
    return out(res, rows[0].mime, buf, 'private, max-age=86400');
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error');
  }
}
