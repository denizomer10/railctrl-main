// notlar istemcisi. notlar.astro tarafından bundled <script> ile çağrılır.

    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchClear = document.getElementById('searchClear');
    const stationFilter = document.getElementById('stationFilter') as HTMLSelectElement;
    const chips = document.querySelectorAll('.chip');
    const tableBody = document.getElementById('tableBody');
    const noResults = document.getElementById('noResults');
    const paginationContainer = document.getElementById('paginationContainer');
    const totalCount = document.getElementById('totalCount');
    const newNoteBtn = document.getElementById('newNoteBtn');
    const modal = document.getElementById('noteModal');
    const modalTitle = document.getElementById('modalTitle');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const noteForm = document.getElementById('noteForm') as HTMLFormElement;
    const richEditor = document.getElementById('richEditor') as HTMLDivElement;
    const mediaFilesInput = document.getElementById('mediaFiles') as HTMLInputElement;
    const mediaList = document.getElementById('mediaList');
    const editorTools = document.getElementById('editorTools');
    const textColorPicker = document.getElementById('textColorPicker') as HTMLInputElement;
    const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement;
    const formMessage = document.getElementById('formMessage');
    const viewModal = document.getElementById('viewModal');
    const closeViewModal = document.getElementById('closeViewModal');
    const viewTitle = document.getElementById('viewTitle');
    const viewKategori = document.getElementById('viewKategori');
    const viewTarih = document.getElementById('viewTarih');
    const viewMedia = document.getElementById('viewMedia');
    const viewContent = document.getElementById('viewContent');
    const viewAttachments = document.getElementById('viewAttachments');
    const viewActions = document.getElementById('viewActions');
    const editNoteBtn = document.getElementById('editNoteBtn');
    const deleteNoteBtn = document.getElementById('deleteNoteBtn');
    const deleteFromFormBtn = document.getElementById('deleteFromFormBtn');
    const noteIdInput = document.getElementById('noteId') as HTMLInputElement;
    const allModals: HTMLElement[] = [modal, viewModal].filter(Boolean) as HTMLElement[];

    allModals.forEach((m) => {
      if (m.parentElement !== document.body) document.body.appendChild(m);
    });

    const syncBodyScroll = () => {
      const isAnyModalOpen = allModals.some((m) => m.style.display === 'flex');
      document.body.style.overflow = isAnyModalOpen ? 'hidden' : '';
    };

    const showModal = (m?: HTMLElement | null) => {
      if (!m) return;
      m.style.display = 'flex';
      syncBodyScroll();
    };

    const hideModal = (m?: HTMLElement | null) => {
      if (!m) return;
      m.style.display = 'none';
      syncBodyScroll();
    };

    let currentKategori = '';
    let currentIstasyon = '';
    let allNotes: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    const limit = 30;
    let currentUserRole = 'user';
    let currentViewNote: any = null;
    let editingId: number | null = null;
    let attachedMedia: any[] = [];
    let selectedEditorImage: HTMLImageElement | null = null;
    const pageParams = new URLSearchParams(window.location.search);
    const autoEditId = Number.parseInt(pageParams.get('editId') || '', 10);
    const autoViewId = Number.parseInt(pageParams.get('viewId') || '', 10);

    const clearAutoQueryParams = () => {
      const next = new URLSearchParams(window.location.search);
      next.delete('editId');
      next.delete('viewId');
      const query = next.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
    };

    function toPlainText(html: string): string {
      const div = document.createElement('div');
      div.innerHTML = html || '';
      return (div.textContent || '').trim();
    }

    function sanitizeHtml(raw: string): string {
      const template = document.createElement('template');
      template.innerHTML = raw || '';
      const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN']);
      const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
      const toRemove: Element[] = [];
      while (walker.nextNode()) {
        const el = walker.currentNode as Element;
        if (!allowed.has(el.tagName)) {
          toRemove.push(el);
          continue;
        }
        [...el.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) el.removeAttribute(attr.name);
          if (el.tagName === 'A' && name === 'href') {
            const href = (el.getAttribute('href') || '').trim().toLowerCase();
            const safe = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('/');
            if (!safe) el.removeAttribute('href');
            return;
          }
          if (name !== 'style' && !(el.tagName === 'A' && name === 'target') && !(el.tagName === 'A' && name === 'rel')) {
            el.removeAttribute(attr.name);
          }
        });
      }
      toRemove.forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
      return template.innerHTML;
    }

    function syncEditorToTextarea() {
      const textarea = document.getElementById('icerik') as HTMLTextAreaElement;
      textarea.value = sanitizeHtml(richEditor?.innerHTML || '');
    }

    function applyEditorThemeDefaults() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (textColorPicker) textColorPicker.value = isDark ? '#e5e7eb' : '#111827';
      if (bgColorPicker && !bgColorPicker.value) bgColorPicker.value = '#fff59d';
      if (richEditor && !richEditor.innerHTML.trim()) {
        richEditor.style.color = isDark ? '#e5e7eb' : '#111827';
      }
    }

    function addMediaToList(items: any[]) {
      const byPath = new Map(attachedMedia.map((m: any) => [m.path, m]));
      items.forEach((item) => {
        if (item?.path && !byPath.has(item.path)) byPath.set(item.path, item);
      });
      attachedMedia = Array.from(byPath.values());
      renderMediaList();
    }

    function insertMediaIntoEditor(items: any[]) {
      items.forEach((item) => {
        if (!item?.path) return;
        if (item.type === 'image') {
          const img = document.createElement('img');
          img.src = item.path;
          img.alt = item.name || 'gorsel';
          img.style.width = '420px';
          richEditor.appendChild(img);
          richEditor.appendChild(document.createElement('br'));
          return;
        }
        const link = document.createElement('a');
        link.href = item.path;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.name || 'Dosya';
        richEditor.appendChild(link);
        richEditor.appendChild(document.createElement('br'));
      });
      syncEditorToTextarea();
    }

    // Kullanıcı rolünü al
    async function getUserRole() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          currentUserRole = data.user?.role || 'user';
        }
      } catch (e) { currentUserRole = 'user'; }
    }
    getUserRole();
    applyEditorThemeDefaults();

    async function loadNotes() {
      tableBody!.innerHTML = `
        <tr class="loading-row">
          <td colspan="6">
            <div class="loading-state">
              <div class="loading-spinner"></div>
              <span>Yükleniyor...</span>
            </div>
          </td>
        </tr>
      `;
      noResults!.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (searchInput?.value) params.set('search', searchInput.value);
        if (currentKategori) params.set('kategori', currentKategori);
        if (currentIstasyon) params.set('istasyon', currentIstasyon);

        const response = await fetch(`/api/notlar?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        tableBody!.innerHTML = '';
        allNotes = data.notes || [];

        totalCount!.textContent = allNotes.length.toString();

        if (allNotes.length === 0) {
          noResults!.style.display = 'block';
          if (paginationContainer) paginationContainer.style.display = 'none';
          return;
        }

        totalPages = Math.max(1, Math.ceil(allNotes.length / limit));
        if (currentPage > totalPages) currentPage = totalPages;
        renderRows(allNotes);
        renderPagination();

      } catch (error: any) {
        console.error('Load error:', error);
        tableBody!.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 2rem; color: #dc2626;">
              Hata: ${error.message}
            </td>
          </tr>
        `;
      }
    }

    function getKategoriClass(kategori: string): string {
      switch (kategori?.toLowerCase()) {
        case 'prosedür': return 'kategori-prosedur';
        case 'şifre': return 'kategori-sifre';
        case 'adres': return 'kategori-adres';
        case 'vardiya': return 'kategori-vardiya';
        case 'özel': return 'kategori-ozel';
        default: return 'kategori-genel';
      }
    }

    function getKategoriIcon(kategori: string): string {
      switch (kategori?.toLowerCase()) {
        case 'prosedür': return '📋';
        case 'şifre': return '🔐';
        case 'adres': return '📍';
        case 'vardiya': return '⏰';
        case 'özel': return '🔒';
        default: return '📌';
      }
    }

    function renderRows(notes: any[]) {
      tableBody!.innerHTML = '';
      const start = (currentPage - 1) * limit;
      const pageNotes = notes.slice(start, start + limit);
      pageNotes.forEach(note => {
        const row = document.createElement('tr');
        
        const tarih = note.created_at ? new Date(note.created_at).toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Europe/Istanbul'
        }) : '-';
        
        const kategori = note.kategori || 'Genel';
        const plain = toPlainText(note.icerik || '');
        const preview = plain.substring(0, 100) + (plain.length > 100 ? '...' : '');
        
        row.innerHTML = `
          <td class="baslik-cell" data-label="Başlık">${note.baslik || 'İsimsiz Not'}</td>
          <td data-label="Kategori"><span class="kategori-badge ${getKategoriClass(kategori)}">${getKategoriIcon(kategori)} ${kategori}</span></td>
            <td data-label="İstasyon">${note.istasyon || 'Genel'}</td>
            <td class="preview-cell" data-label="İçerik Önizleme">${preview}</td>
            <td data-label="Tarih"><span class="date-cell">${tarih}</span></td>
            <td data-label="İşlem"><button class="btn-view" data-id="${note.id}">Görüntüle</button></td>
        `;
        
        const viewBtn = row.querySelector('.btn-view');
        viewBtn?.addEventListener('click', () => openViewModal(note));
        
        tableBody!.appendChild(row);
      });
    }

    function renderPagination() {
      if (!paginationContainer) return;
      paginationContainer.innerHTML = '';
      if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
      }
      paginationContainer.style.display = 'flex';
      for (let page = 1; page <= totalPages; page++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `page-btn${page === currentPage ? ' active' : ''}`;
        btn.textContent = String(page);
        btn.addEventListener('click', () => {
          if (page === currentPage) return;
          currentPage = page;
          renderRows(allNotes);
          renderPagination();
        });
        paginationContainer.appendChild(btn);
      }
    }

    function openViewModal(note: any) {
      currentViewNote = note;
      viewTitle!.textContent = note.baslik || 'İsimsiz Not';
      const kategori = note.kategori || 'Genel';
      viewKategori!.className = `kategori-badge ${getKategoriClass(kategori)}`;
      viewKategori!.textContent = `${getKategoriIcon(kategori)} ${kategori}`;
      
      const tarih = note.created_at ? new Date(note.created_at).toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Istanbul'
      }) : '-';
      viewTarih!.textContent = tarih;
      
      const medya = Array.isArray(note.medya) ? note.medya : (() => {
        try { return JSON.parse(note.medya || '[]'); } catch { return []; }
      })();
      const contentHtml = sanitizeHtml(note.icerik || '');
      const contentReferencedPaths = new Set<string>();
      const refMatches = contentHtml.matchAll(/(?:src|href)=["'](\/files\/[^"']+)["']/gi);
      for (const match of refMatches) {
        if (match[1]) contentReferencedPaths.add(match[1]);
      }
      viewMedia!.innerHTML = '';
      viewAttachments!.innerHTML = '';
      const attachmentItems: any[] = [];
      medya.forEach((item: any) => {
        if (!item?.path) return;
        if (item.type === 'image') {
          const img = document.createElement('img');
          img.src = item.path;
          img.alt = item.name || 'resim';
          viewMedia!.appendChild(img);
        } else if (item.type === 'video') {
          const video = document.createElement('video');
          video.src = item.path;
          video.controls = true;
          viewMedia!.appendChild(video);
        }
        attachmentItems.push(item);
      });

      contentReferencedPaths.forEach((path) => {
        if (!attachmentItems.some((i: any) => i.path === path)) {
          attachmentItems.push({ path, name: path.split('/').pop() || 'Dosya' });
        }
      });

      if (attachmentItems.length > 0) {
        viewAttachments!.style.display = 'grid';
        const title = document.createElement('div');
        title.className = 'view-attachments-title';
        title.textContent = 'Ek Dosyalar';
        viewAttachments!.appendChild(title);

        attachmentItems.forEach((item: any) => {
          const link = document.createElement('a');
          link.className = 'attachment-btn';
          link.href = item.path;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.innerHTML = `<span>📄</span><span class="name">${item.name || 'Dosya'}</span>`;
          viewAttachments!.appendChild(link);
        });
      } else {
        viewAttachments!.style.display = 'none';
      }

      viewContent!.innerHTML = contentHtml;

      const fitEls = [...viewMedia!.querySelectorAll('img,video,iframe'), ...viewContent!.querySelectorAll('img,video,iframe')];
      fitEls.forEach((el) => {
        const node = el as HTMLElement;
        node.style.width = '100%';
        node.style.maxWidth = '100%';
        node.style.height = 'auto';
        node.style.maxHeight = window.innerWidth <= 768 ? '42vh' : '520px';
        node.style.objectFit = 'contain';
        node.style.display = 'block';
        node.style.margin = '0.35rem auto';
        node.style.boxSizing = 'border-box';
      });
      
      // Şef veya admin ise düzenleme/silme butonlarını göster
      const canEdit = currentUserRole === 'sef' || currentUserRole === 'admin';
      viewActions!.style.display = canEdit ? 'flex' : 'none';
      
      showModal(viewModal as HTMLElement);
    }

    // Düzenleme modalını aç
    function openEditModal(note: any) {
      editingId = note.id;
      modalTitle!.textContent = 'Notu Düzenle';
      noteIdInput.value = note.id;
      (document.getElementById('baslik') as HTMLInputElement).value = note.baslik || '';
      (document.getElementById('kategori') as HTMLSelectElement).value = note.kategori || 'Genel';
      (document.getElementById('noteIstasyon') as HTMLSelectElement).value = note.istasyon || '';
      richEditor.innerHTML = sanitizeHtml(note.icerik || '');
      syncEditorToTextarea();
      attachedMedia = Array.isArray(note.medya) ? note.medya : (() => {
        try { return JSON.parse(note.medya || '[]'); } catch { return []; }
      })();
      renderMediaList();
      
      // Şef veya admin ise silme butonunu göster
      const canDelete = currentUserRole === 'sef' || currentUserRole === 'admin';
      deleteFromFormBtn!.style.display = canDelete ? 'block' : 'none';
      
      formMessage!.style.display = 'none';
      showModal(modal as HTMLElement);
    }

    function renderMediaList() {
      if (!mediaList) return;
      mediaList.innerHTML = '';
      if (attachedMedia.length === 0) {
        mediaList.innerHTML = '<small>Henüz dosya eklenmedi.</small>';
        return;
      }

      attachedMedia.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'media-item';
        row.innerHTML = `
          <span class="media-name">${item.name || 'Dosya'}</span>
          <button type="button" class="media-remove" data-index="${index}">Kaldır</button>
        `;
        row.querySelector('.media-remove')?.addEventListener('click', async () => {
          const removed = attachedMedia[index];
          attachedMedia.splice(index, 1);
          renderMediaList();
          if (removed?.path) {
            await deleteMediaPaths([removed.path]);
          }
        });
        mediaList.appendChild(row);
      });
    }

    async function deleteMediaPaths(paths: string[]) {
      if (!paths.length) return;
      await fetch('/api/notlar/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
    }

    function getEditorFilePaths(): Set<string> {
      const paths = new Set<string>();
      richEditor.querySelectorAll('img, a, video, audio').forEach((el) => {
        const anyEl = el as any;
        const srcOrHref = anyEl.currentSrc || anyEl.src || anyEl.href || '';
        const match = String(srcOrHref).match(/\/files\/([^?#]+)/);
        if (match?.[1]) paths.add(`/files/${decodeURIComponent(match[1])}`);
      });
      return paths;
    }

    async function reconcileEditorRemovedMedia() {
      const editorPaths = getEditorFilePaths();
      const removed = attachedMedia.filter((m: any) => m?.source === 'editor' && m?.path && !editorPaths.has(m.path));
      if (!removed.length) return;
      attachedMedia = attachedMedia.filter((m: any) => !removed.some((r: any) => r.path === m.path));
      renderMediaList();
      await deleteMediaPaths(removed.map((m: any) => m.path));
    }

    async function uploadMedia(files: FileList, source: 'editor' | 'list' = 'list') {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));

      const response = await fetch('/api/notlar/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Dosya yüklenemedi');
      const filesWithSource = (data.files || []).map((file: any) => ({ ...file, source }));
      addMediaToList(filesWithSource);
      return filesWithSource;
    }

    // Not silme fonksiyonu
    async function deleteNote(noteId: number) {
      if (!confirm('Bu notu silmek istediğinizden emin misiniz?')) return;
      
      try {
        const response = await fetch(`/api/notlar/${noteId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        hideModal(viewModal as HTMLElement);
        hideModal(modal as HTMLElement);
        loadNotes();
      } catch (error: any) {
        alert('Silme hatası: ' + error.message);
      }
    }

    async function tryOpenEditFromQuery() {
      if (!Number.isFinite(autoEditId)) return;
      clearAutoQueryParams();
      try {
        const response = await fetch(`/api/notlar/${autoEditId}`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data?.record) throw new Error(data?.error || 'Not bulunamadı');
        openEditModal(data.record);
      } catch (error: any) {
        alert(`Düzenleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
      }
    }

    async function tryOpenViewFromQuery() {
      if (!Number.isFinite(autoViewId)) return;
      clearAutoQueryParams();
      try {
        const response = await fetch(`/api/notlar/${autoViewId}`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data?.record) throw new Error(data?.error || 'Not bulunamadı');
        openViewModal(data.record);
      } catch (error: any) {
        alert(`Görüntüleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
      }
    }

    let searchTimeout: number;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const value = (e.target as HTMLInputElement).value;
      searchClear!.style.display = value ? 'flex' : 'none';
      
      searchTimeout = window.setTimeout(() => {
        currentPage = 1;
        loadNotes();
      }, 300);
    });

    searchClear?.addEventListener('click', () => {
      searchInput!.value = '';
      searchClear!.style.display = 'none';
      currentPage = 1;
      loadNotes();
    });

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentKategori = (chip as HTMLElement).dataset.kategori || '';
        currentPage = 1;
        loadNotes();
      });
    });

    stationFilter?.addEventListener('change', () => {
      currentIstasyon = stationFilter.value || '';
      currentPage = 1;
      loadNotes();
    });

    newNoteBtn?.addEventListener('click', () => {
      editingId = null;
      modalTitle!.textContent = 'Yeni Not';
      noteForm?.reset();
      richEditor.innerHTML = '';
      applyEditorThemeDefaults();
      syncEditorToTextarea();
      noteIdInput.value = '';
      attachedMedia = [];
      renderMediaList();
      deleteFromFormBtn!.style.display = 'none';
      showModal(modal as HTMLElement);
      formMessage!.style.display = 'none';
    });

    closeModal?.addEventListener('click', () => hideModal(modal as HTMLElement));
    cancelBtn?.addEventListener('click', () => hideModal(modal as HTMLElement));
    modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(modal as HTMLElement); });

    closeViewModal?.addEventListener('click', () => hideModal(viewModal as HTMLElement));
    viewModal?.addEventListener('click', (e) => { if (e.target === viewModal) hideModal(viewModal as HTMLElement); });

    // Detay modalından düzenlemeye geç
    editNoteBtn?.addEventListener('click', () => {
      if (currentViewNote) {
        hideModal(viewModal as HTMLElement);
        openEditModal(currentViewNote);
      }
    });

    // Detay modalından silme
    deleteNoteBtn?.addEventListener('click', () => {
      if (currentViewNote) {
        deleteNote(currentViewNote.id);
      }
    });

    // Form içinden silme
    deleteFromFormBtn?.addEventListener('click', () => {
      if (editingId) {
        deleteNote(editingId);
      }
    });

    noteForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      syncEditorToTextarea();
      const htmlContent = (document.getElementById('icerik') as HTMLTextAreaElement).value.trim();
      if (!htmlContent && attachedMedia.length === 0) {
        formMessage!.className = 'form-message error';
        formMessage!.textContent = 'Açıklama veya en az bir dosya ekleyin.';
        formMessage!.style.display = 'block';
        return;
      }
      const payload: Record<string, any> = {
        baslik: (document.getElementById('baslik') as HTMLInputElement).value,
        kategori: (document.getElementById('kategori') as HTMLSelectElement).value,
        istasyon: (document.getElementById('noteIstasyon') as HTMLSelectElement).value,
        icerik: (document.getElementById('icerik') as HTMLTextAreaElement).value,
        medya: attachedMedia,
      };
      if (payload.kategori === 'Özel') {
        payload.hedef_roller = ['sef', 'gar_mudur', 'admin'];
      }

      try {
        const url = editingId ? `/api/notlar/${editingId}` : '/api/notlar';
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        formMessage!.className = 'form-message success';
        formMessage!.textContent = editingId ? 'Not güncellendi!' : 'Not kaydedildi!';
        formMessage!.style.display = 'block';

        setTimeout(() => {
          hideModal(modal as HTMLElement);
          loadNotes();
        }, 1000);

      } catch (error: any) {
        formMessage!.className = 'form-message error';
        formMessage!.textContent = error.message;
        formMessage!.style.display = 'block';
      }
    });

    mediaFilesInput?.addEventListener('change', async () => {
      if (!mediaFilesInput.files || mediaFilesInput.files.length === 0) return;
      try {
        await uploadMedia(mediaFilesInput.files, 'list');
        mediaFilesInput.value = '';
      } catch (error: any) {
        formMessage!.className = 'form-message error';
        formMessage!.textContent = error.message;
        formMessage!.style.display = 'block';
      }
    });

    richEditor?.addEventListener('dragover', (e) => {
      e.preventDefault();
      richEditor.classList.add('dragover');
    });
    richEditor?.addEventListener('dragleave', () => {
      richEditor.classList.remove('dragover');
    });
    richEditor?.addEventListener('drop', async (e) => {
      e.preventDefault();
      richEditor.classList.remove('dragover');
      const dt = (e as DragEvent).dataTransfer;
      if (!dt?.files || dt.files.length === 0) return;
      try {
        const uploaded = await uploadMedia(dt.files, 'editor');
        insertMediaIntoEditor(uploaded);
      } catch (error: any) {
        formMessage!.className = 'form-message error';
        formMessage!.textContent = error.message;
        formMessage!.style.display = 'block';
      }
    });

    richEditor?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (selectedEditorImage) selectedEditorImage.classList.remove('selected-image');
      if (target.tagName === 'IMG') {
        selectedEditorImage = target as HTMLImageElement;
        selectedEditorImage.classList.add('selected-image');
      } else {
        selectedEditorImage = null;
      }
    });

    ['dragenter', 'dragover'].forEach((evt) => {
      mediaList?.addEventListener(evt, (e) => {
        e.preventDefault();
        mediaList.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      mediaList?.addEventListener(evt, (e) => {
        e.preventDefault();
        mediaList.classList.remove('dragover');
      });
    });
    mediaList?.addEventListener('drop', async (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!dt?.files || dt.files.length === 0) return;
      try {
        await uploadMedia(dt.files, 'list');
      } catch (error: any) {
        formMessage!.className = 'form-message error';
        formMessage!.textContent = error.message;
        formMessage!.style.display = 'block';
      }
    });

    editorTools?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName !== 'BUTTON') return;
      richEditor.focus();

      if (target.dataset.link === 'true') {
        const url = prompt('Bağlantı adresini girin (https://...)');
        if (!url) return;
        document.execCommand('createLink', false, url);
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, '#1d4ed8');
        syncEditorToTextarea();
        return;
      }

      const resize = target.dataset.resize;
      if (resize && selectedEditorImage) {
        const current = parseInt(selectedEditorImage.style.width || '420', 10);
        const next = resize === 'up' ? current + 60 : Math.max(120, current - 60);
        selectedEditorImage.style.width = `${next}px`;
        syncEditorToTextarea();
        return;
      }

      const cmd = target.dataset.cmd;
      const value = target.dataset.value || null;
      if (!cmd) return;
      document.execCommand(cmd, false, value ?? undefined);
      syncEditorToTextarea();
    });

    richEditor?.addEventListener('input', async () => {
      syncEditorToTextarea();
      await reconcileEditorRemovedMedia();
    });
    textColorPicker?.addEventListener('input', () => {
      richEditor.focus();
      document.execCommand('foreColor', false, textColorPicker.value);
      syncEditorToTextarea();
    });
    bgColorPicker?.addEventListener('input', () => {
      richEditor.focus();
      document.execCommand('hiliteColor', false, bgColorPicker.value);
      syncEditorToTextarea();
    });

    renderMediaList();
    loadNotes();
    tryOpenViewFromQuery();
    tryOpenEditFromQuery();

export function initNotlar(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
