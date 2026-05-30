/* Shared client-side helpers for every CashyZone page. */
(function () {
  'use strict';

  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

  const CZ = {
    token: localStorage.getItem('cz_token') || null,
    user: JSON.parse(localStorage.getItem('cz_user') || 'null'),

    money(n) { return inr.format(Number(n) || 0); },

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

      const right = u
        ? `<a href="/wallet.html" class="flex items-center gap-2 bg-brand-50 text-brand-700 text-sm font-bold px-3 py-2 rounded-xl">
             <span class="w-2 h-2 rounded-full bg-brand-500"></span><span id="navBalance">${this.money(u.balance)}</span></a>
           <span class="hidden sm:inline text-sm text-slate-600">Hi, ${(u.name || 'there').split(' ')[0]}</span>
           <button onclick="CZ.logout()" class="text-sm font-semibold px-3 py-2 rounded-xl hover:bg-slate-100">Logout</button>`
        : `<a href="/login.html" class="text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-100">Login</a>
           <a href="/login.html?mode=register" class="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">Sign up</a>`;

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
            <div class="flex items-center gap-2">${right}</div>
          </nav>
        </header>`;

      // Fire-and-forget: show the KYC payment banner if one is owed.
      this.checkKyc();
    },
  };

  window.CZ = CZ;
})();
