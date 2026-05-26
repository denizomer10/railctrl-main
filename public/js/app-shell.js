(function () {
  const THEME_STORAGE_KEY = 'theme';
  const VERSION_STORAGE_KEY = '__railctrl_app_version__';
  const SW_URL = '/sw.js';
  let swRegistered = false;

  function setInitialTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const fallback = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = stored || fallback;
    document.documentElement.setAttribute('data-theme', theme);
  }

  function applyThemeMetaColor() {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    metaThemeColor.setAttribute('content', dark ? '#0f172a' : '#1b2845');
  }

  function syncVersion(assetVersion) {
    if (!assetVersion) return;
    const prev = localStorage.getItem(VERSION_STORAGE_KEY);
    if (prev === assetVersion) return;
    localStorage.setItem(VERSION_STORAGE_KEY, assetVersion);
  }

  function registerServiceWorker() {
    if (swRegistered || !('serviceWorker' in navigator)) return;
    swRegistered = true;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(SW_URL)
        .then(function (registration) {
          registration.update().catch(function () {});
        })
        .catch(function (error) {
          console.warn('Service Worker registration failed:', error);
        });
    }, { once: true });
  }

  function setResponsiveTableLabels(root) {
    const scope = root || document;
    const tables = scope.querySelectorAll('.table-container table, .data-table, .results-table, #usersTable, .users-table');
    tables.forEach((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => {
        return (th.textContent || '').trim() || 'Alan';
      });
      if (headers.length === 0) return;
      table.querySelectorAll('tbody tr').forEach((row) => {
        row.querySelectorAll('td').forEach((cell, index) => {
          if (!cell.getAttribute('data-label')) {
            cell.setAttribute('data-label', headers[index] || 'Kolon ' + (index + 1));
          }
        });
      });
    });
  }

  function observeForResponsiveTables() {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        setResponsiveTableLabels();
        applyThemeMetaColor();
        scheduled = false;
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  window.RailctrlShell = {
    init: function (options) {
      const cfg = options || {};
      if (cfg.assetVersion) syncVersion(cfg.assetVersion);
      setInitialTheme();
    },
    finalize: function (options) {
      const cfg = options || {};
      applyThemeMetaColor();
      if (cfg.enablePwa !== false) registerServiceWorker();
      if (cfg.responsiveTables) {
        setResponsiveTableLabels();
        observeForResponsiveTables();
      }
    }
  };
})();
