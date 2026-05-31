/* Shared CashyType main navigation — one source of truth for every page.
   Renders a sticky top bar with the logo + menu, plus a mobile hamburger that
   opens the menu as a top off-canvas. Reads login state from window.CZ, so load
   this AFTER /assets/app.js. Root element is a <div class="czn"> (not <header>/<nav>)
   so it never collides with page-level header{}/nav{} styles. */
(function () {
  'use strict';
  if (window.__czNavLoaded) return;
  window.__czNavLoaded = true;

  var CSS = [
    ".czn{position:sticky;top:0;z-index:1200;background:rgba(255,255,255,.96);",
    "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 24px rgba(0,0,0,.08);",
    "font-family:'Poppins',system-ui,sans-serif;transition:box-shadow .3s ease}",
    ".czn.czn-scrolled{box-shadow:0 8px 28px rgba(0,0,0,.14)}",
    ".czn-inner{max-width:1280px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}",
    ".czn-logo{display:flex;align-items:center;text-decoration:none}",
    ".czn-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#6c63ff,#564fd8);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;margin-right:10px;box-shadow:0 4px 6px rgba(108,99,255,.3)}",
    ".czn-logo-text{font-size:22px;font-weight:800;font-family:'Montserrat','Poppins',sans-serif;background:linear-gradient(to right,#6c63ff,#ff6584);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}",
    ".czn-menu{display:flex;align-items:center;gap:4px;list-style:none;margin:0;padding:0}",
    ".czn-menu a{color:#2d3748;text-decoration:none;font-weight:600;font-size:14.5px;padding:8px 11px;border-radius:10px;transition:.2s;cursor:pointer;white-space:nowrap}",
    ".czn-menu a:hover{color:#6c63ff;background:rgba(108,99,255,.08)}",
    ".czn-burger{display:none;background:none;border:none;cursor:pointer;color:#2d3748;padding:4px;line-height:0}",
    ".czn-oc{position:fixed;inset:0;z-index:1300;visibility:hidden}",
    ".czn-oc.open{visibility:visible}",
    ".czn-oc-bg{position:absolute;inset:0;background:rgba(15,23,42,.45);opacity:0;transition:opacity .3s}",
    ".czn-oc.open .czn-oc-bg{opacity:1}",
    ".czn-oc-panel{position:absolute;top:0;left:0;right:0;background:#fff;border-radius:0 0 22px 22px;padding:16px 20px 24px;transform:translateY(-100%);transition:transform .34s cubic-bezier(.22,1,.36,1);box-shadow:0 20px 44px rgba(0,0,0,.2)}",
    ".czn-oc.open .czn-oc-panel{transform:translateY(0)}",
    ".czn-oc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}",
    ".czn-oc-menu{list-style:none;margin:0;padding:0}",
    ".czn-oc-menu a{display:block;color:#2d3748;text-decoration:none;font-weight:600;font-size:16.5px;padding:13px 6px;border-bottom:1px solid #f1f5f9}",
    ".czn-oc-menu a:last-child{border-bottom:none}",
    ".czn-oc-menu a:hover{color:#6c63ff}",
    ".czn-close{background:none;border:none;cursor:pointer;color:#2d3748;padding:4px;line-height:0}",
    "@media(max-width:992px){.czn-menu{display:none}.czn-burger{display:block}}",
  ].join('');

  var BURGER = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  var CLOSE = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function items(loggedIn) {
    return loggedIn ? [
      ['Home', '/'],
      ['Data Entry Work', '/tasks.html'],
      ['My Balance', '/wallet.html'],
      ['Widthwal Money Instant', '/instant-withdrawal.html'],
      ['About Cashytype', '/about-cashytype.html'],
      ['Term and Condition', '/term-cond.html'],
      ['Contact Support Team', '#', 'tg'],
      ['Cashytype Giveaway', '/givaway.html'],
      ['Logout', '#', 'logout'],
    ] : [
      ['Registration', '/register.html'],
      ['Home', '/'],
      ['My Balance', '/wallet.html'],
      ['About Cashytype', '/about-cashytype.html'],
      ['Term and Condition', '/term-cond.html'],
      ['Contact Support Team', '#', 'tg'],
    ];
  }

  function li(it) {
    if (it[2] === 'logout') return '<li><a href="#" onclick="event.preventDefault();CZ.logout()">' + it[0] + '</a></li>';
    var extra = it[2] === 'tg' ? ' data-tg="1"' : '';
    return '<li><a href="' + it[1] + '"' + extra + '>' + it[0] + '</a></li>';
  }

  function logoHtml(brand) {
    return '<a class="czn-logo" href="/"><span class="czn-logo-icon"><i class="fas fa-keyboard"></i></span><span class="czn-logo-text">' + brand + '</span></a>';
  }

  function render() {
    var CZ = window.CZ || {};
    var loggedIn = !!CZ.token;
    var brand = (loggedIn && CZ.user && CZ.user.name) ? CZ.user.name.split(' ')[0] : 'CashyType';
    var menuHtml = items(loggedIn).map(li).join('');

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.className = 'czn';
    bar.innerHTML =
      '<div class="czn-inner">' + logoHtml(brand) +
      '<ul class="czn-menu">' + menuHtml + '</ul>' +
      '<button class="czn-burger" aria-label="Open menu">' + BURGER + '</button></div>';

    var oc = document.createElement('div');
    oc.className = 'czn-oc';
    oc.innerHTML =
      '<div class="czn-oc-bg"></div><div class="czn-oc-panel"><div class="czn-oc-head">' +
      logoHtml(brand) + '<button class="czn-close" aria-label="Close menu">' + CLOSE + '</button></div>' +
      '<ul class="czn-oc-menu">' + menuHtml + '</ul></div>';

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.appendChild(oc);

    function open() { oc.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function close() { oc.classList.remove('open'); document.body.style.overflow = ''; }
    bar.querySelector('.czn-burger').addEventListener('click', open);
    oc.querySelector('.czn-close').addEventListener('click', close);
    oc.querySelector('.czn-oc-bg').addEventListener('click', close);
    // Close the drawer when an in-page link is tapped.
    [].forEach.call(oc.querySelectorAll('.czn-oc-menu a'), function (a) { a.addEventListener('click', close); });

    // Subtle shadow once scrolled.
    window.addEventListener('scroll', function () {
      bar.classList.toggle('czn-scrolled', window.scrollY > 20);
    });

    // Telegram support links (nav + drawer) from admin settings.
    fetch('/api/public-settings').then(function (r) { return r.json(); }).then(function (s) {
      if (!s.telegram_url) return;
      [].forEach.call(document.querySelectorAll('[data-tg]'), function (a) {
        a.href = s.telegram_url; a.target = '_blank'; a.rel = 'noopener';
      });
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
