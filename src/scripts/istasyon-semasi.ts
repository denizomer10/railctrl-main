// istasyon-semasi istemcisi. istasyon-semasi.astro tarafından bundled <script> ile çağrılır.
const stationImages = {
    atalar: '/files/atalar.webp',
    aydintepe: '/files/aydintepe.webp',
    basak: '/files/basak.webp',
    'bostanci-dogu-konkors': '/files/bostanci-dogu-konkors.webp',
    'bostanci-peron-bati-konkors': '/files/bostanci-peron-bati-konkors.webp',
    cayirova: '/files/cayirova.webp',
    cevizli: '/files/cevizli.webp',
    darica: '/files/darica.webp',
    erenkoy: '/files/erenkoy.webp',
    fatih: '/files/fatih.webp',
    feneryolu: '/files/feneryolu.webp',
    'gebze-konkors': '/files/gebze-konkors.webp',
    'gebze-peron': '/files/gebze-peron.webp',
    goztepe: '/files/goztepe.webp',
    guzelyali: '/files/guzelyali.webp',
    icmeler: '/files/icmeler.webp',
    idealtepe: '/files/idealtepe.webp',
    kartal: '/files/kartal.webp',
    kaynarca: '/files/kaynarca.webp',
    'kücükyali': '/files/kücükyali.webp',
    maltepe: '/files/maltepe.webp',
    osmangazi: '/files/osmangazi.webp',
    pendik: '/files/pendik.webp',
    sogutlucesme: '/files/sogutlucesme.webp',
    suadiye: '/files/suadiye.webp',
    'sureyya-plaji': '/files/sureyya-plaji.webp',
    tersane: '/files/tersane.webp',
    tuzla: '/files/tuzla.webp',
    yunus: '/files/yunus.webp'
  };

  const stationNames = {
    atalar: 'Atalar İstasyonu',
    aydintepe: 'Aydıntepe İstasyonu',
    basak: 'Başak İstasyonu',
    'bostanci-dogu-konkors': 'Bostancı Doğu Konkors İstasyonu',
    'bostanci-peron-bati-konkors': 'Bostancı Peron Batı Konkors İstasyonu',
    cayirova: 'Çayırova İstasyonu',
    cevizli: 'Cevizli İstasyonu',
    darica: 'Darica İstasyonu',
    erenkoy: 'Erenköy İstasyonu',
    fatih: 'Fatih İstasyonu',
    feneryolu: 'Feneryolu İstasyonu',
    'gebze-konkors': 'Gebze Konkors İstasyonu',
    'gebze-peron': 'Gebze Peron İstasyonu',
    goztepe: 'Göztepe İstasyonu',
    guzelyali: 'Güzelyalı İstasyonu',
    icmeler: 'İçmeler İstasyonu',
    idealtepe: 'İdealtepe İstasyonu',
    kartal: 'Kartal İstasyonu',
    kaynarca: 'Kaynarca İstasyonu',
    'kücükyali': 'Küçükyalı İstasyonu',
    maltepe: 'Maltepe İstasyonu',
    osmangazi: 'Osman Gazi İstasyonu',
    pendik: 'Pendik İstasyonu',
    sogutlucesme: 'Söğütlüçeşme İstasyonu',
    suadiye: 'Suadiye İstasyonu',
    'sureyya-plaji': 'Süreyya Plajı İstasyonu',
    tersane: 'Tersane İstasyonu',
    tuzla: 'Tuzla İstasyonu',
    yunus: 'Yunus İstasyonu'
  };

  const viewer = document.getElementById('istasyon-viewer');
  const stationSelect = document.getElementById('station-select');
  const stationNameEl = document.getElementById('current-station-name');
  const image = document.getElementById('istasyon-image');
  const imageWrap = document.getElementById('istasyon-image-wrap');
  const zoomIndicator = document.getElementById('zoom-indicator');
  const closeViewerBtn = document.getElementById('close-viewer-btn');

  if (viewer && stationSelect && stationNameEl && image && imageWrap) {
    let zoom = 1;
    let baseScale = 1;
    let maxZoom = 6;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let indicatorTimer;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;

    const MIN_ZOOM = 1;
    const ZOOM_STEP = 0.2;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const getDistance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const showZoom = () => {
      const text = `${Math.round(zoom * 100)}%`;
      if (zoomIndicator) {
        zoomIndicator.textContent = text;
        zoomIndicator.classList.add('show');
        clearTimeout(indicatorTimer);
        indicatorTimer = setTimeout(() => zoomIndicator.classList.remove('show'), 800);
      }
    };

    const updateBaseScale = () => {
      const naturalWidth = image.naturalWidth || 1;
      const naturalHeight = image.naturalHeight || 1;
      const viewWidth = Math.max(1, imageWrap.clientWidth - 24);
      const viewHeight = Math.max(1, imageWrap.clientHeight - 24);
      baseScale = Math.min(viewWidth / naturalWidth, viewHeight / naturalHeight, 1);
      maxZoom = Math.max(4, 1 / baseScale);
    };

    const applyZoom = (nextZoom, anchorX, anchorY) => {
      const prevWidth = image.clientWidth || 1;
      const prevHeight = image.clientHeight || 1;
      const viewWidth = imageWrap.clientWidth;
      const viewHeight = imageWrap.clientHeight;
      const prevScrollLeft = imageWrap.scrollLeft;
      const prevScrollTop = imageWrap.scrollTop;

      const ratioX = anchorX !== undefined ? anchorX / prevWidth : (prevScrollLeft + viewWidth / 2) / prevWidth;
      const ratioY = anchorY !== undefined ? anchorY / prevHeight : (prevScrollTop + viewHeight / 2) / prevHeight;

      zoom = clamp(nextZoom, MIN_ZOOM, maxZoom);
      const renderScale = baseScale * zoom;
      const nextWidth = Math.max(1, Math.round((image.naturalWidth || 1) * renderScale));
      const nextHeight = Math.max(1, Math.round((image.naturalHeight || 1) * renderScale));

      image.style.width = `${nextWidth}px`;
      image.style.height = `${nextHeight}px`;

      const targetLeft = ratioX * nextWidth - (anchorX !== undefined ? anchorX - prevScrollLeft : viewWidth / 2);
      const targetTop = ratioY * nextHeight - (anchorY !== undefined ? anchorY - prevScrollTop : viewHeight / 2);
      imageWrap.scrollLeft = Math.max(0, targetLeft);
      imageWrap.scrollTop = Math.max(0, targetTop);

      showZoom();
    };

    const resetZoom = () => {
      applyZoom(1);
      const centerLeft = Math.max(0, (imageWrap.scrollWidth - imageWrap.clientWidth) / 2);
      const centerTop = Math.max(0, (imageWrap.scrollHeight - imageWrap.clientHeight) / 2);
      imageWrap.scrollLeft = centerLeft;
      imageWrap.scrollTop = centerTop;
    };

    const zoomBy = (delta, clientX, clientY) => {
      const rect = imageWrap.getBoundingClientRect();
      const anchorX = clientX !== undefined ? clientX - rect.left + imageWrap.scrollLeft : undefined;
      const anchorY = clientY !== undefined ? clientY - rect.top + imageWrap.scrollTop : undefined;
      applyZoom(zoom + delta, anchorX, anchorY);
    };

    const clearStationQuery = () => {
      const next = new URLSearchParams(window.location.search);
      next.delete('station');
      next.delete('istasyon');
      const query = next.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
    };

    const showStation = (station) => {
      if (!station || !stationImages[station]) {
        viewer.style.display = 'none';
        image.src = '';
        stationNameEl.textContent = 'İstasyon Şeması';
        return;
      }

      image.onload = () => {
        updateBaseScale();
        resetZoom();
      };

      image.src = stationImages[station];
      image.alt = stationNames[station] || 'İstasyon Şeması';
      stationNameEl.textContent = stationNames[station] || 'İstasyon Şeması';
      viewer.style.display = 'block';
    };

    closeViewerBtn?.addEventListener('click', () => {
      viewer.style.display = 'none';
      stationSelect.value = '';
      image.src = '';
      stationNameEl.textContent = 'İstasyon Şeması';
    });

    viewer.addEventListener('wheel', (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      zoomBy(delta, event.clientX, event.clientY);
    }, { passive: false });

    viewer.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = imageWrap.scrollLeft;
      startScrollTop = imageWrap.scrollTop;
      viewer.classList.add('dragging');
    });

    document.addEventListener('mousemove', (event) => {
      if (!isDragging) return;
      imageWrap.scrollLeft = startScrollLeft - (event.clientX - startX);
      imageWrap.scrollTop = startScrollTop - (event.clientY - startY);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      viewer.classList.remove('dragging');
    });

    viewer.addEventListener('mouseleave', () => {
      isDragging = false;
      viewer.classList.remove('dragging');
    });

    viewer.addEventListener('touchstart', (event) => {
      if (event.touches.length === 1) {
        isDragging = true;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        startScrollLeft = imageWrap.scrollLeft;
        startScrollTop = imageWrap.scrollTop;
      } else if (event.touches.length === 2) {
        isDragging = false;
        pinchStartDistance = getDistance(event.touches[0], event.touches[1]);
        pinchStartZoom = zoom;
      }
    }, { passive: true });

    viewer.addEventListener('touchmove', (event) => {
      if (event.touches.length === 1 && isDragging) {
        imageWrap.scrollLeft = startScrollLeft - (event.touches[0].clientX - startX);
        imageWrap.scrollTop = startScrollTop - (event.touches[0].clientY - startY);
      } else if (event.touches.length === 2) {
        event.preventDefault();
        const currentDistance = getDistance(event.touches[0], event.touches[1]);
        const scaleFactor = currentDistance / Math.max(1, pinchStartDistance);
        const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        const rect = imageWrap.getBoundingClientRect();
        const anchorX = midX - rect.left + imageWrap.scrollLeft;
        const anchorY = midY - rect.top + imageWrap.scrollTop;
        applyZoom(pinchStartZoom * scaleFactor, anchorX, anchorY);
      }
    }, { passive: false });

    viewer.addEventListener('touchend', () => {
      isDragging = false;
    }, { passive: true });

    stationSelect.addEventListener('change', (e) => {
      const station = e.target.value;
      showStation(station);
      if (station) clearStationQuery();
    });

    window.addEventListener('resize', () => {
      if (viewer.style.display === 'none' || !image.src) return;
      updateBaseScale();
      applyZoom(zoom);
    }, { passive: true });

    const params = new URLSearchParams(window.location.search);
    const initialStation = params.get('station') || params.get('istasyon') || '';
    if (initialStation && stationImages[initialStation]) {
      stationSelect.value = initialStation;
      showStation(initialStation);
    }
  }

export function initIstasyonSemasi(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
