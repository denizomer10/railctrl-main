// Güzergah sayfası istemcisi. guzergah.astro tarafından bundled <script> ile çağrılır.
import { initZoomViewer } from './zoom-viewer';

  initZoomViewer({ viewer: 'guzergah-viewer', container: 'guzergah-image-container', indicator: 'guzergah-zoom-indicator' });

  const mapButtons = Array.from(document.querySelectorAll('.map-btn'));
  const mapImage = document.getElementById('guzergah-image') as HTMLImageElement | null;
  if (mapImage) {
    mapImage.addEventListener('error', () => {
      const fallbackSrc = mapImage.dataset.fallbackSrc;
      if (fallbackSrc && mapImage.dataset.fallbackTried !== '1') {
        mapImage.dataset.fallbackTried = '1';
        mapImage.src = fallbackSrc;
      }
    });
  }
  mapButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = (btn as HTMLElement).getAttribute('data-src');
      const fallbackSrc = (btn as HTMLElement).getAttribute('data-fallback-src') || '';
      const alt = (btn as HTMLElement).getAttribute('data-alt') || 'Harita';
      if (!mapImage || !src) return;
      mapImage.dataset.fallbackSrc = fallbackSrc;
      mapImage.dataset.fallbackTried = '0';
      mapImage.src = src;
      mapImage.alt = alt;
      mapButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

export function initGuzergah(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
