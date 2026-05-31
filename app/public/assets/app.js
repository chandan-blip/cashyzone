/* Shared client-side helpers for every CashyZone page. */
(function () {
  'use strict';

  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
  const numFmt = new Intl.NumberFormat('en-IN');

  const CZ = {
    token: localStorage.getItem('cz_token') || null,
    user: JSON.parse(localStorage.getItem('cz_user') || 'null'),

    money(n) { return inr.format(Number(n) || 0); },
    num(n) { return numFmt.format(Math.round(Number(n) || 0)); },

    // Animate an element's number from 0 up to `target`, formatting each frame.
    // opts.money → format as ₹ currency; opts.duration → ms (default 700).
    countUp(el, target, opts = {}) {
      if (!el) return;
      const to = Number(target) || 0;
      const dur = opts.duration || 1900;
      const fmt = opts.money ? (v) => this.money(v) : (v) => this.num(v);
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { el.textContent = fmt(to); return; }

      // Entrance: fade in + grow slightly from small to full size.
      el.style.transformOrigin = 'left center';
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.86)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'opacity 600ms ease, transform 600ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
      }));

      if (to === 0) { el.textContent = fmt(0); return; }

      // Cancel any in-flight animation on the same element.
      if (el._countStop) { try { el._countStop(); } catch { /* ignore */ } el._countStop = null; }
      if (el._countRAF) { cancelAnimationFrame(el._countRAF); el._countRAF = null; }

      // Clamp so the displayed number never shoots past the target.
      const clamp = (v) => Math.min(to, Math.max(0, v));

      // Preferred: Motion One — tween with a strong ease-out (fast → slow),
      // no overshoot.
      const M = window.Motion;
      if (M && M.animate) {
        try {
          const controls = M.animate(0, to, {
            duration: dur / 1000,
            ease: opts.ease || [0.16, 1, 0.3, 1], // easeOutExpo — starts fast, ends slow
            onUpdate: (v) => { el.textContent = fmt(clamp(v)); },
          });
          el._countStop = () => controls.stop && controls.stop();
          if (controls.finished && controls.finished.then) {
            controls.finished.then(() => { el.textContent = fmt(to); el._countStop = null; }).catch(() => {});
          }
          // Safety net: guarantee the final value even if the controls API differs.
          setTimeout(() => { if (el._countStop) { el.textContent = fmt(to); el._countStop = null; } }, dur + 500);
          return;
        } catch { /* fall through to the rAF version below */ }
      }

      // Fallback: rAF easeOutExpo — fast start, slow finish, no overshoot.
      const ease = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = fmt(clamp(to * ease(p)));
        if (p < 1) el._countRAF = requestAnimationFrame(tick);
        else { el.textContent = fmt(to); el._countRAF = null; }
      };
      el._countRAF = requestAnimationFrame(tick);
    },

    setSession(token, user) {
      this.token = token; this.user = user;
      localStorage.setItem('cz_token', token);
      localStorage.setItem('cz_user', JSON.stringify(user));
    },

    clearSession() {
      this.token = null; this.user = null;
      localStorage.removeItem('cz_token');
      localStorage.removeItem('cz_user');
    },

    async api(path, opts = {}) {
      const res = await fetch(path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
          ...(opts.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { this.clearSession(); }
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      return data;
    },

    requireAuth() {
      if (!this.token) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); return false; }
      return true;
    },

    requireAdmin() {
      if (!this.requireAuth()) return false;
      if (!this.user || !this.user.is_admin) { location.href = '/'; return false; }
      return true;
    },

    logout() { this.clearSession(); location.href = '/'; },

    toast(msg) {
      let t = document.getElementById('cz-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'cz-toast';
        t.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(t._timer);
      t._timer = setTimeout(() => (t.style.display = 'none'), 2800);
    },

    // Global KYC banner. Reads KYC status fresh from the DB on every page load,
    // so a user who submitted KYC but hasn't paid the fee always sees the
    // "pay to proceed" notice — even after logging out and back in.
    async checkKyc() {
      if (!this.token) return null;
      let data;
      try {
        data = await this.api('/api/kyc');
      } catch { return null; }
      this.kyc = data;

      // Only the awaiting-payment state gets the blocking banner.
      if (data.needsPayment) {
        const onDeposit = location.pathname.startsWith('/deposit');
        let bar = document.getElementById('cz-kyc-bar');
        if (!bar) {
          bar = document.createElement('div');
          bar.id = 'cz-kyc-bar';
          bar.className = 'sticky top-16 z-30 bg-amber-500 text-white';
          document.body.insertBefore(bar, document.body.children[1] || null);
        }
        bar.innerHTML = `
          <div class="max-w-6xl mx-auto px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
            <span>⚠️ Pay the KYC fee of ${this.money(data.fee)} to complete verification and proceed.</span>
            ${onDeposit ? '' : `<a href="/deposit.html?purpose=kyc" class="bg-white text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition">Pay ${this.money(data.fee)} now</a>`}
          </div>`;
      }
      return data;
    },

    // Refresh the cached balance from the server (keeps nav pill accurate).
    async refreshBalance() {
      if (!this.token) return;
      try {
        const data = await this.api('/api/auth/me');
        this.setSession(this.token, data.user);
        const pill = document.getElementById('navBalance');
        if (pill) pill.textContent = this.money(data.user.balance);
      } catch { /* ignore */ }
    },

    renderNav(active) {
      // Treat a present token as "logged in" so the header always shows Logout,
      // even if the cached user object is missing for some reason.
      const loggedIn = !!this.token;
      const u = loggedIn ? (this.user || { name: 'Account', balance: 0, is_admin: false }) : null;
      const link = (href, label, key) =>
        `<a href="${href}" class="px-3 py-2 rounded-lg text-sm font-medium ${active === key ? 'text-brand-700 bg-brand-50' : 'text-slate-600 hover:text-brand-600'}">${label}</a>`;

      const left = [
        link('/', 'Home', 'home'),
        link('/tasks.html', 'Tasks', 'tasks'),
        u ? link('/wallet.html', 'Wallet', 'wallet') : '',
        u && u.is_admin ? link('/admin.html', 'Admin', 'admin') : '',
      ].join('');

      // Desktop-only right cluster (balance pill, greeting, logout / auth buttons).
      const right = u
        ? `<a href="/wallet.html" class="flex items-center gap-2 bg-brand-50 text-brand-700 text-sm font-bold px-3 py-2 rounded-xl">
             <span class="w-2 h-2 rounded-full bg-brand-500"></span><span id="navBalance">${this.money(u.balance)}</span></a>
           <span class="hidden lg:inline text-sm text-slate-600">Hi, ${(u.name || 'there').split(' ')[0]}</span>
           <button onclick="CZ.logout()" class="hidden md:inline-block text-sm font-semibold px-3 py-2 rounded-xl hover:bg-slate-100">Logout</button>`
        : `<a href="/login.html" class="hidden md:inline-block text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-100">Login</a>
           <a href="/login.html?mode=register" class="hidden md:inline-block bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">Sign up</a>`;

      // Full-width links shown inside the mobile offcanvas.
      const mLink = (href, label, key) =>
        `<a href="${href}" class="block px-4 py-3 rounded-xl text-base font-semibold ${active === key ? 'text-brand-700 bg-brand-50' : 'text-slate-700 hover:bg-slate-50'}">${label}</a>`;

      const drawerLinks = [
        mLink('/', 'Home', 'home'),
        mLink('/tasks.html', 'Tasks', 'tasks'),
        u ? mLink('/wallet.html', 'Wallet', 'wallet') : '',
        u && u.is_admin ? mLink('/admin.html', 'Admin', 'admin') : '',
      ].join('');

      const drawerActions = u
        ? `<button onclick="CZ.logout()" class="w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-4 py-3 rounded-xl transition">Logout</button>`
        : `<a href="/login.html" class="block text-center border border-slate-200 hover:bg-slate-50 font-semibold px-4 py-3 rounded-xl transition">Login</a>
           <a href="/login.html?mode=register" class="block text-center bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-3 rounded-xl transition">Sign up</a>`;

      const navEl = document.getElementById('nav');
      // display:contents so the sticky <header> sticks to the page body, not this
      // wrapper (which is only header-height and would scroll the header away).
      navEl.className = 'contents';
      navEl.innerHTML = `
        <header class="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
          <nav class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-2">
            <a href="/" class="flex items-center gap-2 font-extrabold text-lg shrink-0">
              <span class="grid place-items-center w-9 h-9 rounded-xl bg-brand-500 text-white">₹</span>
              Cashy<span style="background:linear-gradient(90deg,#16c45f,#0ea5e9);-webkit-background-clip:text;background-clip:text;color:transparent">Zone</span>
            </a>
            <div class="hidden md:flex items-center gap-1">${left}</div>
            <div class="flex items-center gap-2">${right}
              <button type="button" onclick="CZ.openNav()" aria-label="Open menu" class="md:hidden grid place-items-center w-10 h-10 rounded-xl text-slate-700 hover:bg-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
              </button>
            </div>
          </nav>
        </header>
        <!-- (KYC warning banner removed — GST is now collected at withdrawal.) -->

        <!-- Mobile offcanvas -->
        <div id="navDrawer" class="md:hidden fixed inset-0 z-50 hidden">
          <div onclick="CZ.closeNav()" class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm opacity-0 transition-opacity duration-300" id="navDrawerOverlay"></div>
          <aside id="navDrawerPanel" class="absolute top-0 right-0 h-full w-72 max-w-[80%] bg-white shadow-2xl flex flex-col translate-x-full transition-transform duration-300">
            <div class="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span class="font-extrabold text-lg">Menu</span>
              <button type="button" onclick="CZ.closeNav()" aria-label="Close menu" class="grid place-items-center w-10 h-10 rounded-xl text-slate-700 hover:bg-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            ${u ? `<div class="mx-4 mt-4 flex items-center gap-3">
              <div class="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-lg shadow-brand-500/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div class="min-w-0">
                <p class="font-black truncate">${u.name || 'Account'}</p>
                ${u.created_at ? `<p class="text-xs text-slate-500 truncate">Member since ${new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>` : ''}
              </div>
            </div>` : ''}
            ${u ? `<a href="/wallet.html" class="mx-4 mt-4 flex items-center justify-between bg-brand-50 text-brand-700 font-bold px-4 py-3 rounded-xl">
              <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-brand-500"></span>Balance</span>
              <span>${this.money(u.balance)}</span></a>` : ''}
            <nav class="flex-1 overflow-y-auto px-4 py-4 space-y-1">${drawerLinks}</nav>
            <div class="px-4 py-4 border-t border-slate-200 space-y-2">${drawerActions}</div>
          </aside>
        </div>`;
    },

    // Open the mobile navigation offcanvas (slides in from the right).
    openNav() {
      const d = document.getElementById('navDrawer');
      if (!d) return;
      d.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      // Next frame so the transition animates from the off-screen start state.
      requestAnimationFrame(() => {
        document.getElementById('navDrawerOverlay').classList.remove('opacity-0');
        document.getElementById('navDrawerPanel').classList.remove('translate-x-full');
      });
    },

    // Close the mobile navigation offcanvas.
    closeNav() {
      const d = document.getElementById('navDrawer');
      if (!d) return;
      document.getElementById('navDrawerOverlay').classList.add('opacity-0');
      document.getElementById('navDrawerPanel').classList.add('translate-x-full');
      document.body.style.overflow = '';
      setTimeout(() => d.classList.add('hidden'), 300);
    },
    // Registration-fee gate: a logged-in non-admin whose registration fee has
    // not been approved is confined to the reg-fee page until an admin approves.
    async guardActivation() {
      if (!this.token) return;                 // visitors browse freely
      if (this.user && this.user.is_admin) return;
      const page = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      const exempt = ['/reg-fee.html', '/login.html', '/register.html'];
      if (exempt.includes(page) || page.startsWith('/admin')) return;
      try {
        const data = await this.api('/api/auth/activation');
        if (data.status !== 'active') location.href = '/reg-fee.html';
      } catch { /* network error — don't lock the user out */ }
    },
  };

  window.CZ = CZ;
  // Enforce the registration-fee paywall on every page load.
  CZ.guardActivation();
})();
