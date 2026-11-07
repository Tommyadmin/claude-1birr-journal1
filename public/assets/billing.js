/* Trade journal — Subscription page, manual telebirr / crypto payments, admin review and plan settings. */
(function () {
  'use strict';
  var T = window.TJ, S = T.S, $ = T.$, $$ = T.$$, esc = T.esc;
  var FEATURE_ORDER = ['analytics', 'reports', 'import', 'screenshots', 'mt5', 'plan_notes', 'priority_support'];
  var usd = function (v) { return '$' + T.n(v, v % 1 ? 2 : 0); };
  var etb = function (v) { return T.n(v, v % 1 ? 2 : 0) + ' ETB'; };
  S.period = S.period || 'month';
  var billPeriod = T.store('tj-billp') || 'month';

  function limitsText(p) {
    var l = p.limits || {};
    return [l.trades_month ? l.trades_month + ' new trades a month' : 'Unlimited trades',
      p.features.mt5 ? (l.mt5_accounts ? l.mt5_accounts + ' MT5 account' + (l.mt5_accounts > 1 ? 's' : '') : 'Unlimited MT5 accounts') : null].filter(Boolean);
  }
  function copyBtn(val) { return '<button class="btn sm" type="button" data-copyv="' + esc(val) + '">Copy</button>'; }
  function bindCopy(root) {
    $$('[data-copyv]', root).forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.copyv;
        var ok = function () { T.toast('Copied'); };
        if (navigator.clipboard) navigator.clipboard.writeText(v).then(ok, function () { window.prompt('Copy this:', v); }); else window.prompt('Copy this:', v);
      };
    });
  }

  // ================= USER: SUBSCRIPTION =================
  T.views.billing = function (el) {
    el.innerHTML = '<div class="page-head"><div><h1>Subscription</h1><p>Choose a plan and pay with telebirr or crypto</p></div></div><section class="panel"><p class="muted">Loading plans…</p></section>';
    T.api('billing').then(function (j) {
      S.ent = j.ent;
      var e = j.ent, plans = j.plans, feat = j.features, pay = j.payment;
      var statusTxt = e.admin ? 'Admins have every feature.' :
        e.plan === 'free' ? (e.lapsed ? 'Your ' + esc(e.lapsed.name) + ' access ended. You are on the Free plan.' : 'You are on the Free plan.') :
        (e.on_trial ? 'Free trial' : 'Active') + (e.expires_at ? ' until <b class="num">' + T.fmtDate(e.expires_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) + '</b> (' + e.days_left + ' day' + (e.days_left === 1 ? '' : 's') + ' left)' : ' with no end date');
      var lim = e.limits || {};
      var card = function (id) {
        var p = plans[id], price = billPeriod === 'year' ? p.price_year : p.price_month, pe = billPeriod === 'year' ? p.price_year_etb : p.price_month_etb;
        var current = e.plan === id && !e.on_trial && !e.admin;
        return '<section class="panel" style="display:flex;flex-direction:column;gap:12px;' + (p.highlight ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),var(--shadow)' : '') + '">' +
          '<div class="row between"><h2>' + esc(p.name) + '</h2>' + (p.highlight ? '<span class="pill acc">Most popular</span>' : '') + (current ? '<span class="pill ok">Current</span>' : '') + '</div>' +
          '<p class="small muted" style="margin:0;min-height:2.6em">' + esc(p.description) + '</p>' +
          '<div><span class="num" style="font-size:28px;font-weight:600">' + usd(price) + '</span><span class="muted small"> / ' + (billPeriod === 'year' ? 'year' : 'month') + '</span>' +
          (pe ? '<div class="small muted num">or ' + etb(pe) + ' with telebirr</div>' : '') +
          (billPeriod === 'year' && p.price_month ? '<div class="small pos">Save ' + Math.max(0, Math.round((1 - p.price_year / (p.price_month * 12)) * 100)) + '% vs monthly</div>' : '') + '</div>' +
          '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:7px;font-size:13.5px">' +
          ['Trade journal, Today checklist, calendar, dashboard, CSV export'].concat(limitsText(p)).map(function (x) { return '<li class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start"><span class="pos">✓</span><span>' + esc(x) + '</span></li>'; }).join('') +
          FEATURE_ORDER.map(function (f) {
            var on = p.features[f];
            return '<li class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start;' + (on ? '' : 'color:var(--faint)') + '"><span class="' + (on ? 'pos' : '') + '">' + (on ? '✓' : '—') + '</span><span>' + esc(feat[f]) + '</span></li>';
          }).join('') + '</ul>' +
          '<button class="btn ' + (p.highlight ? 'primary' : '') + '" type="button" data-buy="' + id + '" style="margin-top:auto"' + (e.admin ? ' disabled' : '') + '>' + (current ? 'Renew ' : 'Choose ') + esc(p.name) + '</button></section>';
      };
      var stat = { pending: '<span class="pill warn">Waiting for review</span>', approved: '<span class="pill ok">Approved</span>', rejected: '<span class="pill bad">Rejected</span>' };
      el.innerHTML = '<div class="page-head"><div><h1>Subscription</h1><p>Choose a plan and pay with telebirr or crypto</p></div>' +
        '<div class="segtabs" role="group" aria-label="Billing period"><button type="button" data-bp="month" aria-pressed="' + (billPeriod === 'month') + '">Monthly</button><button type="button" data-bp="year" aria-pressed="' + (billPeriod === 'year') + '">Yearly</button></div></div>' +
        '<section class="panel"><div class="row between"><div><div class="eyebrow">Your plan</div><h2>' + esc(e.name) + (e.on_trial ? ' <span class="pill warn">Trial</span>' : '') + '</h2><p class="small muted" style="margin:4px 0 0">' + statusTxt + '</p></div>' +
        '<div class="kv"><dt>Trades this month</dt><dd class="num">' + S.monthTrades + (lim.trades_month ? ' / ' + lim.trades_month : ' · unlimited') + '</dd><dt>MT5 sync</dt><dd>' + (e.features.mt5 ? (lim.mt5_accounts ? lim.mt5_accounts + ' account' + (lim.mt5_accounts > 1 ? 's' : '') : 'Unlimited accounts') : '—') + '</dd></div></div>' +
        (j.payments.some(function (x) { return x.status === 'pending'; }) ? '<p class="notice" style="margin:14px 0 0">A payment is waiting for review. Your plan switches on as soon as it is approved, usually within a few hours.</p>' : '') + '</section>' +
        '<div class="grid g3">' + ['starter', 'pro', 'ultimate'].map(card).join('') + '</div>' +
        '<p class="small muted" style="margin:0">' + esc(plans.free.name) + ' plan (after a trial or subscription ends): journal, checklist, calendar and dashboard' + (plans.free.limits.trades_month ? ', ' + plans.free.limits.trades_month + ' new trades a month' : '') + '. Your data is never deleted when a plan ends.</p>' +
        '<section class="panel"><div class="panel-head"><h2>Payment history</h2></div>' + (j.payments.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Plan</th><th>Method</th><th class="n">Amount</th><th>Reference</th><th>Status</th></tr></thead><tbody>' +
          j.payments.map(function (x) {
            return '<tr><td class="num small">' + esc(x.created_at) + '</td><td>' + esc((plans[x.plan] || {}).name || x.plan) + ' · ' + (x.period === 'year' ? 'yearly' : 'monthly') + '</td><td>' + (x.method === 'crypto' ? 'Crypto' : 'telebirr') + '</td>' +
              '<td class="n num">' + T.n(x.amount, 2) + ' ' + esc(x.currency) + '</td><td class="num small">' + esc(x.reference) + '</td><td>' + stat[x.status] + (x.admin_note ? '<br><span class="small muted">' + esc(x.admin_note) + '</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">No payments yet.</div>') + '</section>';
      $$('[data-bp]', el).forEach(function (b) { b.onclick = function () { billPeriod = b.dataset.bp; T.store('tj-billp', billPeriod); T.views.billing(el); }; });
      $$('[data-buy]', el).forEach(function (b) { b.onclick = function () { payDialog(b.dataset.buy, billPeriod, plans, pay, function () { T.views.billing(el); }); }; });
    }).catch(function (er) { el.innerHTML = '<p class="alert">' + esc(er.message) + '</p>'; });
  };

  function payDialog(planId, period, plans, pay, done) {
    var p = plans[planId], dlg = $('#modal');
    var methods = [];
    if (pay.telebirr.enabled) methods.push('telebirr');
    if (pay.crypto.enabled && pay.crypto.wallets.length) methods.push('crypto');
    if (!methods.length) { T.toast('Payments are not set up yet. Contact support.', true); return; }
    var method = methods[0], wallet = 0;
    var priceUsd = period === 'year' ? p.price_year : p.price_month, priceEtb = period === 'year' ? p.price_year_etb : p.price_month_etb;
    var draw = function () {
      var amount = method === 'telebirr' && priceEtb ? etb(priceEtb) : usd(priceUsd) + (method === 'crypto' ? ' in ' + esc(pay.crypto.wallets[wallet].coin) : '');
      var t = pay.telebirr, w = pay.crypto.wallets[wallet];
      dlg.innerHTML = '<form method="dialog" id="payF"><div class="dlg-head"><div><div class="eyebrow">' + esc(p.name) + ' · ' + (period === 'year' ? 'yearly' : 'monthly') + '</div><h2>Pay ' + amount + '</h2></div><button class="btn sm" type="button" id="pX">Close</button></div>' +
        '<div class="dlg-body">' +
        (methods.length > 1 ? '<div class="seg" role="radiogroup" aria-label="Payment method">' + methods.map(function (m) { return '<label><input type="radio" name="pm" value="' + m + '"' + (m === method ? ' checked' : '') + '>' + (m === 'crypto' ? 'Crypto' : 'telebirr') + '</label>'; }).join('') + '</div>' : '') +
        (method === 'telebirr' ?
          '<div class="sect"><h3>1. Send with telebirr</h3><dl class="kv">' +
          (t.account_name ? '<dt>Name</dt><dd><b>' + esc(t.account_name) + '</b></dd>' : '') +
          (t.number ? '<dt>Phone number</dt><dd class="row" style="gap:8px"><b class="num">' + esc(t.number) + '</b>' + copyBtn(t.number) + '</dd>' : '') +
          (t.merchant_code ? '<dt>Merchant code</dt><dd class="row" style="gap:8px"><b class="num">' + esc(t.merchant_code) + '</b>' + copyBtn(t.merchant_code) + '</dd>' : '') +
          '<dt>Amount</dt><dd><b class="num">' + (priceEtb ? etb(priceEtb) : usd(priceUsd) + ' (in ETB at today\'s rate)') + '</b></dd></dl>' +
          '<p class="small muted" style="margin:0">' + esc(t.instructions) + '</p></div>'
          :
          '<div class="sect"><h3>1. Send crypto</h3>' +
          (pay.crypto.wallets.length > 1 ? '<label class="f">Coin and network<select id="pW">' + pay.crypto.wallets.map(function (x, i) { return '<option value="' + i + '"' + (i === wallet ? ' selected' : '') + '>' + esc(x.coin + ' · ' + x.network) + '</option>'; }).join('') + '</select></label>' : '') +
          '<dl class="kv"><dt>Coin</dt><dd><b>' + esc(w.coin) + '</b></dd><dt>Network</dt><dd><b>' + esc(w.network) + '</b> <span class="small muted">send only on this network</span></dd>' +
          '<dt>Address</dt><dd class="row" style="gap:8px;flex-wrap:nowrap;min-width:0"><b class="num" style="overflow-wrap:anywhere;font-size:12.5px">' + esc(w.address || 'Not set yet') + '</b>' + (w.address ? copyBtn(w.address) : '') + '</dd>' +
          '<dt>Amount</dt><dd><b class="num">' + usd(priceUsd) + ' in ' + esc(w.coin) + '</b> <span class="small muted">plus network fee</span></dd></dl>' +
          '<p class="small muted" style="margin:0">' + esc(pay.crypto.instructions) + '</p></div>') +
        '<div class="sect"><h3>2. Tell us about your payment</h3><div class="fg">' +
        '<label class="f s2">' + (method === 'crypto' ? 'Transaction hash (TxID)' : 'telebirr transaction number') + '<input id="pRef" class="num" required maxlength="120" placeholder="' + (method === 'crypto' ? '0x… or TRC20 hash' : 'e.g. CK12AB34CD') + '"></label>' +
        '<label class="f s2">' + (method === 'crypto' ? 'Sending wallet (optional)' : 'Your telebirr name or phone') + '<input id="pPayer" maxlength="80"></label>' +
        '<label class="f s4">Screenshot of the payment <span class="hint">JPG or PNG. Helps us confirm faster.</span><input id="pProof" type="file" accept="image/*"></label>' +
        '<label class="f s4">Note (optional)<input id="pNote" maxlength="500"></label></div><div class="uplist" id="pUp"></div></div>' +
        '<p class="small muted" style="margin:0">We check every payment by hand. Your ' + esc(p.name) + ' plan starts as soon as it is approved, and you get a message in your inbox.</p>' +
        '</div><div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" id="pC">Cancel</button><button class="btn primary" type="submit" id="pGo">I have paid · Submit</button></div></div></form>';
      bindCopy(dlg);
      $('#pX').onclick = $('#pC').onclick = function () { dlg.close(); };
      $$('input[name=pm]', dlg).forEach(function (r) { r.onchange = function () { method = r.value; draw(); }; });
      var sw = $('#pW'); if (sw) sw.onchange = function () { wallet = +sw.value; draw(); };
      $('#payF').onsubmit = function (e) {
        e.preventDefault();
        var btn = $('#pGo'); btn.disabled = true; btn.textContent = 'Submitting…';
        T.api('submit_payment', { plan: planId, period: period, method: method, reference: $('#pRef').value, payer: $('#pPayer').value, note: $('#pNote').value,
          coin: method === 'crypto' ? w.coin + ' ' + w.network : '' }).then(function (r) {
          var f = $('#pProof').files[0];
          if (!f) return r;
          var setP = T.uploadList($('#pUp')).add(f.name);
          return T.shrinkImage(f, 1600, 0.85).then(function (blob) { return T.upload('/api/app?action=upload_proof&id=' + r.id, blob, function (x) { setP(x); }); })
            .then(function () { setP(1, 'ok'); return r; }, function (er) { setP(1, 'err'); T.toast('Payment saved, but the screenshot failed: ' + er.message, true); return r; });
        }).then(function () {
          dlg.close(); T.toast('Payment submitted. We will confirm it soon.'); done();
        }).catch(function (er) { btn.disabled = false; btn.textContent = 'I have paid · Submit'; T.toast(er.message, true); });
      };
    };
    draw();
    dlg.showModal();
  }

  // ================= ADMIN: SET A USER'S PLAN =================
  T.setPlanModal = function (u, plans, done) {
    var dlg = $('#modal');
    dlg.innerHTML = '<form method="dialog" id="spF"><div class="dlg-head"><div><div class="eyebrow">Change plan</div><h2>' + esc(u.name) + '</h2></div><button class="btn sm" type="button" id="spX">Close</button></div>' +
      '<div class="dlg-body"><p class="small muted" style="margin:0">Now: <b>' + esc(u.plan_name) + '</b>' + (u.days_left != null ? ', ' + u.days_left + ' days left' : u.lifetime ? ', no end date' : '') + '. Use this for gifts, refunds or payments made outside the app.</p>' +
      '<div class="fg"><label class="f s2">Plan<select id="spPlan">' + plans.map(function (p) { return '<option value="' + p.id + '"' + (p.id === u.plan_effective ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f s2">Length in days <span class="hint">0 = no end date</span><input id="spDays" type="number" min="0" max="3650" value="30"></label></div></div>' +
      '<div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" id="spC">Cancel</button><button class="btn primary" type="submit">Save plan</button></div></div></form>';
    $('#spX').onclick = $('#spC').onclick = function () { dlg.close(); };
    $('#spF').onsubmit = function (e) {
      e.preventDefault();
      T.adminApi('set_plan', { id: u.id, plan: $('#spPlan').value, days: $('#spDays').value }).then(function () { dlg.close(); T.toast('Plan updated'); done(); }).catch(function (er) { T.toast(er.message, true); });
    };
    dlg.showModal();
  };

  // ================= ADMIN: EDIT USER (type, status, subscription) =================
  T.editUserModal = function (u, j, done) {
    var dlg = $('#modal'), me = u.id === j.me;
    var cur = u.plan_effective, curDays = u.days_left != null ? u.days_left : 0;
    dlg.innerHTML = '<form method="dialog" id="euF"><div class="dlg-head"><div><div class="eyebrow">Edit user</div><h2>' + esc(u.name) + '</h2><p class="small muted" style="margin:2px 0 0">' + esc(u.email) + ' · ' + esc(u.phone || 'no phone') + '</p></div><button class="btn sm" type="button" id="euX">Close</button></div>' +
      '<div class="dlg-body">' +
      '<div class="sect"><h3>Account</h3><div class="fg">' +
      '<label class="f s2">User type<select id="euRole"' + (me ? ' disabled' : '') + '>' + T.opt([['user', 'User'], ['admin', 'Admin (full access, manages users)']], u.role) + '</select></label>' +
      '<label class="f s2">Status<select id="euStatus"' + (me ? ' disabled' : '') + '>' + T.opt((u.status === 'pending' ? [['pending', 'Waiting for approval']] : []).concat([['active', 'Active'], ['disabled', 'Disabled (cannot sign in)']]), u.status) + '</select></label>' +
      (me ? '<p class="small muted s4" style="margin:0">You cannot change your own type or status.</p>' : '') + '</div></div>' +
      '<div class="sect"><h3>Subscription</h3><p class="small muted" style="margin:0">Now: <b>' + esc(u.plan_name) + '</b>' + (u.on_trial && cur !== 'free' ? ' (trial)' : '') +
      (u.days_left != null ? ', ' + u.days_left + ' days left' : u.lifetime && u.role !== 'admin' ? ', no end date' : '') + (u.role === 'admin' ? '. Admins always have every feature.' : '.') + '</p>' +
      '<div class="fg"><label class="f s2">Subscription type<select id="euPlan">' + j.plans.map(function (p) { return '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f s2">Length from today (days) <span class="hint">0 = no end date. Ignored for Free.</span><input id="euDays" type="number" min="0" max="3650" value="' + (curDays || 30) + '"></label>' +
      '<label class="switch s4"><input type="checkbox" id="euApply">Apply this subscription change</label></div></div>' +
      '</div><div class="dlg-foot"><span></span><div class="row"><button class="btn" type="button" id="euC">Cancel</button><button class="btn primary" type="submit">Save changes</button></div></div></form>';
    var close = function () { dlg.close(); };
    $('#euX').onclick = $('#euC').onclick = close;
    var mark = function () { $('#euApply').checked = true; };
    $('#euPlan').onchange = mark; $('#euDays').oninput = mark;
    $('#euF').onsubmit = function (e) {
      e.preventDefault();
      var jobs = [], role = $('#euRole').value, st = $('#euStatus').value;
      if (!me && role !== u.role) jobs.push(function () { return T.adminApi('set_role', { id: u.id, role: role }); });
      if (!me && st !== u.status && st !== 'pending') jobs.push(function () { return T.adminApi('set_status', { id: u.id, status: st }); });
      if ($('#euApply').checked) jobs.push(function () { return T.adminApi('set_plan', { id: u.id, plan: $('#euPlan').value, days: $('#euDays').value }); });
      if (!jobs.length) { close(); return; }
      var chain = Promise.resolve();
      jobs.forEach(function (fn) { chain = chain.then(fn); });
      chain.then(function () { close(); T.toast('User updated'); done(); }).catch(function (er) { T.toast(er.message, true); done(); });
    };
    dlg.showModal();
  };

  // ================= ADMIN: SUBSCRIPTIONS =================
  T.adminBilling = function (b) {
    T.adminApi('billing').then(function (j) {
      var plans = j.plans, feat = j.features, pay = j.payment;
      var pend = j.payments.filter(function (x) { return x.status === 'pending'; }), done = j.payments.filter(function (x) { return x.status !== 'pending'; });
      S.payPending = pend.length;
      var counts = {}; j.counts.forEach(function (c) { counts[c.plan] = c.n; });
      var revenue = {}; done.filter(function (x) { return x.status === 'approved'; }).forEach(function (x) { revenue[x.currency] = (revenue[x.currency] || 0) + (x.amount || 0); });
      var payRow = function (x, actions) {
        return '<tr><td class="num small">' + esc(x.created_at) + '</td><td><b>' + esc(x.name) + '</b><br><span class="small muted">' + esc(x.email) + '</span></td>' +
          '<td>' + esc((plans[x.plan] || {}).name || x.plan) + '<br><span class="small muted">' + (x.period === 'year' ? 'Yearly' : 'Monthly') + '</span></td>' +
          '<td>' + (x.method === 'crypto' ? 'Crypto' : 'telebirr') + (x.note ? '<br><span class="small muted">' + esc(x.note) + '</span>' : '') + '</td>' +
          '<td class="n num">' + T.n(x.amount, 2) + ' ' + esc(x.currency) + '</td>' +
          '<td class="tw"><span class="num small" style="overflow-wrap:anywhere">' + esc(x.reference) + '</span>' + (x.payer ? '<br><span class="small muted">' + esc(x.payer) + '</span>' : '') + '</td>' +
          '<td>' + (x.has_proof ? '<img src="/api/media?type=proof&id=' + x.id + '" alt="Payment screenshot" data-proof style="width:56px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--line);cursor:zoom-in">' : '<span class="small muted">No screenshot</span>') + '</td>' +
          '<td>' + (actions ? '<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm primary" data-rv="approve" data-id="' + x.id + '">Approve</button><button class="btn sm danger" data-rv="reject" data-id="' + x.id + '">Reject</button></div>'
            : '<span class="pill ' + (x.status === 'approved' ? 'ok' : 'bad') + '">' + x.status + '</span>' + (x.admin_note ? '<br><span class="small muted">' + esc(x.admin_note) + '</span>' : '')) + '</td></tr>';
      };
      var head = '<thead><tr><th>Submitted</th><th>User</th><th>Plan</th><th>Method</th><th class="n">Amount</th><th>Reference</th><th>Proof</th><th></th></tr></thead>';
      var planForm = function (id) {
        var p = plans[id];
        return '<div class="panel" style="box-shadow:none"><div class="panel-head"><h3>' + esc(p.name) + ' <span class="small muted">(' + id + ')</span></h3>' + (id !== 'free' ? '<label class="switch"><input type="checkbox" data-pf="' + id + ':highlight"' + (p.highlight ? ' checked' : '') + '>Highlight</label>' : '') + '</div><div class="fg">' +
          '<label class="f">Name<input data-pf="' + id + ':name" value="' + esc(p.name) + '"></label>' +
          '<label class="f s2">Description<input data-pf="' + id + ':description" value="' + esc(p.description) + '"></label>' +
          '<label class="f">New trades / month <span class="hint">0 = unlimited</span><input type="number" min="0" data-pf="' + id + ':trades_month" value="' + p.limits.trades_month + '"></label>' +
          (id !== 'free' ? '<label class="f">Monthly (USD)<input type="number" step="0.01" min="0" data-pf="' + id + ':price_month" value="' + p.price_month + '"></label>' +
            '<label class="f">Yearly (USD)<input type="number" step="0.01" min="0" data-pf="' + id + ':price_year" value="' + p.price_year + '"></label>' +
            '<label class="f">Monthly (ETB) <span class="hint">for telebirr, 0 = show USD</span><input type="number" step="1" min="0" data-pf="' + id + ':price_month_etb" value="' + p.price_month_etb + '"></label>' +
            '<label class="f">Yearly (ETB)<input type="number" step="1" min="0" data-pf="' + id + ':price_year_etb" value="' + p.price_year_etb + '"></label>' : '') +
          '<label class="f">MT5 accounts <span class="hint">0 = unlimited</span><input type="number" min="0" data-pf="' + id + ':mt5_accounts" value="' + p.limits.mt5_accounts + '"></label>' +
          '</div><div class="chips" style="margin-top:12px">' + FEATURE_ORDER.map(function (f) { return '<label class="chip"><input type="checkbox" data-pf="' + id + ':f:' + f + '"' + (p.features[f] ? ' checked' : '') + '>' + esc(feat[f]) + '</label>'; }).join('') + '</div></div>';
      };
      b.innerHTML = '<div class="kpis">' + T.kpi('Payments to review', pend.length, '', pend.length ? 'neg' : '') +
        ['starter', 'pro', 'ultimate'].map(function (id) { return T.kpi(esc(plans[id].name) + ' users', counts[id] || 0, 'Includes trials'); }).join('') +
        Object.keys(revenue).map(function (c) { return T.kpi('Approved (' + c + ')', T.n(revenue[c], 2) + ' ' + c, 'Last 200 payments'); }).join('') + '</div>' +
        '<section class="panel"><div class="panel-head"><div><h2>Payments to review</h2><p>Check the transaction in your telebirr or wallet history, then approve. The plan starts straight away and the user gets a message.</p></div></div>' +
        (pend.length ? '<div class="tbl-wrap"><table class="tbl">' + head + '<tbody>' + pend.map(function (x) { return payRow(x, true); }).join('') + '</tbody></table></div>' : '<div class="empty">Nothing to review.</div>') + '</section>' +
        '<form class="panel" id="trialF"><div class="panel-head"><div><h2>Free trial</h2><p>Every new user gets this once, starting when they verify their email. 0 = no trial.</p></div></div><div class="fg">' +
        '<label class="f">Trial length (days)<input id="trDays" type="number" min="0" max="365" value="' + esc(j.trial_days) + '"></label>' +
        '<label class="f">Trial gives the features of<select id="trPlan">' + ['starter', 'pro', 'ultimate'].map(function (id) { return '<option value="' + id + '"' + (j.trial_plan === id ? ' selected' : '') + '>' + esc(plans[id].name) + '</option>'; }).join('') + '</select></label>' +
        '<div class="f" style="justify-content:flex-end"><button class="btn primary" type="submit">Save trial</button></div></div></form>' +
        '<form class="panel" id="plansF"><div class="panel-head"><div><h2>Plans and features</h2><p>Prices, limits and the features each plan unlocks. Journal, checklist, calendar, dashboard and CSV export are always included.</p></div><button class="btn primary" type="submit">Save plans</button></div>' +
        '<div class="grid">' + ['starter', 'pro', 'ultimate', 'free'].map(planForm).join('') + '</div></form>' +
        '<form class="panel" id="payF2"><div class="panel-head"><div><h2>Payment methods</h2><p>Shown to users when they subscribe.</p></div><button class="btn primary" type="submit">Save payment methods</button></div>' +
        '<div class="grid g2"><div class="stack"><label class="switch"><input type="checkbox" id="tbOn"' + (pay.telebirr.enabled ? ' checked' : '') + '><b>telebirr</b></label>' +
        '<label class="f">Account name<input id="tbName" value="' + esc(pay.telebirr.account_name) + '" placeholder="Name shown in telebirr"></label>' +
        '<label class="f">Phone number<input id="tbNum" class="num" value="' + esc(pay.telebirr.number) + '" placeholder="09…"></label>' +
        '<label class="f">Merchant / till code <span class="hint">optional</span><input id="tbCode" class="num" value="' + esc(pay.telebirr.merchant_code) + '"></label>' +
        '<label class="f">Instructions<textarea id="tbIns">' + esc(pay.telebirr.instructions) + '</textarea></label></div>' +
        '<div class="stack"><label class="switch"><input type="checkbox" id="crOn"' + (pay.crypto.enabled ? ' checked' : '') + '><b>Crypto</b></label>' +
        '<div class="listed" id="wl">' + pay.crypto.wallets.map(function (w, i) {
          return '<div class="lrow" style="grid-template-columns:70px 90px minmax(0,1fr) auto"><input data-wc="' + i + '" value="' + esc(w.coin) + '" placeholder="USDT" aria-label="Coin"><input data-wn="' + i + '" value="' + esc(w.network) + '" placeholder="TRC20" aria-label="Network"><input data-wa="' + i + '" class="num" value="' + esc(w.address) + '" placeholder="Wallet address" aria-label="Address"><button class="btn sm ghost" type="button" data-wx="' + i + '" aria-label="Remove">×</button></div>';
        }).join('') + '</div><button class="btn sm" type="button" id="wAdd">+ Add wallet</button>' +
        '<label class="f">Instructions<textarea id="crIns">' + esc(pay.crypto.instructions) + '</textarea></label></div></div></form>' +
        '<section class="panel"><div class="panel-head"><h2>Payment history</h2></div>' + (done.length ? '<div class="tbl-wrap"><table class="tbl">' + head + '<tbody>' + done.map(function (x) { return payRow(x, false); }).join('') + '</tbody></table></div>' : '<div class="empty">No reviewed payments yet.</div>') + '</section>';

      $$('[data-proof]', b).forEach(function (im) { im.onclick = function () { $('#imgFull').src = im.src; $('#imgDlg').showModal(); }; });
      $$('[data-rv]', b).forEach(function (btn) {
        btn.onclick = function () {
          var approve = btn.dataset.rv === 'approve';
          var note = window.prompt(approve ? 'Approve this payment? Optional note to the user:' : 'Reason for rejecting (sent to the user):', '');
          if (note === null) return;
          btn.disabled = true;
          T.adminApi('review_payment', { id: +btn.dataset.id, decision: approve ? 'approve' : 'reject', note: note })
            .then(function () { T.toast(approve ? 'Approved. The plan is active.' : 'Rejected'); T.adminBilling(b); }).catch(function (er) { btn.disabled = false; T.toast(er.message, true); });
        };
      });
      $('#trialF', b).onsubmit = function (e) {
        e.preventDefault();
        T.adminApi('save_site', { trial_days: $('#trDays').value, trial_plan: $('#trPlan').value }).then(function () { T.toast('Trial saved'); T.adminBilling(b); }).catch(function (er) { T.toast(er.message, true); });
      };
      $('#plansF', b).onsubmit = function (e) {
        e.preventDefault();
        var out = {};
        ['starter', 'pro', 'ultimate', 'free'].forEach(function (id) { out[id] = { features: {}, limits: {} }; });
        $$('[data-pf]', b).forEach(function (i) {
          var k = i.dataset.pf.split(':'), o = out[k[0]];
          if (k[1] === 'f') o.features[k[2]] = i.checked;
          else if (k[1] === 'highlight') o.highlight = i.checked;
          else if (k[1] === 'trades_month' || k[1] === 'mt5_accounts') o.limits[k[1]] = i.value;
          else o[k[1]] = i.value;
        });
        T.adminApi('save_plans', { plans: out }).then(function () { T.toast('Plans saved'); T.adminBilling(b); }).catch(function (er) { T.toast(er.message, true); });
      };
      var wallets = pay.crypto.wallets.slice();
      var readW = function () { return $$('[data-wc]', b).map(function (i, n) { return { coin: i.value, network: $('[data-wn="' + n + '"]', b).value, address: $('[data-wa="' + n + '"]', b).value }; }); };
      $('#wAdd', b).onclick = function () { wallets = readW().concat([{ coin: 'USDT', network: 'TRC20', address: '' }]); pay.crypto.wallets = wallets; savePayLocal(); };
      $$('[data-wx]', b).forEach(function (x) { x.onclick = function () { wallets = readW(); wallets.splice(+x.dataset.wx, 1); pay.crypto.wallets = wallets; savePayLocal(); }; });
      function collect() {
        return { telebirr: { enabled: $('#tbOn').checked, account_name: $('#tbName').value, number: $('#tbNum').value, merchant_code: $('#tbCode').value, instructions: $('#tbIns').value },
          crypto: { enabled: $('#crOn').checked, wallets: readW(), instructions: $('#crIns').value } };
      }
      function savePayLocal() { // redraw the wallet list without losing typed values
        var c = collect(); c.crypto.wallets = wallets; pay.telebirr = c.telebirr; pay.crypto = c.crypto;
        T.adminApi('save_payment_config', { payment: c }).then(function () { T.adminBilling(b); });
      }
      $('#payF2', b).onsubmit = function (e) {
        e.preventDefault();
        T.adminApi('save_payment_config', { payment: collect() }).then(function () { T.toast('Payment methods saved'); T.adminBilling(b); }).catch(function (er) { T.toast(er.message, true); });
      };
    }).catch(function (er) { b.innerHTML = '<p class="alert">' + esc(er.message) + '</p>'; });
  };
})();
