/* Theme: Auto (follows device) / Light / Dark. Loaded in <head> so there is no flash. */
(function () {
  var KEY = 'wtj-theme', ORDER = ['auto', 'light', 'dark'];
  var LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  var ICON = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function get() { try { var v = localStorage.getItem(KEY); return ORDER.indexOf(v) >= 0 ? v : 'auto'; } catch (e) { return 'auto'; } }
  function isDark(mode) { return mode === 'dark' || (mode === 'auto' && mq && mq.matches); }

  function apply(mode) {
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark(mode) ? '#1c1f25' : '#ffffff');
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].innerHTML = ICON[mode] + '<span class="tl">' + LABEL[mode] + '</span>';
      btns[i].setAttribute('aria-label', 'Theme: ' + LABEL[mode] + '. Click to change.');
      btns[i].title = 'Theme: ' + LABEL[mode];
    }
  }

  window.wtjTheme = {
    get: get,
    set: function (mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} apply(mode); },
    next: function () { var m = ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length]; this.set(m); return m; }
  };

  apply(get());
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { apply(get()); });

  document.addEventListener('DOMContentLoaded', function () {
    apply(get());
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.theme-btn');
      if (b) window.wtjTheme.next();
    });
  });
})();
