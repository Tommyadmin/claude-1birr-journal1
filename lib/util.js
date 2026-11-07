// Small helpers shared by the API functions.

export const TZ = process.env.APP_TIMEZONE || 'Africa/Addis_Ababa';

export function send(res, code, body, type) {
  res.statusCode = code;
  res.setHeader('Content-Type', type || 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

export function fail(res, code, message) {
  send(res, code, { error: message });
}

export function query(req) {
  return new URL(req.url, 'http://local').searchParams;
}

// Read the raw request body ourselves (works for JSON and image uploads).
export function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req) {
  const buf = await readBody(req, 1024 * 1024);
  if (!buf.length) return {};
  try {
    const d = JSON.parse(buf.toString('utf8'));
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

// Date/time parts in the journal's time zone.
export function localParts(date = new Date(), tz = TZ) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const x of f.formatToParts(date)) p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    hm: `${p.hour}:${p.minute}`,
    dt: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`,
    offset: Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000) / 1000),
  };
}

export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function clip(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

export const strList = (a, maxItems = 20, maxLen = 60) =>
  (Array.isArray(a) ? a : []).map((x) => String(x == null ? '' : x).replace(/[<>]/g, '').trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems);
