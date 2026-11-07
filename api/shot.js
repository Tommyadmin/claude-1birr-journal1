// /api/shot?id=N  Serves a private screenshot to the signed-in user only.
import { q } from '../lib/db.js';
import { getSession } from '../lib/auth.js';
import { fail } from '../lib/util.js';

export default async function handler(req, res) {
  try {
    if (!(await getSession(req))) return fail(res, 403, 'Signed out');
    const id = parseInt(new URL(req.url, 'http://local').searchParams.get('id'), 10) || 0;
    const rows = await q('SELECT mime, url, data FROM screenshots WHERE id = $1', [id]);
    if (!rows.length) return fail(res, 404, 'Not found');
    let buf = rows[0].data;
    if (!buf && rows[0].url) {
      const r = await fetch(rows[0].url);
      if (!r.ok) return fail(res, 404, 'Image missing from storage');
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (!buf) return fail(res, 404, 'Not found');
    res.statusCode = 200;
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(buf);
  } catch (e) {
    console.error(e);
    return fail(res, e.status || 500, e.status ? e.message : 'Server error');
  }
}
