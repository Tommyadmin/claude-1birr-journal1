/* Trade journal — Inbox, Profile, Settings (customization), Admin (users, messages, site). */
(function () {
  'use strict';
  var T = window.TJ, S = T.S, $ = T.$, $$ = T.$$, esc = T.esc;
  var opt = function () { return T.opt.apply(null, arguments); };

  function savePrefs(patch, msg) {
    return T.api('save_prefs', { prefs: patch }).then(function (j) { S.prefs = j.prefs; T.derive(); T.toast(msg || 'Saved'); T.render(); })
      .catch(function (e) { T.toast(e.message, true); });
  }

  // ================= INBOX =================
  T.views.inbox = function (el) {
    var list = S.inbox || [], un = T.unread();
    el.innerHTML = '<div class="page-head"><div><h1>Inbox</h1><p>' + (un ? un + ' unread' : 'All caught up') + '</p></div>' +
      (un ? '<button class="btn" id="allRead" type="button">Mark all as read</button>' : '') + '</div>' +
      '<section class="panel"><div class="stack">' + (list.length ? list.map(function (m) {
        return '<article class="msg' + (m.read ? '' : ' unread') + '" data-id="' + m.id + '"><div class="row between"><h3>' + esc(m.title) + '</h3><span class="small muted num">' + esc(m.created_at) + '</span></div>' +
          (m.body ? '<p>' + esc(m.body) + '</p>' : '') + '<div class="row between"><span class="pill">' + (m.broadcast ? 'Announcement' : 'Message to you') + '</span>' +
          (m.read ? '<span class="small muted">Read</span>' : '<button class="btn sm" type="button" data-read="' + m.id + '">Mark as read</button>') + '</div></article>';
      }).join('') : '<div class="empty">No messages yet. Announcements and messages from the team appear here.</div>') + '</div></section>';
    var after = function (j) { S.inbox = j.inbox; T.renderShell(); T.render(); };
    var all = $('#allRead', el); if (all) all.onclick = function () { T.api('mark_read', { all: true }).then(after).catch(function (e) { T.toast(e.message, true); }); };
    $$('[data-read]', el).forEach(function (b) { b.onclick = function () { T.api('mark_read', { ids: [+b.dataset.read] }).then(after).catch(function (e) { T.toast(e.message, true); }); }; });
    $$('.popup, .pop').forEach(function (p) { p.remove(); });
  };

  // ================= PROFILE =================
  var COUNTRIES = ['Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Rwanda', 'Somalia', 'Djibouti', 'Eritrea', 'South Sudan', 'Sudan', 'Nigeria', 'Ghana', 'South Africa', 'Egypt', 'Morocco', 'United Arab Emirates', 'Saudi Arabia', 'United Kingdom', 'United States', 'Canada', 'Germany', 'France', 'India', 'Other'];
  T.views.profile = function (el) {
    var u = S.user, pr = u.profile || {}, a = T.aggregate(S.trades.filter(function (t) { return (t.account_type || 'live') === 'live'; }));
    var first = S.trades.length ? S.trades[0].trade_date : null;
    var v = function (k) { return esc(pr[k] || ''); };
    el.innerHTML =
      '<div class="page-head"><div><h1>Profile</h1><p>Your personal information. Only you and the journal admins can see it.</p></div></div>' +
      '<section class="panel"><div class="row" style="gap:18px;align-items:center">' + T.avatarHtml(u, 'lg') +
      '<div style="flex:1;min-width:200px"><h2>' + esc(u.name) + '</h2><p class="small muted" style="margin:2px 0 8px">' + esc(u.email) + (pr.country ? ' · ' + esc(pr.city ? pr.city + ', ' : '') + esc(pr.country) : '') + '</p>' +
      '<div class="row"><label class="btn sm" for="avFile">' + T.icon('upload') + (u.avatar ? 'Change photo' : 'Upload photo') + '</label><input id="avFile" type="file" accept="image/jpeg,image/png,image/webp" hidden>' +
      (u.avatar ? '<button class="btn sm ghost" type="button" id="avDel">Remove</button>' : '') + '</div><div class="uplist" id="avUp" style="margin-top:8px;max-width:360px"></div></div>' +
      '<div class="kv"><dt>Live trades</dt><dd class="num">' + a.n + '</dd><dt>Win rate</dt><dd class="num">' + T.pct(a.wr) + '</dd><dt>Net P&amp;L</dt><dd class="num ' + T.cls(a.pnl) + '">' + T.money(a.pnl, true) + '</dd><dt>Journaling since</dt><dd class="num">' + (first ? T.fmtDate(first, { month: 'short', year: 'numeric' }) : '—') + '</dd></div>' +
      '</div></section>' +
      '<form class="panel" id="pfForm"><div class="panel-head"><h2>Personal information</h2></div><div class="fg">' +
      '<label class="f s2">Full name<input id="pfName" value="' + esc(u.name) + '" maxlength="80" autocomplete="name" required></label>' +
      '<label class="f s2">Phone <span class="hint">with country code</span><input id="pfPhone" type="tel" value="' + esc(u.phone) + '" placeholder="+251911234567" autocomplete="tel" required></label>' +
      '<label class="f s2">Email <span class="hint">used to sign in</span><input value="' + esc(u.email) + '" readonly></label>' +
      '<label class="f">Birthday<input id="pf_birthday" type="date" value="' + v('birthday') + '"></label>' +
      '<label class="f">Country<select id="pf_country">' + opt(COUNTRIES, pr.country, '—') + '</select></label>' +
      '<label class="f">City<input id="pf_city" value="' + v('city') + '" maxlength="60"></label>' +
      '<label class="f">Experience<select id="pf_experience">' + opt(['Beginner (under 1 year)', 'Intermediate (1–3 years)', 'Advanced (3–5 years)', 'Professional (5+ years)'], pr.experience, '—') + '</select></label>' +
      '<label class="f">Trading since <span class="hint">year</span><input id="pf_trading_since" type="number" min="1980" max="2100" value="' + v('trading_since') + '"></label>' +
      '<label class="f">Main broker<input id="pf_broker" value="' + v('broker') + '" placeholder="e.g. Exness" maxlength="60"></label>' +
      '<label class="f">Platform<select id="pf_platform">' + opt(['MT5', 'MT4', 'cTrader', 'TradingView', 'Other'], pr.platform, '—') + '</select></label>' +
      '<label class="f">Telegram<input id="pf_telegram" value="' + v('telegram') + '" placeholder="@username"></label>' +
      '<label class="f">X (Twitter)<input id="pf_x" value="' + v('x') + '" placeholder="@username"></label>' +
      '<label class="f s2">Website<input id="pf_website" value="' + v('website') + '" placeholder="https://"></label>' +
      '<label class="f s4">About me<textarea id="pf_bio" maxlength="600" placeholder="Markets you trade, your style, your goals">' + v('bio') + '</textarea></label>' +
      '</div><div class="row end" style="margin-top:14px"><button class="btn primary" type="submit">Save profile</button></div></form>';
    $('#pfForm', el).onsubmit = function (e) {
      e.preventDefault();
      var profile = {};
      ['birthday', 'country', 'city', 'experience', 'trading_since', 'broker', 'platform', 'telegram', 'x', 'website', 'bio'].forEach(function (k) { profile[k] = $('#pf_' + k).value; });
      T.api('save_profile', { name: $('#pfName').value, phone: $('#pfPhone').value, profile: profile })
        .then(function (j) { S.user = j.user; T.renderShell(); T.render(); T.toast('Profile saved'); }).catch(function (er) { T.toast(er.message, true); });
    };
    $('#avFile', el).onchange = function () {
      var f = this.files[0]; if (!f) return;
      var setP = T.uploadList($('#avUp')).add(f.name);
      T.shrinkImage(f, 512, 0.88, true).then(function (blob) { return T.upload('/api/app?action=upload_avatar', blob, function (p) { setP(p); }); })
        .then(function (j) { setP(1, 'ok'); S.user.avatar = j.avatar; T.renderShell(); setTimeout(T.render, 400); T.toast('Photo updated'); })
        .catch(function (er) { setP(1, 'err'); T.toast(er.message, true); });
    };
    var del = $('#avDel', el); if (del) del.onclick = function () { T.api('delete_avatar', {}).then(function () { S.user.avatar = ''; T.renderShell(); T.render(); }); };
  };

  // ================= SETTINGS =================
  S.stab = T.store('tj-stab') || 'account';
  var STABS = [['account', 'Account'], ['checklist', 'Checklist'], ['windows', 'Trading windows'], ['rules', 'Rules & goals'], ['lists', 'Lists'], ['appearance', 'Appearance'], ['mt5', 'MT5 sync'], ['security', 'Security'], ['data', 'Data']];
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'ETB', 'KES', 'TZS', 'UGX', 'NGN', 'GHS', 'ZAR', 'EGP', 'AED', 'SAR', 'INR', 'JPY', 'CAD', 'AUD', 'CHF'];
  T.views.settings = function (el) {
    el.innerHTML = '<div class="page-head"><div><h1>Settings</h1><p>Make the journal fit how you trade</p></div></div>' +
      '<div class="tabs" role="tablist">' + STABS.map(function (t) { return '<button class="tab" role="tab" data-st="' + t[0] + '" aria-selected="' + (S.stab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="sBody" class="grid"></div>';
    $$('[data-st]', el).forEach(function (b) { b.onclick = function () { S.stab = b.dataset.st; T.store('tj-stab', S.stab); T.render(); }; });
    var body = $('#sBody', el);
    (ST[S.stab] || ST.account)(body);
  };

  function tzList() {
    var l = [];
    try { l = Intl.supportedValuesOf('timeZone'); } catch (e) { l = ['Africa/Addis_Ababa', 'Africa/Nairobi', 'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'UTC']; }
    if (l.indexOf(S.prefs.timezone) < 0) l.unshift(S.prefs.timezone);
    return l;
  }

  var ST = {
    account: function (b) {
      var s = S.settings, p = S.prefs;
      b.innerHTML = '<form class="panel" id="acForm"><div class="panel-head"><div><h2>Account and risk</h2><p>Live balance now: <b class="num">' + T.money(S.balance) + '</b></p></div></div><div class="fg">' +
        '<label class="f">Starting balance<input id="sBal" type="number" step="0.01" min="0" value="' + s.start_balance + '"></label>' +
        '<label class="f">Risk per trade (%)<input id="sRisk" type="number" step="0.1" min="0.1" max="100" value="' + s.risk_pct + '"></label>' +
        '<label class="f">Balance goal<input id="sGoal" type="number" step="1" min="0" value="' + s.goal + '"></label>' +
        '<label class="f">Currency<select id="sCur">' + opt(CURRENCIES.indexOf(p.currency) < 0 ? CURRENCIES.concat([p.currency]) : CURRENCIES, p.currency) + '</select></label>' +
        '<label class="f s2">Time zone <span class="hint">used for “today”, trading windows and MT5 times</span><select id="sTz">' + opt(tzList(), p.timezone) + '</select></label>' +
        '</div><div class="row end" style="margin-top:14px"><button class="btn primary" type="submit">Save</button></div></form>';
      $('#acForm', b).onsubmit = function (e) {
        e.preventDefault();
        T.api('save_settings', { start_balance: $('#sBal').value, risk_pct: $('#sRisk').value, goal: $('#sGoal').value })
          .then(function (j) { S.settings = j.settings; return T.api('save_prefs', { prefs: { currency: $('#sCur').value, timezone: $('#sTz').value } }); })
          .then(function () { return T.load(); }).then(function () { T.renderShell(); T.render(); T.toast('Saved'); })
          .catch(function (er) { T.toast(er.message, true); });
      };
    },

    checklist: function (b) {
      var items = S.prefs.checklist.map(function (c) { return Object.assign({}, c); });
      var draw = function () {
        b.innerHTML = '<section class="panel"><div class="panel-head"><div><h2>Pre-trade checklist</h2><p>Shown on Today and in every trade. Group items by heading.</p></div></div>' +
          '<div class="listed">' + items.map(function (c, i) {
            return '<div class="lrow" style="grid-template-columns:minmax(0,.8fr) minmax(0,2fr) auto"><input data-g="' + i + '" value="' + esc(c.group) + '" placeholder="Group" aria-label="Group">' +
              '<input data-t="' + i + '" value="' + esc(c.text) + '" placeholder="Checklist item" aria-label="Item">' +
              '<div class="row" style="flex-wrap:nowrap;gap:2px"><button class="btn sm ghost" type="button" data-up="' + i + '" aria-label="Move up">↑</button><button class="btn sm ghost" type="button" data-dn="' + i + '" aria-label="Move down">↓</button><button class="btn sm ghost" type="button" data-x="' + i + '" aria-label="Remove">×</button></div></div>';
          }).join('') + '</div>' +
          '<div class="row between" style="margin-top:12px"><button class="btn" type="button" id="clAdd">+ Add item</button><button class="btn primary" type="button" id="clSave">Save checklist</button></div>' +
          '<p class="small muted" style="margin:10px 0 0">Removing an item does not change past trades; their old answers are kept but no longer counted.</p></section>';
        $$('[data-g]', b).forEach(function (i) { i.oninput = function () { items[+i.dataset.g].group = i.value; }; });
        $$('[data-t]', b).forEach(function (i) { i.oninput = function () { items[+i.dataset.t].text = i.value; }; });
        $$('[data-x]', b).forEach(function (x) { x.onclick = function () { items.splice(+x.dataset.x, 1); draw(); }; });
        $$('[data-up]', b).forEach(function (x) { x.onclick = function () { var i = +x.dataset.up; if (i > 0) { var t = items[i]; items[i] = items[i - 1]; items[i - 1] = t; draw(); } }; });
        $$('[data-dn]', b).forEach(function (x) { x.onclick = function () { var i = +x.dataset.dn; if (i < items.length - 1) { var t = items[i]; items[i] = items[i + 1]; items[i + 1] = t; draw(); } }; });
        $('#clAdd', b).onclick = function () { items.push({ id: 'c' + Date.now().toString(36), group: items.length ? items[items.length - 1].group : 'Checklist', text: '' }); draw(); var l = $$('[data-t]', b); l[l.length - 1].focus(); };
        $('#clSave', b).onclick = function () { savePrefs({ checklist: items.filter(function (c) { return c.text.trim(); }) }, 'Checklist saved'); };
      };
      draw();
    },

    windows: function (b) {
      var ws = S.prefs.windows.map(function (w) { return Object.assign({}, w); });
      var draw = function () {
        b.innerHTML = '<section class="panel"><div class="panel-head"><div><h2>Trading windows</h2><p>The times you allow yourself to trade, in your time zone (' + esc(S.prefs.timezone) + '). Trades outside an active window are flagged.</p></div></div>' +
          '<div class="listed">' + ws.map(function (w, i) {
            return '<div class="lrow w"><input data-n="' + i + '" value="' + esc(w.name) + '" placeholder="Name, e.g. London" aria-label="Name">' +
              '<input data-s="' + i + '" type="time" value="' + esc(w.start) + '" aria-label="Start"><input data-e="' + i + '" type="time" value="' + esc(w.end) + '" aria-label="End">' +
              '<label class="switch"><input type="checkbox" data-a="' + i + '"' + (w.active ? ' checked' : '') + '>Trade</label>' +
              '<button class="btn sm ghost" type="button" data-x="' + i + '" aria-label="Remove">×</button></div>';
          }).join('') + '</div>' +
          '<div class="row between" style="margin-top:12px"><button class="btn" type="button" id="wAdd">+ Add window</button><button class="btn primary" type="button" id="wSave">Save windows</button></div></section>';
        $$('[data-n]', b).forEach(function (i) { i.oninput = function () { ws[+i.dataset.n].name = i.value; }; });
        $$('[data-s]', b).forEach(function (i) { i.oninput = function () { ws[+i.dataset.s].start = i.value; }; });
        $$('[data-e]', b).forEach(function (i) { i.oninput = function () { ws[+i.dataset.e].end = i.value; }; });
        $$('[data-a]', b).forEach(function (i) { i.onchange = function () { ws[+i.dataset.a].active = i.checked; }; });
        $$('[data-x]', b).forEach(function (x) { x.onclick = function () { ws.splice(+x.dataset.x, 1); draw(); }; });
        $('#wAdd', b).onclick = function () { ws.push({ id: '', name: 'New window', start: '09:00', end: '10:00', active: true }); draw(); };
        $('#wSave', b).onclick = function () { savePrefs({ windows: ws }, 'Trading windows saved'); };
      };
      draw();
    },

    rules: function (b) {
      var r = S.prefs.rules, g = S.prefs.goals;
      b.innerHTML = '<form class="panel" id="ruForm"><div class="panel-head"><div><h2>Trading rules</h2><p>Set 0 to turn a limit off. The Today page warns you when you hit one, and trades that break them are flagged.</p></div></div><div class="fg">' +
        '<label class="f">Stop after losses per day<input id="r1" type="number" min="0" value="' + r.max_losses_day + '"></label>' +
        '<label class="f">Stop after wins per window<input id="r2" type="number" min="0" value="' + r.max_wins_window + '"></label>' +
        '<label class="f">Max trades per day<input id="r3" type="number" min="0" value="' + r.max_trades_day + '"></label>' +
        '<label class="f">Daily loss limit (% of balance)<input id="r4" type="number" min="0" step="0.5" value="' + r.daily_loss_pct + '"></label>' +
        '<label class="f">Target reward:risk (1:x)<input id="r5" type="number" min="0.1" step="0.1" value="' + r.target_rr + '"></label>' +
        '<label class="f s4">Mindset reminder <span class="hint">shown on Today</span><input id="r6" value="' + esc(S.prefs.mindset) + '" maxlength="300"></label>' +
        '</div><div class="panel-head" style="margin:18px 0 12px"><div><h2>Profit goals</h2><p>Track progress on the dashboard. 0 = off.</p></div></div><div class="fg">' +
        '<label class="f">Daily goal<input id="g1" type="number" min="0" step="1" value="' + g.daily + '"></label>' +
        '<label class="f">Weekly goal<input id="g2" type="number" min="0" step="1" value="' + g.weekly + '"></label>' +
        '<label class="f">Monthly goal<input id="g3" type="number" min="0" step="1" value="' + g.monthly + '"></label>' +
        '</div><div class="row end" style="margin-top:14px"><button class="btn primary" type="submit">Save rules and goals</button></div></form>';
      $('#ruForm', b).onsubmit = function (e) {
        e.preventDefault();
        savePrefs({ rules: { max_losses_day: $('#r1').value, max_wins_window: $('#r2').value, max_trades_day: $('#r3').value, daily_loss_pct: $('#r4').value, target_rr: $('#r5').value },
          mindset: $('#r6').value, goals: { daily: $('#g1').value, weekly: $('#g2').value, monthly: $('#g3').value } }, 'Rules saved');
      };
    },

    lists: function (b) {
      var p = S.prefs, L = { emotions: p.emotions.slice(), mistakes: p.mistakes.slice(), strategies: p.strategies.slice(), market_conditions: p.market_conditions.slice() };
      var inst = p.instruments.map(function (k) { return { k: k, cs: p.contract_sizes[k] }; });
      var labels = { strategies: ['Strategies', 'Setups you trade'], mistakes: ['Mistakes', 'Tag these on trades to see what they cost'], emotions: ['Emotions', 'Used for before, during and after'], market_conditions: ['Market conditions', 'Describe the market when you entered'] };
      var draw = function () {
        b.innerHTML = Object.keys(labels).map(function (k) {
          return '<section class="panel"><div class="panel-head"><div><h2>' + labels[k][0] + '</h2><p>' + labels[k][1] + '</p></div></div><div class="chips">' +
            L[k].map(function (x, i) { return '<span class="chip">' + esc(x) + '<button type="button" data-rm="' + k + ':' + i + '" aria-label="Remove ' + esc(x) + '">×</button></span>'; }).join('') + '</div>' +
            '<form class="row" data-add="' + k + '" style="margin-top:10px;flex-wrap:nowrap"><input placeholder="Add…" maxlength="60" aria-label="Add to ' + labels[k][0] + '"><button class="btn" type="submit">Add</button></form></section>';
        }).join('') +
          '<section class="panel"><div class="panel-head"><div><h2>Instrument types</h2><p>Contract size per 1.0 lot, used to calculate P&amp;L and lot sizes (Forex 100,000 · Gold 100 · Indices 1)</p></div></div>' +
          '<div class="listed">' + inst.map(function (x, i) {
            return '<div class="lrow"><input data-ik="' + i + '" value="' + esc(x.k) + '" aria-label="Type"><input data-ic="' + i + '" type="number" min="0" step="any" value="' + esc(x.cs) + '" aria-label="Contract size"><button class="btn sm ghost" type="button" data-ix="' + i + '" aria-label="Remove">×</button></div>';
          }).join('') + '</div><button class="btn sm" type="button" id="iAdd" style="margin-top:10px">+ Add type</button></section>' +
          '<div class="row end"><button class="btn primary" type="button" id="lSave">Save all lists</button></div>';
        $$('[data-rm]', b).forEach(function (x) { x.onclick = function () { var p2 = x.dataset.rm.split(':'); L[p2[0]].splice(+p2[1], 1); draw(); }; });
        $$('[data-add]', b).forEach(function (f) { f.onsubmit = function (e) { e.preventDefault(); var v = f.querySelector('input').value.trim(); if (v && L[f.dataset.add].indexOf(v) < 0) L[f.dataset.add].push(v); draw(); var n = $('[data-add="' + f.dataset.add + '"] input', b); if (n) n.focus(); }; });
        $$('[data-ik]', b).forEach(function (i) { i.oninput = function () { inst[+i.dataset.ik].k = i.value; }; });
        $$('[data-ic]', b).forEach(function (i) { i.oninput = function () { inst[+i.dataset.ic].cs = i.value; }; });
        $$('[data-ix]', b).forEach(function (x) { x.onclick = function () { inst.splice(+x.dataset.ix, 1); draw(); }; });
        $('#iAdd', b).onclick = function () { inst.push({ k: '', cs: 1 }); draw(); };
        $('#lSave', b).onclick = function () {
          var cs = {}, names = [];
          inst.forEach(function (x) { var k = x.k.trim(); if (k) { names.push(k); cs[k] = x.cs; } });
          savePrefs({ emotions: L.emotions, mistakes: L.mistakes, strategies: L.strategies, market_conditions: L.market_conditions, instruments: names, contract_sizes: cs }, 'Lists saved');
        };
      };
      draw();
    },

    appearance: function (b) {
      var cur = window.wtjTheme ? window.wtjTheme.get() : 'auto';
      b.innerHTML = '<section class="panel"><div class="panel-head"><div><h2>Theme</h2><p>Auto follows your phone or computer. Saved on this device.</p></div></div>' +
        '<div class="seg" style="max-width:360px">' + ['auto', 'light', 'dark'].map(function (m) { return '<label><input type="radio" name="theme" value="' + m + '"' + (cur === m ? ' checked' : '') + '>' + { auto: 'Auto', light: 'Light', dark: 'Dark' }[m] + '</label>'; }).join('') + '</div></section>';
      $$('input[name=theme]', b).forEach(function (r) { r.onchange = function () { if (window.wtjTheme) window.wtjTheme.set(r.value); }; });
    },

    mt5: function (b) {
      var m = S.mt5 || {}, key = m.key || '', url = location.origin + '/api/sync';
      var fld = function (id, label, val, secret) {
        return '<label class="f s2">' + label + '<div class="row" style="flex-wrap:nowrap"><input id="' + id + '" class="num" readonly value="' + esc(val) + '"' + (secret ? ' type="password"' : '') + '>' +
          (secret ? '<button class="btn sm" type="button" id="mShow">Show</button>' : '') + '<button class="btn sm" type="button" data-copy="' + id + '">Copy</button></div></label>';
      };
      b.innerHTML = '<section class="panel"><div class="panel-head"><div><div class="eyebrow">MetaTrader 5</div><h2>Automatic trade sync</h2></div>' +
        (m.last_sync ? '<span class="pill ok"><span class="dot"></span>Last sync ' + esc(m.last_sync.slice(0, 16)) + '</span>' : '<span class="pill">Not connected yet</span>') + '</div>' +
        (m.last_account ? '<p class="small muted" style="margin:-6px 0 12px">Account ' + esc(m.last_account) + '</p>' : '') +
        '<div class="fg">' + fld('mUrl', 'Sync URL', url, false) + (key ? fld('mKey', 'Your sync key', key, true) : '<div class="f s2">Your sync key<span class="small muted" style="font-weight:400;padding:8px 0">No key yet. Create one to connect MT5.</span></div>') + '</div>' +
        '<div class="row" style="margin-top:12px"><a class="btn primary" href="/mt5/TradeJournalSync.mq5" download>' + T.icon('download') + 'Download MT5 sync EA</a>' +
        '<button class="btn" type="button" id="mGen">' + (key ? 'Replace key' : 'Create sync key') + '</button>' +
        '<span class="row" id="mGenC" hidden><span class="small muted">Your EA stops syncing until you paste the new key.</span><button class="btn danger sm" type="button" id="mYes">Replace</button><button class="btn sm" type="button" id="mNo">Cancel</button></span></div>' +
        '<ol class="steps"><li>In MT5 on a computer or VPS, open <b>File &gt; Open Data Folder &gt; MQL5 &gt; Experts</b> and put the downloaded file there.</li>' +
        '<li>In the Navigator, right-click <b>Expert Advisors</b> and choose <b>Refresh</b>. If it does not appear, open the file in <b>MetaEditor</b> and press <b>Compile</b> (F7).</li>' +
        '<li>Open <b>Tools &gt; Options &gt; Expert Advisors</b>, tick <b>Allow WebRequest for listed URL</b> and add <b class="num">' + esc(location.origin) + '</b>.</li>' +
        '<li>Drag <b>TradeJournalSync</b> onto one chart. On the <b>Inputs</b> tab paste the Sync URL and your key. Turn on <b>Algo Trading</b>.</li>' +
        '<li>Closed trades arrive within minutes, marked <span class="src">MT5</span> and <b>Needs review</b>. Open each to add your checklist, emotions and notes.</li></ol>' +
        '<p class="small muted" style="margin:10px 0 0">The EA only reads your history; it never opens, changes or closes trades. Times are converted to your time zone. The MT5 phone app cannot run EAs.</p></section>';
      $$('[data-copy]', b).forEach(function (x) {
        x.onclick = function () {
          var inp = $('#' + x.dataset.copy);
          var fallback = function () { inp.type = 'text'; inp.select(); try { document.execCommand('copy'); T.toast('Copied'); } catch (e) { T.toast('Select and copy it manually.'); } };
          if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(function () { T.toast('Copied'); }, fallback); else fallback();
        };
      });
      var sh = $('#mShow', b); if (sh) sh.onclick = function () { var k = $('#mKey'); k.type = k.type === 'password' ? 'text' : 'password'; sh.textContent = k.type === 'password' ? 'Show' : 'Hide'; };
      var gen = function () { T.api('mt5_key', {}).then(function (j) { S.mt5.key = j.key; T.render(); T.toast('Sync key ready. Paste it into the EA.'); }).catch(function (e) { T.toast(e.message, true); }); };
      $('#mGen', b).onclick = function () { if (key) $('#mGenC').hidden = false; else gen(); };
      var y = $('#mYes', b); if (y) y.onclick = gen;
      var n = $('#mNo', b); if (n) n.onclick = function () { $('#mGenC').hidden = true; };
    },

    security: function (b) {
      var u = S.user;
      b.innerHTML = '<form class="panel" id="pwForm"><div class="panel-head"><div><h2>' + (u.has_password ? 'Change password' : 'Set a password') + '</h2>' +
        '<p>Sign-in methods: ' + [u.has_password ? 'email and password' : '', u.google ? 'Google' : ''].filter(Boolean).join(' · ') + '</p></div></div><div class="fg">' +
        (u.has_password ? '<label class="f s2">Current password<input id="pwOld" type="password" autocomplete="current-password"></label>' : '') +
        '<label class="f s2">New password <span class="hint">8+ characters</span><input id="pwNew" type="password" minlength="8" autocomplete="new-password"></label>' +
        '</div><p class="small muted">Changing your password signs you out on your other devices.</p><div class="row end"><button class="btn primary" type="submit">' + (u.has_password ? 'Change password' : 'Set password') + '</button></div></form>';
      $('#pwForm', b).onsubmit = function (e) {
        e.preventDefault(); var old = $('#pwOld');
        T.api('save_settings', { current_password: old ? old.value : '', new_password: $('#pwNew').value })
          .then(function () { S.user.has_password = true; T.toast('Password saved'); T.render(); }).catch(function (er) { T.toast(er.message, true); });
      };
    },

    data: function (b) {
      var u = S.user;
      b.innerHTML = '<section class="panel"><div class="panel-head"><div><h2>Export</h2><p>Download every trade with all its fields as CSV. Use Reports for a printable PDF.</p></div></div>' +
        '<div class="row"><a class="btn" href="/api/app?action=export">' + T.icon('download') + 'Export all trades (CSV)</a><a class="btn" href="#trades" id="goImp">' + T.icon('upload') + 'Import trades</a></div></section>' +
        '<form class="panel" id="delForm"><div class="panel-head"><div><h2>Delete account</h2><p>Permanently deletes your account, trades, screenshots and profile.</p></div></div><div class="fg">' +
        (u.has_password ? '<label class="f s2">Password<input id="delPw" type="password" autocomplete="current-password"></label>' : '') +
        '<label class="f s2">Type DELETE to confirm<input id="delC" autocomplete="off"></label></div>' +
        '<div class="row end" style="margin-top:12px"><button class="btn danger" type="submit">Delete my account</button></div></form>';
      $('#delForm', b).onsubmit = function (e) {
        e.preventDefault(); var pw = $('#delPw');
        T.api('delete_account', { confirm: $('#delC').value.trim(), password: pw ? pw.value : '' }).then(function () { location.replace('/login.html'); }).catch(function (er) { T.toast(er.message, true); });
      };
    }
  };

  // ================= ADMIN =================
  S.adtab = 'users';
  T.views.admin = function (el) {
    el.innerHTML = '<div class="page-head"><div><div class="eyebrow">Admin</div><h1>' + ({ users: 'Users', messages: 'Messages', site: 'Site settings' }[S.adtab]) + '</h1></div></div>' +
      '<div class="tabs" role="tablist">' + [['users', 'Users'], ['messages', 'Messages'], ['site', 'Site settings']].map(function (t) { return '<button class="tab" role="tab" data-ad="' + t[0] + '" aria-selected="' + (S.adtab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="adBody" class="grid"><section class="panel"><p class="muted">Loading…</p></section></div>';
    $$('[data-ad]', el).forEach(function (b) { b.onclick = function () { S.adtab = b.dataset.ad; T.render(); }; });
    AD[S.adtab]($('#adBody', el), el);
  };

  var AD = {
    users: function (b, el) {
      T.adminApi('list').then(function (j) {
        var all = j.users, q = (S.adq || '').toLowerCase();
        var u = all.filter(function (x) { return !q || (x.name + ' ' + x.email + ' ' + x.phone).toLowerCase().indexOf(q) >= 0; });
        var pend = all.filter(function (x) { return x.status === 'pending'; }).length;
        var pill = function (x) {
          if (x.status === 'pending') return x.email_verified ? (x.phone ? '<span class="pill warn">Waiting for approval</span>' : '<span class="pill">No phone yet</span>') : '<span class="pill">Email not confirmed</span>';
          return x.status === 'active' ? '<span class="pill ok">Active</span>' : '<span class="pill bad">Disabled</span>';
        };
        var btns = function (x) {
          if (x.id === j.me) return '<span class="small muted">You</span>';
          var s = '';
          if (x.status === 'pending') s += '<button class="btn sm primary" data-a="approve" data-id="' + x.id + '"' + (x.email_verified ? '' : ' disabled title="Waiting for email confirmation"') + '>Approve</button>';
          if (x.status === 'active') s += '<button class="btn sm" data-a="disable" data-id="' + x.id + '">Disable</button>';
          if (x.status === 'disabled') s += '<button class="btn sm" data-a="enable" data-id="' + x.id + '">Enable</button>';
          if (x.status === 'active') s += '<button class="btn sm" data-a="' + (x.role === 'admin' ? 'demote' : 'promote') + '" data-id="' + x.id + '">' + (x.role === 'admin' ? 'Remove admin' : 'Make admin') + '</button>';
          s += '<button class="btn sm" data-a="msg" data-id="' + x.id + '">Message</button><button class="btn sm" data-a="reset" data-id="' + x.id + '">Reset password</button>';
          s += '<button class="btn sm danger" data-a="delete" data-id="' + x.id + '">Delete</button>';
          return '<div class="row" style="gap:6px;flex-wrap:nowrap">' + s + '</div>';
        };
        b.innerHTML = '<div class="kpis">' + T.kpi('Accounts', all.length) + T.kpi('Active', all.filter(function (x) { return x.status === 'active'; }).length) +
          T.kpi('Waiting for approval', pend, '', pend ? 'neg' : '') + T.kpi('Trades logged', all.reduce(function (s, x) { return s + x.trades; }, 0)) + '</div>' +
          (j.email_enabled ? '' : '<p class="notice" style="margin:0">Email is not set up (RESEND_API_KEY). Confirmation, approval and reset emails are not being sent.</p>') +
          '<section class="panel"><div class="panel-head"><input id="adQ" placeholder="Search name, email or phone" value="' + esc(S.adq || '') + '" style="max-width:320px"></div>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Phone</th><th>Status</th><th class="n">Trades</th><th>Joined</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
          u.map(function (x) {
            return '<tr><td><div class="row" style="flex-wrap:nowrap;gap:10px">' + (x.has_avatar ? '<img class="av" src="/api/media?type=avatar&uid=' + x.id + '" alt="">' : '<span class="av">' + esc(T.initials(x.name)) + '</span>') +
              '<div><b>' + esc(x.name) + '</b>' + (x.role === 'admin' ? ' <span class="src">ADMIN</span>' : '') + (x.google ? ' <span class="small muted">Google</span>' : '') + '<br><span class="small muted">' + esc(x.email) + '</span></div></div></td>' +
              '<td class="num">' + esc(x.phone || '—') + '</td><td>' + pill(x) + '</td><td class="n num">' + x.trades + '</td>' +
              '<td class="num small">' + esc(x.created_at) + '</td><td class="num small">' + esc(x.last_login || '—') + '</td><td>' + btns(x) + '</td></tr>';
          }).join('') + '</tbody></table></div><div id="admOut"></div></section>';
        var qt; $('#adQ', b).oninput = function () { var v = this.value; clearTimeout(qt); qt = setTimeout(function () { S.adq = v; AD.users(b, el); }, 250); };
        $$('[data-a]', b).forEach(function (btn) {
          btn.onclick = function () {
            var id = +btn.dataset.id, a = btn.dataset.a, x = all.find(function (z) { return z.id === id; }), p;
            if (a === 'approve' || a === 'enable') p = T.adminApi('set_status', { id: id, status: 'active' });
            else if (a === 'disable') { if (!window.confirm('Disable ' + x.name + '? They are signed out and cannot sign in.')) return; p = T.adminApi('set_status', { id: id, status: 'disabled' }); }
            else if (a === 'promote') p = T.adminApi('set_role', { id: id, role: 'admin' });
            else if (a === 'demote') p = T.adminApi('set_role', { id: id, role: 'user' });
            else if (a === 'msg') { S.adtab = 'messages'; S.msgTo = String(id); T.render(); return; }
            else if (a === 'reset') {
              p = T.adminApi('send_reset', { id: id }).then(function (r) {
                if (r.link) $('#admOut').innerHTML = '<p class="notice" style="margin-top:12px">Email is not set up, so send this one-time link to ' + esc(x.name) + ' yourself (valid 24 h):<br><input class="num" readonly value="' + esc(r.link) + '" onclick="this.select()"></p>';
                T.toast(r.emailed ? 'Reset email sent' : 'Reset link created'); return 'keep';
              });
            } else if (a === 'delete') {
              var typed = window.prompt('This deletes ' + x.name + ' and all their trades. Type their email to confirm:');
              if (typed === null) return;
              p = T.adminApi('delete_user', { id: id, confirm: typed.trim() });
            }
            btn.disabled = true;
            p.then(function (r) { if (r !== 'keep') { T.toast('Done'); AD.users(b, el); } else btn.disabled = false; }).catch(function (er) { btn.disabled = false; T.toast(er.message, true); });
          };
        });
      }).catch(function (er) { b.innerHTML = '<p class="alert">' + esc(er.message) + '</p>'; });
    },

    messages: function (b) {
      Promise.all([T.adminApi('messages'), T.adminApi('list')]).then(function (rs) {
        var j = rs[0], users = rs[1].users.filter(function (u) { return u.status === 'active'; });
        b.innerHTML = '<form class="panel" id="msgForm"><div class="panel-head"><div><h2>Send a message</h2><p>Appears as a popup and in the inbox. ' + j.active_users + ' active users.</p></div></div><div class="fg">' +
          '<label class="f s2">To<select id="mTo">' + opt([['all', 'Everyone (announcement)']].concat(users.map(function (u) { return [String(u.id), u.name + ' · ' + u.email]; })), S.msgTo || 'all') + '</select></label>' +
          '<label class="f s2">Title<input id="mTitle" maxlength="140" required placeholder="e.g. New feature: CSV import"></label>' +
          '<label class="f s4">Message<textarea id="mBody" maxlength="5000" placeholder="Write your message"></textarea></label>' +
          '<label class="switch s4"><input type="checkbox" id="mEmail">Also send it by email</label>' +
          '</div><div class="row end" style="margin-top:12px"><button class="btn primary" type="submit">Send</button></div></form>' +
          '<section class="panel"><div class="panel-head"><h2>Sent</h2></div>' + (j.messages.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sent</th><th>To</th><th>Title</th><th class="n">Read by</th><th></th></tr></thead><tbody>' +
          j.messages.map(function (m) {
            return '<tr><td class="num small">' + esc(m.created_at) + '</td><td>' + (m.user_id ? esc(m.to_name || '') + '<br><span class="small muted">' + esc(m.to_email || '') + '</span>' : '<span class="pill acc">Everyone</span>') + '</td>' +
              '<td class="wrap"><b>' + esc(m.title) + '</b>' + (m.body ? '<br><span class="small muted">' + esc(m.body.slice(0, 140)) + (m.body.length > 140 ? '…' : '') + '</span>' : '') + '</td><td class="n num">' + m.reads + '</td>' +
              '<td><button class="btn sm ghost" type="button" data-dm="' + m.id + '">Delete</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">No messages sent yet.</div>') + '</section>';
        S.msgTo = null;
        $('#msgForm', b).onsubmit = function (e) {
          e.preventDefault();
          var btn = this.querySelector('button[type=submit]'); btn.disabled = true;
          T.adminApi('send_message', { to: $('#mTo').value, title: $('#mTitle').value, body: $('#mBody').value, email: $('#mEmail').checked })
            .then(function (r) { T.toast('Sent' + (r.emailed ? ' · ' + r.emailed + ' emails' : '')); AD.messages(b); T.pollInbox(); })
            .catch(function (er) { btn.disabled = false; T.toast(er.message, true); });
        };
        $$('[data-dm]', b).forEach(function (x) { x.onclick = function () { if (!window.confirm('Delete this message for everyone?')) return; T.adminApi('delete_message', { id: +x.dataset.dm }).then(function () { AD.messages(b); }); }; });
      }).catch(function (er) { b.innerHTML = '<p class="alert">' + esc(er.message) + '</p>'; });
    },

    site: function (b) {
      T.adminApi('site').then(function (j) {
        var s = j.site;
        b.innerHTML = '<form class="panel" id="siteForm"><div class="panel-head"><div><h2>Branding</h2><p>Shown in the sidebar, sign-in page, emails and reports.</p></div></div><div class="fg">' +
          '<label class="f s2">Website name<input id="sName" value="' + esc(s.name) + '" maxlength="60" required></label>' +
          '<label class="f s2">Tagline<input id="sTag" value="' + esc(s.tagline) + '" maxlength="80" placeholder="e.g. Trading journal"></label>' +
          '<label class="f">Accent color<div class="row" style="flex-wrap:nowrap"><input id="sAcc" type="color" value="' + esc(s.accent) + '"><input id="sAccT" class="num" value="' + esc(s.accent) + '" maxlength="7"></div></label>' +
          '<label class="f">Support email<input id="sMail" type="email" value="' + esc(s.support_email) + '" placeholder="support@yourdomain.com"></label>' +
          '<label class="f s2">Footer text<input id="sFoot" value="' + esc(s.footer) + '" maxlength="300" placeholder="© 2026 1birr Trade. All rights reserved."></label>' +
          '</div>' +
          '<div class="panel-head" style="margin:18px 0 10px"><div><h2>Logo</h2><p>Square PNG, JPG or WEBP, up to 1 MB. Also used as the browser tab icon.</p></div></div>' +
          '<div class="row" style="gap:14px">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="Current logo" style="width:56px;height:56px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:var(--sunk)">' : '<span class="mono-mark" style="width:56px;height:56px;font-size:20px">' + esc(T.initials(s.name)) + '</span>') +
          '<label class="btn" for="logoF">' + T.icon('upload') + (s.logo ? 'Replace logo' : 'Upload logo') + '</label><input id="logoF" type="file" accept="image/png,image/jpeg,image/webp" hidden>' +
          (s.logo ? '<button class="btn ghost" type="button" id="logoDel">Remove</button>' : '') + '</div><div class="uplist" id="logoUp" style="margin-top:8px;max-width:360px"></div>' +
          '<div class="panel-head" style="margin:18px 0 10px"><div><h2>Sign-up</h2></div></div><div class="fg">' +
          '<label class="switch s2"><input type="checkbox" id="sOpen"' + (s.registration_open ? ' checked' : '') + '>Allow new sign-ups</label>' +
          '<label class="switch s2"><input type="checkbox" id="sAppr"' + (s.require_approval ? ' checked' : '') + '>New accounts need admin approval</label></div>' +
          '<div class="panel-head" style="margin:18px 0 10px"><div><h2>Legal</h2><p>Used in the generic Terms and Privacy Policy. Have a lawyer review them before you rely on them.</p></div></div><div class="fg">' +
          '<label class="f s2">Company or owner name<input id="sEnt" value="' + esc(s.legal_entity) + '" maxlength="120" placeholder="e.g. 1birr Trade PLC"></label>' +
          '<label class="f s2">Governing law (country)<input id="sCountry" value="' + esc(s.country) + '" maxlength="60"></label>' +
          '<label class="f s4">Terms and Conditions <span class="hint">Markdown. Leave empty to use the generic text.</span><textarea id="sTerms" style="min-height:200px" placeholder="Using the generic Terms. Paste your own to replace them.">' + esc(s.terms) + '</textarea></label>' +
          '<label class="f s4">Privacy Policy <span class="hint">Markdown. Leave empty to use the generic text.</span><textarea id="sPriv" style="min-height:200px" placeholder="Using the generic Privacy Policy. Paste your own to replace it.">' + esc(s.privacy) + '</textarea></label>' +
          '<div class="row s4"><button class="btn sm" type="button" id="useT">Start from the generic Terms</button><button class="btn sm" type="button" id="useP">Start from the generic Privacy Policy</button>' +
          '<a class="btn sm ghost" href="/terms.html" target="_blank" rel="noopener">View Terms</a><a class="btn sm ghost" href="/privacy.html" target="_blank" rel="noopener">View Privacy</a></div>' +
          '</div><div class="row end" style="margin-top:14px"><button class="btn primary" type="submit">Save site settings</button></div></form>';
        $('#sAcc', b).oninput = function () { $('#sAccT').value = this.value; document.documentElement.style.setProperty('--accent', this.value); };
        $('#sAccT', b).oninput = function () { if (/^#[0-9a-f]{6}$/i.test(this.value)) { $('#sAcc').value = this.value; document.documentElement.style.setProperty('--accent', this.value); } };
        $('#useT', b).onclick = function () { $('#sTerms').value = s.terms_default; };
        $('#useP', b).onclick = function () { $('#sPriv').value = s.privacy_default; };
        var afterSite = function (site) { S.site = site; T.applySite(); T.renderShell(); AD.site(b); };
        $('#siteForm', b).onsubmit = function (e) {
          e.preventDefault();
          T.adminApi('save_site', { name: $('#sName').value, tagline: $('#sTag').value, accent: $('#sAccT').value, support_email: $('#sMail').value, footer: $('#sFoot').value,
            registration_open: $('#sOpen').checked ? '1' : '0', require_approval: $('#sAppr').checked ? '1' : '0', legal_entity: $('#sEnt').value, country: $('#sCountry').value,
            terms: $('#sTerms').value, privacy: $('#sPriv').value })
            .then(function (r) { T.toast('Site settings saved'); afterSite(r.site); }).catch(function (er) { T.toast(er.message, true); });
        };
        $('#logoF', b).onchange = function () {
          var f = this.files[0]; if (!f) return;
          var setP = T.uploadList($('#logoUp')).add(f.name);
          (f.size <= 1024 * 1024 ? Promise.resolve(f) : T.shrinkImage(f, 512, 0.9, false)).then(function (blob) { return T.upload('/api/admin?action=upload_logo', blob, function (p) { setP(p); }); })
            .then(function (r) { setP(1, 'ok'); T.toast('Logo updated'); setTimeout(function () { afterSite(r.site); }, 300); }).catch(function (er) { setP(1, 'err'); T.toast(er.message, true); });
        };
        var ld = $('#logoDel', b); if (ld) ld.onclick = function () { T.adminApi('delete_logo', {}).then(function (r) { afterSite(r.site); }); };
      }).catch(function (er) { b.innerHTML = '<p class="alert">' + esc(er.message) + '</p>'; });
    }
  };
})();
