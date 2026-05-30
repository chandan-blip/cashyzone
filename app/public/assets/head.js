/* Loads Tailwind (CDN) + brand config + Inter font + favicon. Include before </head>.
   head.js is a blocking <script> in <head>, so it runs before the body paints —
   we use that to hide the page until Tailwind has applied, preventing the flash
   of unstyled content (FOUC) on reload. */
(function () {
  // 1) Hide the page immediately (runs before <body> is painted).
  const hideStyle = document.createElement('style');
  hideStyle.id = 'cz-fouc';
  hideStyle.textContent = 'html.cz-loading{visibility:hidden}';
  document.head.appendChild(hideStyle);
  document.documentElement.classList.add('cz-loading');

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    document.documentElement.classList.remove('cz-loading');
  }
  // Safety net: never leave the page hidden if the CDN is slow/unreachable.
  setTimeout(reveal, 2500);

  // Favicon + theme colour for every page that includes head.js.
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon'; icon.type = 'image/svg+xml'; icon.href = '/favicon.svg';
    document.head.appendChild(icon);
    const apple = document.createElement('link');
    apple.rel = 'apple-touch-icon'; apple.href = '/favicon.svg';
    document.head.appendChild(apple);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const tc = document.createElement('meta');
    tc.name = 'theme-color'; tc.content = '#16c45f';
    document.head.appendChild(tc);
  }

  const tw = document.createElement('script');
  tw.src = 'https://cdn.tailwindcss.com';
  tw.onload = function () {
    window.tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { 50: '#eefdf3', 100: '#d6f9e2', 200: '#aff1c6', 500: '#16c45f', 600: '#0ea54e', 700: '#0c8340', 900: '#0a4d29' },
          },
          fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
        },
      },
    };
    // Tailwind applies styles synchronously once configured; reveal on the next
    // two frames so the painted page is already styled.
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  };
  tw.onerror = reveal; // if Tailwind fails to load, show the page anyway
  document.head.appendChild(tw);

  const f1 = document.createElement('link');
  f1.rel = 'preconnect'; f1.href = 'https://fonts.googleapis.com';
  document.head.appendChild(f1);
  const f2 = document.createElement('link');
  f2.rel = 'stylesheet';
  f2.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
  document.head.appendChild(f2);

  const style = document.createElement('style');
  style.textContent = '.gradient-text{background:linear-gradient(90deg,#16c45f,#0ea5e9);-webkit-background-clip:text;background-clip:text;color:transparent}[hidden]{display:none!important}body{font-family:Inter,system-ui,sans-serif}';
  document.head.appendChild(style);
})();
