/* Trade journal — core: state, API, uploads with progress, stats engine, layout, router, inbox popups. */
(function () {
  'use strict';
  var T = window.TJ = { views: {}, S: {} };
  var S = T.S;
  S.scope = store('tj-scope') || 'live';

  // ---------- helpers ----------
  var $ = T.$ = function (s, el) { return (el || document).querySelector(s); };
  T.$$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = T.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  T.store = store;
  var fmtCache = {};
  T.money = function (v, sign, dec) {
    v = Number(v) || 0;
    var cur = (S.prefs && S.prefs.currency) || 'USD', key = cur + (dec === 0 ? 0 : 2);
    if (!fmtCache[key]) {
      try { fmtCache[key] = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: dec === 0 ? 0 : 2, maximumFractionDigits: dec === 0 ? 0 : 2 }); }
      catch (e) { fmtCache[key] = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }); }
    }
    var s = fmtCache[key].format(Math.abs(v));
    if (v < 0) return '-' + s;
    return (sign && v > 0 ? '+' : '') + s;
  };
  T.n = function (v, d) { if (v == null || isNaN(v)) return '—'; return Number(v).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 2 : d }); };
  T.rfmt = function (v) { if (v == null || isNaN(v) || !isFinite(v)) return '—'; v = Math.round(v * 100) / 100; return (v > 0 ? '+' : '') + v.toFixed(2) + 'R'; };
  T.pct = function (v, d) { return v == null || isNaN(v) ? '—' : (v * 100).toFixed(d == null ? 0 : d) + '%'; };
  T.cls = function (v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; };
  var pad = T.pad = function (n) { return String(n).padStart(2, '0'); };
  T.nowL = function () { return new Date(Date.now() + (S.skew || 0) + (S.tzoff || 0) * 1000); };
  T.todayStr = function () { var d = T.nowL(); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  T.nowMin = function () { var d = T.nowL(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  T.nowHM = function () { var d = T.nowL(); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
  T.toMin = function (hm) { if (!hm) return null; var p = hm.split(':'); return (+p[0]) * 60 + (+p[1]); };
  T.fmtDate = function (ds, opts) { var p = String(ds).slice(0, 10).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts || { day: 'numeric', month: 'short' })); };
  T.addDays = function (ds, n) { var p = ds.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.toISOString().slice(0, 10); };
  T.weekStart = function (ds) { var p = ds.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return T.addDays(ds, -((d.getUTCDay() + 6) % 7)); };
  T.initials = function (name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?'; };

  T.toast = function (msg, err) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(T.toast._t); T.toast._t = setTimeout(function () { t.hidden = true; }, 3000);
  };

  // tiny Markdown: headings, lists, bold, italics, links, paragraphs
  T.md = function (src) {
    var out = [], list = null;
    function inline(s) {
      return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" rel="noopener">$1</a>');
    }
    String(src || '').split(/\r?\n/).forEach(function (line) {
      var m;
      if (/^\s*[-*]\s+/.test(line)) { if (!list) { list = []; } list.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>'); return; }
      if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>');
      else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    });
    if (list) out.push('<ul>' + list.join('') + '</ul>');
    return out.join('');
  };

  // ---------- API ----------
  function handle(r) {
    if (r.status === 401) { location.href = '/login.html'; throw new Error('Signed out'); }
    return r.json().catch(function () { return { error: 'Server error (' + r.status + ')' }; }).then(function (j) {
      if (!r.ok || j.error) { var er = new Error(j.error || 'Request failed'); er.code = j.code; throw er; }
      return j;
    });
  }
  T.api = function (action, body, base) {
    var opts = { method: body ? 'POST' : 'GET', headers: { 'X-CSRF': S.csrf || '' }, credentials: 'same-origin' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch((base || '/api/app') + '?action=' + action, opts).then(handle);
  };
  T.adminApi = function (action, body) { return T.api(action, body, '/api/admin'); };

  // Upload a file/blob with a progress callback (0..1). Resolves with the JSON reply.
  T.upload = function (url, blob, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('X-CSRF', S.csrf || '');
      if (blob.type) x.setRequestHeader('Content-Type', blob.type);
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = function () {
        var j = {}; try { j = JSON.parse(x.responseText); } catch (e) { j = { error: 'Server error (' + x.status + ')' }; }
        if (x.status === 401) { location.href = '/login.html'; return; }
        if (x.status >= 400 || j.error) reject(new Error(j.error || 'Upload failed')); else { if (onProgress) onProgress(1); resolve(j); }
      };
      x.onerror = function () { reject(new Error('Network error. Check your connection.')); };
      x.send(blob);
    });
  };

  // Resize an image before upload. square=true crops the center (for profile photos).
  T.shrinkImage = function (file, max, quality, square) {
    var LIMIT = 3.8 * 1024 * 1024;
    if (!/^image\//.test(file.type) || (file.type === 'image/gif' && !square)) {
      return file.size <= LIMIT ? Promise.resolve(file) : Promise.reject(new Error('Image is larger than 4 MB.'));
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, sx = 0, sy = 0, sw = w, sh = h;
        if (square) { var m = Math.min(w, h); sx = (w - m) / 2; sy = (h - m) / 2; sw = sh = m; w = h = m; }
        var k = Math.min(1, max / Math.max(w, h));
        if (k === 1 && !square && file.size <= 600 * 1024) { resolve(file); return; }
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        c.toBlob(function (b) { if (b && b.size <= LIMIT) resolve(b); else if (file.size <= LIMIT) resolve(file); else reject(new Error('Image is too large even after resizing.')); }, 'image/jpeg', quality || 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); file.size <= LIMIT ? resolve(file) : reject(new Error('Could not read this image.')); };
      img.src = url;
    });
  };

  // Upload list UI: returns { add(name) -> setter(p, state) }
  T.uploadList = function (el) {
    return {
      add: function (name) {
        var row = document.createElement('div');
        row.className = 'upitem';
        row.innerHTML = '<span>' + esc(name) + '</span><div class="progress"><i></i></div><b>0%</b>';
        el.appendChild(row);
        var bar = row.querySelector('.progress'), fill = row.querySelector('i'), lab = row.querySelector('b');
        return function (p, state) {
          fill.style.width = Math.round(p * 100) + '%';
          lab.textContent = state === 'err' ? 'Failed' : state === 'ok' ? 'Done' : Math.round(p * 100) + '%';
          if (state) bar.className = 'progress ' + (state === 'err' ? 'bad' : 'ok');
        };
      }
    };
  };

  // ---------- load ----------
  T.load = function () {
    return T.api('bootstrap').then(function (j) {
      S.trades = j.trades; S.settings = j.settings; S.prefs = j.prefs; S.user = j.user; S.site = j.site;
      S.inbox = j.inbox || []; S.notes = {}; (j.notes || []).forEach(function (n) { S.notes[n.day] = n.text; });
      S.csrf = j.csrf; S.mt5 = j.mt5 || {}; S.adminPending = j.admin_pending || 0; S.ent = j.ent || { features: {}, limits: {} }; S.monthTrades = j.trades_this_month || 0;
      S.loadedAt = new Date().toISOString(); S.skew = j.ts * 1000 - Date.now(); S.tzoff = j.tz_offset;
      fmtCache = {};
      T.applySite();
      T.derive();
    });
  };

  T.applySite = function () {
    var s = S.site || {};
    document.title = s.name || 'Trade Journal';
    if (s.accent) wtjTheme.accent(s.accent);
  };

  // ---------- trading windows & rules ----------
  T.windows = function () { return (S.prefs && S.prefs.windows) || []; };
  T.windowName = function (id) { var w = T.windows().find(function (x) { return x.id === id; }); return w ? w.name : 'Other'; };
  T.windowAt = function (min) {
    var ws = T.windows();
    for (var i = 0; i < ws.length; i++) {
      var s = T.toMin(ws[i].start), e = T.toMin(ws[i].end);
      if (s <= e ? (min >= s && min < e) : (min >= s || min < e)) return ws[i];
    }
    return null;
  };

  T.tradeR = function (t) {
    if (t.r_multiple != null) return t.r_multiple;
    if (t.risk_amount) return t.pnl / t.risk_amount;
    return null;
  };
  T.plannedRR = function (t) {
    if (t.entry == null || t.sl == null || t.tp == null) return null;
    var risk = Math.abs(t.entry - t.sl); if (!risk) return null;
    return Math.abs(t.tp - t.entry) / risk;
  };

  T.inScope = function (t) { return S.scope === 'all' || (t.account_type || 'live') === S.scope; };

  // Per-trade derived values and automatic rule flags. Balance follows live trades only.
  T.derive = function () {
    var p = S.prefs, rules = p.rules, ids = p.checklist.map(function (c) { return c.id; });
    S.trades.sort(function (a, b) {
      return a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 :
        (a.trade_time || '99') < (b.trade_time || '99') ? -1 : (a.trade_time || '99') > (b.trade_time || '99') ? 1 : a.id - b.id;
    });
    var bal = S.settings.start_balance, cum = {}, byDay = {};
    S.trades.forEach(function (t) {
      var acct = t.account_type || 'live';
      var key = acct + '|' + t.trade_date;
      var d = byDay[key] || (byDay[key] = { L: 0, n: 0, pnl: 0, win: {}, startBal: acct === 'live' ? bal : 0 });
      var f = [];
      var pending = t.source === 'mt5' && !t.reviewed;
      var w = T.windows().find(function (x) { return x.id === t.session; });
      if (t.trade_time && (!w || !w.active)) f.push({ k: 'window', l: 'Outside trading window' });
      if (rules.max_losses_day && d.L >= rules.max_losses_day) f.push({ k: 'maxloss', l: 'After ' + rules.max_losses_day + ' losses' });
      if (rules.max_wins_window && (d.win[t.session] || 0) >= rules.max_wins_window) f.push({ k: 'afterwin', l: 'After window win' });
      if (rules.max_trades_day && d.n >= rules.max_trades_day) f.push({ k: 'overtrade', l: 'Over daily trade limit' });
      if (rules.daily_loss_pct && d.startBal > 0 && -d.pnl >= d.startBal * rules.daily_loss_pct / 100) f.push({ k: 'dailyloss', l: 'Past daily loss limit' });
      var cc = 0; ids.forEach(function (id) { if (t.checklist && t.checklist[id]) cc++; });
      if (pending) f.push({ k: 'review', l: 'Needs review' });
      else if (ids.length && cc < ids.length) f.push({ k: 'checklist', l: 'Checklist ' + cc + '/' + ids.length });
      if (t.emotional) f.push({ k: 'emotional', l: 'Emotional / revenge' });
      if (!t.followed_plan) f.push({ k: 'plan', l: 'Broke plan' });
      var rr = T.plannedRR(t);
      if (rr != null && rr < rules.target_rr * 0.97) f.push({ k: 'rr', l: 'RR 1:' + (Math.round(rr * 10) / 10) });
      var before = acct === 'live' ? bal : (cum[acct] || 0);
      var riskPct = t.risk_amount && acct === 'live' && bal > 0 ? t.risk_amount / bal : null;
      if (riskPct != null && riskPct > S.settings.risk_pct / 100 * 1.05) f.push({ k: 'risk', l: 'Over-risked' });
      (t.mistakes || []).forEach(function (m) { f.push({ k: 'm:' + m, l: m, mistake: true }); });
      t._ = { before: before, after: before + t.pnl, R: T.tradeR(t), rr: rr, flags: f, clean: !f.length, cc: cc, pending: pending, riskPct: riskPct };
      if (acct === 'live') bal += t.pnl; else cum[acct] = (cum[acct] || 0) + t.pnl;
      d.n++; d.pnl += t.pnl;
      if (t.result === 'L') d.L++;
      if (t.result === 'W') d.win[t.session] = (d.win[t.session] || 0) + 1;
    });
    S.balance = bal;
  };

  T.scoped = function () { return S.trades.filter(T.inScope); };

  T.aggregate = function (list) {
    var a = { n: list.length, W: 0, L: 0, B: 0, pnl: 0, R: 0, rN: 0, gw: 0, gl: 0, maxW: 0, maxL: 0, streakW: 0, streakL: 0, rr: 0, rrN: 0, fees: 0 };
    var cw = 0, cl = 0, days = {};
    list.forEach(function (t) {
      a[t.result]++; a.pnl += t.pnl;
      if (t._.R != null && isFinite(t._.R)) { a.R += t._.R; a.rN++; }
      if (t._.rr != null) { a.rr += t._.rr; a.rrN++; }
      a.fees += Math.abs(t.commission || 0) - (t.swap || 0);
      if (t.pnl > 0) a.gw += t.pnl; else a.gl += -t.pnl;
      if (t.pnl > a.maxW) a.maxW = t.pnl; if (t.pnl < a.maxL) a.maxL = t.pnl;
      if (t.result === 'W') { cw++; cl = 0; } else if (t.result === 'L') { cl++; cw = 0; }
      a.streakW = Math.max(a.streakW, cw); a.streakL = Math.max(a.streakL, cl);
      days[t.trade_date] = (days[t.trade_date] || 0) + t.pnl;
    });
    a.wr = a.W + a.L ? a.W / (a.W + a.L) : null;
    a.pf = a.gl ? a.gw / a.gl : (a.gw ? Infinity : null);
    a.avgW = a.W ? list.filter(function (t) { return t.result === 'W'; }).reduce(function (s, t) { return s + t.pnl; }, 0) / a.W : 0;
    a.avgL = a.L ? list.filter(function (t) { return t.result === 'L'; }).reduce(function (s, t) { return s + t.pnl; }, 0) / a.L : 0;
    a.expR = a.rN ? a.R / a.rN : null;
    a.exp = a.n ? a.pnl / a.n : null;
    a.avgRR = a.rrN ? a.rr / a.rrN : null;
    a.avgR = a.expR;
    a.realRR = a.avgL ? Math.abs(a.avgW / a.avgL) : null;
    var dk = Object.keys(days);
    a.days = dk.length;
    a.bestDay = null; a.worstDay = null;
    dk.forEach(function (k) {
      if (!a.bestDay || days[k] > a.bestDay.v) a.bestDay = { d: k, v: days[k] };
      if (!a.worstDay || days[k] < a.worstDay.v) a.worstDay = { d: k, v: days[k] };
    });
    // drawdown on the running total
    var run = 0, peak = 0, mdd = 0, peakBase = list.length ? list[0]._.before : 0, mddPct = 0;
    list.forEach(function (t) {
      run += t.pnl; peak = Math.max(peak, run);
      var dd = peak - run; if (dd > mdd) { mdd = dd; var base = peakBase + peak; mddPct = base > 0 ? dd / base : 0; }
    });
    a.mdd = mdd; a.mddPct = mddPct;
    return a;
  };

  T.groupBy = function (list, keyFn) {
    var g = {};
    list.forEach(function (t) { var ks = keyFn(t); [].concat(ks).forEach(function (k) { if (k == null || k === '') return; (g[k] = g[k] || []).push(t); }); });
    return g;
  };

  // ---------- plan & features ----------
  T.can = function (f) { return !!(S.ent && S.ent.features && S.ent.features[f]); };
  var FEAT_NAMES = { analytics: 'Full analytics', reports: 'Reports and PDF export', import: 'CSV and Excel import', screenshots: 'Chart screenshots', mt5: 'MT5 automatic sync', plan_notes: 'Trading plan and notes', priority_support: 'Priority support' };
  T.featName = function (f) { return FEAT_NAMES[f] || f; };
  T.lockedPanel = function (f, what) {
    return '<section class="panel" style="text-align:center;padding:36px 20px"><div class="eyebrow">' + esc(S.ent.name || 'Your') + ' plan</div><h2 style="margin:6px 0 8px">' + esc(what || T.featName(f)) + ' is a paid feature</h2>' +
      '<p class="muted" style="margin:0 auto 16px;max-width:52ch">Upgrade to a plan that includes ' + esc(T.featName(f).toLowerCase()) + '. You keep all your trades and notes when you change plans.</p>' +
      '<a class="btn primary" href="#billing">See plans</a></section>';
  };
  T.planBadge = function () {
    var e = S.ent || {};
    if (e.admin) return '<span class="pill acc">Admin · ' + esc(e.name) + '</span>';
    var cls = e.plan === 'free' ? '' : e.on_trial ? 'warn' : 'acc';
    var t = esc(e.name || 'Free') + (e.on_trial ? ' trial' : '') + (e.days_left != null ? ' · ' + e.days_left + 'd left' : '');
    return '<a class="pill ' + cls + '" href="#billing" style="text-decoration:none">' + t + '</a>';
  };
  T.planBanner = function () {
    var e = S.ent || {};
    if (e.admin) return '';
    if (e.on_trial && e.days_left != null && e.days_left <= 3) return '<a class="notice" href="#billing"><b>Your ' + esc(e.name) + ' trial ends in ' + e.days_left + ' day' + (e.days_left === 1 ? '' : 's') + '.</b> Choose a plan to keep your features.</a>';
    if (!e.on_trial && e.plan !== 'free' && e.days_left != null && e.days_left <= 3) return '<a class="notice" href="#billing"><b>Your ' + esc(e.name) + ' plan ends in ' + e.days_left + ' day' + (e.days_left === 1 ? '' : 's') + '.</b> Renew to keep your features.</a>';
    if (e.lapsed) return '<a class="notice" href="#billing"><b>Your ' + esc(e.lapsed.name) + (e.lapsed ? '' : '') + ' access has ended.</b> You are on the Free plan. Subscribe to unlock analytics, reports, imports and MT5 sync again.</a>';
    return '';
  };
  T.tradeLimitNote = function () {
    var lim = S.ent && S.ent.limits && S.ent.limits.trades_month;
    if (!lim) return '';
    var left = Math.max(0, lim - S.monthTrades);
    return '<span class="pill ' + (left ? '' : 'bad') + '">' + S.monthTrades + ' / ' + lim + ' trades this month</span>';
  };

  // ---------- icons ----------
  var IC = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 3v8h8V3z"/>',
    today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trades: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    reports: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    plan: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    admin: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 4v5h-5M3 20v-5h5"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'
  };
  T.icon = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (IC[k] || '') + '</svg>'; };

  var NAV = [
    { v: 'dashboard', l: 'Dashboard' }, { v: 'today', l: 'Today' }, { v: 'trades', l: 'Journal' }, { v: 'calendar', l: 'Calendar' },
    { v: 'analytics', l: 'Analytics' }, { v: 'reports', l: 'Reports' }, { v: 'plan', l: 'Plan & notes' },
    { sec: 'Account' },
    { v: 'inbox', l: 'Inbox' }, { v: 'billing', l: 'Subscription' }, { v: 'profile', l: 'Profile' }, { v: 'settings', l: 'Settings' }, { v: 'admin', l: 'Admin', admin: true }
  ];
  var SCOPES = [['live', 'Live account', 'L'], ['demo', 'Demo account', 'D'], ['backtest', 'Backtest', 'B'], ['all', 'All accounts', 'A']];
  T.unread = function () { return (S.inbox || []).filter(function (m) { return !m.read; }).length; };

  function brandHtml() {
    var s = S.site || {};
    return '<a class="brand" href="#dashboard">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="">' : '<span class="mono-mark">' + esc(T.initials(s.name)) + '</span>') +
      '<span style="min-width:0"><b>' + esc(s.name || 'Trade Journal') + '</b>' + (s.tagline ? '<small>' + esc(s.tagline) + '</small>' : '') + '</span></a>';
  }
  T.avatarHtml = function (u, cls) {
    u = u || S.user || {};
    return u.avatar ? '<img class="av ' + (cls || '') + '" src="' + esc(u.avatar) + '" alt="">' : '<span class="av ' + (cls || '') + '">' + esc(T.initials(u.name)) + '</span>';
  };
  function legalLinks() {
    var s = S.site || {};
    return (s.footer ? esc(s.footer) + ' · ' : '') + '<a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a>';
  }

  // Small round "coin" marker, colored per name (used for accounts and symbols).
  var COIN_COLORS = ['#f7a600', '#2f80ed', '#3bc8e7', '#8b5cf6', '#ef5d73', '#22c08a', '#f97316', '#6366f1'];
  T.coin = function (name, cls, color) {
    var str = String(name || '?'), h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return '<span class="coin ' + (cls || '') + '" style="background:' + (color || COIN_COLORS[h % COIN_COLORS.length]) + '">' + esc(str.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '?') + '</span>';
  };
  var SCOPE_COLOR = { live: '#f7a600', demo: '#3bc8e7', backtest: '#8b5cf6', all: '#2f80ed' };
  T.scopeCoin = function (k, cls) { var sc = SCOPES.find(function (x) { return x[0] === k; }) || SCOPES[0]; return T.coin(sc[2], cls, SCOPE_COLOR[k]); };
  T.scopeName = function (k) { return (SCOPES.find(function (x) { return x[0] === k; }) || SCOPES[0])[1]; };

  // Live P&L since a date (inclusive)
  T.sumLive = function (from) {
    var t = T.todayStr();
    return S.trades.filter(function (x) { return (x.account_type || 'live') === 'live' && x.trade_date >= from && x.trade_date <= t; }).reduce(function (s, x) { return s + x.pnl; }, 0);
  };

  // Simple pop-up menu next to a button. items: [{l, href}|{l, fn}|{sep:true}|{html}]
  T.menu = function (btn, items) {
    var old = document.querySelector('.menu'); if (old) { var same = old._btn === btn; old.remove(); if (same) return; }
    var m = document.createElement('div'); m.className = 'menu'; m._btn = btn; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(function (it, i) {
      if (it.sep) return '<hr>';
      if (it.html) return '<div class="menu-x">' + it.html + '</div>';
      return it.href ? '<a role="menuitem" href="' + it.href + '"' + (it.dl ? ' download' : '') + '>' + (it.icon ? T.icon(it.icon) : '') + esc(it.l) + '</a>'
        : '<button role="menuitem" type="button" data-mi="' + i + '">' + (it.icon ? T.icon(it.icon) : '') + esc(it.l) + '</button>';
    }).join('');
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect(), w = m.offsetWidth;
    m.style.top = (r.bottom + window.scrollY + 8) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mi]'); if (b) { m.remove(); items[+b.dataset.mi].fn(); return; }
      if (e.target.closest('a')) m.remove();
    });
    setTimeout(function () {
      var off = function (e) { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { m.remove(); document.removeEventListener('click', off, true); } };
      document.addEventListener('click', off, true);
    }, 0);
  };
  function userMenu(btn) {
    T.menu(btn, [
      { html: '<b>' + esc(S.user.name) + '</b><small>' + esc(S.user.email) + '</small><div style="margin-top:8px">' + T.planBadge() + '</div>' },
      { sep: true },
      { l: 'Profile', href: '#profile', icon: 'profile' }, { l: 'Settings', href: '#settings', icon: 'settings' }, { l: 'Subscription', href: '#billing', icon: 'billing' },
      { sep: true },
      { l: 'Sign out', href: '/api/auth?action=logout', icon: 'logout' }
    ]);
  }

  T.setScope = function (k) { S.scope = k; store('tj-scope', k); T.renderShell(); T.render(); };

  T.renderShell = function () {
    var admin = S.user.role === 'admin', un = T.unread(), s = S.site || {};
    var navA = function (n) {
      return '<a class="nav-a" href="#' + n.v + '" data-v="' + n.v + '">' + T.icon(n.v) + '<span>' + n.l + '</span>' + (n.v === 'inbox' && un ? '<span class="badge">' + un + '</span>' : '') + (n.v === 'admin' && S.adminPending ? '<span class="badge" title="Waiting for approval">' + S.adminPending + '</span>' : '') + '</a>';
    };
    var acctIdx = NAV.findIndex(function (n) { return n.sec; });
    var main = NAV.slice(0, acctIdx).map(navA).join('');
    var acct = NAV.slice(acctIdx + 1).filter(function (n) { return !n.admin || admin; }).map(navA).join('');
    var counts = {}; S.trades.forEach(function (t) { var k = t.account_type || 'live'; counts[k] = (counts[k] || 0) + 1; });
    counts.all = S.trades.length;
    var scopes = SCOPES.map(function (sc) {
      return '<button type="button" class="scope-a' + (S.scope === sc[0] ? ' on' : '') + '" data-scope-side="' + sc[0] + '">' + T.scopeCoin(sc[0]) +
        '<span><b>' + sc[1] + '</b><small>' + (counts[sc[0]] || 0) + ' trade' + (counts[sc[0]] === 1 ? '' : 's') + '</small></span></button>';
    }).join('');
    $('#side').innerHTML = brandHtml() +
      '<a class="acct-card" href="#dashboard" title="Live account balance"><span class="ic">' + T.icon('home') + '</span><span style="min-width:0"><b class="num">' + T.money(S.balance) + '</b><small>Live balance · ' + (counts.live || 0) + ' trades</small></span></a>' +
      '<nav class="navlist">' + main + '</nav>' +
      '<div class="navsec"><span>Your accounts</span></div><div class="navlist">' + scopes + '</div>' +
      '<div class="side-hr"></div><nav class="navlist">' + acct + '</nav>' +
      '<div class="side-hr"></div><div class="legal">' + legalLinks() + '<br>© ' + new Date().getFullYear() + ' ' + esc(s.name || '') + '</div>';
    var t = T.todayStr(), mo = T.sumLive(t.slice(0, 8) + '01'), td = T.sumLive(t), wk = T.sumLive(T.weekStart(t));
    var tick = function (lbl, v, color, ch) { return '<span class="tick">' + T.coin(ch, '', color) + '<b class="' + T.cls(v) + '">' + T.money(v, true) + '</b><small>' + lbl + '</small></span>'; };
    $('#topbar').innerHTML = '<div class="tb-brand">' + brandHtml() + '</div>' +
      '<div class="ticks">' + tick('Today', td, '#f7a600', 'D') + tick('This week', wk, '#2f80ed', 'W') + tick('This month', mo, '#8b5cf6', 'M') + '</div>' +
      '<div class="tb-right"><button class="btn primary tb-new" type="button" data-new>' + T.icon('plus') + 'New trade</button>' +
      '<a class="ibtn" href="#inbox" aria-label="Inbox">' + T.icon('bell') + (un ? '<span class="badge">' + un + '</span>' : '') + '</a>' +
      '<button class="theme-btn ibtn" type="button"></button>' +
      '<button class="ibtn av-btn" type="button" id="meBtn" aria-label="Account menu">' + T.avatarHtml(null, 'me-av') + '</button></div>';
    $('#bottombar').innerHTML = ['dashboard', 'today', 'trades', 'calendar'].map(function (v) {
      return '<a href="#' + v + '" data-v="' + v + '">' + T.icon(v) + '<span>' + NAV.find(function (n) { return n.v === v; }).l + '</span></a>';
    }).join('') + '<button type="button" id="moreBtn" data-v="more">' + T.icon('more') + '<span>More</span>' + (un ? '<span class="badge">' + un + '</span>' : '') + '</button>';
    $('#footer').innerHTML = legalLinks();
    T.$$('[data-new]').forEach(function (b) { b.onclick = function () { T.openTrade(null); }; });
    T.$$('[data-scope-side]').forEach(function (b) { b.onclick = function () { T.setScope(b.dataset.scopeSide); if (S.view !== 'dashboard' && ['trades', 'calendar', 'analytics', 'reports'].indexOf(S.view) < 0) location.hash = '#dashboard'; }; });
    $('#meBtn').onclick = function () { userMenu(this); };
    $('#moreBtn').onclick = openMore;
    if (window.wtjTheme) window.wtjTheme.set(window.wtjTheme.get());
    markNav();
  };

  // Account header + section tabs shared by Dashboard, Calendar, Analytics and Reports.
  var ITABS = [['dashboard', 'Summary', 'dashboard'], ['calendar', 'Calendar', 'calendar'], ['analytics', 'Analytics', 'analytics'], ['reports', 'Reporting', 'reports']];
  function ago(str) {
    if (!str) return '';
    var d = new Date(String(str).replace(' ', 'T')); if (isNaN(d)) return str;
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min' + (m > 1 ? 's' : '') + ' ago';
    var h = Math.round(m / 60); if (h < 24) return h + ' hour' + (h > 1 ? 's' : '') + ' ago';
    var dd = Math.round(h / 24); return dd + ' day' + (dd > 1 ? 's' : '') + ' ago';
  }
  T.insightHead = function (view) {
    var sc = S.scope, list = T.scoped(), m5 = S.mt5 || {};
    var value = sc === 'live' ? S.balance : list.reduce(function (s, t) { return s + t.pnl; }, 0);
    var src = sc === 'live' || sc === 'all' ? (m5.last_account ? 'MT5 · ' + m5.last_account : 'Manual journal') : (sc === 'demo' ? 'Practice trades' : 'Strategy testing');
    var upd = m5.last_sync ? 'Last sync: ' + ago(m5.last_sync) : 'Updated ' + ago(S.loadedAt);
    return '<div class="ihead no-print"><div class="hero">' + T.scopeCoin(sc, 'xl') +
      '<div style="min-width:0"><div class="t1">' + esc(T.scopeName(sc)) + ' <span class="sep">•</span> <span class="muted">' + esc(src) + '</span></div>' +
      '<div class="t2"><span class="num-h ' + (sc === 'live' ? '' : T.cls(value)) + '">' + T.money(value, sc !== 'live') + '</span><small>' + list.length + ' trades' + (sc === 'live' ? ' · balance' : ' · net P&amp;L') + '</small></div></div>' +
      '<div class="hero-r"><span class="small">' + esc(upd) + '</span>' +
      '<button class="rbtn go" type="button" id="hRefresh" aria-label="Refresh data" title="Refresh">' + T.icon('refresh') + '</button>' +
      '<button class="rbtn" type="button" id="hMore" aria-label="More actions" title="More">' + T.icon('more') + '</button></div></div>' +
      '<div class="tabs itabs" role="tablist">' + ITABS.map(function (t) {
        return '<a class="tab" role="tab" href="#' + t[0] + '" aria-selected="' + (view === t[0]) + '">' + T.icon(t[2]) + '<span>' + t[1] + '</span></a>';
      }).join('') + '</div><div class="mob-scope">' + T.scopeSwitch(true) + '</div></div>';
  };
  T.bindInsightHead = function (el) {
    var r = $('#hRefresh', el);
    if (r) r.onclick = function () {
      r.classList.add('spin');
      T.load().then(function () { T.renderShell(); T.render(); T.toast('Up to date'); }).catch(function (e) { r.classList.remove('spin'); T.toast(e.message, true); });
    };
    var mo = $('#hMore', el);
    if (mo) mo.onclick = function () {
      T.menu(mo, [
        { l: 'New trade', icon: 'plus', fn: function () { T.openTrade(null); } },
        { l: 'Export trades (CSV)', icon: 'download', href: '/api/app?action=export', dl: true },
        { l: 'Import trades', icon: 'upload', href: '#trades' },
        { sep: true },
        { l: 'MT5 sync and settings', icon: 'settings', href: '#settings' }
      ]);
    };
    T.bindScope(el);
  };

  // Ring chart. parts: [{v, color, label}]
  T.donut = function (parts, center, sub) {
    var tot = parts.reduce(function (s, p) { return s + Math.max(0, p.v); }, 0), r = 52, C = 2 * Math.PI * r, off = 0;
    var rings = tot ? parts.filter(function (p) { return p.v > 0; }).map(function (p) {
      var len = p.v / tot * C, seg = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>';
      off += len; return seg;
    }).join('') : '';
    return '<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="' + esc(parts.map(function (p) { return p.label + ' ' + p.v; }).join(', ')) + '">' +
      '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="16"/>' + rings +
      (center ? '<text x="70" y="' + (sub ? 70 : 76) + '" text-anchor="middle" class="dc">' + esc(center) + '</text>' : '') +
      (sub ? '<text x="70" y="88" text-anchor="middle" class="ds">' + esc(sub) + '</text>' : '') + '</svg>';
  };

  function openMore() {
    var admin = S.user.role === 'admin';
    var back = document.createElement('div'); back.className = 'sheet-back';
    var sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'More');
    sh.innerHTML = '<div class="grab"></div><button class="btn primary" type="button" data-new style="width:100%;margin-bottom:8px">' + T.icon('plus') + 'New trade</button><nav class="navlist">' +
      NAV.filter(function (n) { return n.v && (!n.admin || admin) && ['dashboard', 'today', 'trades', 'calendar'].indexOf(n.v) < 0; }).map(function (n) {
        return '<a class="nav-a" href="#' + n.v + '">' + T.icon(n.v) + '<span>' + n.l + '</span>' + (n.v === 'inbox' && T.unread() ? '<span class="badge">' + T.unread() + '</span>' : '') + '</a>';
      }).join('') + '<a class="nav-a" href="/api/auth?action=logout">' + T.icon('logout') + '<span>Sign out</span></a></nav>' +
      '<div class="legal" style="margin-top:12px">' + legalLinks() + '</div>';
    var close = function () { back.remove(); sh.remove(); };
    back.onclick = close;
    sh.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    sh.querySelector('[data-new]').onclick = function () { close(); T.openTrade(null); };
    document.body.appendChild(back); document.body.appendChild(sh);
  }

  function markNav() {
    T.$$('[data-v]').forEach(function (a) { a.classList.toggle('on', a.dataset.v === S.view); });
  }

  // ---------- router ----------
  T.render = function () {
    if (!S.user) return;   // still loading
    var v = (location.hash || '#dashboard').slice(1).split('/')[0];
    if (!T.views[v] || (v === 'admin' && S.user.role !== 'admin')) v = 'dashboard';
    var changed = S.view !== v;
    S.view = v;
    markNav();
    var el = $('#view'), y = window.scrollY;
    T.views[v](el);
    window.scrollTo(0, changed ? 0 : y);
  };

  // ---------- shared renderers ----------
  T.flagHtml = function (t, max) {
    if (t._.clean) return '<span class="flag ok">Rules followed</span>';
    var fl = t._.flags, out = fl.slice(0, max || 3).map(function (f) { return '<span class="flag' + (f.k === 'review' ? ' info' : '') + '">' + esc(f.l) + '</span>'; }).join(' ');
    return out + (fl.length > (max || 3) ? ' <span class="tagc">+' + (fl.length - (max || 3)) + '</span>' : '');
  };
  T.tradeRows = function (list, emptyMsg) {
    if (!list.length) return '<div class="empty">' + (emptyMsg || 'No trades yet.') + '</div>';
    return '<div class="tlist">' + list.map(function (t) {
      return '<div class="trow ' + t.result + '" data-id="' + t.id + '" tabindex="0" role="button" aria-label="' + esc(t.pair + ' ' + t.trade_date) + '">' +
        '<button class="star' + (t.favorite ? ' on' : '') + '" data-fav="' + t.id + '" aria-label="Favorite" title="Favorite">' + (t.favorite ? '★' : '☆') + '</button>' +
        '<div class="d">' + T.fmtDate(t.trade_date) + '<br>' + esc(t.trade_time || '') + '</div>' +
        '<div style="min-width:0"><div class="p">' + esc(t.pair) + ' <small>' + (t.direction === 'buy' ? 'Long' : 'Short') + ' · ' + esc(T.windowName(t.session)) + (t.strategy ? ' · ' + esc(t.strategy) : '') + '</small></div>' +
        '<div class="sub">' + (t.source === 'mt5' ? '<span class="src">MT5</span>' : t.source === 'import' ? '<span class="src">CSV</span>' : '') +
        (t.account_type && t.account_type !== 'live' ? '<span class="tagc">' + esc(t.account_type) + '</span>' : '') + T.flagHtml(t) +
        (t.shots.length ? '<span>' + t.shots.length + ' img</span>' : '') + (t.tags || []).slice(0, 3).map(function (g) { return '<span class="tagc">#' + esc(g) + '</span>'; }).join('') + '</div></div>' +
        '<span class="pill ' + t.result + ' pl">' + { W: 'Win', L: 'Loss', B: 'BE' }[t.result] + '</span>' +
        '<div class="amt ' + T.cls(t.pnl) + '">' + T.money(t.pnl, true) + '<small>' + T.rfmt(t._.R) + '</small></div></div>';
    }).join('') + '</div>';
  };
  T.bindRows = function (root) {
    T.$$('.trow', root).forEach(function (r) {
      var open = function () { T.openTrade(S.trades.find(function (t) { return t.id === +r.dataset.id; })); };
      r.addEventListener('click', function (e) { if (!e.target.closest('[data-fav]')) open(); });
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === r) open(); });
    });
    T.$$('[data-fav]', root).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        T.api('toggle_favorite', { id: +b.dataset.fav }).then(function (j) {
          var t = S.trades.find(function (x) { return x.id === +b.dataset.fav; }); if (t) t.favorite = j.favorite;
          b.classList.toggle('on', !!j.favorite); b.textContent = j.favorite ? '★' : '☆';
        }).catch(function (err) { T.toast(err.message, true); });
      };
    });
  };

  T.checklistHtml = function (values, prefix, cols) {
    var html = '', g = null, items = S.prefs.checklist;
    if (!items.length) return '<p class="muted small">No checklist items. Add them in Settings > Checklist.</p>';
    items.forEach(function (c) {
      if (!cols && c.group !== g) { if (g !== null) html += '</div>'; g = c.group; html += '<div class="check-group"><h4>' + esc(g) + '</h4>'; }
      var on = !!values[c.id], id = prefix + c.id;
      html += '<label class="item' + (on ? ' done' : '') + '" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + esc(c.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(c.text) + '</span></label>';
    });
    if (!cols && g !== null) html += '</div>';
    return cols ? '<div class="cl-cols">' + html + '</div>' : html;
  };

  // Equity / cumulative P&L line chart
  T.equitySvg = function (list, opts) {
    opts = opts || {};
    var start = S.scope === 'live' && list.length ? list[0]._.before : 0;
    var pts = [start], run = start;
    list.forEach(function (t) { run += t.pnl; pts.push(run); });
    var W = 820, H = opts.h || 240, L = 92, R = 14, Tp = 16, B = 30;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), goal = S.scope === 'live' ? S.settings.goal : 0;
    var showGoal = goal && goal <= hi * 1.35 && goal >= lo;
    if (showGoal) hi = Math.max(hi, goal);
    if (hi === lo) { hi += 10; lo -= 10; }
    var padv = (hi - lo) * 0.08; hi += padv; lo -= padv;
    var x = function (i) { return L + (pts.length > 1 ? i / (pts.length - 1) : 0.5) * (W - L - R); };
    var y = function (v) { return Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - B); };
    var step = niceStep((hi - lo) / 4), g = '';
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(T.money(v, false, 0)) + '</text>';
    }
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p).toFixed(1); }).join(' ');
    var base = Math.max(Math.min(start, hi), lo);
    var area = d + ' L' + x(pts.length - 1).toFixed(1) + ' ' + y(base).toFixed(1) + ' L' + x(0).toFixed(1) + ' ' + y(base).toFixed(1) + ' Z';
    var last = pts[pts.length - 1];
    var dots = list.length <= 80 ? list.map(function (t, i) { return '<circle cx="' + x(i + 1) + '" cy="' + y(pts[i + 1]) + '" r="2.6" fill="' + (t.result === 'W' ? 'var(--win)' : t.result === 'L' ? 'var(--loss)' : 'var(--be)') + '"/>'; }).join('') : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Equity curve">' + g +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(start) + '" y2="' + y(start) + '" stroke="var(--line-strong)" stroke-dasharray="2 4"/>' +
      (showGoal ? '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(goal) + '" y2="' + y(goal) + '" stroke="var(--accent)" stroke-dasharray="6 5" stroke-width="1.4"/><text x="' + (W - R) + '" y="' + (y(goal) - 6) + '" text-anchor="end" style="fill:var(--accent)">Goal ' + esc(T.money(goal, false, 0)) + '</text>' : '') +
      '<path d="' + area + '" fill="var(--accent)" opacity=".10"/><path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>' + dots +
      '<circle cx="' + x(pts.length - 1) + '" cy="' + y(last) + '" r="4.5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>' +
      '<text x="' + L + '" y="' + (H - 6) + '">Start</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">Trade ' + list.length + '</text></svg>';
  };
  function niceStep(raw) { var p = Math.pow(10, Math.floor(Math.log10(raw || 1))); var n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  T.niceStep = niceStep;

  // Grouped performance table with a P&L bar per row
  T.groupTable = function (groups, label, opts) {
    opts = opts || {};
    var keys = Object.keys(groups);
    if (!keys.length) return '<div class="empty">' + (opts.empty || 'No data yet.') + '</div>';
    var rows = keys.map(function (k) { return { k: k, a: T.aggregate(groups[k]) }; });
    if (opts.order) rows.sort(function (x, y) { return opts.order.indexOf(x.k) - opts.order.indexOf(y.k); });
    else rows.sort(function (x, y) { return opts.byPnl ? x.a.pnl - y.a.pnl : y.a.n - x.a.n; });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.a.pnl); })) || 1;
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(label) + '</th><th class="n">Trades</th><th class="n">Win rate</th><th class="n">Profit factor</th><th class="n">Avg R</th><th class="n">Net</th><th>P&amp;L</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var a = r.a;
        return '<tr><td>' + esc(opts.name ? opts.name(r.k) : r.k) + '</td><td class="n num">' + a.n + '</td><td class="n num">' + T.pct(a.wr) + '</td>' +
          '<td class="n num">' + (a.pf == null ? '—' : a.pf === Infinity ? '∞' : a.pf.toFixed(2)) + '</td><td class="n num ' + T.cls(a.expR) + '">' + T.rfmt(a.expR) + '</td>' +
          '<td class="n num ' + T.cls(a.pnl) + '">' + T.money(a.pnl, true) + '</td>' +
          '<td><div class="bar"><i class="' + (a.pnl < 0 ? 'neg' : '') + '" style="width:' + Math.round(Math.abs(a.pnl) / max * 110) + 'px"></i></div></td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  T.kpi = function (label, value, sub, cls) {
    return '<div class="kpi"><span class="label">' + label + '</span><span class="v ' + (cls || '') + '">' + value + '</span>' + (sub ? '<span class="s">' + sub + '</span>' : '') + '</div>';
  };

  T.scopeSwitch = function (mob) {
    return '<div class="segtabs no-print' + (mob === false ? '' : ' mob-only') + '" role="group" aria-label="Account">' + [['live', 'Live'], ['demo', 'Demo'], ['backtest', 'Backtest'], ['all', 'All']].map(function (o) {
      return '<button type="button" data-scope="' + o[0] + '" aria-pressed="' + (S.scope === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  };
  T.bindScope = function (el) {
    T.$$('[data-scope]', el).forEach(function (b) { b.onclick = function () { T.setScope(b.dataset.scope); }; });
  };

  // ---------- inbox popups ----------
  var shown = {};
  T.showPopups = function () {
    if (S.view === 'inbox' || document.querySelector('.pop')) return;
    var m = (S.inbox || []).find(function (x) { return !x.read && !shown[x.id]; });
    if (!m) return;
    shown[m.id] = true;
    var p = document.createElement('div'); p.className = 'pop'; p.setAttribute('role', 'alertdialog'); p.setAttribute('aria-label', 'New message');
    p.innerHTML = '<div class="row between"><span class="eyebrow">' + T.icon('bell').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:2"') + ' New message</span><span class="small muted num">' + esc(m.created_at) + '</span></div>' +
      '<h3>' + esc(m.title) + '</h3>' + (m.body ? '<p>' + esc(m.body) + '</p>' : '') +
      '<div class="row end"><a class="btn sm ghost" href="#inbox">Open inbox</a><button class="btn sm primary" type="button">Mark as read</button></div>';
    var close = function () { p.remove(); setTimeout(T.showPopups, 300); };
    p.querySelector('a').onclick = function () { p.remove(); };
    p.querySelector('button').onclick = function () {
      T.api('mark_read', { ids: [m.id] }).then(function (j) { S.inbox = j.inbox; T.renderShell(); close(); }).catch(function () { close(); });
    };
    document.body.appendChild(p);
  };
  T.pollInbox = function () {
    if (document.hidden) return;
    T.api('inbox').then(function (j) {
      var before = T.unread(); S.inbox = j.inbox;
      if (T.unread() !== before) { T.renderShell(); if (S.view === 'inbox') T.render(); }
      T.showPopups();
    }).catch(function () {});
  };

  // ---------- start ----------
  T.start = function () {
    window.addEventListener('hashchange', function () { T.render(); setTimeout(T.showPopups, 400); });
    $('#imgClose').onclick = function () { $('#imgDlg').close(); };
    $('#imgDlg').addEventListener('click', function (e) { if (e.target === this) this.close(); });
    T.load().then(function () {
      T.renderShell(); T.render();
      setTimeout(T.showPopups, 800);
      setInterval(T.pollInbox, 90000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) T.pollInbox(); });
    }).catch(function (err) {
      $('#view').innerHTML = '<div class="panel"><p class="alert">Could not load the journal: ' + esc(err.message) + '</p></div>';
    });
    setInterval(function () { if (S.view === 'today' && !document.querySelector('dialog[open]') && T.views.today.tick) T.views.today.tick(); }, 20000);
  };
})();
