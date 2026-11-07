/* Wakanda Trade Journal — front end (no libraries) */
(function () {
  'use strict';

  // ---------- rules ----------
  var WINDOWS = { london: [660, 720], ny: [930, 1050] }; // minutes from midnight, local time
  var SESSION_NAMES = { london: 'London', ny: 'New York', other: 'Other' };
  var CHECK = [
    { g: 'Before the session', id: 'time', t: { london: 'Inside the <b>London window</b> (11:00–12:00)', ny: 'Inside the <b>NY window</b> (15:30–17:30)' } },
    { g: 'Before the session', id: 'news', t: 'Checked the <b>news calendar</b>. No high-impact news during the trade' },
    { g: 'Before the session', id: 'levels', t: { london: 'Marked the <b>Asia High and Low</b>', ny: 'Marked the <b>Asia and London Highs and Lows</b>' } },
    { g: 'Before the session', id: 'calm', t: 'Calm. No frustration from earlier trades' },
    { g: 'Setup', id: 'h4', t: '<b>H4 direction</b> is clear' },
    { g: 'Setup', id: 'm15', t: '<b>15M agrees</b> with H4' },
    { g: 'Setup', id: 'sweep', t: { london: '<b>Asia High or Low taken out</b>', ny: '<b>London or Asia High/Low taken out after 15:30</b>' } },
    { g: 'Setup', id: 'choch', t: '<b>CHOCH</b> confirmed' },
    { g: 'Entry and risk', id: 'ltf', t: 'Entry on <b>5M or 1M</b>' },
    { g: 'Entry and risk', id: 'risk', t: 'Risk is <b>RISK%</b> of the account' },
    { g: 'Entry and risk', id: 'sl', t: '<b>Stop loss</b> placed' },
    { g: 'Entry and risk', id: 'tp', t: '<b>TP at 1:3 RR</b>, or close 80% at 1:3' }
  ];
  var CHECK_SHORT = { time: 'Session window', news: 'News check', levels: 'Levels marked', calm: 'Calm mind', h4: 'H4 direction', m15: '15M aligned', sweep: 'Liquidity taken', choch: 'CHOCH', ltf: '5M/1M entry', risk: 'Risk size', sl: 'Stop loss', tp: 'TP at 1:3' };
  var MOODS = ['Calm', 'Confident', 'Anxious', 'Frustrated', 'Greedy', 'Fearful', 'Bored', 'Tired'];

  // ---------- state ----------
  var S = {
    trades: [], settings: {}, skew: 0, tzoff: 0, csrf: '',
    view: 'today', active: null,
    calMonth: null, calSel: null,
    jf: { month: 'all', session: 'all', result: 'all', rules: 'all', pair: '' },
    range: 'all'
  };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v, sign) {
    v = Number(v) || 0;
    var s = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (v < 0) return '-' + s;
    return (sign && v > 0 ? '+' : '') + s;
  }
  function short(v) { v = Math.round(Number(v) || 0); return (v > 0 ? '+' : '') + v; }
  function rfmt(v) { if (v == null || isNaN(v)) return '—'; v = Math.round(v * 100) / 100; return (v > 0 ? '+' : '') + v + 'R'; }
  function cls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
  function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; }
  function pad(n) { return String(n).padStart(2, '0'); }

  // local "now" in the journal's time zone (server-defined), read with UTC getters
  function nowL() { return new Date(Date.now() + S.skew + S.tzoff * 1000); }
  function todayStr() { var d = nowL(); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function nowMin() { var d = nowL(); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function nowHM() { var d = nowL(); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function toMin(hm) { if (!hm) return null; var p = hm.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function windowOf(min) { for (var k in WINDOWS) if (min >= WINDOWS[k][0] && min < WINDOWS[k][1]) return k; return null; }
  function fmtDate(ds, opts) { var p = ds.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts || { day: 'numeric', month: 'short' })); }

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  // ---------- API ----------
  function api(action, body, isForm) {
    var opts = { method: body ? 'POST' : 'GET', headers: { 'X-CSRF': S.csrf }, credentials: 'same-origin' };
    if (body) {
      if (isForm) opts.body = body;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    return fetch('/api/app?action=' + action, opts).then(function (r) {
      if (r.status === 401) { location.href = '/login.html'; throw new Error('Signed out'); }
      return r.json().catch(function () { return { error: 'Server error (' + r.status + ')' }; }).then(function (j) {
        if (!r.ok || j.error) throw new Error(j.error || 'Request failed');
        return j;
      });
    });
  }

  function toast(msg, err) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2800);
  }

  function load() {
    return api('bootstrap').then(function (j) {
      S.trades = j.trades; S.settings = j.settings; S.csrf = j.csrf; S.mt5 = j.mt5 || {};
      S.skew = j.ts * 1000 - Date.now(); S.tzoff = j.tz_offset;
      derive();
    });
  }

  // ---------- derived data ----------
  function tradeR(t) {
    if (t.r_multiple != null) return t.r_multiple;
    if (t.risk_amount) return t.pnl / t.risk_amount;
    return null;
  }
  function plannedRR(t) {
    if (t.entry == null || t.sl == null || t.tp == null) return null;
    var risk = Math.abs(t.entry - t.sl); if (!risk) return null;
    return Math.abs(t.tp - t.entry) / risk;
  }
  function checkCount(t) { var c = t.checklist || {}; var n = 0; CHECK.forEach(function (x) { if (c[x.id]) n++; }); return n; }

  function derive() {
    S.trades.sort(function (a, b) {
      return a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 :
        (a.trade_time || '99') < (b.trade_time || '99') ? -1 : (a.trade_time || '99') > (b.trade_time || '99') ? 1 : a.id - b.id;
    });
    var bal = S.settings.start_balance, byDay = {};
    S.trades.forEach(function (t) {
      var d = byDay[t.trade_date] || (byDay[t.trade_date] = { L: 0, win: {} });
      var f = [];
      var m = toMin(t.trade_time);
      if (m != null && !windowOf(m)) f.push({ k: 'window', l: 'Outside window' });
      if (d.L >= 2) f.push({ k: 'after2L', l: 'After 2 losses' });
      if (d.win[t.session]) f.push({ k: 'afterWin', l: 'After session win' });
      var pending = t.source === 'mt5' && !t.reviewed;
      var cc = checkCount(t);
      if (pending) f.push({ k: 'review', l: 'Needs review' });
      else if (cc < CHECK.length) f.push({ k: 'checklist', l: 'Checklist ' + cc + '/' + CHECK.length });
      if (t.emotional) f.push({ k: 'emotional', l: 'Emotional / revenge' });
      if (!t.followed_plan) f.push({ k: 'plan', l: 'Broke plan' });
      var rr = plannedRR(t); if (rr != null && rr < 2.9) f.push({ k: 'rr', l: 'RR 1:' + (Math.round(rr * 10) / 10) });
      if (t.risk_amount && bal > 0 && t.risk_amount > bal * S.settings.risk_pct / 100 * 1.05) f.push({ k: 'risk', l: 'Over-risked' });
      t._ = { before: bal, after: bal + t.pnl, R: tradeR(t), rr: rr, flags: f, clean: f.length === 0, cc: cc, pending: pending };
      bal += t.pnl;
      if (t.result === 'L') d.L++;
      if (t.result === 'W') d.win[t.session] = true;
    });
    S.balance = bal;
  }

  function aggregate(list) {
    var a = { n: list.length, W: 0, L: 0, B: 0, pnl: 0, R: 0, gw: 0, gl: 0, maxW: 0, maxL: 0, streakW: 0, streakL: 0 };
    var cw = 0, cl = 0;
    list.forEach(function (t) {
      a[t.result]++; a.pnl += t.pnl; a.R += t._.R || 0;
      if (t.pnl > 0) a.gw += t.pnl; else a.gl += -t.pnl;
      if (t.pnl > a.maxW) a.maxW = t.pnl; if (t.pnl < a.maxL) a.maxL = t.pnl;
      if (t.result === 'W') { cw++; cl = 0; } else if (t.result === 'L') { cl++; cw = 0; }
      a.streakW = Math.max(a.streakW, cw); a.streakL = Math.max(a.streakL, cl);
    });
    a.wr = a.W + a.L ? a.W / (a.W + a.L) : null;
    a.pf = a.gl ? a.gw / a.gl : (a.gw ? Infinity : null);
    a.avgW = a.W ? list.filter(function (t) { return t.result === 'W'; }).reduce(function (s, t) { return s + t.pnl; }, 0) / a.W : 0;
    a.avgL = a.L ? list.filter(function (t) { return t.result === 'L'; }).reduce(function (s, t) { return s + t.pnl; }, 0) / a.L : 0;
    a.expR = a.n ? a.R / a.n : null;
    return a;
  }

  function dayState(ds) {
    var list = S.trades.filter(function (t) { return t.trade_date === ds; });
    var st = { list: list, L: 0, W: { london: 0, ny: 0, other: 0 }, pnl: 0 };
    list.forEach(function (t) { if (t.result === 'L') st.L++; if (t.result === 'W') st.W[t.session]++; st.pnl += t.pnl; });
    return st;
  }

  function runTrades() {
    return S.trades.filter(function (t) { return t.trade_date >= S.settings.run_start; }).slice(0, S.settings.run_size);
  }

  // ---------- shared renderers ----------
  function flagHtml(t) {
    if (t._.clean) return '<span class="flag ok">Rules followed</span>';
    return t._.flags.map(function (f) { return '<span class="flag">' + esc(f.l) + '</span>'; }).join(' ');
  }
  function tradeRows(list, emptyMsg) {
    if (!list.length) return '<div class="empty">' + (emptyMsg || 'No trades yet.') + '</div>';
    return '<div class="tlist">' + list.map(function (t) {
      return '<div class="trow ' + t.result + '" data-id="' + t.id + '" tabindex="0" role="button">' +
        '<div class="d">' + fmtDate(t.trade_date) + '<br>' + esc(t.trade_time || '') + '</div>' +
        '<div style="min-width:0"><div class="p">' + esc(t.pair) + ' <span class="muted" style="font-size:14px">' + (t.direction === 'buy' ? 'Buy' : 'Sell') + ' · ' + SESSION_NAMES[t.session] + '</span></div>' +
        '<div class="sub">' + (t.source === 'mt5' ? '<span class="mt5">MT5</span>' : '') + flagHtml(t) + (t.shots.length ? '<span class="cam">' + t.shots.length + ' img</span>' : '') + (t.mood ? '<span class="cam">' + esc(t.mood) + '</span>' : '') + '</div></div>' +
        '<span class="pill ' + t.result + ' pl">' + { W: 'Win', L: 'Loss', B: 'BE' }[t.result] + '</span>' +
        '<div class="amt ' + cls(t.pnl) + '">' + money(t.pnl, true) + '<small>' + rfmt(t._.R) + '</small></div></div>';
    }).join('') + '</div>';
  }
  function bindRows(root) {
    $$('.trow', root).forEach(function (r) {
      var open = function () { openTrade(S.trades.find(function (t) { return t.id === +r.dataset.id; })); };
      r.addEventListener('click', open);
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    });
  }
  function checklistHtml(session, values, prefix, compact) {
    var html = '', g = null;
    CHECK.forEach(function (c) {
      if (!compact && c.g !== g) { if (g) html += '</div>'; g = c.g; html += '<div class="group"><h3>' + g + '</h3>'; }
      var txt = typeof c.t === 'string' ? c.t : (c.t[session] || c.t.london);
      txt = txt.replace('RISK%', S.settings.risk_pct + '%');
      var on = !!values[c.id], id = prefix + c.id;
      html += '<label class="item' + (on ? ' done' : '') + '" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + c.id + '"' + (on ? ' checked' : '') + '><span>' + txt + '</span></label>';
    });
    if (!compact) html += '</div>';
    return compact ? '<div class="cl-compact">' + html + '</div>' : html;
  }

  // ---------- views ----------
  var views = {};

  views.today = function (el) {
    var ds = todayStr(), st = dayState(ds), m = nowMin(), win = windowOf(m);
    if (!S.active) S.active = win || (m >= 800 ? 'ny' : 'london');
    var a = S.active, stopped = st.L >= 2, sessDone = st.W[a] >= 1;
    var clKey = 'wtj-cl-' + ds, cl = store(clKey) || { london: {}, ny: {} };
    var vals = cl[a] || {};
    var done = CHECK.filter(function (c) { return vals[c.id]; }).length;
    var goal = S.settings.goal, prog = goal ? Math.min(100, S.balance / goal * 100) : 0;
    var risk = Math.max(0, S.balance) * S.settings.risk_pct / 100;

    var banner = '';
    if (stopped) banner = '<div class="banner stop">2 losses today. I AM DONE. Close the charts.</div>';
    else if (st.W.london && st.W.ny) banner = '<div class="banner done">Won both sessions. I AM DONE for today.</div>';

    el.innerHTML =
      '<div class="panel-head" style="margin:0"><div><div class="eyebrow">' + fmtDate(ds, { weekday: 'long', day: 'numeric', month: 'long' }) + '</div><h1>Today</h1></div>' +
      '<div class="mono" style="font-size:24px" id="clk">' + nowHM() + '</div></div>' +
      '<div class="strip">' +
      '<div class="cell"><span class="lbl">Trading window</span><span class="val">' + (win ? SESSION_NAMES[win] + ' open' : 'Closed') + '</span>' + (win ? '<span class="pill open"><span class="dot"></span>You may trade</span>' : '<span class="pill closed"><span class="dot"></span>No trading now</span>') + '</div>' +
      '<div class="cell"><span class="lbl">Losses today</span><span class="val num">' + st.L + ' / 2</span>' + (stopped ? '<span class="pill stop">Limit hit</span>' : st.L === 1 ? '<span class="pill gold">One more = done</span>' : '<span class="pill closed">Clean</span>') + '</div>' +
      '<div class="cell"><span class="lbl">Today P&amp;L</span><span class="val num ' + cls(st.pnl) + '">' + money(st.pnl, true) + '</span><span class="muted" style="font-size:13px">London ' + st.W.london + 'W · NY ' + st.W.ny + 'W</span></div>' +
      '<div class="cell"><span class="lbl">Balance → ' + money(goal) + '</span><span class="val num">' + money(S.balance) + '</span><div class="progress"><i style="width:' + prog + '%"></i></div></div>' +
      '</div>' + banner + (function () {
        var n = S.trades.filter(function (t) { return t._.pending; }).length;
        return n ? '<a class="notice" href="#journal" id="reviewLink"><b>' + n + ' MT5 trade' + (n > 1 ? 's' : '') + ' to review.</b> Add your checklist, mood and notes so they count in your stats.</a>' : '';
      })() +
      '<div class="grid2">' +
      '<section class="panel"><div class="panel-head"><h2>Pre-trade checklist</h2><div class="tabs" role="tablist">' +
      '<button class="tab" role="tab" data-s="london" aria-selected="' + (a === 'london') + '">London<small>11:00–12:00</small></button>' +
      '<button class="tab" role="tab" data-s="ny" aria-selected="' + (a === 'ny') + '">NY<small>15:30–17:30</small></button></div></div>' +
      (stopped || sessDone ? '<div class="banner ' + (stopped ? 'stop' : 'done') + '" style="font-size:16px;margin-bottom:12px">' + (stopped ? 'Day is over. No more trades.' : SESSION_NAMES[a] + ' session won. I AM DONE for this session.') + '</div>' : '') +
      '<div id="cl">' + checklistHtml(a, vals, 'cl-', false) + '</div>' +
      '<div class="verdict"><div class="progress"><i style="width:' + (done / CHECK.length * 100) + '%"></i></div>' +
      '<span class="go' + (done === CHECK.length ? ' ok' : '') + '">' + (done === CHECK.length ? 'All ' + CHECK.length + ' checked. Clear to enter' : done + ' of ' + CHECK.length + ' checked') + '</span></div>' +
      '<div class="verdict" style="border:0;padding-top:0;justify-content:space-between"><span class="muted" style="font-size:14px">Risk for this trade: <b class="mono">' + money(risk) + '</b> · 1:3 target <b class="mono">' + money(risk * 3) + '</b></span>' +
      '<button class="btn primary" id="logFromCl">Log this trade</button></div></section>' +
      '<div style="display:flex;flex-direction:column;gap:18px;min-width:0">' +
      '<section class="panel"><div class="panel-head"><h2>Today\'s trades</h2></div><div id="todayList">' + tradeRows(st.list, 'No trades today.') + '</div></section>' +
      '<div class="mind"><strong>NO REVENGE TRADE. NO EMOTIONAL TRADE.</strong><span class="muted">This will make you poor the rest of your life.</span></div>' +
      '</div></div>';

    $$('.tab', el).forEach(function (b) { b.onclick = function () { S.active = b.dataset.s; render(); }; });
    $$('#cl input', el).forEach(function (i) {
      i.onchange = function () { cl[a] = cl[a] || {}; cl[a][i.dataset.k] = i.checked; store(clKey, cl); render(); };
    });
    var rl = $('#reviewLink', el); if (rl) rl.onclick = function () { S.jf.rules = 'review'; };
    $('#logFromCl', el).onclick = function () {
      openTrade(null, { session: a, checklist: Object.assign({}, vals), clearKey: [clKey, a] });
    };
    bindRows(el);
  };

  views.journal = function (el) {
    var f = S.jf;
    var months = []; S.trades.forEach(function (t) { var mo = t.trade_date.slice(0, 7); if (months.indexOf(mo) < 0) months.push(mo); });
    months.reverse();
    var list = S.trades.filter(function (t) {
      return (f.month === 'all' || t.trade_date.slice(0, 7) === f.month) &&
        (f.session === 'all' || t.session === f.session) &&
        (f.result === 'all' || t.result === f.result) &&
        (f.rules === 'all' || (f.rules === 'review' ? t._.pending : !t._.pending && (f.rules === 'clean') === t._.clean)) &&
        (!f.pair || t.pair.indexOf(f.pair.toUpperCase()) >= 0);
    }).slice().reverse();
    var ag = aggregate(list);
    var sel = function (id, opts, v) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };

    el.innerHTML =
      '<div class="panel-head" style="margin:0"><div><div class="eyebrow">All entries</div><h1>Journal</h1></div><a class="btn" href="/api/app?action=export">Export CSV</a></div>' +
      '<section class="panel"><div class="filters">' +
      '<label class="f">Month' + sel('fMonth', [['all', 'All months']].concat(months.map(function (m) { return [m, fmtDate(m + '-01', { month: 'long', year: 'numeric' })]; })), f.month) + '</label>' +
      '<label class="f">Session' + sel('fSess', [['all', 'All'], ['london', 'London'], ['ny', 'New York'], ['other', 'Other']], f.session) + '</label>' +
      '<label class="f">Result' + sel('fRes', [['all', 'All'], ['W', 'Wins'], ['L', 'Losses'], ['B', 'Breakeven']], f.result) + '</label>' +
      '<label class="f">Rules' + sel('fRules', [['all', 'All trades'], ['clean', 'Rules followed'], ['broken', 'Rules broken'], ['review', 'Needs review (MT5)']], f.rules) + '</label>' +
      '<label class="f">Pair<input id="fPair" value="' + esc(f.pair) + '" placeholder="e.g. XAU"></label>' +
      '</div><div class="row" style="margin-top:12px;gap:18px;font-size:14px">' +
      '<span><b class="mono">' + ag.n + '</b> trades</span><span>Win rate <b class="mono">' + (ag.wr == null ? '—' : Math.round(ag.wr * 100) + '%') + '</b></span>' +
      '<span>Net <b class="mono ' + cls(ag.pnl) + '">' + money(ag.pnl, true) + '</b></span><span>Net <b class="mono ' + cls(ag.R) + '">' + rfmt(ag.R) + '</b></span></div></section>' +
      '<section class="panel" id="jList">' + tradeRows(list, S.trades.length ? 'No trades match these filters.' : 'No trades yet. Use “+ New trade” to log your first one.') + '</section>';

    var upd = function () { f.month = $('#fMonth').value; f.session = $('#fSess').value; f.result = $('#fRes').value; f.rules = $('#fRules').value; f.pair = $('#fPair').value; render(); var p = $('#fPair'); if (document.activeElement !== p && upd.typing) { p.focus(); p.setSelectionRange(p.value.length, p.value.length); } };
    ['#fMonth', '#fSess', '#fRes', '#fRules'].forEach(function (s) { $(s, el).onchange = upd; });
    $('#fPair', el).oninput = function () { upd.typing = true; upd(); upd.typing = false; };
    bindRows(el);
  };

  function equitySvg(list) {
    var start = list.length ? list[0]._.before : S.settings.start_balance;
    var pts = [start].concat(list.map(function (t) { return t._.after; }));
    var W = 800, H = 260, L = 64, R = 14, T = 16, B = 28;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), goal = S.settings.goal;
    var showGoal = goal && goal <= hi * 1.35 && goal >= lo;
    if (showGoal) hi = Math.max(hi, goal);
    if (hi === lo) { hi += 10; lo -= 10; }
    var padv = (hi - lo) * 0.08; hi += padv; lo = Math.max(lo - padv, lo < 0 ? lo - padv : 0);
    var x = function (i) { return L + (pts.length > 1 ? i / (pts.length - 1) : 0.5) * (W - L - R); };
    var y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var step = niceStep((hi - lo) / 4), g = '';
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">$' + Math.round(v).toLocaleString('en-US') + '</text>';
    }
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p).toFixed(1); }).join(' ');
    var area = d + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - B) + ' L' + x(0).toFixed(1) + ' ' + (H - B) + ' Z';
    var last = pts[pts.length - 1];
    var dots = list.length <= 60 ? list.map(function (t, i) { return '<circle cx="' + x(i + 1) + '" cy="' + y(t._.after) + '" r="3" fill="' + (t.result === 'W' ? 'var(--win)' : t.result === 'L' ? 'var(--loss)' : 'var(--be)') + '"/>'; }).join('') : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Equity curve">' + g +
      (showGoal ? '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(goal) + '" y2="' + y(goal) + '" stroke="var(--gold)" stroke-dasharray="6 5" stroke-width="1.5"/><text x="' + (W - R) + '" y="' + (y(goal) - 6) + '" text-anchor="end" style="fill:var(--gold)">Goal ' + money(goal) + '</text>' : '') +
      '<path d="' + area + '" fill="var(--gold)" opacity=".12"/><path d="' + d + '" fill="none" stroke="var(--gold)" stroke-width="2.2" stroke-linejoin="round"/>' + dots +
      '<circle cx="' + x(pts.length - 1) + '" cy="' + y(last) + '" r="5" fill="var(--gold)" stroke="var(--panel)" stroke-width="2"/>' +
      '<text x="' + L + '" y="' + (H - 8) + '">Start</text><text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">Trade ' + list.length + '</text></svg>';
  }
  function niceStep(raw) { var p = Math.pow(10, Math.floor(Math.log10(raw || 1))); var n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  function groupTable(list, keyFn, label) {
    var groups = {};
    list.forEach(function (t) { var k = keyFn(t); (groups[k] = groups[k] || []).push(t); });
    var keys = Object.keys(groups);
    if (!keys.length) return '<div class="empty">No data yet.</div>';
    keys.sort(function (a, b) { return groups[b].length - groups[a].length; });
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + label + '</th><th class="n">Trades</th><th class="n">Win rate</th><th class="n">Net $</th><th class="n">Net R</th></tr></thead><tbody>' +
      keys.map(function (k) { var a = aggregate(groups[k]); return '<tr><td>' + esc(k) + '</td><td class="n">' + a.n + '</td><td class="n">' + (a.wr == null ? '—' : Math.round(a.wr * 100) + '%') + '</td><td class="n ' + cls(a.pnl) + '">' + money(a.pnl, true) + '</td><td class="n ' + cls(a.R) + '">' + rfmt(a.R) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  views.stats = function (el) {
    var ds = todayStr(), list = S.trades;
    if (S.range === 'month') list = list.filter(function (t) { return t.trade_date.slice(0, 7) === ds.slice(0, 7); });
    if (S.range === 'run') list = runTrades();
    if (S.range === '30') { var d = nowL(); d.setUTCDate(d.getUTCDate() - 30); var c = d.toISOString().slice(0, 10); list = list.filter(function (t) { return t.trade_date > c; }); }
    var a = aggregate(list);
    // max drawdown on balance
    var peak = list.length ? list[0]._.before : 0, mdd = 0, mddPct = 0;
    list.forEach(function (t) { peak = Math.max(peak, t._.before, t._.after); var dd = peak - t._.after; if (dd > mdd) { mdd = dd; mddPct = peak ? dd / peak : 0; } });

    var rlist = list.filter(function (t) { return !t._.pending; }), pendingN = list.length - rlist.length;
    var clean = rlist.filter(function (t) { return t._.clean; }), broken = rlist.filter(function (t) { return !t._.clean; });
    var ac = aggregate(clean), ab = aggregate(broken);
    var flagStats = {};
    rlist.forEach(function (t) { t._.flags.forEach(function (f) { var k = f.k === 'checklist' ? 'Checklist incomplete' : f.k === 'rr' ? 'TP below 1:3' : f.l; (flagStats[k] = flagStats[k] || []).push(t); }); });
    var skipStats = CHECK.map(function (c) { var miss = rlist.filter(function (t) { return !(t.checklist || {})[c.id]; }); return { c: c, list: miss }; }).filter(function (x) { return x.list.length; });

    var run = runTrades(), rs = S.settings.run_size, slots = '';
    for (var i = 0; i < rs; i++) { var t = run[i]; slots += '<div class="slot ' + (t ? t.result : '') + '" title="' + (t ? esc(t.trade_date + ' ' + t.pair + ' ' + money(t.pnl, true)) : '') + '">' + (t ? t.result : i + 1) + '</div>'; }
    var ra = aggregate(run);

    var tile = function (l, v, extra, numCls) { return '<div class="cell"><span class="lbl">' + l + '</span><span class="val num ' + (numCls || '') + '">' + v + '</span>' + (extra || '') + '</div>'; };
    var cmpCell = function (title, ag, good) {
      return '<div class="cell ' + (good ? 'good' : 'bad') + '"><span class="lbl">' + title + '</span><span class="val num ' + cls(ag.pnl) + '">' + money(ag.pnl, true) + '</span>' +
        '<span style="font-size:14px"><b class="mono">' + ag.n + '</b> trades · win rate <b class="mono">' + (ag.wr == null ? '—' : Math.round(ag.wr * 100) + '%') + '</b> · <b class="mono">' + rfmt(ag.R) + '</b></span></div>';
    };
    var flagRows = Object.keys(flagStats).sort(function (x, y) { return flagStats[y].length - flagStats[x].length; }).map(function (k) {
      var g = aggregate(flagStats[k]); return '<tr><td>' + esc(k) + '</td><td class="n">' + g.n + '</td><td class="n">' + (g.wr == null ? '—' : Math.round(g.wr * 100) + '%') + '</td><td class="n ' + cls(g.pnl) + '">' + money(g.pnl, true) + '</td></tr>';
    }).join('');
    var skipRows = skipStats.sort(function (x, y) { return y.list.length - x.list.length; }).map(function (s) {
      var g = aggregate(s.list); return '<tr><td>' + CHECK_SHORT[s.c.id] + '</td><td class="n">' + g.n + '</td><td class="n">' + (g.wr == null ? '—' : Math.round(g.wr * 100) + '%') + '</td><td class="n ' + cls(g.pnl) + '">' + money(g.pnl, true) + '</td></tr>';
    }).join('');

    var rangeBtn = function (k, l) { return '<button class="tab" data-r="' + k + '" aria-selected="' + (S.range === k) + '">' + l + '</button>'; };
    var goal = S.settings.goal;

    el.innerHTML =
      '<div class="panel-head" style="margin:0"><div><div class="eyebrow">Performance</div><h1>Stats</h1></div><div class="tabs">' +
      rangeBtn('all', 'All time') + rangeBtn('month', 'This month') + rangeBtn('30', 'Last 30 days') + rangeBtn('run', 'Current run') + '</div></div>' +
      '<div class="strip">' +
      tile('Balance', money(S.balance), '<div class="progress"><i style="width:' + (goal ? Math.min(100, S.balance / goal * 100) : 0) + '%"></i></div><span class="muted" style="font-size:12px">' + (S.balance >= goal ? 'Goal reached' : money(goal - S.balance) + ' to ' + money(goal)) + '</span>') +
      tile('Net P&amp;L', money(a.pnl, true), '<span class="muted" style="font-size:12px">' + a.n + ' trades · ' + a.W + 'W ' + a.L + 'L ' + a.B + 'BE</span>', cls(a.pnl)) +
      tile('Win rate', a.wr == null ? '—' : Math.round(a.wr * 100) + '%', '<span class="muted" style="font-size:12px">Break-even at 1:3 is 25%</span>') +
      tile('Net R', rfmt(a.R), '<span class="muted" style="font-size:12px">Expectancy ' + rfmt(a.expR) + ' / trade</span>', cls(a.R)) +
      tile('Profit factor', a.pf == null ? '—' : a.pf === Infinity ? '∞' : a.pf.toFixed(2)) +
      tile('Avg win / loss', money(a.avgW) + ' / ' + money(a.avgL)) +
      tile('Max drawdown', '-' + money(mdd), '<span class="muted" style="font-size:12px">' + Math.round(mddPct * 100) + '% from peak</span>', mdd ? 'neg' : '') +
      tile('Streaks', a.streakW + 'W / ' + a.streakL + 'L', '<span class="muted" style="font-size:12px">Longest win / loss run</span>') +
      '</div>' +
      '<section class="panel chart"><div class="panel-head"><h2>Equity curve</h2><span class="muted" style="font-size:13px">Dots: <span class="pos">win</span> · <span class="neg">loss</span> · breakeven</span></div>' + equitySvg(list) + '</section>' +
      '<section class="panel"><div class="panel-head"><h2>Rule-break analysis</h2><span class="muted" style="font-size:13px">A trade is clean when no rule flag applies' + (pendingN ? '. ' + pendingN + ' MT5 trade' + (pendingN > 1 ? 's' : '') + ' not reviewed yet, not counted' : '') + '</span></div>' +
      '<div class="compare">' + cmpCell('Rules followed', ac, true) + cmpCell('Rules broken', ab, false) + '</div>' +
      '<div class="grid2" style="margin-top:16px;grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<div><h3 style="margin-bottom:6px">Results by broken rule</h3>' + (flagRows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rule broken</th><th class="n">Trades</th><th class="n">Win rate</th><th class="n">Net $</th></tr></thead><tbody>' + flagRows + '</tbody></table></div>' : '<div class="empty">No rule breaks. Keep it that way.</div>') + '</div>' +
      '<div><h3 style="margin-bottom:6px">Checklist items skipped</h3>' + (skipRows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item not ticked</th><th class="n">Trades</th><th class="n">Win rate</th><th class="n">Net $</th></tr></thead><tbody>' + skipRows + '</tbody></table></div>' : '<div class="empty">Every checklist item ticked on every trade.</div>') + '</div>' +
      '</div></section>' +
      '<section class="panel"><div class="panel-head"><div><div class="eyebrow">Rule 4</div><h2>' + rs + '-trade run since ' + fmtDate(S.settings.run_start, { day: 'numeric', month: 'short', year: 'numeric' }) + '</h2></div>' +
      '<span style="font-size:14px"><b class="mono">' + run.length + '/' + rs + '</b> · win rate <b class="mono">' + (ra.wr == null ? '—' : Math.round(ra.wr * 100) + '%') + '</b> · <b class="mono ' + cls(ra.R) + '">' + rfmt(ra.R) + '</b></span></div>' +
      '<div class="tape">' + slots + '</div></section>' +
      '<div class="grid2" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<section class="panel"><h2 style="margin-bottom:10px">By session</h2>' + groupTable(list, function (t) { return SESSION_NAMES[t.session]; }, 'Session') + '</section>' +
      '<section class="panel"><h2 style="margin-bottom:10px">By pair</h2>' + groupTable(list, function (t) { return t.pair; }, 'Pair') + '</section>' +
      '<section class="panel"><h2 style="margin-bottom:10px">By mood before trade</h2>' + groupTable(list.filter(function (t) { return t.mood; }), function (t) { return t.mood; }, 'Mood') + '</section>' +
      '<section class="panel"><h2 style="margin-bottom:10px">By weekday</h2>' + groupTable(list, function (t) { return fmtDate(t.trade_date, { weekday: 'long' }); }, 'Day') + '</section>' +
      '</div>';
    $$('[data-r]', el).forEach(function (b) { b.onclick = function () { S.range = b.dataset.r; render(); }; });
  };

  views.calendar = function (el) {
    var ds = todayStr();
    if (!S.calMonth) S.calMonth = ds.slice(0, 7);
    var y = +S.calMonth.slice(0, 4), mo = +S.calMonth.slice(5, 7);
    var first = new Date(Date.UTC(y, mo - 1, 1)), startDow = (first.getUTCDay() + 6) % 7; // Monday first
    var gridStart = new Date(Date.UTC(y, mo - 1, 1 - startDow));
    var byDay = {};
    S.trades.forEach(function (t) { var d = byDay[t.trade_date] || (byDay[t.trade_date] = { pnl: 0, n: 0, list: [] }); d.pnl += t.pnl; d.n++; d.list.push(t); });
    var cells = '', monthPnl = 0, monthN = 0, wd = 0;
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week'].forEach(function (h) { cells += '<div class="hd">' + h + '</div>'; });
    for (var w = 0; w < 6; w++) {
      var wk = 0, wn = 0, any = false;
      for (var i = 0; i < 7; i++) {
        var d = new Date(gridStart.getTime() + (w * 7 + i) * 864e5), key = d.toISOString().slice(0, 10), inM = d.getUTCMonth() === mo - 1;
        if (inM) any = true;
        var info = byDay[key];
        if (inM && info) { monthPnl += info.pnl; monthN += info.n; wk += info.pnl; wn += info.n; if (info.pnl > 0) wd++; }
        cells += '<div class="day' + (inM ? '' : ' out') + (info && inM ? ' ' + cls(info.pnl) : '') + (key === ds ? ' today' : '') + (key === S.calSel ? ' sel' : '') + '" data-d="' + (inM ? key : '') + '">' +
          '<span class="dn">' + d.getUTCDate() + '</span>' + (info && inM ? '<span class="v ' + cls(info.pnl) + '"><span class="full">' + money(info.pnl, true) + '</span><span class="short">' + short(info.pnl) + '</span></span><span class="c">' + info.n + ' trade' + (info.n > 1 ? 's' : '') + '</span>' : '') + '</div>';
      }
      cells += '<div class="wk"><span class="' + cls(wk) + '">' + (wn ? '<span class="full">' + money(wk, true) + '</span><span class="short">' + short(wk) + '</span>' : '—') + '</span><small>' + (wn ? wn + ' trades' : '') + '</small></div>';
      if (!any && w > 3) break;
    }
    var tradedDays = Object.keys(byDay).filter(function (k) { return k.slice(0, 7) === S.calMonth; }).length;
    var sel = S.calSel && byDay[S.calSel] ? byDay[S.calSel].list : [];

    el.innerHTML =
      '<div class="panel-head" style="margin:0"><div><div class="eyebrow">Daily P&amp;L</div><h1>' + fmtDate(S.calMonth + '-01', { month: 'long', year: 'numeric' }) + '</h1></div>' +
      '<div class="row"><button class="btn" id="calPrev" aria-label="Previous month">‹</button><button class="btn" id="calToday">This month</button><button class="btn" id="calNext" aria-label="Next month">›</button></div></div>' +
      '<div class="strip">' +
      '<div class="cell"><span class="lbl">Month P&amp;L</span><span class="val num ' + cls(monthPnl) + '">' + money(monthPnl, true) + '</span></div>' +
      '<div class="cell"><span class="lbl">Trades</span><span class="val num">' + monthN + '</span></div>' +
      '<div class="cell"><span class="lbl">Days traded</span><span class="val num">' + tradedDays + '</span></div>' +
      '<div class="cell"><span class="lbl">Green days</span><span class="val num">' + wd + ' / ' + tradedDays + '</span></div></div>' +
      '<section class="panel"><div class="cal">' + cells + '</div></section>' +
      (S.calSel ? '<section class="panel"><div class="panel-head"><h2>' + fmtDate(S.calSel, { weekday: 'long', day: 'numeric', month: 'long' }) + '</h2></div>' + tradeRows(sel, 'No trades on this day.') + '</section>' : '');

    var shift = function (n) { var d = new Date(Date.UTC(y, mo - 1 + n, 1)); S.calMonth = d.toISOString().slice(0, 7); S.calSel = null; render(); };
    $('#calPrev', el).onclick = function () { shift(-1); };
    $('#calNext', el).onclick = function () { shift(1); };
    $('#calToday', el).onclick = function () { S.calMonth = ds.slice(0, 7); S.calSel = null; render(); };
    $$('.day[data-d]', el).forEach(function (c) { if (c.dataset.d) c.onclick = function () { S.calSel = c.dataset.d; render(); }; });
    bindRows(el);
  };

  views.settings = function (el) {
    var s = S.settings;
    el.innerHTML =
      '<div><div class="eyebrow">Account</div><h1>Settings</h1></div>' +
      '<section class="panel"><h2 style="margin-bottom:4px">Appearance</h2><p class="muted" style="margin:0 0 12px;font-size:14px">Auto follows your phone or computer setting. Saved on this device.</p>' +
      '<div class="seg" id="themeSeg" style="max-width:360px">' + ['auto', 'light', 'dark'].map(function (m) {
        var cur = window.wtjTheme ? window.wtjTheme.get() : 'auto';
        return '<label><input type="radio" name="theme" value="' + m + '"' + (cur === m ? ' checked' : '') + '>' + { auto: 'Auto', light: 'Light', dark: 'Dark' }[m] + '</label>';
      }).join('') + '</div></section>' +
      '<section class="panel"><h2 style="margin-bottom:12px">Account and risk</h2><form id="setForm" class="stack">' +
      '<div class="fgrid">' +
      '<label class="f">Starting balance ($)<input id="sBal" type="number" step="0.01" min="0" value="' + s.start_balance + '"></label>' +
      '<label class="f">Risk per trade (%)<input id="sRisk" type="number" step="0.1" min="0.1" max="100" value="' + s.risk_pct + '"></label>' +
      '<label class="f">Balance goal ($)<input id="sGoal" type="number" step="1" min="0" value="' + s.goal + '"></label>' +
      '<label class="f">&nbsp;<span class="muted" style="text-transform:none;letter-spacing:0;font-size:13px">Balance now: <b class="mono">' + money(S.balance) + '</b></span></label>' +
      '<label class="f">Run starts on<input id="sRun" type="date" value="' + s.run_start + '"></label>' +
      '<label class="f">Run length (trades)<input id="sRunN" type="number" min="1" max="500" value="' + s.run_size + '"></label>' +
      '</div><div><button class="btn primary" type="submit">Save settings</button></div></form></section>' +
      '<section class="panel"><h2 style="margin-bottom:12px">Change password</h2><form id="pwForm" class="stack"><div class="fgrid">' +
      '<label class="f s2">Current password<input id="pwOld" type="password" autocomplete="current-password"></label>' +
      '<label class="f s2">New password (8+ characters)<input id="pwNew" type="password" minlength="8" autocomplete="new-password"></label>' +
      '</div><div><button class="btn" type="submit">Change password</button></div></form></section>' +
      mt5Section() +
      '<section class="panel"><h2 style="margin-bottom:12px">Data</h2><div class="row"><a class="btn" href="/api/app?action=export">Export all trades (CSV)</a><a class="btn danger" href="/api/auth?action=logout">Sign out</a></div></section>';

    $$('#themeSeg input', el).forEach(function (r) { r.onchange = function () { if (window.wtjTheme) window.wtjTheme.set(r.value); }; });
    $('#setForm', el).onsubmit = function (e) {
      e.preventDefault();
      api('save_settings', { start_balance: $('#sBal').value, risk_pct: $('#sRisk').value, goal: $('#sGoal').value, run_start: $('#sRun').value, run_size: $('#sRunN').value })
        .then(function (j) { S.settings = j.settings; derive(); render(); toast('Settings saved'); })
        .catch(function (err) { toast(err.message, true); });
    };
    bindMt5(el);
    $('#pwForm', el).onsubmit = function (e) {
      e.preventDefault();
      api('save_settings', { current_password: $('#pwOld').value, new_password: $('#pwNew').value })
        .then(function () { $('#pwOld').value = ''; $('#pwNew').value = ''; toast('Password changed'); })
        .catch(function (err) { toast(err.message, true); });
    };
  };

  function syncUrl() {
    return location.origin + '/api/sync';
  }
  function mt5Section() {
    var m = S.mt5 || {}, key = m.key || '';
    var fld = function (id, label, val, secret) {
      return '<label class="f s2">' + label + '<div class="row" style="flex-wrap:nowrap"><input id="' + id + '" class="mono" readonly value="' + esc(val) + '"' + (secret ? ' type="password"' : '') + '>' +
        (secret ? '<button class="btn small" type="button" id="mShow">Show</button>' : '') +
        '<button class="btn small" type="button" data-copy="' + id + '">Copy</button></div></label>';
    };
    return '<section class="panel"><div class="panel-head"><div><div class="eyebrow">MetaTrader 5</div><h2>MT5 sync</h2></div>' +
      (m.last_sync ? '<span class="pill open"><span class="dot"></span>Last sync ' + esc(m.last_sync.slice(0, 16)) + '</span>' : '<span class="pill closed">Not connected yet</span>') + '</div>' +
      (m.last_account ? '<p class="muted" style="margin:-4px 0 12px;font-size:14px">Account ' + esc(m.last_account) + '</p>' : '') +
      '<div class="fgrid">' + fld('mUrl', 'Sync URL', syncUrl(), false) +
      (key ? fld('mKey', 'Sync key', key, true) : '<label class="f s2">Sync key<span class="muted" style="text-transform:none;letter-spacing:0;font-size:14px;padding:8px 0">No key yet. Create one to connect MT5.</span></label>') +
      '</div><div class="row" style="margin-top:12px">' +
      '<a class="btn primary" href="/mt5/WakandaJournalSync.mq5" download>Download MT5 sync EA</a>' +
      '<button class="btn" type="button" id="mGen">' + (key ? 'Replace key' : 'Create sync key') + '</button>' +
      '<span class="row" id="mGenConfirm" hidden><span class="muted" style="font-size:14px">Your EA stops syncing until you paste the new key.</span><button class="btn danger small" type="button" id="mGenYes">Replace</button><button class="btn small" type="button" id="mGenNo">Cancel</button></span>' +
      '</div>' +
      '<ol class="steps">' +
      '<li>In MT5 (desktop), open <b>File &gt; Open Data Folder</b>, go to <b>MQL5 &gt; Experts</b> and put the downloaded file there.</li>' +
      '<li>In the Navigator, right-click <b>Expert Advisors</b> and choose <b>Refresh</b>. If it does not appear, open the file in <b>MetaEditor</b> and press <b>Compile</b> (F7).</li>' +
      '<li>Open <b>Tools &gt; Options &gt; Expert Advisors</b>, tick <b>Allow WebRequest for listed URL</b> and add <b class="mono">' + esc(location.origin) + '</b> (your Vercel address, with https).</li>' +
      '<li>Drag <b>WakandaJournalSync</b> onto any one chart. On the <b>Inputs</b> tab paste the Sync URL and Sync key. Turn on <b>Algo Trading</b>.</li>' +
      '<li>Closed trades appear here within a few minutes, marked <span class="mt5">MT5</span> and <b>Needs review</b>. Open each one to add your checklist and notes.</li>' +
      '</ol><p class="muted" style="font-size:13px;margin:8px 0 0">The EA only reads your trade history. It never opens, changes or closes trades. MT5 must be running on a computer or VPS for syncing; the MT5 phone app cannot run EAs.</p></section>';
  }
  function bindMt5(el) {
    $$('[data-copy]', el).forEach(function (b) {
      b.onclick = function () {
        var inp = $('#' + b.dataset.copy);
        var done = function () { toast('Copied'); };
        if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done, function () { inp.type = 'text'; inp.select(); });
        else { inp.type = 'text'; inp.select(); document.execCommand('copy'); done(); }
      };
    });
    var show = $('#mShow', el);
    if (show) show.onclick = function () { var k = $('#mKey'); k.type = k.type === 'password' ? 'text' : 'password'; show.textContent = k.type === 'password' ? 'Show' : 'Hide'; };
    var gen = function () {
      api('mt5_key', {}).then(function (j) { S.mt5.key = j.key; render(); toast('Sync key ready. Paste it into the EA.'); var k = $('#mKey'); if (k) { k.type = 'text'; } })
        .catch(function (err) { toast(err.message, true); });
    };
    $('#mGen', el).onclick = function () { if (S.mt5 && S.mt5.key) $('#mGenConfirm').hidden = false; else gen(); };
    var y = $('#mGenYes', el), n = $('#mGenNo', el);
    if (y) y.onclick = gen;
    if (n) n.onclick = function () { $('#mGenConfirm').hidden = true; };
  }

  // Resize big chart screenshots before upload (max 1920px, JPEG) so they stay small and fast.
  function shrinkImage(file) {
    var LIMIT = 3.8 * 1024 * 1024;
    if (!/^image\//.test(file.type) || file.type === 'image/gif') {
      return file.size <= LIMIT ? Promise.resolve(file) : Promise.reject(new Error('Image is larger than 4 MB.'));
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 1920, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        if (k === 1 && file.size <= 600 * 1024) { resolve(file); return; }
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (b && b.size <= LIMIT) resolve(b);
          else if (file.size <= LIMIT) resolve(file);
          else reject(new Error('Image is too large even after resizing.'));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); file.size <= LIMIT ? resolve(file) : reject(new Error('Could not read this image.')); };
      img.src = url;
    });
  }

  // ---------- trade dialog ----------
  function openTrade(t, preset) {
    var isNew = !t;
    preset = preset || {};
    var bal = S.balance;
    var defRisk = Math.round(Math.max(0, bal) * S.settings.risk_pct) / 100;
    var tm = nowHM();
    t = t || {
      id: 0, trade_date: todayStr(), trade_time: tm, session: preset.session || windowOf(toMin(tm)) || 'other',
      pair: store('wtj-lastpair') || 'XAUUSD', direction: 'buy', entry: null, sl: null, tp: null, lot: null,
      risk_amount: defRisk, pnl: null, r_multiple: null, result: 'W', checklist: preset.checklist || {},
      emotional: 0, followed_plan: 1, mood: '', notes: '', lessons: '', shots: []
    };
    var v = function (x) { return x == null ? '' : esc(x); };
    var radio = function (name, val, label, cur) { return '<label><input type="radio" name="' + name + '" value="' + val + '"' + (cur === val ? ' checked' : '') + '>' + label + '</label>'; };
    var saveLabel = isNew ? 'Save trade' : (t.source === 'mt5' && !t.reviewed ? 'Save and mark reviewed' : 'Save changes');
    var dlg = $('#tradeDlg');
    dlg.innerHTML =
      '<form method="dialog" id="tf" novalidate>' +
      '<div class="dlg-head"><div><div class="eyebrow">' + (isNew ? 'New entry' : fmtDate(t.trade_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) + '</div><h2>' + (isNew ? 'Log a trade' : esc(t.pair) + ' · ' + (t.direction === 'buy' ? 'Buy' : 'Sell')) + '</h2></div>' +
      '<button class="btn small" type="button" id="tfX">Close</button></div>' +
      '<div class="dlg-body">' +
      (!isNew ? '<div class="flags">' + flagHtml(t) + '</div>' : '') +
      (t.source === 'mt5' ? '<p class="mt5-note"><span class="mt5">MT5</span> Synced from account <b class="mono">' + esc(t.mt5_account) + '</b>, position <b class="mono">#' + esc(t.mt5_position) + '</b>' +
        (t.close_time ? '. Closed ' + esc(t.close_time.slice(0, 16)) + (t.close_price != null ? ' at <b class="mono">' + t.close_price + '</b>' : '') : '') +
        (t.reviewed ? '.' : '. Fill in the checklist and psychology, then save to mark it reviewed.') + '</p>' : '') +
      '<div class="sect"><h3>Trade</h3><div class="fgrid">' +
      '<label class="f">Date<input id="tDate" type="date" value="' + v(t.trade_date) + '" required></label>' +
      '<label class="f">Time (entry)<input id="tTime" type="time" value="' + v(t.trade_time) + '"></label>' +
      '<label class="f s2">Session<div class="seg">' + radio('sess', 'london', 'London', t.session) + radio('sess', 'ny', 'New York', t.session) + radio('sess', 'other', 'Other', t.session) + '</div></label>' +
      '<label class="f">Pair<input id="tPair" class="mono" value="' + v(t.pair) + '" required autocapitalize="characters"></label>' +
      '<label class="f">Direction<div class="seg">' + radio('dir', 'buy', 'Buy', t.direction) + radio('dir', 'sell', 'Sell', t.direction) + '</div></label>' +
      '<label class="f">Lot size<input id="tLot" type="number" step="0.01" min="0" value="' + v(t.lot) + '"></label>' +
      '<label class="f">Risk ($)<input id="tRisk" type="number" step="0.01" min="0" value="' + v(t.risk_amount) + '"></label>' +
      '<label class="f">Entry<input id="tEntry" type="number" step="any" value="' + v(t.entry) + '"></label>' +
      '<label class="f">Stop loss<input id="tSl" type="number" step="any" value="' + v(t.sl) + '"></label>' +
      '<label class="f">Take profit<input id="tTp" type="number" step="any" value="' + v(t.tp) + '"></label>' +
      '<label class="f">Planned RR<span class="mono" id="tRR" style="padding:8px 0;font-size:16px;text-transform:none">—</span></label>' +
      '</div></div>' +
      '<div class="sect"><h3>Result</h3><div class="fgrid">' +
      '<label class="f s2">Outcome<div class="seg res">' + radio('res', 'W', 'Win', t.result) + radio('res', 'B', 'Breakeven', t.result) + radio('res', 'L', 'Loss', t.result) + '</div></label>' +
      '<label class="f">P&amp;L ($)<input id="tPnl" type="number" step="0.01" value="' + v(t.pnl) + '" placeholder="-12.50" required></label>' +
      '<label class="f">R multiple<input id="tR" type="number" step="0.01" value="' + v(t.r_multiple) + '" placeholder="auto"></label>' +
      '</div></div>' +
      '<div class="sect"><h3>Setup checklist</h3><div id="tCl">' + checklistHtml(t.session === 'ny' ? 'ny' : 'london', t.checklist || {}, 'tc-', true) + '</div></div>' +
      '<div class="sect"><h3>Psychology</h3><div class="fgrid">' +
      '<label class="f">Mood before<select id="tMood"><option value="">—</option>' + MOODS.map(function (m) { return '<option' + (t.mood === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></label>' +
      '<label class="f s2" style="justify-content:flex-end;gap:8px;text-transform:none;letter-spacing:0">' +
      '<span class="switch"><input type="checkbox" id="tPlan"' + (t.followed_plan ? ' checked' : '') + '> I followed my plan</span>' +
      '<span class="switch"><input type="checkbox" id="tEmo"' + (t.emotional ? ' checked' : '') + '> This was a revenge or emotional trade</span></label>' +
      '</div>' +
      '<label class="f">Notes (why I took it, what happened)<textarea id="tNotes">' + v(t.notes) + '</textarea></label>' +
      '<label class="f">Lessons learned<textarea id="tLessons">' + v(t.lessons) + '</textarea></label></div>' +
      '<div class="sect"><h3>Screenshots</h3>' +
      '<div class="shots" id="tShots">' + t.shots.map(function (s) { return '<div class="shot"><img src="/api/shot?id=' + s.id + '" alt="' + s.kind + ' screenshot" loading="lazy" data-full="/api/shot?id=' + s.id + '"><span>' + s.kind + '</span><button type="button" data-del="' + s.id + '" aria-label="Delete screenshot">×</button></div>'; }).join('') + '</div>' +
      '<div class="fgrid"><label class="f s2">Add “before” chart<input id="fBefore" type="file" accept="image/*" multiple></label>' +
      '<label class="f s2">Add “after” chart<input id="fAfter" type="file" accept="image/*" multiple></label></div></div>' +
      '</div>' +
      '<div class="dlg-foot">' + (isNew ? '<span></span>' : '<button class="btn danger" type="button" id="tDel">Delete trade</button>') +
      '<div class="row"><button class="btn" type="button" id="tfCancel">Cancel</button><button class="btn primary" type="submit" id="tfSave">' + saveLabel + '</button></div></div>' +
      '</form>';

    var rTouched = t.r_multiple != null, resTouched = !isNew;
    var close = function () { dlg.close(); };
    $('#tfX').onclick = close; $('#tfCancel').onclick = close;
    var upRR = function () {
      var e = parseFloat($('#tEntry').value), s = parseFloat($('#tSl').value), p = parseFloat($('#tTp').value);
      var rr = (!isNaN(e) && !isNaN(s) && !isNaN(p) && e !== s) ? Math.abs(p - e) / Math.abs(e - s) : null;
      $('#tRR').textContent = rr == null ? '—' : '1:' + (Math.round(rr * 100) / 100);
      $('#tRR').className = 'mono ' + (rr == null ? '' : rr >= 2.9 ? 'pos' : 'neg');
    };
    var upR = function () {
      if (rTouched) return;
      var p = parseFloat($('#tPnl').value), r = parseFloat($('#tRisk').value);
      $('#tR').value = (!isNaN(p) && r > 0) ? (Math.round(p / r * 100) / 100) : '';
    };
    ['#tEntry', '#tSl', '#tTp'].forEach(function (s) { $(s).oninput = upRR; });
    $('#tRisk').oninput = upR;
    $('#tPnl').oninput = function () {
      upR();
      if (!resTouched) { var p = parseFloat(this.value); if (!isNaN(p)) { var r = p > 0 ? 'W' : p < 0 ? 'L' : 'B'; $('input[name=res][value=' + r + ']').checked = true; } }
    };
    $('#tR').oninput = function () { rTouched = this.value !== ''; };
    $$('input[name=res]').forEach(function (r) { r.onchange = function () { resTouched = true; }; });
    $('#tTime').onchange = function () { var w = windowOf(toMin(this.value)); if (w) $('input[name=sess][value=' + w + ']').checked = true; };
    $$('#tCl input').forEach(function (i) { i.onchange = function () { i.closest('.item').classList.toggle('done', i.checked); }; });
    upRR(); if (isNew) upR();

    $$('#tShots img').forEach(function (im) { im.onclick = function () { $('#imgFull').src = im.dataset.full; $('#imgDlg').showModal(); }; });
    $$('#tShots [data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!window.confirm('Delete this screenshot?')) return;
        api('delete_shot', { id: +b.dataset.del }).then(function () {
          b.closest('.shot').remove(); t.shots = t.shots.filter(function (s) { return s.id !== +b.dataset.del; });
          toast('Screenshot deleted'); return load().then(render);
        }).catch(function (err) { toast(err.message, true); });
      };
    });
    if (!isNew) $('#tDel').onclick = function () {
      if (!window.confirm('Delete this trade and its screenshots? This cannot be undone.')) return;
      api('delete_trade', { id: t.id }).then(function () { close(); toast('Trade deleted'); return load().then(render); }).catch(function (err) { toast(err.message, true); });
    };

    $('#tf').onsubmit = function (e) {
      e.preventDefault();
      var checklist = {}; $$('#tCl input').forEach(function (i) { checklist[i.dataset.k] = i.checked; });
      var data = {
        id: t.id, trade_date: $('#tDate').value, trade_time: $('#tTime').value,
        session: ($('input[name=sess]:checked') || {}).value, pair: $('#tPair').value,
        direction: ($('input[name=dir]:checked') || {}).value, lot: $('#tLot').value, risk_amount: $('#tRisk').value,
        entry: $('#tEntry').value, sl: $('#tSl').value, tp: $('#tTp').value,
        result: ($('input[name=res]:checked') || {}).value, pnl: $('#tPnl').value, r_multiple: $('#tR').value,
        checklist: checklist, mood: $('#tMood').value, followed_plan: $('#tPlan').checked, emotional: $('#tEmo').checked,
        notes: $('#tNotes').value, lessons: $('#tLessons').value
      };
      var btn = $('#tfSave'); btn.disabled = true; btn.textContent = 'Saving…';
      api('save_trade', data).then(function (j) {
        store('wtj-lastpair', data.pair.toUpperCase());
        var files = [];
        Array.prototype.forEach.call($('#fBefore').files, function (f) { files.push([f, 'before']); });
        Array.prototype.forEach.call($('#fAfter').files, function (f) { files.push([f, 'after']); });
        var chain = Promise.resolve(), fails = 0;
        files.forEach(function (pair, i) {
          chain = chain.then(function () {
            btn.textContent = 'Uploading ' + (i + 1) + '/' + files.length + '…';
            return shrinkImage(pair[0]).then(function (blob) {
              return api('upload&trade_id=' + j.id + '&kind=' + pair[1], blob, true);
            }).catch(function (err) { fails++; toast(pair[0].name + ': ' + err.message, true); });
          });
        });
        return chain.then(function () {
          if (isNew && preset.clearKey) { var c = store(preset.clearKey[0]) || {}; c[preset.clearKey[1]] = {}; store(preset.clearKey[0], c); }
          return load();
        }).then(function () {
          close(); render();
          if (!fails) toast(isNew ? 'Trade saved' : 'Changes saved');
        });
      }).catch(function (err) { toast(err.message, true); btn.disabled = false; btn.textContent = saveLabel; });
    };
    dlg.showModal();
    dlg.scrollTop = 0;
  }

  // ---------- routing ----------
  function render() {
    var v = (location.hash || '#today').slice(1);
    if (!views[v]) v = 'today';
    S.view = v;
    $$('#nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.v === v); });
    var el = $('#view');
    var y = window.scrollY;
    views[v](el);
    if (render.lastView === v) window.scrollTo(0, y); else window.scrollTo(0, 0);
    render.lastView = v;
  }

  window.addEventListener('hashchange', render);
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.theme-btn') && S.view === 'settings') setTimeout(render, 0);
  });
  $('#newTradeBtn').onclick = function () { openTrade(null); };
  $('#imgClose').onclick = function () { $('#imgDlg').close(); };
  $('#imgDlg').addEventListener('click', function (e) { if (e.target === this) this.close(); });

  load().then(render).catch(function (err) {
    $('#view').innerHTML = '<div class="panel"><p class="alert">Could not load the journal: ' + esc(err.message) + '</p></div>';
  });

  // keep the Today clock and window status current
  setInterval(function () {
    if (S.view !== 'today' || document.querySelector('dialog[open]')) return;
    var c = $('#clk'); if (!c) return;
    var prev = c.dataset.w, w = String(windowOf(nowMin()));
    c.textContent = nowHM();
    if (prev !== undefined && prev !== w) render(); else c.dataset.w = w;
  }, 20000);
})();
