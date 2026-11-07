/* Trade journal — Today, Trades list, trade form, CSV/Excel import. */
(function () {
  'use strict';
  var T = window.TJ, S = T.S, $ = T.$, $$ = T.$$, esc = T.esc;

  function opt(list, cur, blank) {
    return (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }
  T.opt = opt;
  function withCur(list, cur) { return cur && list.indexOf(cur) < 0 ? list.concat([cur]) : list; }

  // ================= TODAY =================
  T.views.today = function (el) {
    var p = S.prefs, rules = p.rules, ds = T.todayStr(), m = T.nowMin(), win = T.windowAt(m);
    var todays = S.trades.filter(function (t) { return t.trade_date === ds && (t.account_type || 'live') === 'live'; });
    var st = { L: 0, W: {}, pnl: 0, n: todays.length };
    todays.forEach(function (t) { if (t.result === 'L') st.L++; if (t.result === 'W') st.W[t.session] = (st.W[t.session] || 0) + 1; st.pnl += t.pnl; });
    var active = p.windows.filter(function (w) { return w.active; });
    if (!S.activeWin || !active.find(function (w) { return w.id === S.activeWin; })) S.activeWin = (win && win.active ? win.id : (active[0] || {}).id) || 'other';
    var a = S.activeWin;
    var startBal = S.balance - st.pnl;
    var lossLimit = rules.daily_loss_pct ? startBal * rules.daily_loss_pct / 100 : 0;
    var stops = [];
    if (rules.max_losses_day && st.L >= rules.max_losses_day) stops.push(rules.max_losses_day + ' losses today. Stop trading for today.');
    if (rules.max_trades_day && st.n >= rules.max_trades_day) stops.push('Daily trade limit reached (' + rules.max_trades_day + ').');
    if (lossLimit && -st.pnl >= lossLimit) stops.push('Daily loss limit reached (' + T.money(-lossLimit) + ').');
    var winDone = rules.max_wins_window && (st.W[a] || 0) >= rules.max_wins_window;
    var clKey = 'tj-cl-' + ds, cl = T.store(clKey) || {}, vals = cl[a] || {};
    var total = p.checklist.length, done = p.checklist.filter(function (c) { return vals[c.id]; }).length;
    var risk = Math.max(0, S.balance) * S.settings.risk_pct / 100;
    var g = p.goals || {};

    el.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">' + T.fmtDate(ds, { weekday: 'long', day: 'numeric', month: 'long' }) + '</div><h1>Today</h1></div>' +
      '<div class="num" style="font-size:22px;font-weight:600" id="clk">' + T.nowHM() + '</div></div>' + T.planBanner() +
      '<div class="kpis">' +
      T.kpi('Trading window', win ? esc(win.name) + (win.active ? '' : ' (off)') : 'Closed', win && win.active ? '<span class="pill ok"><span class="dot"></span>You may trade</span>' : '<span class="pill"><span class="dot"></span>No window now</span>') +
      T.kpi('Losses today', st.L + (rules.max_losses_day ? ' / ' + rules.max_losses_day : ''), rules.max_losses_day && st.L === rules.max_losses_day - 1 ? '<span class="pill warn">One more = stop</span>' : '') +
      T.kpi('Trades today', st.n + (rules.max_trades_day ? ' / ' + rules.max_trades_day : '')) +
      T.kpi('Today P&amp;L', T.money(st.pnl, true), g.daily ? 'Goal ' + T.money(g.daily) + ' · ' + T.pct(Math.max(0, st.pnl) / g.daily) : (lossLimit ? 'Loss limit ' + T.money(-lossLimit) : ''), T.cls(st.pnl)) +
      T.kpi('Balance', T.money(S.balance), S.settings.goal ? '<div class="progress" style="margin-top:4px"><i style="width:' + Math.min(100, Math.max(0, S.balance / S.settings.goal * 100)) + '%"></i></div>' : '') +
      '</div>' +
      stops.map(function (s) { return '<div class="banner stop">' + esc(s) + '</div>'; }).join('') +
      '<div class="grid g-main">' +
      '<section class="panel"><div class="panel-head"><div><h2>Pre-trade checklist</h2><p>' + done + ' of ' + total + ' checked</p></div>' +
      (active.length ? '<div class="segtabs" role="tablist">' + active.map(function (w) {
        return '<button type="button" data-win="' + esc(w.id) + '" aria-pressed="' + (w.id === a) + '">' + esc(w.name) + ' <span class="num muted" style="font-size:11px">' + esc(w.start) + '–' + esc(w.end) + '</span></button>';
      }).join('') + '</div>' : '') + '</div>' +
      (winDone ? '<div class="banner done" style="margin-bottom:12px">' + esc(T.windowName(a)) + ' window won. Done for this window.</div>' : '') +
      '<div id="cl">' + T.checklistHtml(vals, 'cl-', false) + '</div>' +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px">' +
      '<div class="progress ' + (done === total && total ? 'ok' : '') + '"><i style="width:' + (total ? done / total * 100 : 0) + '%"></i></div>' +
      '<div class="row between"><span class="small muted">Risk this trade <b class="num" style="color:var(--fg)">' + T.money(risk) + '</b> · 1:' + rules.target_rr + ' target <b class="num" style="color:var(--fg)">' + T.money(risk * rules.target_rr) + '</b></span>' +
      '<button class="btn primary" id="logFromCl" type="button">' + (done === total && total ? 'Clear to enter · Log trade' : 'Log this trade') + '</button></div></div></section>' +
      '<div class="grid">' +
      (p.mindset ? '<div class="mind">' + esc(p.mindset) + '</div>' : '') +
      sizeCalc() +
      '<section class="panel"><div class="panel-head"><h2>Today\'s trades</h2></div>' + T.tradeRows(todays.slice().reverse(), 'No trades today.') + '</section>' +
      '</div></div>';

    $$('[data-win]', el).forEach(function (b) { b.onclick = function () { S.activeWin = b.dataset.win; T.render(); }; });
    $$('#cl input', el).forEach(function (i) {
      i.onchange = function () { cl[a] = cl[a] || {}; cl[a][i.dataset.k] = i.checked; T.store(clKey, cl); T.render(); };
    });
    $('#logFromCl', el).onclick = function () { T.openTrade(null, { session: a, checklist: Object.assign({}, vals), clearKey: [clKey, a] }); };
    bindCalc(el);
    T.bindRows(el);
  };
  T.views.today.tick = function () {
    var c = $('#clk'); if (!c) return;
    var w = T.windowAt(T.nowMin()), id = w ? w.id : '';
    if (c.dataset.w !== undefined && c.dataset.w !== id) T.render(); else { c.textContent = T.nowHM(); c.dataset.w = id; }
  };

  function sizeCalc() {
    var p = S.prefs, types = p.instruments.filter(function (k) { return p.contract_sizes[k]; });
    var last = T.store('tj-calc') || {};
    return '<section class="panel"><div class="panel-head"><div><h2>Position size</h2><p>Lot size for your risk and stop distance</p></div></div>' +
      '<div class="fg two">' +
      '<label class="f">Balance<input id="pcBal" type="number" step="0.01" value="' + (Math.round(S.balance * 100) / 100) + '"></label>' +
      '<label class="f">Risk %<input id="pcRisk" type="number" step="0.1" value="' + S.settings.risk_pct + '"></label>' +
      '<label class="f">Instrument<select id="pcType">' + opt(types, last.type || types[0]) + '</select></label>' +
      '<label class="f">Stop distance <span class="hint">price units</span><input id="pcDist" type="number" step="any" value="' + (last.dist || '') + '" placeholder="e.g. 0.0020 or 5.0"></label>' +
      '</div><div class="kv" style="margin-top:12px" id="pcOut"></div>' +
      '<p class="small muted" style="margin:8px 0 0">Uses contract size from Settings. Exact for USD-quoted symbols (EURUSD, XAUUSD); approximate for others.</p></section>';
  }
  function bindCalc(el) {
    var upd = function () {
      var bal = +$('#pcBal').value || 0, rp = +$('#pcRisk').value || 0, type = $('#pcType').value, dist = Math.abs(+$('#pcDist').value || 0);
      var cs = S.prefs.contract_sizes[type] || 1, risk = bal * rp / 100;
      var lots = dist ? risk / (dist * cs) : 0;
      T.store('tj-calc', { type: type, dist: $('#pcDist').value });
      $('#pcOut').innerHTML = '<dt>Money at risk</dt><dd class="num">' + T.money(risk) + '</dd>' +
        '<dt>Lot size</dt><dd class="num" style="font-weight:600">' + (dist ? T.n(Math.floor(lots * 100) / 100, 2) + ' lots' : '—') + '</dd>' +
        '<dt>TP distance (1:' + S.prefs.rules.target_rr + ')</dt><dd class="num">' + (dist ? T.n(dist * S.prefs.rules.target_rr, 5) : '—') + '</dd>';
    };
    ['#pcBal', '#pcRisk', '#pcType', '#pcDist'].forEach(function (s) { $(s, el).oninput = upd; });
    upd();
  }

  // ================= TRADES =================
  var F = { q: '', from: '', to: '', result: '', strategy: '', session: '', type: '', tag: '', mistake: '', fav: false, review: false, sort: 'new' };
  var showN = 100;
  T.views.trades = function (el) {
    var all = T.scoped();
    var strategies = {}, tags = {}, types = {};
    all.forEach(function (t) { if (t.strategy) strategies[t.strategy] = 1; (t.tags || []).forEach(function (g) { tags[g] = 1; }); if (t.instrument_type) types[t.instrument_type] = 1; });
    var ql = F.q.trim().toLowerCase();
    var list = all.filter(function (t) {
      if (F.from && t.trade_date < F.from) return false;
      if (F.to && t.trade_date > F.to) return false;
      if (F.result && t.result !== F.result) return false;
      if (F.strategy && t.strategy !== F.strategy) return false;
      if (F.session && t.session !== F.session) return false;
      if (F.type && t.instrument_type !== F.type) return false;
      if (F.tag && (t.tags || []).indexOf(F.tag) < 0) return false;
      if (F.mistake && (t.mistakes || []).indexOf(F.mistake) < 0) return false;
      if (F.fav && !t.favorite) return false;
      if (F.review && !t._.pending) return false;
      if (ql) {
        var hay = [t.pair, t.strategy, t.notes, t.lessons, t.went_right, t.went_wrong, t.exit_reason, (t.tags || []).join(' '), (t.mistakes || []).join(' '), t.mood].join(' ').toLowerCase();
        if (hay.indexOf(ql) < 0) return false;
      }
      return true;
    });
    var sorters = {
      new: function (a, b) { return b.trade_date.localeCompare(a.trade_date) || (b.trade_time || '').localeCompare(a.trade_time || '') || b.id - a.id; },
      old: function (a, b) { return a.trade_date.localeCompare(b.trade_date) || (a.trade_time || '').localeCompare(b.trade_time || '') || a.id - b.id; },
      best: function (a, b) { return b.pnl - a.pnl; }, worst: function (a, b) { return a.pnl - b.pnl; }
    };
    list.sort(sorters[F.sort] || sorters.new);
    var ag = T.aggregate(list.slice().sort(sorters.old));
    var p = S.prefs;
    el.innerHTML =
      '<div class="page-head"><div><h1>Trades</h1><p>' + all.length + ' trades in ' + (S.scope === 'all' ? 'all accounts' : S.scope + ' account') + ' ' + T.tradeLimitNote() + '</p></div>' +
      '<div class="row">' + T.scopeSwitch() + '<button class="btn" id="impBtn" type="button">' + T.icon('upload') + 'Import</button>' +
      '<a class="btn" id="expBtn" href="#">' + T.icon('download') + 'Export CSV</a><button class="btn primary" type="button" data-new2>' + T.icon('plus') + 'New trade</button></div></div>' +
      '<section class="panel"><div class="filters">' +
      '<label class="f" style="grid-column:span 2">Search<input id="fQ" value="' + esc(F.q) + '" placeholder="Symbol, strategy, notes, tags…"></label>' +
      '<label class="f">From<input id="fFrom" type="date" value="' + esc(F.from) + '"></label>' +
      '<label class="f">To<input id="fTo" type="date" value="' + esc(F.to) + '"></label>' +
      '<label class="f">Result<select id="fRes">' + opt([['W', 'Wins'], ['L', 'Losses'], ['B', 'Breakeven']], F.result, 'All') + '</select></label>' +
      '<label class="f">Sort<select id="fSort">' + opt([['new', 'Newest first'], ['old', 'Oldest first'], ['best', 'Best P&L'], ['worst', 'Worst P&L']], F.sort) + '</select></label>' +
      '<label class="f">Strategy<select id="fStrat">' + opt(Object.keys(strategies).sort(), F.strategy, 'All') + '</select></label>' +
      '<label class="f">Window<select id="fSess">' + opt(p.windows.map(function (w) { return [w.id, w.name]; }).concat([['other', 'Other']]), F.session, 'All') + '</select></label>' +
      '<label class="f">Instrument<select id="fType">' + opt(Object.keys(types).sort(), F.type, 'All') + '</select></label>' +
      '<label class="f">Tag<select id="fTag">' + opt(Object.keys(tags).sort(), F.tag, 'All') + '</select></label>' +
      '<label class="f">Mistake<select id="fMis">' + opt(p.mistakes, F.mistake, 'All') + '</select></label>' +
      '<div class="f" style="justify-content:flex-end;gap:8px"><label class="switch"><input type="checkbox" id="fFav"' + (F.fav ? ' checked' : '') + '>Favorites</label><label class="switch"><input type="checkbox" id="fRev"' + (F.review ? ' checked' : '') + '>Needs review</label></div>' +
      '</div><div class="row small" style="margin-top:14px;gap:18px;color:var(--muted)">' +
      '<span><b class="num" style="color:var(--fg)">' + ag.n + '</b> trades</span><span>Win rate <b class="num" style="color:var(--fg)">' + T.pct(ag.wr) + '</b></span>' +
      '<span>Net <b class="num ' + T.cls(ag.pnl) + '">' + T.money(ag.pnl, true) + '</b></span><span>Net <b class="num ' + T.cls(ag.R) + '">' + T.rfmt(ag.R) + '</b></span>' +
      '<span>Profit factor <b class="num" style="color:var(--fg)">' + (ag.pf == null ? '—' : ag.pf === Infinity ? '∞' : ag.pf.toFixed(2)) + '</b></span>' +
      '<button class="btn ghost sm" id="fClear" type="button">Clear filters</button></div></section>' +
      '<section class="panel" style="padding:6px 10px">' + T.tradeRows(list.slice(0, showN), all.length ? 'No trades match these filters.' : 'No trades yet. Click “New trade”, import a CSV, or connect MT5 in Settings.') +
      (list.length > showN ? '<div class="row" style="justify-content:center;padding:12px"><button class="btn" id="more" type="button">Show ' + Math.min(100, list.length - showN) + ' more</button></div>' : '') + '</section>';

    var set = function () {
      F.q = $('#fQ').value; F.from = $('#fFrom').value; F.to = $('#fTo').value; F.result = $('#fRes').value; F.sort = $('#fSort').value;
      F.strategy = $('#fStrat').value; F.session = $('#fSess').value; F.type = $('#fType').value; F.tag = $('#fTag').value; F.mistake = $('#fMis').value;
      F.fav = $('#fFav').checked; F.review = $('#fRev').checked; showN = 100;
    };
    $$('select, input[type=date], input[type=checkbox]', el).forEach(function (i) { if (i.closest('.filters')) i.onchange = function () { set(); T.render(); }; });
    var qt; $('#fQ', el).oninput = function () { clearTimeout(qt); qt = setTimeout(function () { set(); T.render(); var q = $('#fQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    $('#fClear', el).onclick = function () { Object.keys(F).forEach(function (k) { F[k] = typeof F[k] === 'boolean' ? false : ''; }); F.sort = 'new'; T.render(); };
    var more = $('#more', el); if (more) more.onclick = function () { showN += 100; T.render(); };
    $('#expBtn', el).href = '/api/app?action=export' + (F.from ? '&from=' + F.from : '') + (F.to ? '&to=' + F.to : '');
    $('#impBtn', el).onclick = function () { if (!T.can('import')) { T.toast('CSV and Excel import is part of a paid plan.', true); location.hash = '#billing'; return; } openImport(); };
    $('[data-new2]', el).onclick = function () { T.openTrade(null); };
    T.bindScope(el);
    T.bindRows(el);
  };

  // ================= TRADE FORM =================
  T.openTrade = function (t, preset) {
    var isNew = !t, p = S.prefs;
    preset = preset || {};
    var tm = T.nowHM();
    var defRisk = Math.round(Math.max(0, S.balance) * S.settings.risk_pct) / 100;
    var lastPair = T.store('tj-lastpair') || 'XAUUSD';
    t = t || {
      id: 0, trade_date: T.todayStr(), trade_time: tm, session: preset.session || ((T.windowAt(T.toMin(tm)) || {}).id || 'other'),
      pair: lastPair, direction: 'buy', entry: null, sl: null, tp: null, lot: null, leverage: null, risk_amount: defRisk,
      pnl: null, gross_pnl: null, commission: null, swap: null, r_multiple: null, result: '', checklist: preset.checklist || {},
      emotional: 0, followed_plan: 1, mood: '', emotion_during: '', emotion_after: '', confidence: null,
      notes: '', lessons: '', exit_reason: '', went_right: '', went_wrong: '', market_condition: '', strategy: '',
      instrument_type: T.store('tj-lasttype') || '', mistakes: [], tags: [], partials: [], account_type: S.scope !== 'all' ? S.scope : 'live',
      close_price: null, close_time: '', shots: [], source: 'manual'
    };
    var v = function (x) { return x == null ? '' : esc(x); };
    var radio = function (name, val, label, cur) { return '<label><input type="radio" name="' + name + '" value="' + val + '"' + (String(cur) === String(val) ? ' checked' : '') + '>' + label + '</label>'; };
    var ct = (t.close_time || '').split(' ');
    var emo = function (id, cur) { return '<select id="' + id + '">' + opt(withCur(p.emotions, cur), cur, '—') + '</select>'; };
    var dlg = $('#tradeDlg');
    dlg.innerHTML =
      '<form method="dialog" id="tf" novalidate>' +
      '<div class="dlg-head"><div><div class="eyebrow">' + (isNew ? 'New trade' : T.fmtDate(t.trade_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) + '</div>' +
      '<h2>' + (isNew ? 'Log a trade' : esc(t.pair) + ' · ' + (t.direction === 'buy' ? 'Long' : 'Short')) + '</h2></div>' +
      '<button class="btn sm" type="button" id="tfX">Close</button></div>' +
      '<div class="dlg-body">' +
      (!isNew ? '<div class="row">' + T.flagHtml(t, 8) + '</div>' : '') +
      (t.source === 'mt5' ? '<p class="notice" style="margin:0"><span class="src">MT5</span> Synced from account <b class="num">' + esc(t.mt5_account) + '</b>, position <b class="num">#' + esc(t.mt5_position) + '</b>.' +
        (t.reviewed ? '' : ' Add your setup, psychology and notes, then save to mark it reviewed.') + '</p>' : '') +

      '<div class="sect"><h3>Position</h3><div class="fg">' +
      '<label class="f">Account<select id="tAcct">' + opt([['live', 'Live'], ['demo', 'Demo'], ['backtest', 'Backtest']], t.account_type || 'live') + '</select></label>' +
      '<label class="f">Instrument type<select id="tType">' + opt(withCur(p.instruments, t.instrument_type), t.instrument_type, 'Auto') + '</select></label>' +
      '<label class="f">Symbol<input id="tPair" class="num" value="' + v(t.pair) + '" required autocapitalize="characters" list="symList"></label>' +
      '<label class="f">Direction<div class="seg">' + radio('dir', 'buy', 'Long', t.direction) + radio('dir', 'sell', 'Short', t.direction) + '</div></label>' +
      '<label class="f">Entry date<input id="tDate" type="date" value="' + v(t.trade_date) + '" required></label>' +
      '<label class="f">Entry time<input id="tTime" type="time" value="' + v(t.trade_time) + '"></label>' +
      '<label class="f">Exit date<input id="tCDate" type="date" value="' + v(ct[0]) + '"></label>' +
      '<label class="f">Exit time<input id="tCTime" type="time" value="' + v(ct[1]) + '"></label>' +
      '<label class="f">Lot size<input id="tLot" type="number" step="0.01" min="0" value="' + v(t.lot) + '"></label>' +
      '<label class="f">Leverage <span class="hint">1:x</span><input id="tLev" type="number" min="1" step="1" value="' + v(t.leverage) + '"></label>' +
      '<label class="f">Entry price<input id="tEntry" type="number" step="any" value="' + v(t.entry) + '"></label>' +
      '<label class="f">Exit price<input id="tExit" type="number" step="any" value="' + v(t.close_price) + '"></label>' +
      '<label class="f">Stop loss<input id="tSl" type="number" step="any" value="' + v(t.sl) + '"></label>' +
      '<label class="f">Take profit<input id="tTp" type="number" step="any" value="' + v(t.tp) + '"></label>' +
      '<label class="f">Risk (money)<input id="tRisk" type="number" step="0.01" min="0" value="' + v(t.risk_amount) + '"></label>' +
      '<div class="f">Planned RR<span class="calc" id="tRR">—</span></div>' +
      '</div>' +
      '<details class="partials" ' + ((t.partials || []).length ? 'open' : '') + '><summary class="small" style="cursor:pointer;color:var(--fg-2);font-weight:500">Partial entries and exits</summary>' +
      '<div id="tParts" class="stack" style="margin-top:10px"></div><button class="btn sm" type="button" id="addPart" style="margin-top:8px">+ Add fill</button>' +
      '<p class="small muted" style="margin:6px 0 0">The entry price and lot above are the first fill. Add later entries (scale-in) or exits (scale-out) here.</p></details></div>' +

      '<div class="sect"><h3>Result</h3><div class="fg">' +
      '<label class="f">Gross P&amp;L<div class="row" style="flex-wrap:nowrap"><input id="tGross" type="number" step="0.01" value="' + v(t.gross_pnl) + '"><button class="btn sm" type="button" id="calcG" title="Calculate from prices">Calc</button></div></label>' +
      '<label class="f">Commission<input id="tComm" type="number" step="0.01" value="' + v(t.commission) + '" placeholder="0.00"></label>' +
      '<label class="f">Swap<input id="tSwap" type="number" step="0.01" value="' + v(t.swap) + '" placeholder="0.00"></label>' +
      '<label class="f">Net P&amp;L<input id="tPnl" type="number" step="0.01" value="' + v(t.pnl) + '" placeholder="-12.50" required></label>' +
      '<label class="f s2">Outcome<div class="seg res">' + radio('res', 'W', 'Win', t.result) + radio('res', 'B', 'Breakeven', t.result) + radio('res', 'L', 'Loss', t.result) + '</div></label>' +
      '<label class="f">R multiple<input id="tR" type="number" step="0.01" value="' + v(t.r_multiple) + '" placeholder="auto"></label>' +
      '<div class="f">Calculation<span class="small muted" id="calcNote" style="font-weight:400;padding-top:8px">Net = gross − commission + swap</span></div>' +
      '</div></div>' +

      '<div class="sect"><h3>Setup</h3><div class="fg">' +
      '<label class="f s2">Strategy<input id="tStrat" value="' + v(t.strategy) + '" list="stratList" placeholder="Pick or type"></label>' +
      '<label class="f">Trading window<select id="tSess">' + opt(p.windows.map(function (w) { return [w.id, w.name + ' ' + w.start + '–' + w.end]; }).concat([['other', 'Other']]), t.session) + '</select></label>' +
      '<label class="f">Market condition<select id="tMkt">' + opt(withCur(p.market_conditions, t.market_condition), t.market_condition, '—') + '</select></label>' +
      '</div><div id="tCl">' + T.checklistHtml(t.checklist || {}, 'tc-', true) + '</div></div>' +

      '<div class="sect"><h3>Psychology</h3><div class="fg">' +
      '<label class="f">Before the trade' + emo('tEmoB', t.mood) + '</label>' +
      '<label class="f">During' + emo('tEmoD', t.emotion_during) + '</label>' +
      '<label class="f">After' + emo('tEmoA', t.emotion_after) + '</label>' +
      '<label class="f">Confidence<div class="seg">' + [1, 2, 3, 4, 5].map(function (n) { return radio('conf', n, n, t.confidence); }).join('') + '</div></label>' +
      '<div class="f s4" style="flex-direction:row;flex-wrap:wrap;gap:20px;font-weight:400"><label class="switch"><input type="checkbox" id="tPlan"' + (t.followed_plan ? ' checked' : '') + '>I followed my trading plan</label>' +
      '<label class="switch"><input type="checkbox" id="tEmo"' + (t.emotional ? ' checked' : '') + '>Revenge or emotional trade</label></div>' +
      '</div></div>' +

      '<div class="sect"><h3>Mistakes</h3><div class="chips" id="tMis">' + withCur(p.mistakes, null).concat((t.mistakes || []).filter(function (x) { return p.mistakes.indexOf(x) < 0; })).map(function (m, i) {
        return '<label class="chip bad"><input type="checkbox" value="' + esc(m) + '"' + ((t.mistakes || []).indexOf(m) >= 0 ? ' checked' : '') + '>' + esc(m) + '</label>';
      }).join('') + '</div></div>' +

      '<div class="sect"><h3>Journal</h3><div class="fg">' +
      '<label class="f s2">Why I entered<textarea id="tNotes">' + v(t.notes) + '</textarea></label>' +
      '<label class="f s2">Why I exited<textarea id="tExitR">' + v(t.exit_reason) + '</textarea></label>' +
      '<label class="f s2">What went right<textarea id="tRight">' + v(t.went_right) + '</textarea></label>' +
      '<label class="f s2">What went wrong<textarea id="tWrong">' + v(t.went_wrong) + '</textarea></label>' +
      '<label class="f s4">Lessons learned<textarea id="tLessons">' + v(t.lessons) + '</textarea></label>' +
      '<label class="f s4">Tags <span class="hint">comma separated</span><input id="tTags" value="' + v((t.tags || []).join(', ')) + '" placeholder="a-plus, news, scalp"></label>' +
      '</div></div>' +

      '<div class="sect"><h3>Screenshots</h3>' + (T.can('screenshots') ? '' : '<p class="notice" style="margin:0">Chart screenshots are part of a paid plan. <a href="#billing" id="upg">See plans</a></p>') +
      '<div class="shots" id="tShots">' + t.shots.map(function (s) { return '<div class="shot"><img src="/api/media?type=shot&id=' + s.id + '" alt="' + s.kind + ' screenshot" loading="lazy"><span>' + s.kind + '</span><button type="button" data-del="' + s.id + '" aria-label="Delete screenshot">×</button></div>'; }).join('') + '</div>' +
      '<div class="fg"' + (T.can('screenshots') ? '' : ' hidden') + '><label class="f s2">Add “before” charts<input id="fBefore" type="file" accept="image/*" multiple></label>' +
      '<label class="f s2">Add “after” charts<input id="fAfter" type="file" accept="image/*" multiple></label></div>' +
      '<div class="uplist" id="upList"></div></div>' +
      '</div>' +
      '<datalist id="stratList">' + p.strategies.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<datalist id="symList">' + Object.keys(S.trades.reduce(function (o, x) { o[x.pair] = 1; return o; }, {})).concat((p.watchlist || []).map(function (w) { return w.symbol; })).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<div class="dlg-foot">' + (isNew ? '<span></span>' : '<button class="btn danger" type="button" id="tDel">Delete trade</button>') +
      '<div class="row"><button class="btn" type="button" id="tfCancel">Cancel</button><button class="btn primary" type="submit" id="tfSave">' +
      (isNew ? 'Save trade' : t.source === 'mt5' && !t.reviewed ? 'Save and mark reviewed' : 'Save changes') + '</button></div></div></form>';

    var saveLabel = $('#tfSave').textContent;
    var close = function () { dlg.close(); };
    $('#tfX').onclick = close; $('#tfCancel').onclick = close;
    var upg = $('#upg'); if (upg) upg.onclick = close;

    // partial fills
    var parts = (t.partials || []).slice();
    var drawParts = function () {
      $('#tParts').innerHTML = parts.map(function (x, i) {
        return '<div class="prow"><select data-pk="' + i + '" aria-label="Fill type">' + opt([['out', 'Exit'], ['in', 'Add entry']], x.kind) + '</select>' +
          '<input data-pl="' + i + '" type="number" step="0.01" placeholder="Lot" value="' + v(x.lot) + '" aria-label="Lot">' +
          '<input data-pp="' + i + '" type="number" step="any" placeholder="Price" value="' + v(x.price) + '" aria-label="Price">' +
          '<input class="pt" data-pt="' + i + '" type="time" value="' + v(x.time) + '" aria-label="Time">' +
          '<button class="btn sm ghost" type="button" data-px="' + i + '" aria-label="Remove fill">×</button></div>';
      }).join('');
      $$('#tParts [data-pk]').forEach(function (s) { s.onchange = function () { parts[+s.dataset.pk].kind = s.value; }; });
      $$('#tParts [data-pl]').forEach(function (s) { s.oninput = function () { parts[+s.dataset.pl].lot = s.value; }; });
      $$('#tParts [data-pp]').forEach(function (s) { s.oninput = function () { parts[+s.dataset.pp].price = s.value; }; });
      $$('#tParts [data-pt]').forEach(function (s) { s.oninput = function () { parts[+s.dataset.pt].time = s.value; }; });
      $$('#tParts [data-px]').forEach(function (b) { b.onclick = function () { parts.splice(+b.dataset.px, 1); drawParts(); }; });
    };
    drawParts();
    $('#addPart').onclick = function () { parts.push({ kind: 'out', lot: '', price: '', time: '' }); drawParts(); };

    var netTouched = !isNew && t.gross_pnl == null && t.pnl != null, rTouched = t.r_multiple != null, resTouched = !isNew;
    var num = function (id) { var x = parseFloat($(id).value); return isNaN(x) ? null : x; };
    var upRR = function () {
      var e = num('#tEntry'), s = num('#tSl'), tp = num('#tTp');
      var rr = (e != null && s != null && tp != null && e !== s) ? Math.abs(tp - e) / Math.abs(e - s) : null;
      $('#tRR').textContent = rr == null ? '—' : '1:' + (Math.round(rr * 100) / 100);
      $('#tRR').className = 'calc ' + (rr == null ? '' : rr >= p.rules.target_rr * 0.97 ? 'pos' : 'neg');
    };
    var upNet = function () {
      if (!netTouched) {
        var g = num('#tGross');
        if (g != null) $('#tPnl').value = (Math.round((g - Math.abs(num('#tComm') || 0) + (num('#tSwap') || 0)) * 100) / 100);
      }
      upR(); upRes();
    };
    var upR = function () {
      if (rTouched) return;
      var pn = num('#tPnl'), r = num('#tRisk');
      $('#tR').value = (pn != null && r > 0) ? (Math.round(pn / r * 100) / 100) : '';
    };
    var upRes = function () {
      if (resTouched) return;
      var pn = num('#tPnl'), r = num('#tRisk'); if (pn == null) return;
      var res = r && Math.abs(pn) < 0.1 * r ? 'B' : pn > 0 ? 'W' : pn < 0 ? 'L' : 'B';
      $('input[name=res][value=' + res + ']').checked = true;
    };
    ['#tEntry', '#tSl', '#tTp'].forEach(function (s) { $(s).oninput = upRR; });
    ['#tGross', '#tComm', '#tSwap'].forEach(function (s) { $(s).oninput = upNet; });
    $('#tRisk').oninput = function () { upR(); upRes(); };
    $('#tPnl').oninput = function () { netTouched = true; upR(); upRes(); };
    $('#tR').oninput = function () { rTouched = this.value !== ''; };
    $$('input[name=res]').forEach(function (r) { r.onchange = function () { resTouched = true; }; });
    $('#tTime').onchange = function () { var w = T.windowAt(T.toMin(this.value)); $('#tSess').value = w ? w.id : 'other'; };
    $$('#tCl input').forEach(function (i) { i.onchange = function () { i.closest('.item').classList.toggle('done', i.checked); }; });
    $('#calcG').onclick = function () {
      var dir = ($('input[name=dir]:checked') || {}).value === 'sell' ? -1 : 1;
      var type = $('#tType').value || guessType($('#tPair').value);
      var cs = p.contract_sizes[type] || 1;
      var ins = [{ lot: num('#tLot'), price: num('#tEntry') }], outs = [];
      parts.forEach(function (x) { var l = parseFloat(x.lot), pr = parseFloat(x.price); if (l > 0 && !isNaN(pr)) (x.kind === 'in' ? ins : outs).push({ lot: l, price: pr }); });
      ins = ins.filter(function (x) { return x.lot > 0 && x.price != null; });
      if (!ins.length) { T.toast('Enter the lot size and entry price first.', true); return; }
      var lotIn = ins.reduce(function (s, x) { return s + x.lot; }, 0);
      var avg = ins.reduce(function (s, x) { return s + x.lot * x.price; }, 0) / lotIn;
      var lotOut = outs.reduce(function (s, x) { return s + x.lot; }, 0);
      var ex = num('#tExit');
      if (lotOut < lotIn - 1e-9) { if (ex == null) { T.toast('Enter the exit price (or add exits for the full size).', true); return; } outs.push({ lot: lotIn - lotOut, price: ex }); }
      var gross = outs.reduce(function (s, x) { return s + (x.price - avg) * dir * x.lot * cs; }, 0);
      $('#tGross').value = Math.round(gross * 100) / 100;
      if (ex == null && outs.length) $('#tExit').value = Math.round(outs.reduce(function (s, x) { return s + x.price * x.lot; }, 0) / outs.reduce(function (s, x) { return s + x.lot; }, 0) * 100000) / 100000;
      $('#calcNote').textContent = 'Contract size ' + T.n(cs) + ' (' + type + '). Exact for USD-quoted symbols.';
      netTouched = false; upNet();
    };
    upRR();
    if (isNew) { upR(); }

    $$('#tShots img').forEach(function (im) { im.onclick = function () { $('#imgFull').src = im.src; $('#imgDlg').showModal(); }; });
    $$('#tShots [data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!window.confirm('Delete this screenshot?')) return;
        T.api('delete_shot', { id: +b.dataset.del }).then(function () {
          b.closest('.shot').remove(); t.shots = t.shots.filter(function (s) { return s.id !== +b.dataset.del; });
          T.toast('Screenshot deleted'); return T.load().then(T.render);
        }).catch(function (err) { T.toast(err.message, true); });
      };
    });
    if (!isNew) $('#tDel').onclick = function () {
      if (!window.confirm('Delete this trade and its screenshots? This cannot be undone.')) return;
      T.api('delete_trade', { id: t.id }).then(function () { close(); T.toast('Trade deleted'); return T.load().then(T.render); }).catch(function (err) { T.toast(err.message, true); });
    };

    $('#tf').onsubmit = function (e) {
      e.preventDefault();
      var checklist = {}; $$('#tCl input').forEach(function (i) { checklist[i.dataset.k] = i.checked; });
      var conf = $('input[name=conf]:checked');
      var data = {
        id: t.id, account_type: $('#tAcct').value, instrument_type: $('#tType').value, pair: $('#tPair').value,
        direction: ($('input[name=dir]:checked') || {}).value, trade_date: $('#tDate').value, trade_time: $('#tTime').value,
        close_date: $('#tCDate').value, close_time: $('#tCTime').value, lot: $('#tLot').value, leverage: $('#tLev').value,
        entry: $('#tEntry').value, close_price: $('#tExit').value, sl: $('#tSl').value, tp: $('#tTp').value, risk_amount: $('#tRisk').value,
        partials: parts, gross_pnl: $('#tGross').value, commission: $('#tComm').value, swap: $('#tSwap').value, pnl: $('#tPnl').value,
        result: ($('input[name=res]:checked') || {}).value || '', r_multiple: $('#tR').value,
        strategy: $('#tStrat').value.trim(), session: $('#tSess').value, market_condition: $('#tMkt').value, checklist: checklist,
        mood: $('#tEmoB').value, emotion_during: $('#tEmoD').value, emotion_after: $('#tEmoA').value, confidence: conf ? conf.value : '',
        followed_plan: $('#tPlan').checked, emotional: $('#tEmo').checked,
        mistakes: $$('#tMis input:checked').map(function (i) { return i.value; }),
        notes: $('#tNotes').value, exit_reason: $('#tExitR').value, went_right: $('#tRight').value, went_wrong: $('#tWrong').value, lessons: $('#tLessons').value,
        tags: $('#tTags').value.split(',').map(function (s) { return s.trim().replace(/^#/, ''); }).filter(Boolean)
      };
      var btn = $('#tfSave'); btn.disabled = true; btn.textContent = 'Saving…';
      T.api('save_trade', data).then(function (j) {
        T.store('tj-lastpair', data.pair.toUpperCase()); if (data.instrument_type) T.store('tj-lasttype', data.instrument_type);
        var files = [];
        Array.prototype.forEach.call($('#fBefore').files, function (f) { files.push([f, 'before']); });
        Array.prototype.forEach.call($('#fAfter').files, function (f) { files.push([f, 'after']); });
        var ul = T.uploadList($('#upList')), chain = Promise.resolve(), fails = 0;
        files.forEach(function (pair, i) {
          var setP = ul.add(pair[0].name + ' · ' + pair[1]);
          chain = chain.then(function () {
            btn.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + '…';
            return T.shrinkImage(pair[0], 1920, 0.85).then(function (blob) {
              return T.upload('/api/app?action=upload&trade_id=' + j.id + '&kind=' + pair[1], blob, function (pr) { setP(pr); });
            }).then(function () { setP(1, 'ok'); }).catch(function (err) { fails++; setP(1, 'err'); T.toast(pair[0].name + ': ' + err.message, true); });
          });
        });
        return chain.then(function () {
          if (isNew && preset.clearKey) { var c = T.store(preset.clearKey[0]) || {}; c[preset.clearKey[1]] = {}; T.store(preset.clearKey[0], c); }
          return T.load();
        }).then(function () {
          if (!fails) { close(); T.toast(isNew ? 'Trade saved' : 'Changes saved'); }
          else { btn.disabled = false; btn.textContent = saveLabel; t.id = j.id; isNew = false; }
          T.render();
        });
      }).catch(function (err) {
        T.toast(err.message, true); btn.disabled = false; btn.textContent = saveLabel;
        if (err.code === 'upgrade') { close(); location.hash = '#billing'; }
      });
    };
    dlg.showModal();
    dlg.scrollTop = 0;
  };

  function guessType(sym) {
    var s = String(sym || '').toUpperCase();
    if (/^(XAU|XAG|XPT|XPD|GOLD|SILVER)/.test(s)) return 'Metals';
    if (/(BTC|ETH|XRP|SOL|LTC|DOGE)/.test(s)) return 'Crypto';
    if (/(US30|US100|US500|NAS|SPX|GER|DE40|DAX|UK100|JP225|USTEC)/.test(s)) return 'Indices';
    if (/(OIL|WTI|BRENT|NGAS)/.test(s)) return 'Commodities';
    if (/^[A-Z]{6}$/.test(s.replace(/[^A-Z]/g, '').slice(0, 6))) return 'Forex';
    return 'Forex';
  }

  // ================= IMPORT =================
  var FIELDS = [
    ['open', 'Entry date (and time)', ['open time', 'entry time', 'open date', 'date/time', 'datetime', 'date', 'time', 'opened', 'entry date', 'open']],
    ['otime', 'Entry time (if separate)', ['time', 'entry time', 'open time']],
    ['close', 'Exit date/time', ['close time', 'close_time', 'time (2)', 'exit time', 'closed', 'close date', 'exit date']],
    ['pair', 'Symbol', ['symbol', 'pair', 'instrument', 'market', 'ticker', 'asset', 'item']],
    ['direction', 'Direction', ['type', 'side', 'direction', 'action', 'buy/sell', 'position type']],
    ['lot', 'Lot / volume', ['volume', 'lots', 'lot', 'size', 'quantity', 'qty', 'lot size']],
    ['entry', 'Entry price', ['price', 'open price', 'entry price', 'entry']],
    ['close_price', 'Exit price', ['price (2)', 'close price', 'close_price', 'exit price', 'exit']],
    ['sl', 'Stop loss', ['s / l', 's/l', 'sl', 'stop loss', 'stop']],
    ['tp', 'Take profit', ['t / p', 't/p', 'tp', 'take profit', 'target']],
    ['commission', 'Commission', ['commission', 'comm', 'fee', 'fees']],
    ['swap', 'Swap', ['swap', 'rollover', 'financing']],
    ['pnl', 'Profit (net)', ['profit', 'p&l', 'pnl', 'net profit', 'net p&l', 'pl', 'p/l', 'realized p&l', 'gain']],
    ['strategy', 'Strategy', ['strategy', 'setup']],
    ['notes', 'Notes', ['notes', 'comment', 'comments', 'note']],
    ['tags', 'Tags', ['tags', 'tag', 'labels']]
  ];

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/).slice(0, 5).join('\n');
    var cands = [',', ';', '\t'], delim = ',', best = -1;
    cands.forEach(function (c) { var n = first.split(c).length; if (n > best) { best = n; delim = c; } });
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = function () { res(window.XLSX); }; s.onerror = function () { rej(new Error('Could not load the Excel reader. Save the file as CSV instead.')); };
      document.head.appendChild(s);
    });
  }
  function norm(h) { return String(h || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function findHeader(rows) {
    var syn = {}; FIELDS.forEach(function (f) { f[2].forEach(function (s) { syn[s] = 1; }); });
    var best = { i: 0, score: 0 };
    rows.slice(0, 40).forEach(function (r, i) {
      var sc = r.filter(function (c) { return syn[norm(c)]; }).length;
      if (sc > best.score) best = { i: i, score: sc };
    });
    var head = rows[best.i] || [], seen = {};
    head = head.map(function (h, j) { var n = norm(h) || 'column ' + (j + 1); seen[n] = (seen[n] || 0) + 1; return seen[n] > 1 ? n + ' (' + seen[n] + ')' : n; });
    return { i: best.i, head: head };
  }
  function autoMap(head) {
    var map = {}, used = {};
    FIELDS.forEach(function (f) {
      for (var k = 0; k < f[2].length; k++) { var j = head.indexOf(f[2][k]); if (j >= 0 && !used[j]) { map[f[0]] = j; used[j] = 1; return; } }
    });
    return map;
  }
  function parseNum(s) {
    if (s == null) return null;
    s = String(s).replace(/[\s $€£]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.'); else s = s.replace(/,/g, '');
    var n = parseFloat(s); return isNaN(n) ? null : n;
  }
  function parseDT(s, fmt, shiftH) {
    if (s == null || s === '') return null;
    var d = null, m;
    if (typeof s === 'number' || /^\d{5}(\.\d+)?$/.test(String(s))) { // Excel serial date
      var ms = Math.round((parseFloat(s) - 25569) * 86400000); d = new Date(ms);
    } else {
      s = String(s).trim();
      if ((m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
      else if ((m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i))) {
        var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
        var day = fmt === 'mdy' ? b : a, mon = fmt === 'mdy' ? a : b, hh = +(m[4] || 0);
        if (m[7]) { if (/pm/i.test(m[7]) && hh < 12) hh += 12; if (/am/i.test(m[7]) && hh === 12) hh = 0; }
        d = new Date(Date.UTC(y, mon - 1, day, hh, +(m[5] || 0)));
      }
    }
    if (!d || isNaN(d)) return null;
    if (shiftH) d = new Date(d.getTime() + shiftH * 3600000);
    var iso = d.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }

  function openImport() {
    var dlg = $('#tradeDlg'), st = { rows: null, head: [], map: {}, start: 0 };
    dlg.innerHTML = '<div class="dlg-head"><div><div class="eyebrow">Import</div><h2>Import trades</h2></div><button class="btn sm" type="button" id="ix">Close</button></div>' +
      '<div class="dlg-body" id="ib">' +
      '<div class="sect"><h3>1. Choose a file</h3><label class="f">CSV or Excel file (.csv, .xlsx)<input id="iFile" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv"></label>' +
      '<p class="small muted" style="margin:0">Works with exports from most brokers and journals, this journal\'s own CSV, and the MT5 history report (right-click History > Report > Open XML). Duplicates are skipped automatically.</p></div>' +
      '<div id="iStep2"></div></div>';
    dlg.showModal();
    $('#ix').onclick = function () { dlg.close(); };
    $('#iFile').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var ok = function (rows) {
        rows = rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
        if (!rows.length) { T.toast('The file is empty.', true); return; }
        var h = findHeader(rows); st.rows = rows; st.head = h.head; st.start = h.i + 1; st.map = autoMap(h.head);
        step2();
      };
      if (/\.xlsx?$/i.test(f.name)) {
        loadXlsx().then(function (X) {
          return f.arrayBuffer().then(function (buf) {
            var wb = X.read(buf, { type: 'array', cellDates: false });
            var ws = wb.Sheets[wb.SheetNames[0]];
            ok(X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd hh:mm:ss' }));
          });
        }).catch(function (e) { T.toast(e.message, true); });
      } else {
        var r = new FileReader(); r.onload = function () { ok(parseCSV(String(r.result))); }; r.readAsText(f);
      }
    };

    function mapped(opts) {
      var out = [], m = st.map;
      for (var i = st.start; i < st.rows.length; i++) {
        var r = st.rows[i], g = function (k) { return m[k] == null ? '' : r[m[k]]; };
        var dirRaw = String(g('direction')).toLowerCase();
        if (i > st.start && norm(g('pair')) === 'symbol') break;           // next section of an MT5 report
        if (!g('pair') && !g('pnl')) { if (out.length) break; else continue; }
        if (m.direction != null && !/buy|sell|long|short|^b$|^s$/.test(dirRaw)) continue;   // balance, deposit, etc.
        var ot = String(g('otime') || '').match(/^(\d{1,2}):(\d{2})/);
        var o = parseDT(String(g('open')) + (ot && !/\d:\d\d/.test(String(g('open'))) ? ' ' + ot[0] : ''), opts.fmt, opts.shift);
        var cRaw = String(g('close') || ''); if (/^\d{1,2}:\d{2}$/.test(cRaw) && o) cRaw = o.date + ' ' + cRaw;
        var c = parseDT(cRaw, opts.fmt, opts.shift);
        var comm = parseNum(g('commission')), sw = parseNum(g('swap')), pr = parseNum(g('pnl'));
        out.push({
          _row: i + 1, trade_date: o ? o.date : '', trade_time: o ? o.time : '', close_date: c ? c.date : '', close_time: c ? c.time : '',
          pair: String(g('pair')).replace(/[^A-Za-z0-9/.!_-]/g, ''), direction: /sell|short|^s$/.test(dirRaw) ? 'sell' : 'buy',
          lot: parseNum(g('lot')), entry: parseNum(g('entry')), close_price: parseNum(g('close_price')), sl: parseNum(g('sl')), tp: parseNum(g('tp')),
          commission: comm, swap: sw, pnl: opts.gross && pr != null ? pr - Math.abs(comm || 0) + (sw || 0) : pr, gross_pnl: opts.gross ? pr : null,
          strategy: g('strategy'), notes: g('notes'), tags: String(g('tags') || '').split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean),
          account_type: opts.acct, followed_plan: true
        });
      }
      return out;
    }

    function step2() {
      var opts = { fmt: 'dmy', shift: 0, acct: S.scope !== 'all' ? S.scope : 'live', gross: false };
      var colOpt = function (k) { return '<select data-map="' + k + '"><option value="">— not in file —</option>' + st.head.map(function (h, j) { return '<option value="' + j + '"' + (st.map[k] === j ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select>'; };
      $('#iStep2').innerHTML =
        '<div class="sect"><h3>2. Match the columns</h3><p class="small muted" style="margin:0">Found ' + (st.rows.length - st.start) + ' rows. Columns were matched automatically; check them below.</p>' +
        '<div class="fg">' + FIELDS.map(function (f) { return '<label class="f">' + f[1] + colOpt(f[0]) + '</label>'; }).join('') + '</div>' +
        '<div class="fg"><label class="f">Date format for 01/02/2026<select id="iFmt">' + opt([['dmy', '1 Feb (day first)'], ['mdy', 'Jan 2 (month first)']], 'dmy') + '</select></label>' +
        '<label class="f">Shift times by <span class="hint">hours, e.g. MT5 server → local</span><input id="iShift" type="number" step="0.5" value="0"></label>' +
        '<label class="f">Import into<select id="iAcct">' + opt([['live', 'Live account'], ['demo', 'Demo'], ['backtest', 'Backtest']], opts.acct) + '</select></label>' +
        '<label class="f">Profit column is<select id="iGross">' + opt([['net', 'Net (after fees)'], ['gross', 'Gross (before fees)']], 'net') + '</select></label></div></div>' +
        '<div class="sect"><h3>3. Preview</h3><div id="iPrev"></div></div>' +
        '<div class="sect"><div class="progress" id="iBar" hidden><i></i></div><p class="small" id="iMsg" style="margin:0"></p>' +
        '<div class="row end"><button class="btn primary" type="button" id="iGo">Import trades</button></div></div>';
      var read = function () {
        $$('[data-map]').forEach(function (s) { st.map[s.dataset.map] = s.value === '' ? null : +s.value; });
        opts.fmt = $('#iFmt').value; opts.shift = +$('#iShift').value || 0; opts.acct = $('#iAcct').value; opts.gross = $('#iGross').value === 'gross';
      };
      var prev = function () {
        read();
        var rows = mapped(opts), bad = rows.filter(function (r) { return !r.trade_date || !r.pair || r.pnl == null; }).length;
        $('#iPrev').innerHTML = '<p class="small" style="margin:0 0 8px"><b class="num">' + rows.length + '</b> trades ready' + (bad ? ', <span class="neg"><b class="num">' + bad + '</b> missing a date, symbol or profit</span> (they will be skipped)' : '') + '.</p>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Time</th><th>Symbol</th><th>Side</th><th class="n">Lot</th><th class="n">Entry</th><th class="n">Exit</th><th class="n">Net</th></tr></thead><tbody>' +
          rows.slice(0, 8).map(function (r) {
            return '<tr><td class="num">' + esc(r.trade_date || '?') + '</td><td class="num">' + esc(r.trade_time) + '</td><td>' + esc(r.pair || '?') + '</td><td>' + r.direction + '</td>' +
              '<td class="n num">' + T.n(r.lot) + '</td><td class="n num">' + T.n(r.entry, 5) + '</td><td class="n num">' + T.n(r.close_price, 5) + '</td><td class="n num ' + T.cls(r.pnl) + '">' + (r.pnl == null ? '?' : T.money(r.pnl, true)) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        return rows;
      };
      $$('#iStep2 select, #iStep2 input').forEach(function (i) { i.onchange = prev; });
      prev();
      $('#iGo').onclick = function () {
        var rows = prev().filter(function (r) { return r.trade_date && r.pair && r.pnl != null; });
        if (!rows.length) { T.toast('Nothing to import. Check the column matching.', true); return; }
        var btn = this; btn.disabled = true;
        var bar = $('#iBar'); bar.hidden = false;
        var res = { inserted: 0, duplicates: 0, errors: [] }, i = 0, size = 100;
        var next = function () {
          if (i >= rows.length) {
            bar.className = 'progress ok';
            $('#iMsg').innerHTML = '<b class="pos">' + res.inserted + ' imported</b> · ' + res.duplicates + ' duplicates skipped' + (res.errors.length ? ' · <span class="neg">' + res.errors.length + ' rows with errors</span> (first: row ' + res.errors[0].row + ': ' + esc(res.errors[0].error) + ')' : '');
            btn.textContent = 'Done'; T.load().then(T.render);
            return;
          }
          var chunk = rows.slice(i, i + size);
          T.api('import_trades', { rows: chunk }).then(function (j) {
            res.inserted += j.inserted; res.duplicates += j.duplicates; res.errors = res.errors.concat(j.errors || []);
            i += size; bar.querySelector('i').style.width = Math.min(100, i / rows.length * 100) + '%';
            $('#iMsg').textContent = 'Importing ' + Math.min(i, rows.length) + ' of ' + rows.length + '…';
            next();
          }).catch(function (err) { bar.className = 'progress bad'; $('#iMsg').textContent = err.message; btn.disabled = false; });
        };
        next();
      };
    }
  }
})();
