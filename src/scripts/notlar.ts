// Notlar sayfası istemcisi. notlar.astro tarafından bundled <script> ile çağrılır.
// Modern zengin editörü (note-editor.ts) kullanır.

import { createNoteEditor, type NoteEditorHandle, type UploadedMedia } from './note-editor';
import { sanitizeHtml } from '../lib/sanitize';

interface NoteRecord {
  id: string;
  baslik: string;
  icerik: string;
  kategori: string | null;
  istasyon: string | null;
  hedef_roller: string | null;
  medya: string | UploadedMedia[] | null;
  created_at: string;
  updated_at: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const DRAFT_KEY = 'railctrl.note.draft';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMedia(raw: NoteRecord['medya']): UploadedMedia[] {
  if (Array.isArray(raw)) return raw as UploadedMedia[];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UploadedMedia[]) : [];
  } catch {
    return [];
  }
}

function toPlainText(html: string): string {
  // Önizleme metni sanitize edilmeden DOM'a yazılmamalı: `img onerror`
  // gibi öznitelikler ayrık düğümde bile tetiklenir.
  const div = document.createElement('div');
  div.innerHTML = sanitizeHtml(html || '');
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string, long = false): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', long
    ? { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }
    : { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
}

function getKategoriClass(kategori: string): string {
  switch ((kategori || '').toLowerCase()) {
    case 'prosedür': return 'kategori-prosedur';
    case 'şifre': return 'kategori-sifre';
    case 'adres': return 'kategori-adres';
    case 'vardiya': return 'kategori-vardiya';
    case 'özel': return 'kategori-ozel';
    default: return 'kategori-genel';
  }
}

function getKategoriIcon(kategori: string): string {
  switch ((kategori || '').toLowerCase()) {
    case 'prosedür': return '📋';
    case 'şifre': return '🔐';
    case 'adres': return '📍';
    case 'vardiya': return '⏰';
    case 'özel': return '🔒';
    default: return '📌';
  }
}

