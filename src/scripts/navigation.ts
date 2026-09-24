// Navigasyon kabuğu: kenar çubuğu, tema düğmeleri, kaydırma hareketi, çıkış.
// Navigation.astro tarafından bundled <script> ile bir kez çağrılır.

import { getCurrentTheme, toggleTheme } from './app-shell';

function toggleMenu(): void {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

function closeMenuOnOutsideClick(event: MouseEvent): void {
  const sidebar = document.getElementById('sidebar');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  if (
    sidebar &&
    hamburgerBtn &&
    sidebar.classList.contains('open') &&
    !sidebar.contains(event.target as Node) &&
    !hamburgerBtn.contains(event.target as Node)
  ) {
    sidebar.classList.remove('open');
  }
}

function syncThemeButton(btn: HTMLButtonElement): void {
  const current = getCurrentTheme();
  btn.classList.toggle('dark', current === 'dark');
  btn.setAttribute('aria-label', current === 'dark' ? 'Açık moda geç' : 'Koyu moda geç');
}

function wireThemeButton(id: string): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;
  syncThemeButton(btn);
  btn.addEventListener('click', () => {
    toggleTheme();
    syncThemeButton(btn);
  });
}

function wireSwipe(): void {
  let touchStartX = 0;
  let touchEndX = 0;
  const minSwipeDistance = 50;

  document.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0]?.screenX ?? 0;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    (e) => {
      touchEndX = e.changedTouches[0]?.screenX ?? 0;
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      const distance = touchEndX - touchStartX;
      if (distance > minSwipeDistance && touchStartX < 50) {
        sidebar.classList.add('open');
      }
      if (distance < -minSwipeDistance && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    },
    { passive: true }
  );
}

async function handleLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    window.location.href = '/login';
  }
}

let initialized = false;

export function initNavigation(): void {
  if (initialized) return;
  initialized = true;

  document.getElementById('hamburger-btn')?.addEventListener('click', toggleMenu);
  document.getElementById('close-btn')?.addEventListener('click', toggleMenu);

  wireThemeButton('theme-toggle-btn');
  wireThemeButton('theme-toggle-btn-mobile');

  document.addEventListener('click', closeMenuOnOutsideClick);
  wireSwipe();

  document.getElementById('logout-btn')?.addEventListener('click', () => void handleLogout());
  document.getElementById('logout-btn-mobile')?.addEventListener('click', () => void handleLogout());
}
