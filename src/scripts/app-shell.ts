// Uygulama kabuğu: tema, sürüm senkronu, PWA ve responsive tablo desteği.
// public/js/app-shell.js dosyasının tipli TypeScript karşılığıdır.
// Layout'lar bu modülü bundled <script> ile import eder; window.RailctrlShell
// globali geriye dönük uyumluluk için korunur.

export type ShellInitOptions = {
  assetVersion?: string | null;
};

export type ShellFinalizeOptions = {
  enablePwa?: boolean;
  responsiveTables?: boolean;
};

const THEME_STORAGE_KEY = 'theme';
const VERSION_STORAGE_KEY = '__railctrl_app_version__';
const SW_URL = '/sw.js';

type ThemeMode = 'dark' | 'light';

function getStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

function getPreferredTheme(): ThemeMode {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Sayfa boyanmadan önce çağrılmalı: FOUC önlemek için en erken tema seçimi. */
export function setInitialTheme(): void {
  const theme = getStoredTheme() ?? getPreferredTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

export function getCurrentTheme(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* depolama yoksa sessiz geç */
  }
  applyThemeMetaColor();
  return next;
}

export function applyThemeMetaColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute('content', getCurrentTheme() === 'dark' ? '#0f172a' : '#1b2845');
}

function syncVersion(assetVersion?: string | null): void {
  if (!assetVersion) return;
  try {
    const prev = window.localStorage.getItem(VERSION_STORAGE_KEY);
    if (prev === assetVersion) return;
    window.localStorage.setItem(VERSION_STORAGE_KEY, assetVersion);
  } catch {
    /* depolama yoksa sessiz geç */
  }
}

let swRegistered = false;

export function registerServiceWorker(): void {
  if (swRegistered || !('serviceWorker' in window.navigator)) return;
  swRegistered = true;
  window.addEventListener(
    'load',
    () => {
      window.navigator.serviceWorker
        .register(SW_URL)
        .then((registration) => {
          registration.update().catch(() => undefined);
        })
        .catch((error: unknown) => {
          console.warn('Service Worker registration failed:', error);
        });
    },
    { once: true }
  );
}

export function setResponsiveTableLabels(root?: ParentNode): void {
  const scope = root ?? document;
  const tables = scope.querySelectorAll(
    '.table-container table, .data-table, .results-table, #usersTable, .users-table'
  );
  tables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => {
      return (th.textContent || '').trim() || 'Alan';
    });
    if (headers.length === 0) return;
    table.querySelectorAll('tbody tr').forEach((row) => {
      row.querySelectorAll('td').forEach((cell, index) => {
        if (!cell.getAttribute('data-label')) {
          cell.setAttribute('data-label', headers[index] || `Kolon ${index + 1}`);
        }
      });
    });
  });
}

let tableObserver: MutationObserver | null = null;

export function observeForResponsiveTables(): void {
  if (tableObserver || !document.body) return;
  let scheduled = false;
  tableObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      setResponsiveTableLabels();
      applyThemeMetaColor();
      scheduled = false;
    });
  });
  tableObserver.observe(document.body, { childList: true, subtree: true });
}

export function initShell(options: ShellInitOptions = {}): void {
  if (options.assetVersion) syncVersion(options.assetVersion);
  setInitialTheme();
}

export function finalizeShell(options: ShellFinalizeOptions = {}): void {
  applyThemeMetaColor();
  if (options.enablePwa !== false) registerServiceWorker();
  if (options.responsiveTables) {
    setResponsiveTableLabels();
    observeForResponsiveTables();
  }
}

/** data-asset-version taşıyan script etiketinden sürümü okur. */
export function readAssetVersionFromDom(): string | null {
  const el = document.querySelector<HTMLElement>('[data-asset-version]');
  return el?.dataset.assetVersion || null;
}

declare global {
  interface Window {
    RailctrlShell?: {
      init: (options?: ShellInitOptions) => void;
      finalize: (options?: ShellFinalizeOptions) => void;
    };
  }
}

// Geriye dönük uyumluluk: eski is:inline bloklar window.RailctrlShell bekler.
window.RailctrlShell = { init: initShell, finalize: finalizeShell };
