// PDF görüntüleyici modalı: data-pdf-viewer özniteliği taşıyan bağlantıları yakalar,
// modalda gösterir. sef-islemleri ve personel-islemleri tarafından kullanılır.

export function normalizePdfUrl(pdfUrl: string): string {
  try {
    return encodeURI(pdfUrl).replace(/#/g, '%23');
  } catch {
    return pdfUrl;
  }
}

export function initPdfViewer(): void {
  const modal = document.getElementById('pdfViewerModal');
  const closeBtn = document.getElementById('closePdfViewerBtn');
  const frame = document.getElementById('pdfViewerFrame') as HTMLIFrameElement | null;
  const titleEl = document.getElementById('pdfViewerTitle');
  const openInNewTabBtn = document.getElementById('openPdfInNewTabBtn') as HTMLAnchorElement | null;
  const downloadBtn = document.getElementById('downloadPdfBtn') as HTMLAnchorElement | null;

  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  function closePdfViewer(): void {
    if (!modal || !frame) return;
    modal.style.display = 'none';
    frame.removeAttribute('src');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const card = target.closest?.('.js-pdf-card') as HTMLElement | null;
    if (!card) {
      if (target === modal) closePdfViewer();
      return;
    }
    const url = card.getAttribute('data-pdf') || (card as HTMLAnchorElement).href;
    const title = card.getAttribute('data-title') || 'PDF Görüntüleyici';
    if (!url || !modal || !frame) return;
    event.preventDefault();
    if (titleEl) titleEl.textContent = title;
    frame.src = normalizePdfUrl(url);
    if (openInNewTabBtn) openInNewTabBtn.href = url;
    if (downloadBtn) downloadBtn.href = url;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  });

  closeBtn?.addEventListener('click', closePdfViewer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePdfViewer();
  });
}
