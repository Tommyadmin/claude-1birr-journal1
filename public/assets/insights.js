/* Trade journal — Dashboard, Calendar, Analytics, Reports, Plan & notes. */
(function () {
  'use strict';
  var T = window.TJ, S = T.S, $ = T.$, $$ = T.$$, esc = T.esc;
  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function weekday(ds) { var p = ds.split('-'); return WEEKDAYS[(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7]; }

  // period filter shared by dashboard and analytics
  function periodRange(key) {
    var t = T.todayStr();
    if (key === 'month') return [t.slice(0, 8) + '01', t];
    if (key === '30') return [T.addDays(t, -29), t];
    if (key === '90') return [T.addDays(t, -89), t];
    if (key === 'year') return [t.slice(0, 4) + '-01-01', t];
    if (key === 'week') return [T.weekStart(t), t];
    return ['0000-00-00', '9999-99-99'];
  }
  function inPeriod(list, key) { var r = periodRange(key); return list.filter(function (x) { return x.trade_date >= r[0] && x.trade_date <= r[1]; }); }
  function periodSwitch(cur) {
    return '<div class="segtabs no-print" role="group" aria-label="Period">' + [['week', 'Week'], ['month', 'Month'], ['30', '30 days'], ['90', '90 days'], ['year', 'Year'], ['all', 'All time']].map(function (o) {
      return '<button type="button" data-period="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  S.period = T.store('tj-period') || 'all';
  function bindPeriod(el) { $$('[data-period]', el).forEach(function (b) { b.onclick = function () { S.period = b.dataset.period; T.store('tj-period', S.period); T.render(); }; }); }

  function kpiBlock(a) {
    var pf = a.pf == null ? '—' : a.pf === Infinity ? '∞' : a.pf.toFixed(2);
    return '<div class="kpis">' +
      T.kpi('Net P&amp;L', T.money(a.pnl, true), a.n + ' trades · ' + a.W + 'W ' + a.L + 'L ' + a.B + 'BE', T.cls(a.pnl)) +
      T.kpi('Win rate', T.pct(a.wr), 'Breakeven excluded') +
      T.kpi('Profit factor', pf, 'Gross win ÷ gross loss') +
      T.kpi('Avg win / loss', T.money(a.avgW, false) + ' / ' + T.money(a.avgL, false), a.realRR ? 'Realized 1:' + a.realRR.toFixed(2) : '') +
      T.kpi('Avg planned RR', a.avgRR == null ? '—' : '1:' + a.avgRR.toFixed(2), 'From entry, SL and TP') +
      T.kpi('Avg R / trade', T.rfmt(a.expR), 'Net ' + T.rfmt(a.R), T.cls(a.expR)) +
      T.kpi('Expectancy', a.exp == null ? '—' : T.money(a.exp, true), 'Per trade', T.cls(a.exp)) +
      T.kpi('Max drawdown', a.mdd ? '-' + T.money(a.mdd) : T.money(0), T.pct(a.mddPct, 1) + ' from peak', a.mdd ? 'neg' : '') +
      T.kpi('Best day', a.bestDay ? T.money(a.bestDay.v, true) : '—', a.bestDay ? T.fmtDate(a.bestDay.d, { day: 'numeric', month: 'short', year: 'numeric' }) : '', a.bestDay ? T.cls(a.bestDay.v) : '') +
      T.kpi('Worst day', a.worstDay ? T.money(a.worstDay.v, true) : '—', a.worstDay ? T.fmtDate(a.worstDay.d, { day: 'numeric', month: 'short', year: 'numeric' }) : '', a.worstDay ? T.cls(a.worstDay.v) : '') +
      T.kpi('Streaks', a.streakW + 'W / ' + a.streakL + 'L', 'Longest win / loss run') +
      T.kpi('Fees', T.money(-a.fees), 'Commission and swap', a.fees > 0 ? 'neg' : '') +
      '</div>';
  }

  // Plain-language observations from the trader's own data. Not signals.
  function observations(list) {
    var out = [], MIN = 5;
    var cmp = function (groups, label, fmt) {
      var rows = Object.keys(groups).map(function (k) { return { k: k, a: T.aggregate(groups[k]) }; }).filter(function (r) { return r.a.n >= MIN && r.a.wr != null; });
      if (rows.length < 2) return;
      rows.sort(function (x, y) { return y.a.wr - x.a.wr; });
      var b = rows[0], w = rows[rows.length - 1];
      if (b.a.wr - w.a.wr >= 0.15) out.push('Your win rate is <b class="num">' + T.pct(b.a.wr) + '</b> ' + fmt(b.k) + ' but <b class="num">' + T.pct(w.a.wr) + '</b> ' + fmt(w.k) + ' (' + b.a.n + ' vs ' + w.a.n + ' trades).');
    };
    cmp(T.groupBy(list, function (t) { return T.windowName(t.session); }), 'window', function (k) { return 'in the ' + esc(k) + ' window'; });
    cmp(T.groupBy(list, function (t) { return t.strategy || null; }), 'strategy', function (k) { return 'with ' + esc(k); });
    cmp(T.groupBy(list, function (t) { return t.mood || null; }), 'emotion', function (k) { return 'when you feel ' + esc(k.toLowerCase()) + ' before entry'; });
    var mis = T.groupBy(list, function (t) { return t.mistakes || []; });
    var worst = Object.keys(mis).map(function (k) { return { k: k, a: T.aggregate(mis[k]) }; }).filter(function (r) { return r.a.n >= 3; }).sort(function (x, y) { return x.a.pnl - y.a.pnl; })[0];
    if (worst && worst.a.pnl < 0) out.push('“' + esc(worst.k) + '” is your costliest mistake: <b class="num neg">' + T.money(worst.a.pnl) + '</b> over ' + worst.a.n + ' trades.');
    var rv = list.filter(function (t) { return !t._.pending; });
    var clean = T.aggregate(rv.filter(function (t) { return !t._.flags.some(function (f) { return !f.mistake; }); })), broken = T.aggregate(rv.filter(function (t) { return t._.flags.some(function (f) { return !f.mistake; }); }));
    if (clean.n >= MIN && broken.n >= MIN) out.push('Trades where you followed every rule made <b class="num ' + T.cls(clean.exp) + '">' + T.money(clean.exp, true) + '</b> on average; trades that broke a rule made <b class="num ' + T.cls(broken.exp) + '">' + T.money(broken.exp, true) + '</b>.');
    var withRisk = list.filter(function (t) { return t._.riskPct != null; });
    if (withRisk.length >= 10) {
      var lim = S.settings.risk_pct / 100;
      var over = T.aggregate(withRisk.filter(function (t) { return t._.riskPct > lim * 1.05; })), within = T.aggregate(withRisk.filter(function (t) { return t._.riskPct <= lim * 1.05; }));
      if (over.n >= 3) out.push('You risked more than your ' + S.settings.risk_pct + '% limit on <b class="num">' + over.n + '</b> trades. Those trades netted <b class="num ' + T.cls(over.pnl) + '">' + T.money(over.pnl, true) + '</b>' + (within.n ? ', versus ' + T.money(within.exp, true) + ' per trade within the limit.' : '.'));
    }
    var early = list.filter(function (t) { return t.result === 'W' && t._.rr != null && t._.R != null && t._.R < t._.rr * 0.7; });
    var winsRR = list.filter(function (t) { return t.result === 'W' && t._.rr != null && t._.R != null; });
    if (winsRR.length >= MIN && early.length / winsRR.length >= 0.4) out.push('On <b class="num">' + T.pct(early.length / winsRR.length) + '</b> of your winners you banked less than 70% of the planned reward. You may be closing winners early.');
    var hours = T.groupBy(list.filter(function (t) { return t.trade_time; }), function (t) { return t.trade_time.slice(0, 2); });
    var hb = Object.keys(hours).map(function (k) { return { k: k, a: T.aggregate(hours[k]) }; }).filter(function (r) { return r.a.n >= MIN; }).sort(function (x, y) { return y.a.pnl - x.a.pnl; });
    if (hb.length >= 2) out.push('Your best hour is <b class="num">' + hb[0].k + ':00</b> (' + T.money(hb[0].a.pnl, true) + ' over ' + hb[0].a.n + ' trades) and your worst is <b class="num">' + hb[hb.length - 1].k + ':00</b> (' + T.money(hb[hb.length - 1].a.pnl, true) + ').');
    return out;
  }

  function goalBars(all) {
    var g = S.prefs.goals || {}, t = T.todayStr(), live = all.filter(function (x) { return (x.account_type || 'live') === 'live'; });
    var sum = function (from) { return live.filter(function (x) { return x.trade_date >= from && x.trade_date <= t; }).reduce(function (s, x) { return s + x.pnl; }, 0); };
    var rows = [];
    if (g.daily) rows.push(['Today', sum(t), g.daily]);
    if (g.weekly) rows.push(['This week', sum(T.weekStart(t)), g.weekly]);
    if (g.monthly) rows.push(['This month', sum(t.slice(0, 8) + '01'), g.monthly]);
    if (S.settings.goal) rows.push(['Balance goal', S.balance, S.settings.goal]);
    if (!rows.length) return '<p class="small muted" style="margin:0">Set daily, weekly or monthly profit goals in Settings > Rules & goals.</p>';
    return '<div class="stack">' + rows.map(function (r) {
      var pr = r[2] ? Math.max(0, Math.min(1, r[1] / r[2])) : 0;
      return '<div><div class="row between small"><span>' + r[0] + '</span><span class="num"><b class="' + T.cls(r[1]) + '">' + T.money(r[1], r[0] !== 'Balance goal') + '</b> / ' + T.money(r[2], false, 0) + '</span></div>' +
        '<div class="progress ' + (pr >= 1 ? 'ok' : '') + '" style="margin-top:5px"><i style="width:' + (pr * 100) + '%"></i></div></div>';
    }).join('') + '</div>';
  }

  // ================= DASHBOARD =================
  var GROUPS = [['pair', 'Instrument'], ['strategy', 'Strategy'], ['session', 'Session']];
  S.dgroup = T.store('tj-dgroup') || 'pair';
  function breakdown(list) {
    var key = S.dgroup, label = (GROUPS.find(function (g) { return g[0] === key; }) || GROUPS[0])[1];
    var g = T.groupBy(list, function (t) { return key === 'session' ? T.windowName(t.session) : (t[key] || (key === 'pair' ? 'Unknown' : 'No strategy')); });
    var rows = Object.keys(g).map(function (k) { return { k: k, a: T.aggregate(g[k]) }; }).sort(function (x, y) { return y.a.n - x.a.n || y.a.pnl - x.a.pnl; });
    var total = list.length || 1;
    var body = rows.length ? rows.map(function (r) {
      var share = r.a.n / total, wr = r.a.wr;
      return '<tr><td><span class="sym">' + T.coin(r.k) + esc(r.k) + '</span></td>' +
        '<td class="num">' + r.a.n + '</td>' +
        '<td><div class="alloc"><span class="trk"><i style="width:' + Math.round((wr || 0) * 100) + '%"></i></span><span class="num">' + T.pct(wr) + '</span></div></td>' +
        '<td class="num">' + T.pct(share) + '</td>' +
        '<td class="num ' + T.cls(r.a.expR) + '">' + T.rfmt(r.a.expR) + '</td>' +
        '<td class="num n ' + T.cls(r.a.pnl) + '"><b>' + T.money(r.a.pnl, true) + '</b></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty">No trades in this period.</div></td></tr>';
    return '<section class="panel flush"><div class="panel-head"><h2>Breakdown <span class="muted">(' + rows.length + ')</span></h2>' +
      '<div class="segtabs" role="group" aria-label="Group by">' + GROUPS.map(function (x) { return '<button type="button" data-dg="' + x[0] + '" aria-pressed="' + (key === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + label + '</th><th>Trades</th><th style="min-width:220px">Win rate</th><th>Share</th><th>Avg R</th><th class="n">Net P&amp;L</th></tr></thead><tbody>' + body + '</tbody></table></div></section>';
  }

  function statCard(icon, label, value, sub, link, linkText, cls, big) {
    return '<div class="panel stat' + (big ? ' big' : '') + '"><span class="tile">' + T.icon(icon) + '</span><div style="min-width:0"><div class="lbl">' + label + '</div>' +
      '<div class="val ' + (cls || '') + '">' + value + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' +
      (link ? '<a class="go" href="' + link + '">' + linkText + ' →</a>' : '') + '</div>';
  }

  T.views.dashboard = function (el) {
    var all = T.scoped(), list = inPeriod(all, S.period), a = T.aggregate(list);
    var obs = observations(list);
    var pending = S.trades.filter(function (t) { return t._.pending; }).length;
    var grossW = list.filter(function (t) { return t.pnl > 0; }).reduce(function (s, t) { return s + t.pnl; }, 0);
    var grossL = list.filter(function (t) { return t.pnl < 0; }).reduce(function (s, t) { return s + t.pnl; }, 0);
    var base = S.settings.start_balance || 0;
    var pf = a.pf == null ? '—' : a.pf === Infinity ? '∞' : a.pf.toFixed(2);
    var pname = { week: 'this week', month: 'this month', '30': 'the last 30 days', '90': 'the last 90 days', year: 'this year', all: 'all time' }[S.period];
    el.innerHTML = T.insightHead('dashboard') +
      T.planBanner() + (pending ? '<a class="notice" href="#trades" id="revLink"><b>' + pending + ' synced trade' + (pending > 1 ? 's' : '') + ' to review.</b> Add your checklist, emotions and notes so they count in your analysis.</a>' : '') +
      (!S.trades.length ? '<div class="banner info">Start by logging your first trade, importing a CSV, or connecting MT5 in Settings.</div>' : '') +
      '<div class="page-head"><div><h1>Summary</h1><p>A quick summary of your ' + esc(T.scopeName(S.scope).toLowerCase()) + ' for ' + pname + '</p></div>' + periodSwitch(S.period) + '</div>' +
      '<div class="sum">' +
      '<div class="panel donut-card">' + T.donut([{ v: a.W, color: 'var(--win)', label: 'Wins' }, { v: a.L, color: 'var(--loss)', label: 'Losses' }, { v: a.B, color: 'var(--faint)', label: 'Breakeven' }], T.pct(a.wr), 'win rate') +
      '<div class="dleg"><div><i style="background:var(--win)"></i>Wins <span class="num">(' + a.W + ')</span></div><div><i style="background:var(--loss)"></i>Losses <span class="num">(' + a.L + ')</span></div>' + (a.B ? '<div><i style="background:var(--faint)"></i>Breakeven <span class="num">(' + a.B + ')</span></div>' : '') +
      '<hr><div class="lbl">Net P&amp;L</div><div class="val num-h ' + T.cls(a.pnl) + '">' + T.money(a.pnl, true) + '</div><div class="sub">' + a.n + ' trades</div></div></div>' +
      '<div class="sum-r">' +
      statCard('up', 'Gross profit', T.money(grossW), a.W + ' winning trades · avg ' + T.money(a.avgW, false), '#trades', 'View', 'pos') +
      statCard('down', 'Gross loss', T.money(grossL), a.L + ' losing trades · avg ' + T.money(a.avgL, false), '#trades', 'View', 'neg') +
      '<div class="wide">' + statCard('trend', 'Overall P&amp;L', T.money(a.pnl, true), (S.scope === 'live' && base ? T.pct(a.pnl / base, 2) + ' of starting balance · ' : '') + 'Profit factor ' + pf + ' · Expectancy ' + (a.exp == null ? '—' : T.money(a.exp, true)), '#analytics', 'See analytics', T.cls(a.pnl), true) + '</div>' +
      '</div></div>' +
      '<div class="kpis">' +
      T.kpi('Avg planned RR', a.avgRR == null ? '—' : '1:' + a.avgRR.toFixed(2), 'From entry, SL and TP') +
      T.kpi('Avg R / trade', T.rfmt(a.expR), 'Net ' + T.rfmt(a.R), T.cls(a.expR)) +
      T.kpi('Max drawdown', a.mdd ? '-' + T.money(a.mdd) : T.money(0), T.pct(a.mddPct, 1) + ' from peak', a.mdd ? 'neg' : '') +
      T.kpi('Best day', a.bestDay ? T.money(a.bestDay.v, true) : '—', a.bestDay ? T.fmtDate(a.bestDay.d, { day: 'numeric', month: 'short', year: 'numeric' }) : '', a.bestDay ? T.cls(a.bestDay.v) : '') +
      T.kpi('Worst day', a.worstDay ? T.money(a.worstDay.v, true) : '—', a.worstDay ? T.fmtDate(a.worstDay.d, { day: 'numeric', month: 'short', year: 'numeric' }) : '', a.worstDay ? T.cls(a.worstDay.v) : '') +
      T.kpi('Streaks', a.streakW + 'W / ' + a.streakL + 'L', 'Longest win / loss run') +
      T.kpi('Fees', T.money(-a.fees), 'Commission and swap', a.fees > 0 ? 'neg' : '') +
      '</div>' +
      '<div class="grid g-main">' +
      '<section class="panel chart"><div class="panel-head"><div><h2>' + (S.scope === 'live' ? 'Equity curve' : 'Cumulative P&amp;L') + '</h2><p>' + (S.scope === 'live' ? 'Balance ' + T.money(S.balance) : list.length + ' trades') + '</p></div></div>' + T.equitySvg(list) + '</section>' +
      '<div class="grid"><section class="panel"><div class="panel-head"><h2>Goals</h2></div>' + goalBars(S.trades) + '</section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Observations</h2><p>Patterns in your own data, not trading signals</p></div></div>' +
      (obs.length ? '<ul class="steps" style="margin:0">' + obs.map(function (o) { return '<li>' + o + '</li>'; }).join('') + '</ul>' : '<p class="small muted" style="margin:0">Log at least 5 trades per group (window, strategy, emotion) to see patterns here.</p>') +
      '</section></div></div>' +
      breakdown(list) +
      '<section class="panel"><div class="panel-head"><h2>Recent trades</h2><a class="btn ghost sm" href="#trades">All trades →</a></div>' + T.tradeRows(all.slice(-6).reverse(), 'No trades yet.') + '</section>';
    T.bindInsightHead(el); bindPeriod(el); T.bindRows(el);
    $$('[data-dg]', el).forEach(function (b) { b.onclick = function () { S.dgroup = b.dataset.dg; T.store('tj-dgroup', S.dgroup); T.render(); }; });
    var rl = $('#revLink', el); if (rl) rl.onclick = function () { S.scope = 'all'; };
  };

  // ================= CALENDAR =================
  T.views.calendar = function (el) {
    var ds = T.todayStr();
    if (!S.calMonth) S.calMonth = ds.slice(0, 7);
    var y = +S.calMonth.slice(0, 4), mo = +S.calMonth.slice(5, 7);
    var first = new Date(Date.UTC(y, mo - 1, 1)), startDow = (first.getUTCDay() + 6) % 7;
    var gridStart = new Date(Date.UTC(y, mo - 1, 1 - startDow));
    var all = T.scoped(), byDay = {};
    all.forEach(function (t) { var d = byDay[t.trade_date] || (byDay[t.trade_date] = { pnl: 0, n: 0, list: [] }); d.pnl += t.pnl; d.n++; d.list.push(t); });
    var cells = '', monthList = [], weeks = [];
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week'].forEach(function (h) { cells += '<div class="hd">' + h + '</div>'; });
    var short = function (v) { v = Math.round(Number(v) || 0); return (v > 0 ? '+' : '') + v; };
    for (var w = 0; w < 6; w++) {
      var wk = 0, wn = 0, any = false;
      for (var i = 0; i < 7; i++) {
        var d = new Date(gridStart.getTime() + (w * 7 + i) * 864e5), key = d.toISOString().slice(0, 10), inM = d.getUTCMonth() === mo - 1;
        if (inM) any = true;
        var info = byDay[key];
        if (inM && info) { monthList = monthList.concat(info.list); wk += info.pnl; wn += info.n; }
        cells += '<button type="button" class="day' + (inM ? '' : ' out') + (info && inM ? ' ' + T.cls(info.pnl) : '') + (key === ds ? ' today' : '') + (key === S.calSel ? ' sel' : '') + '" data-d="' + (inM ? key : '') + '"' + (inM ? '' : ' tabindex="-1" disabled') + '>' +
          '<span class="row" style="gap:4px;width:100%"><span class="dn">' + d.getUTCDate() + '</span>' + (inM && S.notes[key] ? '<span class="nt" title="Has a note"></span>' : '') + '</span>' +
          (info && inM ? '<span class="v ' + T.cls(info.pnl) + '"><span class="full">' + T.money(info.pnl, true) + '</span><span class="short">' + short(info.pnl) + '</span></span><span class="c">' + info.n + ' trade' + (info.n > 1 ? 's' : '') + '</span>' : '') + '</button>';
      }
      cells += '<div class="wk"><span class="' + T.cls(wk) + '">' + (wn ? '<span class="full">' + T.money(wk, true) + '</span><span class="short">' + short(wk) + '</span>' : '—') + '</span><small>' + (wn ? wn + ' trades' : '') + '</small></div>';
      if (any) weeks.push({ n: wn, pnl: wk });
      if (!any && w > 3) break;
    }
    monthList.sort(function (x, z) { return x.trade_date.localeCompare(z.trade_date) || (x.trade_time || '').localeCompare(z.trade_time || ''); });
    var ma = T.aggregate(monthList);
    var dayKeys = Object.keys(byDay).filter(function (k) { return k.slice(0, 7) === S.calMonth; });
    var green = dayKeys.filter(function (k) { return byDay[k].pnl > 0; }).length;
    // current day streak (all time)
    var keys = Object.keys(byDay).sort(), streak = 0, sType = 0;
    for (var k = keys.length - 1; k >= 0; k--) { var s = Math.sign(byDay[keys[k]].pnl); if (!s) continue; if (!sType) sType = s; if (s !== sType) break; streak++; }
    // year strip
    var yr = S.calMonth.slice(0, 4), months = [];
    for (var m = 1; m <= 12; m++) { var mk = yr + '-' + T.pad(m); var ml = all.filter(function (t) { return t.trade_date.slice(0, 7) === mk; }); months.push({ k: mk, n: ml.length, pnl: ml.reduce(function (s2, t) { return s2 + t.pnl; }, 0) }); }
    var sel = S.calSel && byDay[S.calSel] ? byDay[S.calSel].list : [];
    el.innerHTML = T.insightHead('calendar') +
      '<div class="page-head"><div><div class="eyebrow">Daily P&amp;L</div><h1>' + T.fmtDate(S.calMonth + '-01', { month: 'long', year: 'numeric' }) + '</h1></div>' +
      '<div class="row"><button class="btn" id="calPrev" aria-label="Previous month">‹</button><button class="btn" id="calToday">This month</button><button class="btn" id="calNext" aria-label="Next month">›</button></div></div>' +
      '<div class="kpis">' +
      T.kpi('Month P&amp;L', T.money(ma.pnl, true), ma.n + ' trades', T.cls(ma.pnl)) +
      T.kpi('Win rate', T.pct(ma.wr)) +
      T.kpi('Green days', green + ' / ' + dayKeys.length) +
      T.kpi('Best day', ma.bestDay ? T.money(ma.bestDay.v, true) : '—', ma.bestDay ? T.fmtDate(ma.bestDay.d) : '', ma.bestDay ? T.cls(ma.bestDay.v) : '') +
      T.kpi('Worst day', ma.worstDay ? T.money(ma.worstDay.v, true) : '—', ma.worstDay ? T.fmtDate(ma.worstDay.d) : '', ma.worstDay ? T.cls(ma.worstDay.v) : '') +
      T.kpi('Current streak', streak ? streak + (sType > 0 ? ' green' : ' red') + ' day' + (streak > 1 ? 's' : '') : '—', 'Trading days in a row', sType > 0 ? 'pos' : sType < 0 ? 'neg' : '') +
      '</div>' +
      '<section class="panel"><div class="cal">' + cells + '</div></section>' +
      '<div class="grid g-main">' +
      '<section class="panel" id="daySec">' + (S.calSel ? dayPanel(S.calSel, sel) : '<p class="muted small" style="margin:0">Click a day to see its trades and write a note.</p>') + '</section>' +
      '<section class="panel"><div class="panel-head"><h2>' + yr + ' by month</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="n">Trades</th><th class="n">Net</th></tr></thead><tbody>' +
      months.map(function (x, i) { return '<tr data-m="' + x.k + '" style="cursor:pointer"><td>' + MONTHS[i] + '</td><td class="n num">' + (x.n || '—') + '</td><td class="n num ' + T.cls(x.pnl) + '">' + (x.n ? T.money(x.pnl, true) : '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div></section></div>';
    var shift = function (n) { var d2 = new Date(Date.UTC(y, mo - 1 + n, 1)); S.calMonth = d2.toISOString().slice(0, 7); S.calSel = null; T.render(); };
    $('#calPrev', el).onclick = function () { shift(-1); };
    $('#calNext', el).onclick = function () { shift(1); };
    $('#calToday', el).onclick = function () { S.calMonth = ds.slice(0, 7); S.calSel = ds; T.render(); };
    $$('.day[data-d]', el).forEach(function (c) { if (c.dataset.d) c.onclick = function () { S.calSel = c.dataset.d; T.render(); }; });
    $$('[data-m]', el).forEach(function (r) { r.onclick = function () { S.calMonth = r.dataset.m; S.calSel = null; T.render(); }; });
    T.bindInsightHead(el); T.bindRows(el); bindNote(el);
  };
  function dayPanel(day, list) {
    var a = T.aggregate(list);
    return '<div class="panel-head"><div><h2>' + T.fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' }) + '</h2><p>' + (list.length ? a.n + ' trades · <span class="num ' + T.cls(a.pnl) + '">' + T.money(a.pnl, true) + '</span> · win rate ' + T.pct(a.wr) : 'No trades') + '</p></div></div>' +
      T.tradeRows(list, 'No trades on this day.') +
      '<label class="f" style="margin-top:14px">Day note <span class="hint">market observations, mood, plan for tomorrow</span><textarea id="dayNote" data-day="' + day + '">' + esc(S.notes[day] || '') + '</textarea></label>' +
      '<div class="row end" style="margin-top:8px"><span class="small muted" id="noteSt"></span><button class="btn sm" type="button" id="noteSave">Save note</button></div>';
  }
  function bindNote(el) {
    var ta = $('#dayNote', el); if (!ta) return;
    var save = function () {
      var day = ta.dataset.day, text = ta.value;
      $('#noteSt').textContent = 'Saving…';
      T.api('save_note', { day: day, text: text }).then(function () { if (text.trim()) S.notes[day] = text; else delete S.notes[day]; $('#noteSt').textContent = 'Saved'; })
        .catch(function (e) { $('#noteSt').textContent = e.message; });
    };
    $('#noteSave', el).onclick = save;
    var t; ta.oninput = function () { clearTimeout(t); $('#noteSt').textContent = 'Not saved'; t = setTimeout(save, 1500); };
  }

  // ================= ANALYTICS =================
  S.atab = T.store('tj-atab') || 'overview';
  var ATABS = [['overview', 'Overview'], ['strategies', 'Strategies'], ['psychology', 'Psychology'], ['mistakes', 'Mistakes'], ['time', 'Sessions & time'], ['risk', 'Risk'], ['rules', 'Rules']];
  T.views.analytics = function (el) {
    if (!T.can('analytics')) { el.innerHTML = T.insightHead('analytics') + '<div class="page-head"><div><h1>Analytics</h1></div></div>' + T.lockedPanel('analytics'); T.bindInsightHead(el); return; }
    var list = inPeriod(T.scoped(), S.period);
    el.innerHTML = T.insightHead('analytics') + '<div class="page-head"><div><h1>Analytics</h1><p>' + list.length + ' trades · ' + (S.scope === 'all' ? 'all accounts' : S.scope) + '</p></div><div class="row">' + periodSwitch(S.period) + '</div></div>' +
      '<div class="tabs" role="tablist">' + ATABS.map(function (t) { return '<button class="tab" role="tab" data-at="' + t[0] + '" aria-selected="' + (S.atab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="aBody" class="grid"></div>';
    $$('[data-at]', el).forEach(function (b) { b.onclick = function () { S.atab = b.dataset.at; T.store('tj-atab', S.atab); T.render(); }; });
    T.bindInsightHead(el); bindPeriod(el);
    var body = $('#aBody', el);
    if (!list.length) { body.innerHTML = '<section class="panel"><div class="empty">No trades in this period.</div></section>'; return; }
    body.innerHTML = (A[S.atab] || A.overview)(list);
  };
  function panel(title, html, sub) { return '<section class="panel"><div class="panel-head"><div><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div></div>' + html + '</section>'; }
  function compareCard(title, a, good) {
    return '<div class="kpi" style="border-color:' + (good ? 'color-mix(in srgb,var(--win) 45%,transparent)' : 'color-mix(in srgb,var(--loss) 45%,transparent)') + '"><span class="label">' + title + '</span>' +
      '<span class="v ' + T.cls(a.pnl) + '">' + T.money(a.pnl, true) + '</span><span class="s">' + a.n + ' trades · win rate ' + T.pct(a.wr) + ' · avg ' + T.rfmt(a.expR) + '</span></div>';
  }
  function hourChart(list) {
    var by = {}; list.forEach(function (t) { if (!t.trade_time) return; var h = +t.trade_time.slice(0, 2); (by[h] = by[h] || []).push(t); });
    var vals = []; for (var h = 0; h < 24; h++) vals.push(by[h] ? T.aggregate(by[h]) : null);
    var max = Math.max.apply(null, vals.map(function (a) { return a ? Math.abs(a.pnl) : 0; })) || 1;
    var W = 820, H = 220, L = 10, B = 30, bw = (W - L * 2) / 24, mid = (H - B) / 2 + 4;
    var bars = vals.map(function (a, i) {
      var x = L + i * bw + 3, lab = '<text' + (i % 2 ? ' class="odd"' : '') + ' x="' + (x + bw / 2 - 3) + '" y="' + (H - 6) + '" text-anchor="middle">' + T.pad(i) + '</text>';
      if (!a) return lab;
      var hgt = Math.abs(a.pnl) / max * (mid - 10), y = a.pnl >= 0 ? mid - hgt : mid;
      return '<rect x="' + x + '" y="' + y + '" width="' + (bw - 6) + '" height="' + Math.max(1, hgt) + '" rx="2" fill="' + (a.pnl >= 0 ? 'var(--win)' : 'var(--loss)') + '"><title>' + T.pad(i) + ':00 · ' + a.n + ' trades · ' + T.money(a.pnl, true) + '</title></rect>' + lab;
    }).join('');
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Net P&L by hour of entry"><line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line-strong)"/>' + bars + '</svg></div>';
  }
  var A = {
    overview: function (list) {
      return kpiBlock(T.aggregate(list)) +
        '<div class="grid g2">' +
        panel('By instrument', T.groupTable(T.groupBy(list, function (t) { return t.pair; }), 'Symbol')) +
        panel('By instrument type', T.groupTable(T.groupBy(list, function (t) { return t.instrument_type || 'Other'; }), 'Type')) +
        panel('Long vs short', T.groupTable(T.groupBy(list, function (t) { return t.direction === 'buy' ? 'Long' : 'Short'; }), 'Direction')) +
        panel('By market condition', T.groupTable(T.groupBy(list, function (t) { return t.market_condition || null; }), 'Condition', { empty: 'Pick a market condition when you log trades.' })) +
        '</div>';
    },
    strategies: function (list) {
      var g = T.groupBy(list, function (t) { return t.strategy || 'No strategy'; });
      var rows = Object.keys(g).map(function (k) { return { k: k, a: T.aggregate(g[k]) }; }).sort(function (x, y) { return y.a.pnl - x.a.pnl; });
      return panel('Strategy performance', '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Strategy</th><th class="n">Trades</th><th class="n">Win rate</th><th class="n">Profit factor</th><th class="n">Avg planned RR</th><th class="n">Avg R</th><th class="n">Expectancy</th><th class="n">Net</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var a = r.a;
          return '<tr><td>' + esc(r.k) + '</td><td class="n num">' + a.n + '</td><td class="n num">' + T.pct(a.wr) + '</td><td class="n num">' + (a.pf == null ? '—' : a.pf === Infinity ? '∞' : a.pf.toFixed(2)) + '</td>' +
            '<td class="n num">' + (a.avgRR == null ? '—' : '1:' + a.avgRR.toFixed(2)) + '</td><td class="n num ' + T.cls(a.expR) + '">' + T.rfmt(a.expR) + '</td><td class="n num ' + T.cls(a.exp) + '">' + T.money(a.exp, true) + '</td><td class="n num ' + T.cls(a.pnl) + '">' + T.money(a.pnl, true) + '</td></tr>';
        }).join('') + '</tbody></table></div>', 'Most profitable first') +
        (rows.length > 1 ? '<div class="grid g2">' + compareCard('Most profitable: ' + esc(rows[0].k), rows[0].a, true) + compareCard('Least profitable: ' + esc(rows[rows.length - 1].k), rows[rows.length - 1].a, false) + '</div>' : '') +
        '<div class="grid g2">' + Object.keys(g).slice(0, 6).map(function (k) { return panel(esc(k), T.groupTable(T.groupBy(g[k], function (t) { return T.windowName(t.session); }), 'Window')); }).join('') + '</div>';
    },
    psychology: function (list) {
      var em = function (f) { return T.groupBy(list, function (t) { return t[f] || null; }); };
      var plan = T.aggregate(list.filter(function (t) { return t.followed_plan; })), noPlan = T.aggregate(list.filter(function (t) { return !t.followed_plan; }));
      var emo = T.aggregate(list.filter(function (t) { return t.emotional; })), calm = T.aggregate(list.filter(function (t) { return !t.emotional; }));
      return '<div class="grid g2">' + compareCard('Followed my plan', plan, true) + compareCard('Did not follow my plan', noPlan, false) +
        compareCard('Not emotional', calm, true) + compareCard('Revenge / emotional', emo, false) + '</div>' +
        '<div class="grid g2">' +
        panel('Emotion before entry', T.groupTable(em('mood'), 'Emotion', { byPnl: true, empty: 'Pick an emotion when you log trades.' })) +
        panel('Emotion during the trade', T.groupTable(em('emotion_during'), 'Emotion', { byPnl: true, empty: 'No data yet.' })) +
        panel('Emotion after the trade', T.groupTable(em('emotion_after'), 'Emotion', { byPnl: true, empty: 'No data yet.' })) +
        panel('Confidence level', T.groupTable(T.groupBy(list, function (t) { return t.confidence ? t.confidence + ' / 5' : null; }), 'Confidence', { order: ['1 / 5', '2 / 5', '3 / 5', '4 / 5', '5 / 5'], empty: 'Rate your confidence when you log trades.' })) +
        '</div>';
    },
    mistakes: function (list) {
      var g = T.groupBy(list, function (t) { return t.mistakes || []; });
      var none = T.aggregate(list.filter(function (t) { return !(t.mistakes || []).length; }));
      var rows = Object.keys(g).map(function (k) { return { k: k, a: T.aggregate(g[k]) }; }).sort(function (x, y) { return x.a.pnl - y.a.pnl; });
      var cost = rows.reduce(function (s, r) { return s + Math.min(0, r.a.pnl); }, 0);
      var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.a.pnl); })) || 1;
      return '<div class="kpis">' + T.kpi('Trades with a mistake', list.filter(function (t) { return (t.mistakes || []).length; }).length + ' / ' + list.length) +
        T.kpi('Net on those trades', T.money(T.aggregate(list.filter(function (t) { return (t.mistakes || []).length; })).pnl, true), '', T.cls(T.aggregate(list.filter(function (t) { return (t.mistakes || []).length; })).pnl)) +
        T.kpi('Net with no mistakes', T.money(none.pnl, true), none.n + ' trades · win rate ' + T.pct(none.wr), T.cls(none.pnl)) +
        T.kpi('Losses from mistakes', T.money(cost), 'Sum of losing mistake groups', cost < 0 ? 'neg' : '') + '</div>' +
        panel('What each mistake costs', rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mistake</th><th class="n">Times</th><th class="n">Win rate</th><th class="n">Avg per trade</th><th class="n">Total</th><th>Cost</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td>' + esc(r.k) + '</td><td class="n num">' + r.a.n + '</td><td class="n num">' + T.pct(r.a.wr) + '</td><td class="n num ' + T.cls(r.a.exp) + '">' + T.money(r.a.exp, true) + '</td>' +
              '<td class="n num ' + T.cls(r.a.pnl) + '">' + T.money(r.a.pnl, true) + '</td><td><div class="bar"><i class="' + (r.a.pnl < 0 ? 'neg' : '') + '" style="width:' + Math.round(Math.abs(r.a.pnl) / max * 140) + 'px"></i></div></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">No mistakes tagged in this period. Tag them in the trade form to see what they cost.</div>', 'Costliest first');
    },
    time: function (list) {
      var order = S.prefs.windows.map(function (w) { return w.name; }).concat(['Other']);
      return panel('Net P&amp;L by hour of entry', hourChart(list), 'Your time zone: ' + esc(S.prefs.timezone)) +
        '<div class="grid g2">' +
        panel('By trading window', T.groupTable(T.groupBy(list, function (t) { return T.windowName(t.session); }), 'Window', { order: order })) +
        panel('By weekday', T.groupTable(T.groupBy(list, function (t) { return weekday(t.trade_date); }), 'Day', { order: WEEKDAYS })) +
        panel('By month', T.groupTable(T.groupBy(list, function (t) { return t.trade_date.slice(0, 7); }), 'Month', { name: function (k) { return T.fmtDate(k + '-01', { month: 'short', year: 'numeric' }); }, order: Object.keys(T.groupBy(list, function (t) { return t.trade_date.slice(0, 7); })).sort() })) +
        panel('By hour', T.groupTable(T.groupBy(list.filter(function (t) { return t.trade_time; }), function (t) { return t.trade_time.slice(0, 2) + ':00'; }), 'Hour', { order: Array.from({ length: 24 }, function (_, i) { return T.pad(i) + ':00'; }) })) +
        '</div>';
    },
    risk: function (list) {
      var r = S.prefs.rules, lim = S.settings.risk_pct / 100;
      var withRisk = list.filter(function (t) { return t._.riskPct != null; });
      var buckets = { '≤ 1%': [], '1–2%': [], '2–5%': [], '5–10%': [], '> 10%': [] };
      withRisk.forEach(function (t) { var p = t._.riskPct * 100; (p <= 1 ? buckets['≤ 1%'] : p <= 2 ? buckets['1–2%'] : p <= 5 ? buckets['2–5%'] : p <= 10 ? buckets['5–10%'] : buckets['> 10%']).push(t); });
      Object.keys(buckets).forEach(function (k) { if (!buckets[k].length) delete buckets[k]; });
      var avgRisk = withRisk.length ? withRisk.reduce(function (s, t) { return s + t._.riskPct; }, 0) / withRisk.length : null;
      var over = list.filter(function (t) { return t._.flags.some(function (f) { return f.k === 'risk'; }); });
      var days = T.groupBy(list, function (t) { return t.trade_date; }), lossDays = 0, limitDays = 0;
      Object.keys(days).forEach(function (d) {
        var dl = days[d], L = dl.filter(function (t) { return t.result === 'L'; }).length;
        if (r.max_losses_day && L > r.max_losses_day) lossDays++;
        if (dl.some(function (t) { return t._.flags.some(function (f) { return f.k === 'dailyloss' || f.k === 'maxloss'; }); })) limitDays++;
      });
      var a = T.aggregate(list);
      return '<div class="kpis">' +
        T.kpi('Avg risk per trade', avgRisk == null ? '—' : T.pct(avgRisk, 1), 'Limit ' + S.settings.risk_pct + '%', avgRisk > lim * 1.05 ? 'neg' : '') +
        T.kpi('Over-risked trades', over.length, over.length ? T.money(T.aggregate(over).pnl, true) + ' net' : 'None', over.length ? 'neg' : '') +
        T.kpi('Max drawdown', a.mdd ? '-' + T.money(a.mdd) : T.money(0), T.pct(a.mddPct, 1) + ' from peak', a.mdd ? 'neg' : '') +
        T.kpi('Longest losing run', a.streakL + ' trades') +
        T.kpi('Days over loss limit', limitDays, r.max_losses_day ? 'Max ' + r.max_losses_day + ' losses/day' : '', limitDays ? 'neg' : '') +
        T.kpi('Avg planned RR', a.avgRR == null ? '—' : '1:' + a.avgRR.toFixed(2), 'Target 1:' + r.target_rr, a.avgRR != null && a.avgRR < r.target_rr * 0.97 ? 'neg' : '') +
        '</div>' +
        '<div class="grid g2">' +
        panel('Results by risk size', T.groupTable(buckets, 'Risk % of balance', { order: ['≤ 1%', '1–2%', '2–5%', '5–10%', '> 10%'], empty: 'Enter a risk amount on live trades to see this.' })) +
        panel('Results by planned RR', T.groupTable(T.groupBy(list.filter(function (t) { return t._.rr != null; }), function (t) { var x = t._.rr; return x < 1 ? '< 1:1' : x < 2 ? '1:1 – 1:2' : x < 3 ? '1:2 – 1:3' : '1:3 +'; }), 'Planned RR', { order: ['< 1:1', '1:1 – 1:2', '1:2 – 1:3', '1:3 +'], empty: 'Add entry, SL and TP to trades to see this.' })) +
        '</div>' +
        panel('Rule-limit violations', over.length || limitDays ? T.tradeRows(list.filter(function (t) { return t._.flags.some(function (f) { return ['risk', 'maxloss', 'dailyloss', 'overtrade'].indexOf(f.k) >= 0; }); }).slice().reverse().slice(0, 30)) : '<div class="empty">No risk-limit violations in this period.</div>', 'Over-risked trades and trades past your daily limits');
    },
    rules: function (list) {
      var rv = list.filter(function (t) { return !t._.pending; }), pend = list.length - rv.length;
      var isBroken = function (t) { return t._.flags.some(function (f) { return !f.mistake; }); };
      var clean = T.aggregate(rv.filter(function (t) { return !isBroken(t); })), broken = T.aggregate(rv.filter(isBroken));
      var fs = {}; rv.forEach(function (t) { t._.flags.forEach(function (f) { if (f.mistake) return; var k = f.k === 'checklist' ? 'Checklist incomplete' : f.k === 'rr' ? 'TP below target RR' : f.l; (fs[k] = fs[k] || []).push(t); }); });
      var skip = {}; S.prefs.checklist.forEach(function (c) { var miss = rv.filter(function (t) { return !(t.checklist || {})[c.id]; }); if (miss.length) skip[c.text] = miss; });
      return '<div class="grid g2">' + compareCard('Rules followed', clean, true) + compareCard('Rules broken', broken, false) + '</div>' +
        (pend ? '<p class="small muted" style="margin:0">' + pend + ' synced trade' + (pend > 1 ? 's' : '') + ' not reviewed yet are left out.</p>' : '') +
        '<div class="grid g2">' + panel('Results by broken rule', T.groupTable(fs, 'Rule', { byPnl: true, empty: 'No rule breaks. Keep it that way.' })) +
        panel('Checklist items skipped', T.groupTable(skip, 'Item not ticked', { byPnl: true, empty: 'Every checklist item ticked on every trade.' })) + '</div>';
    }
  };

  // ================= REPORTS =================
  var R = { preset: 'month', from: '', to: '', strategy: '' };
  function presetRange(k) {
    var t = T.todayStr(), ws = T.weekStart(t);
    if (k === 'week') return [ws, t];
    if (k === 'lastweek') return [T.addDays(ws, -7), T.addDays(ws, -1)];
    if (k === 'month') return [t.slice(0, 8) + '01', t];
    if (k === 'lastmonth') { var d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 2, 1)); var f = d.toISOString().slice(0, 10); var e = T.addDays(t.slice(0, 8) + '01', -1); return [f, e]; }
    if (k === 'year') return [t.slice(0, 4) + '-01-01', t];
    if (k === 'today') return [t, t];
    return [R.from || t.slice(0, 8) + '01', R.to || t];
  }
  T.views.reports = function (el) {
    if (!T.can('reports')) { el.innerHTML = T.insightHead('reports') + '<div class="page-head"><div><h1>Reports</h1></div></div>' + T.lockedPanel('reports'); T.bindInsightHead(el); return; }
    var rg = presetRange(R.preset), from = rg[0], to = rg[1];
    var list = T.scoped().filter(function (t) { return t.trade_date >= from && t.trade_date <= to && (!R.strategy || t.strategy === R.strategy); });
    var a = T.aggregate(list), s = S.site || {};
    var strategies = Object.keys(T.groupBy(T.scoped(), function (t) { return t.strategy || null; })).sort();
    var days = T.groupBy(list, function (t) { return t.trade_date; });
    var top = list.slice().sort(function (x, y) { return y.pnl - x.pnl; });
    var lessons = list.filter(function (t) { return t.lessons; });
    var notes = Object.keys(S.notes).filter(function (d) { return d >= from && d <= to; }).sort();
    var opt = T.opt;
    el.innerHTML =
      T.insightHead('reports') + '<div class="page-head no-print"><div><h1>Reports</h1><p>Pick a period, then print or save as PDF</p></div></div>' +
      '<section class="panel no-print"><div class="fg">' +
      '<label class="f">Period<select id="rPre">' + opt([['today', 'Today'], ['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom range']], R.preset) + '</select></label>' +
      '<label class="f">From<input id="rFrom" type="date" value="' + from + '"' + (R.preset === 'custom' ? '' : ' disabled') + '></label>' +
      '<label class="f">To<input id="rTo" type="date" value="' + to + '"' + (R.preset === 'custom' ? '' : ' disabled') + '></label>' +
      '<label class="f">Strategy<select id="rStrat">' + opt(strategies, R.strategy, 'All strategies') + '</select></label>' +
      '</div><div class="row end" style="margin-top:12px"><a class="btn" href="/api/app?action=export&from=' + from + '&to=' + to + '">' + T.icon('download') + 'CSV for this period</a><button class="btn primary" type="button" id="rPrint">' + T.icon('print') + 'Print / Save as PDF</button></div></section>' +
      '<div class="grid" id="report">' +
      '<section class="panel"><div class="row between"><div class="row" style="gap:12px">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="" style="width:40px;height:40px;object-fit:contain">' : '<span class="mono-mark" style="width:40px;height:40px">' + esc(T.initials(s.name)) + '</span>') +
      '<div><div class="eyebrow">' + esc(s.name || '') + ' · Performance report</div><h1>' + esc(S.user.name) + '</h1></div></div>' +
      '<div class="small muted" style="text-align:right">' + T.fmtDate(from, { day: 'numeric', month: 'short', year: 'numeric' }) + ' – ' + T.fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' }) +
      '<br>' + (R.strategy ? 'Strategy: ' + esc(R.strategy) + ' · ' : '') + (S.scope === 'all' ? 'All accounts' : S.scope + ' account') + ' · Generated ' + T.fmtDate(T.todayStr(), { day: 'numeric', month: 'short', year: 'numeric' }) + '</div></div></section>' +
      (list.length ? kpiBlock(a) +
        '<section class="panel chart"><div class="panel-head"><h2>Equity in this period</h2></div>' + T.equitySvg(list, { h: 200 }) + '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Daily summary</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th class="n">Trades</th><th class="n">W / L / BE</th><th class="n">Net R</th><th class="n">Net</th></tr></thead><tbody>' +
        Object.keys(days).sort().map(function (d) { var x = T.aggregate(days[d]); return '<tr><td>' + T.fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }) + '</td><td class="n num">' + x.n + '</td><td class="n num">' + x.W + ' / ' + x.L + ' / ' + x.B + '</td><td class="n num ' + T.cls(x.R) + '">' + T.rfmt(x.R) + '</td><td class="n num ' + T.cls(x.pnl) + '">' + T.money(x.pnl, true) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>' +
        '<div class="grid g2">' + panel('By strategy', T.groupTable(T.groupBy(list, function (t) { return t.strategy || 'No strategy'; }), 'Strategy')) +
        panel('By trading window', T.groupTable(T.groupBy(list, function (t) { return T.windowName(t.session); }), 'Window')) +
        panel('By instrument', T.groupTable(T.groupBy(list, function (t) { return t.pair; }), 'Symbol')) +
        panel('Mistakes', T.groupTable(T.groupBy(list, function (t) { return t.mistakes || []; }), 'Mistake', { byPnl: true, empty: 'No mistakes tagged.' })) +
        panel('Emotion before entry', T.groupTable(T.groupBy(list, function (t) { return t.mood || null; }), 'Emotion', { byPnl: true, empty: 'No emotions logged.' })) +
        panel('Best and worst trades', '<div class="tbl-wrap"><table class="tbl"><tbody>' + top.slice(0, 3).concat(top.length > 3 ? top.slice(-3) : []).map(function (t) {
          return '<tr><td class="num">' + T.fmtDate(t.trade_date) + '</td><td>' + esc(t.pair) + '</td><td>' + esc(t.strategy || '') + '</td><td class="n num ' + T.cls(t.pnl) + '">' + T.money(t.pnl, true) + '</td></tr>';
        }).join('') + '</tbody></table></div>') + '</div>' +
        (lessons.length ? panel('Lessons learned', '<ul class="steps" style="margin:0">' + lessons.slice(-20).map(function (t) { return '<li><span class="num muted">' + T.fmtDate(t.trade_date) + ' ' + esc(t.pair) + '</span> — ' + esc(t.lessons) + '</li>'; }).join('') + '</ul>') : '') +
        (notes.length ? panel('Day notes', '<div class="stack">' + notes.map(function (d) { return '<div><b class="num small">' + T.fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }) + '</b><p class="small" style="margin:2px 0 0;white-space:pre-wrap">' + esc(S.notes[d]) + '</p></div>'; }).join('') + '</div>') : '')
        : '<section class="panel"><div class="empty">No trades in this period.</div></section>') +
      '</div>';
    var upd = function () { R.preset = $('#rPre').value; R.from = $('#rFrom').value; R.to = $('#rTo').value; R.strategy = $('#rStrat').value; T.render(); };
    ['#rPre', '#rFrom', '#rTo', '#rStrat'].forEach(function (s2) { $(s2, el).onchange = upd; });
    $('#rPrint', el).onclick = function () { window.print(); };
    T.bindInsightHead(el);
  };

  // ================= PLAN & NOTES =================
  T.views.plan = function (el) {
    if (!T.can('plan_notes')) { el.innerHTML = '<div class="page-head"><div><h1>Plan &amp; notes</h1></div></div>' + T.lockedPanel('plan_notes'); return; }
    var p = S.prefs, today = T.todayStr();
    var noteDays = Object.keys(S.notes).sort().reverse().slice(0, 30);
    el.innerHTML =
      '<div class="page-head"><div><h1>Plan &amp; notes</h1><p>Your trading plan, watchlist and daily market notes</p></div></div>' +
      '<div class="grid g-main">' +
      '<section class="panel"><div class="panel-head"><div><h2>Trading plan</h2><p>Your rules, setups and goals. Simple Markdown: # heading, - list, **bold**</p></div><div class="segtabs"><button type="button" id="pEdit" aria-pressed="' + !!S.planEdit + '">Edit</button><button type="button" id="pView" aria-pressed="' + !S.planEdit + '">Preview</button></div></div>' +
      (S.planEdit ? '<textarea id="planTx" style="min-height:360px">' + esc(p.plan) + '</textarea><div class="row end" style="margin-top:10px"><button class="btn primary" id="planSave" type="button">Save plan</button></div>'
        : (p.plan ? '<div class="prose">' + T.md(p.plan) + '</div>' : '<div class="empty">No trading plan yet. Click Edit to write one: markets you trade, setups, entry and exit rules, risk rules, and what you do after a loss.</div>')) + '</section>' +
      '<div class="grid">' +
      '<section class="panel"><div class="panel-head"><h2>Watchlist</h2></div><div class="listed" id="wl">' + (p.watchlist || []).map(function (w, i) {
        return '<div class="lrow"><b class="num">' + esc(w.symbol) + '</b><span class="small muted">' + esc(w.note) + '</span><button class="btn sm ghost" type="button" data-wx="' + i + '" aria-label="Remove">×</button></div>';
      }).join('') + '</div>' +
      '<form id="wlForm" class="row" style="margin-top:10px;flex-wrap:nowrap"><input id="wlSym" placeholder="Symbol" style="max-width:110px" class="num" required><input id="wlNote" placeholder="Why it is on the list"><button class="btn" type="submit">Add</button></form></section>' +
      '<section class="panel"><div class="panel-head"><h2>Today\'s note</h2></div><textarea id="dayNote" data-day="' + today + '" placeholder="Market observations, news, levels to watch…">' + esc(S.notes[today] || '') + '</textarea>' +
      '<div class="row end" style="margin-top:8px"><span class="small muted" id="noteSt"></span><button class="btn sm" type="button" id="noteSave">Save note</button></div></section>' +
      '<section class="panel"><div class="panel-head"><h2>Recent notes</h2></div>' + (noteDays.length ? '<div class="stack">' + noteDays.map(function (d) { return '<div><b class="num small">' + T.fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + '</b><p class="small" style="margin:2px 0 0;white-space:pre-wrap;color:var(--fg-2)">' + esc(S.notes[d]) + '</p></div>'; }).join('') + '</div>' : '<div class="empty">No notes yet.</div>') + '</section>' +
      '</div></div>';
    var savePrefs = function (patch, msg) { return T.api('save_prefs', { prefs: patch }).then(function (j) { S.prefs = j.prefs; T.toast(msg || 'Saved'); T.render(); }).catch(function (e) { T.toast(e.message, true); }); };
    $('#pEdit', el).onclick = function () { S.planEdit = true; T.render(); };
    $('#pView', el).onclick = function () { S.planEdit = false; T.render(); };
    var ps = $('#planSave', el); if (ps) ps.onclick = function () { S.planEdit = false; savePrefs({ plan: $('#planTx').value }, 'Plan saved'); };
    $('#wlForm', el).onsubmit = function (e) { e.preventDefault(); var wl = (p.watchlist || []).concat([{ symbol: $('#wlSym').value, note: $('#wlNote').value }]); savePrefs({ watchlist: wl }, 'Added'); };
    $$('[data-wx]', el).forEach(function (b) { b.onclick = function () { var wl = p.watchlist.slice(); wl.splice(+b.dataset.wx, 1); savePrefs({ watchlist: wl }, 'Removed'); }; });
    bindNote(el);
  };
})();