export function initNotlar(): void {
  const searchInput = el<HTMLInputElement>('searchInput');
  const searchClear = el<HTMLElement>('searchClear');
  const stationFilter = el<HTMLInputElement>('stationFilter');
  const chips = document.querySelectorAll<HTMLButtonElement>('.chip');
  const tableBody = el<HTMLTableSectionElement>('tableBody');
  const noResults = el<HTMLElement>('noResults');
  const paginationContainer = el<HTMLElement>('paginationContainer');
  const totalCount = el<HTMLElement>('totalCount');
  const newNoteBtn = el<HTMLButtonElement>('newNoteBtn');
  const modal = el<HTMLElement>('noteModal');
  const modalTitle = el<HTMLElement>('modalTitle');
  const closeModal = el<HTMLButtonElement>('closeModal');
  const cancelBtn = el<HTMLButtonElement>('cancelBtn');
  const noteForm = el<HTMLFormElement>('noteForm');
  const richEditor = el<HTMLDivElement>('richEditor');
  const editorToolbar = el<HTMLElement>('editorToolbar');
  const editorStatus = el<HTMLElement>('editorStatus');
  const editorDropzone = el<HTMLElement>('editorDropzone');
  const formMessage = el<HTMLElement>('formMessage');
  const viewModal = el<HTMLElement>('viewModal');
  const closeViewModal = el<HTMLButtonElement>('closeViewModal');
  const viewTitle = el<HTMLElement>('viewTitle');
  const viewKategori = el<HTMLElement>('viewKategori');
  const viewTarih = el<HTMLElement>('viewTarih');
  const viewMedia = el<HTMLElement>('viewMedia');
  const viewContent = el<HTMLElement>('viewContent');
  const viewAttachments = el<HTMLElement>('viewAttachments');
  const viewActions = el<HTMLElement>('viewActions');
  const editNoteBtn = el<HTMLButtonElement>('editNoteBtn');
  const deleteNoteBtn = el<HTMLButtonElement>('deleteNoteBtn');
  const deleteFromFormBtn = el<HTMLButtonElement>('deleteFromFormBtn');
  const noteIdInput = el<HTMLInputElement>('noteId');

  if (!tableBody || !noteForm || !richEditor || !editorToolbar) return;

  const allModals = [modal, viewModal].filter(Boolean) as HTMLElement[];
  allModals.forEach((m) => {
    if (m.parentElement !== document.body) document.body.appendChild(m);
  });

  const syncBodyScroll = () => {
    const open = allModals.some((m) => m.style.display === 'flex');
    document.body.style.overflow = open ? 'hidden' : '';
  };
  const showModal = (m?: HTMLElement | null) => { if (m) { m.style.display = 'flex'; syncBodyScroll(); } };
  const hideModal = (m?: HTMLElement | null) => { if (m) { m.style.display = 'none'; syncBodyScroll(); } };

  const showMessage = (text: string, kind: 'success' | 'error') => {
    if (!formMessage) return;
    formMessage.className = `form-message ${kind}`;
    formMessage.textContent = text;
    formMessage.style.display = 'block';
  };
  const hideMessage = () => { if (formMessage) formMessage.style.display = 'none'; };

  // ------------------------------------------------------------- Durum

  let currentKategori = '';
  let currentIstasyon = '';
  let allNotes: NoteRecord[] = [];
  let currentPage = 1;
  let totalPages = 1;
  const limit = 30;
  let currentUserRole = 'personel';
  let currentViewNote: NoteRecord | null = null;
  let editingId: string | null = null;
  let attachedMedia: UploadedMedia[] = [];
  let searchTimer: number | undefined;

  const pageParams = new URLSearchParams(window.location.search);
  // Not kimlikleri UUID'dir; parseInt ile sayıya çevrilemez.
  const autoEditId = pageParams.get('editId') || '';
  const autoViewId = pageParams.get('viewId') || '';

  const clearAutoQueryParams = () => {
    const next = new URLSearchParams(window.location.search);
    next.delete('editId');
    next.delete('viewId');
    const query = next.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`);
  };

  // ------------------------------------------------------- Medya yönetimi

  const uploadFiles = async (files: File[]): Promise<UploadedMedia[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await fetch('/api/notlar/upload', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Dosya yüklenemedi');

    const uploaded = (data.files || []) as UploadedMedia[];
    addMediaToList(uploaded);
    return uploaded;
  };

  const deleteMediaPaths = async (paths: string[]): Promise<void> => {
    if (!paths.length) return;
    await fetch('/api/notlar/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
  };

  const addMediaToList = (items: UploadedMedia[]) => {
    const byPath = new Map(attachedMedia.map((m) => [m.path, m]));
    items.forEach((item) => { if (item?.path && !byPath.has(item.path)) byPath.set(item.path, item); });
    attachedMedia = Array.from(byPath.values());
    renderMediaList();
  };

  const renderMediaList = () => {
    const mediaList = el<HTMLElement>('mediaList');
    if (!mediaList) return;
    mediaList.innerHTML = '';

    if (attachedMedia.length === 0) {
      const empty = document.createElement('small');
      empty.textContent = 'Henüz dosya eklenmedi.';
      mediaList.appendChild(empty);
      return;
    }

    attachedMedia.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'media-item';

      const thumb = document.createElement('span');
      thumb.className = 'media-thumb';
      thumb.textContent = item.type === 'image' ? '🖼️' : item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '📄';

      const name = document.createElement('span');
      name.className = 'media-name';
      name.textContent = item.name || 'Dosya';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'media-remove';
      remove.textContent = 'Kaldır';
      remove.addEventListener('click', async () => {
        const removed = attachedMedia[index];
        attachedMedia.splice(index, 1);
        renderMediaList();
        if (removed?.path) await deleteMediaPaths([removed.path]);
      });

      row.append(thumb, name, remove);
      mediaList.appendChild(row);
    });
  };

  // ------------------------------------------------------- Zengin editör

  const editor: NoteEditorHandle = createNoteEditor({
    editor: richEditor,
    toolbar: editorToolbar,
    statusbar: editorStatus,
    dropzone: editorDropzone,
    placeholder: 'Not içeriği… Resimleri buraya sürükleyip bırakabilirsiniz.',
    draftKey: DRAFT_KEY,
    onChange: (html) => {
      const textarea = el<HTMLTextAreaElement>('icerik');
      if (textarea) textarea.value = html;
    },
    onUpload: uploadFiles,
    onDeleteMedia: deleteMediaPaths,
    onBusyChange: (busy) => {
      richEditor.classList.toggle('is-uploading', busy);
    },
  });

  // Gizli textarea'yı senkron tut (form gönderimi için)
  const syncTextarea = () => {
    const textarea = el<HTMLTextAreaElement>('icerik');
    if (textarea) textarea.value = editor.getHTML();
  };

  // ---------------------------------------------------------- Listeleme

  const loadNotes = async () => {
    tableBody.innerHTML = `
      <tr class="loading-row">
        <td colspan="6">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <span>Yükleniyor...</span>
          </div>
        </td>
      </tr>
    `;
    if (noResults) noResults.style.display = 'none';

    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(limit));
      if (searchInput?.value) params.set('search', searchInput.value);
      if (currentKategori) params.set('kategori', currentKategori);
      if (currentIstasyon) params.set('istasyon', currentIstasyon);

      const response = await fetch(`/api/notlar?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Notlar alınamadı');

      tableBody.innerHTML = '';
      allNotes = (data.notes || []) as NoteRecord[];
      const pagination = (data.pagination || {}) as Partial<PaginationInfo>;
      if (totalCount) totalCount.textContent = String(pagination.totalCount ?? allNotes.length);

      if (allNotes.length === 0) {
        if (noResults) noResults.style.display = 'block';
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
      }

      totalPages = Math.max(1, Number(pagination.totalPages) || 1);
      if (currentPage > totalPages) currentPage = totalPages;
      renderRows(allNotes);
      renderPagination();
    } catch (error) {
      console.error('Load error:', error);
      tableBody.innerHTML = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.style.cssText = 'text-align:center;padding:2rem;color:#dc2626;';
      cell.textContent = `Hata: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`;
      row.appendChild(cell);
      tableBody.appendChild(row);
    }
  };

  const renderRows = (notes: NoteRecord[]) => {
    tableBody.innerHTML = '';
    notes.forEach((note) => {
      const row = document.createElement('tr');

      const kategori = note.kategori || 'Genel';
      const plain = toPlainText(note.icerik || '');
      const preview = plain.length > 100 ? `${plain.slice(0, 100)}…` : plain;

      // Hücreler textContent ile doldurulur; innerHtml ile XSS riski yoktur.
      const cells: Array<[string, string, string]> = [
        ['baslik-cell', 'Başlık', note.baslik || 'İsimsiz Not'],
        ['', 'İstasyon', note.istasyon || 'Genel'],
        ['preview-cell', 'İçerik Önizleme', preview],
      ];

      const titleCell = document.createElement('td');
      titleCell.className = 'baslik-cell';
      titleCell.dataset.label = 'Başlık';
      titleCell.textContent = note.baslik || 'İsimsiz Not';
      row.appendChild(titleCell);

      const kategoriCell = document.createElement('td');
      kategoriCell.dataset.label = 'Kategori';
      const badge = document.createElement('span');
      badge.className = `kategori-badge ${getKategoriClass(kategori)}`;
      badge.textContent = `${getKategoriIcon(kategori)} ${kategori}`;
      kategoriCell.appendChild(badge);
      row.appendChild(kategoriCell);

      const stationCell = document.createElement('td');
      stationCell.dataset.label = 'İstasyon';
      stationCell.textContent = note.istasyon || 'Genel';
      row.appendChild(stationCell);

      const previewCell = document.createElement('td');
      previewCell.className = 'preview-cell';
      previewCell.dataset.label = 'İçerik Önizleme';
      previewCell.textContent = preview;
      row.appendChild(previewCell);

      const dateCell = document.createElement('td');
      dateCell.dataset.label = 'Tarih';
      const dateSpan = document.createElement('span');
      dateSpan.className = 'date-cell';
      dateSpan.textContent = formatDate(note.created_at);
      dateCell.appendChild(dateSpan);
      row.appendChild(dateCell);

      const actionCell = document.createElement('td');
      actionCell.dataset.label = 'İşlem';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn-view';
      viewBtn.textContent = 'Görüntüle';
      viewBtn.addEventListener('click', () => openViewModal(note));
      actionCell.appendChild(viewBtn);
      row.appendChild(actionCell);

      tableBody.appendChild(row);
    });
  };

  const renderPagination = () => {
    if (!paginationContainer) return;
    paginationContainer.innerHTML = '';
    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }
    paginationContainer.style.display = 'flex';

    const makeBtn = (label: string, page: number, disabled = false, active = false) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-btn${active ? ' active' : ''}`;
      btn.textContent = label;
      btn.disabled = disabled;
      btn.addEventListener('click', () => changePage(page));
      paginationContainer.appendChild(btn);
    };

    makeBtn('‹', currentPage - 1, currentPage <= 1);
    const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const endPage = Math.min(totalPages, startPage + 4);
    for (let page = startPage; page <= endPage; page += 1) {
      makeBtn(String(page), page, false, page === currentPage);
    }
    makeBtn('›', currentPage + 1, currentPage >= totalPages);
  };

  const changePage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    currentPage = page;
    void loadNotes();
  };

  // ------------------------------------------------------------- Görüntüle

  const openViewModal = (note: NoteRecord) => {
    currentViewNote = note;
    if (viewTitle) viewTitle.textContent = note.baslik || 'İsimsiz Not';

    const kategori = note.kategori || 'Genel';
    if (viewKategori) {
      viewKategori.className = `kategori-badge ${getKategoriClass(kategori)}`;
      viewKategori.textContent = `${getKategoriIcon(kategori)} ${kategori}`;
    }
    if (viewTarih) viewTarih.textContent = formatDate(note.created_at, true);

    const medya = parseMedia(note.medya);
    const contentHtml = sanitizeHtml(note.icerik || '');

    // İçerikte referans verilen yolları topla
    const contentPaths = new Set<string>();
    for (const match of contentHtml.matchAll(/(?:src|href)=["']((?:\/files\/|\/api\/media\/)[^"']+)["']/gi)) {
      if (match[1]) contentPaths.add(match[1]);
    }

    if (viewMedia) {
      viewMedia.innerHTML = '';
      medya.forEach((item) => {
        if (!item?.path) return;
        if (item.type === 'image') {
          const img = document.createElement('img');
          img.src = item.path;
          img.alt = item.name || 'resim';
          img.loading = 'lazy';
          viewMedia.appendChild(img);
        } else if (item.type === 'video') {
          const video = document.createElement('video');
          video.src = item.path;
          video.controls = true;
          video.preload = 'metadata';
          viewMedia.appendChild(video);
        }
      });
    }

    if (viewAttachments) {
      viewAttachments.innerHTML = '';
      const items: Array<{ path: string; name: string }> = medya
        .filter((m): m is UploadedMedia => !!m?.path)
        .map((m) => ({ path: m.path, name: m.name || 'Dosya' }));

      contentPaths.forEach((path) => {
        if (!items.some((i) => i.path === path)) {
          items.push({ path, name: decodeURIComponent(path.split('/').pop() || 'Dosya') });
        }
      });

      if (items.length > 0) {
        viewAttachments.style.display = 'grid';
        const title = document.createElement('div');
        title.className = 'view-attachments-title';
        title.textContent = 'Ek Dosyalar';
        viewAttachments.appendChild(title);

        items.forEach((item) => {
          const link = document.createElement('a');
          link.className = 'attachment-btn';
          link.href = item.path;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';

          const iconSpan = document.createElement('span');
          iconSpan.textContent = '📄';
          const nameSpan = document.createElement('span');
          nameSpan.className = 'name';
          nameSpan.textContent = item.name;
          link.append(iconSpan, nameSpan);
          viewAttachments.appendChild(link);
        });
      } else {
        viewAttachments.style.display = 'none';
      }
    }

    if (viewContent) {
      viewContent.innerHTML = contentHtml;
      // Medya öğelerini sığdır
      viewContent.querySelectorAll<HTMLElement>('img,video,iframe').forEach((node) => {
        node.style.width = '100%';
        node.style.maxWidth = '100%';
        node.style.height = 'auto';
        node.style.maxHeight = window.innerWidth <= 768 ? '42vh' : '520px';
        node.style.objectFit = 'contain';
        node.style.display = 'block';
        node.style.margin = '0.35rem auto';
        node.style.boxSizing = 'border-box';
      });
    }

    if (viewActions) {
      viewActions.style.display = currentUserRole === 'yonetici' ? 'flex' : 'none';
    }

    showModal(viewModal);
  };

  // --------------------------------------------------------------- Düzenle

  const openEditModal = (note: NoteRecord) => {
    editingId = note.id;
    if (modalTitle) modalTitle.textContent = 'Notu Düzenle';
    if (noteIdInput) noteIdInput.value = note.id;

    const baslikInput = el<HTMLInputElement>('baslik');
    const kategoriSelect = el<HTMLSelectElement>('kategori');
    const istasyonInput = el<HTMLInputElement>('noteIstasyon');

    if (baslikInput) baslikInput.value = note.baslik || '';
    if (kategoriSelect) {
      const value = note.kategori || 'Genel';
      const hasOption = Array.from(kategoriSelect.options).some((o) => o.value === value);
      if (!hasOption) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        kategoriSelect.appendChild(opt);
      }
      kategoriSelect.value = value;
    }
    if (istasyonInput) istasyonInput.value = note.istasyon || '';

    editor.setHTML(note.icerik || '');
    attachedMedia = parseMedia(note.medya);
    renderMediaList();

    if (deleteFromFormBtn) {
      deleteFromFormBtn.style.display = currentUserRole === 'yonetici' ? 'block' : 'none';
    }

    hideMessage();
    showModal(modal);
  };

  const openNewNoteModal = () => {
    editingId = null;
    if (modalTitle) modalTitle.textContent = 'Yeni Not';
    noteForm.reset();
    editor.clear();
    if (noteIdInput) noteIdInput.value = '';
    attachedMedia = [];
    renderMediaList();
    if (deleteFromFormBtn) deleteFromFormBtn.style.display = 'none';
    hideMessage();
    showModal(modal);
  };

  // ----------------------------------------------------------------- Sil

  const deleteNote = async (noteId: string) => {
    if (!confirm('Bu notu silmek istediğinizden emin misiniz?')) return;
    try {
      const response = await fetch(`/api/notlar/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Silinemedi');

      hideModal(viewModal);
      hideModal(modal);
      await loadNotes();
    } catch (error) {
      alert(`Silme hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  };

  // ------------------------------------------------------------- Otomatik

  const tryOpenFromQuery = async (id: string, mode: 'view' | 'edit') => {
    if (!id) return;
    clearAutoQueryParams();
    try {
      const response = await fetch(`/api/notlar/${encodeURIComponent(id)}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.record) throw new Error(data?.error || 'Not bulunamadı');
      if (mode === 'edit') openEditModal(data.record);
      else openViewModal(data.record);
    } catch (error) {
      alert(`${mode === 'edit' ? 'Düzenleme' : 'Görüntüleme'} penceresi açılamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  };

  // -------------------------------------------------------------- Roller

  const getUserRole = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUserRole = data.user?.role || 'personel';
      }
    } catch {
      currentUserRole = 'personel';
    }
  };

  // ------------------------------------------------------------- Olaylar

  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    if (searchClear) searchClear.style.display = searchInput.value ? 'flex' : 'none';
    searchTimer = window.setTimeout(() => {
      currentPage = 1;
      void loadNotes();
    }, 300);
  });

  searchClear?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    searchClear.style.display = 'none';
    currentPage = 1;
    void loadNotes();
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentKategori = chip.dataset.kategori || '';
      currentPage = 1;
      void loadNotes();
    });
  });

  stationFilter?.addEventListener('input', () => {
    currentIstasyon = stationFilter.value || '';
    currentPage = 1;
    void loadNotes();
  });

  newNoteBtn?.addEventListener('click', openNewNoteModal);
  closeModal?.addEventListener('click', () => hideModal(modal));
  cancelBtn?.addEventListener('click', () => hideModal(modal));
  modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(modal); });

  closeViewModal?.addEventListener('click', () => hideModal(viewModal));
  viewModal?.addEventListener('click', (e) => { if (e.target === viewModal) hideModal(viewModal); });

  editNoteBtn?.addEventListener('click', () => {
    if (currentViewNote) {
      hideModal(viewModal);
      openEditModal(currentViewNote);
    }
  });

  deleteNoteBtn?.addEventListener('click', () => {
    if (currentViewNote) void deleteNote(currentViewNote.id);
  });

  deleteFromFormBtn?.addEventListener('click', () => {
    if (editingId) void deleteNote(editingId);
  });

  noteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncTextarea();

    const htmlContent = editor.getHTML().trim();
    const baslik = (el<HTMLInputElement>('baslik')?.value || '').trim();

    if (!baslik) {
      showMessage('Başlık zorunludur.', 'error');
      return;
    }
    if (!htmlContent && attachedMedia.length === 0) {
      showMessage('Açıklama veya en az bir dosya ekleyin.', 'error');
      return;
    }

    const payload: Record<string, unknown> = {
      baslik,
      kategori: el<HTMLSelectElement>('kategori')?.value || 'Genel',
      istasyon: el<HTMLInputElement>('noteIstasyon')?.value || null,
      icerik: htmlContent,
      medya: attachedMedia,
    };

    try {
      const url = editingId ? `/api/notlar/${encodeURIComponent(editingId)}` : '/api/notlar';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Kaydedilemedi');

      showMessage(editingId ? 'Not güncellendi!' : 'Not kaydedildi!', 'success');
      editor.clear();

      window.setTimeout(() => {
        hideModal(modal);
        void loadNotes();
      }, 700);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Kaydedilemedi', 'error');
    }
  });

  // ESC ile modal kapat
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (viewModal?.style.display === 'flex') hideModal(viewModal);
    else if (modal?.style.display === 'flex') hideModal(modal);
  });

  // ------------------------------------------------------------- Başlat

  void getUserRole();
  renderMediaList();
  void loadNotes();
  if (autoViewId) void tryOpenFromQuery(autoViewId, 'view');
  if (autoEditId) void tryOpenFromQuery(autoEditId, 'edit');
}