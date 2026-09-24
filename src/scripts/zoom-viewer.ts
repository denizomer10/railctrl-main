// Görüntü yakınlaştırma/kaydırma: harita ve çizelge sayfaları için ortak modül.
// guzergah, tren-saatleri, idari-cizelge tarafından kullanılır.

export type ZoomViewerIds = {
  viewer: string;
  container: string;
  indicator?: string;
  image?: string;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.3;

export function initZoomViewer(ids: ZoomViewerIds): void {
  const viewer = document.getElementById(ids.viewer);
  const container = document.getElementById(ids.container);
  const zoomIndicator = ids.indicator ? document.getElementById(ids.indicator) : null;
  if (!viewer || !container) return;

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialDistance = 0;
  let initialScale = 1;
  let indicatorTimeout: number | undefined;

  const clampScale = (value: number): number => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));

  const showIndicator = (): void => {
    if (!zoomIndicator) return;
    zoomIndicator.textContent = `${Math.round(scale * 100)}%`;
    zoomIndicator.classList.add('show');
    window.clearTimeout(indicatorTimeout);
    indicatorTimeout = window.setTimeout(() => zoomIndicator.classList.remove('show'), 800);
  };

  const applyTransform = (): void => {
    container.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };

  const zoomAt = (factor: number, centerX = 0, centerY = 0): void => {
    const next = clampScale(scale * factor);
    const ratio = next / scale;
    translateX = centerX - (centerX - translateX) * ratio;
    translateY = centerY - (centerY - translateY) * ratio;
    scale = next;
    applyTransform();
    showIndicator();
  };

  viewer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewer.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  container.addEventListener('pointerdown', (e) => {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.setPointerCapture?.(e.pointerId);
  });

  container.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
  });

  const endDrag = (): void => {
    isDragging = false;
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      initialDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialScale = scale;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (initialDistance > 0) {
        scale = clampScale(initialScale * (dist / initialDistance));
        applyTransform();
        showIndicator();
      }
    }
  }, { passive: false });

  viewer.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = (btn as HTMLElement).dataset.zoom;
      if (dir === 'reset') {
        scale = 1;
        translateX = 0;
        translateY = 0;
        applyTransform();
        showIndicator();
      } else {
        zoomAt(dir === 'out' ? 1 - ZOOM_STEP : 1 + ZOOM_STEP);
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '0') {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform();
      showIndicator();
    } else if (event.key === '+' || event.key === '=') {
      zoomAt(1 + ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      zoomAt(1 - ZOOM_STEP);
    }
  });
}
