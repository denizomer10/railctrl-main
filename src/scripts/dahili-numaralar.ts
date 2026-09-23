// dahili-numaralar istemcisi. dahili-numaralar.astro tarafından bundled <script> ile çağrılır.

    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchClear = document.getElementById('searchClear') as HTMLElement;
    const tableBody = document.getElementById('tableBody') as HTMLElement;
    const noResults = document.getElementById('noResults') as HTMLElement;
    const paginationContainer = document.getElementById('paginationContainer') as HTMLElement;
    const newRecordBtn = document.getElementById('newRecordBtn') as HTMLButtonElement;
    const reportBtn = document.getElementById('reportBtn') as HTMLButtonElement;
    const modal = document.getElementById('recordModal') as HTMLElement;
    const reportModal = document.getElementById('reportModal') as HTMLElement;
    const modalTitle = document.getElementById('modalTitle') as HTMLElement;
    const closeModal = document.getElementById('closeModal') as HTMLElement;
    const closeReportModal = document.getElementById('closeReportModal') as HTMLElement;
    const cancelBtn = document.getElementById('cancelBtn') as HTMLElement;
    const recordForm = document.getElementById('recordForm') as HTMLFormElement;
    const formMessage = document.getElementById('formMessage') as HTMLElement;
    const deleteRecordBtn = document.getElementById('deleteRecordBtn') as HTMLButtonElement;
    const reportStartDate = document.getElementById('reportStartDate') as HTMLInputElement;
    const reportEndDate = document.getElementById('reportEndDate') as HTMLInputElement;
    const reportAllDates = document.getElementById('reportAllDates') as HTMLInputElement;
    const reportDateRangeRow = document.getElementById('reportDateRangeRow') as HTMLElement;
    const reportBirim = document.getElementById('reportBirim') as HTMLSelectElement;
    const downloadPdfBtn = document.getElementById('downloadPdfBtn') as HTMLButtonElement;
    const allModals: HTMLElement[] = [modal, reportModal].filter(Boolean) as HTMLElement[];

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

    let currentPage = 1;
    let totalPages = 1;
    const limit = 30;
    let editingId: number | null = null;
    let currentUserRole = 'user';
    const pageParams = new URLSearchParams(window.location.search);
    const autoEditId = Number.parseInt(pageParams.get('editId') || '', 10);

    function clearAutoEditQuery() {
      const next = new URLSearchParams(window.location.search);
      next.delete('editId');
      next.delete('src');
      const qs = next.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }

    function canManageDahili() {
      return currentUserRole === 'sef' || currentUserRole === 'admin';
    }

    async function getUserRole() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) { const data = await res.json(); currentUserRole = data.user?.role || 'user'; }
      } catch (e) { currentUserRole = 'user'; }
      if (newRecordBtn) {
        newRecordBtn.style.display = canManageDahili() ? 'inline-flex' : 'none';
      }
    }

    async function tryOpenEditFromQuery() {
      if (!Number.isFinite(autoEditId)) return;
      clearAutoEditQuery();
      try {
        const res = await fetch(`/api/dahili-numaralar/${autoEditId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data?.record) throw new Error(data?.error || 'Kayıt bulunamadı');
        openEditModal(data.record);
      } catch (error: any) {
        alert(`Düzenleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
      }
    }

    function bindDatePickerOpen(input?: HTMLInputElement | null) {
      if (!input) return;
      const openPicker = () => {
        if (typeof input.showPicker === 'function') {
          try { input.showPicker(); } catch (_e) {}
        }
      };
      input.addEventListener('click', openPicker);
      input.addEventListener('focus', openPicker);
    }

    async function loadScriptOnce(src: string) {
      const key = `script:${src}`;
      if ((window as any)[key]) return;
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[data-src="${src}"]`) as HTMLScriptElement | null;
        if (existing?.getAttribute('data-loaded') === '1') {
          (window as any)[key] = true;
          resolve();
          return;
        }
        const script = existing || document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute('data-src', src);
        script.onload = () => {
          script.setAttribute('data-loaded', '1');
          (window as any)[key] = true;
          resolve();
        };
        script.onerror = () => reject(new Error(`Script yüklenemedi: ${src}`));
        if (!existing) document.head.appendChild(script);
      });
    }

    bindDatePickerOpen(reportStartDate);
    bindDatePickerOpen(reportEndDate);

    function toAscii(str: string): string {
      if (!str) return str;
      return str
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C');
    }

    function applyReportAllDatesState() {
      const allDates = Boolean(reportAllDates?.checked);
      if (reportDateRangeRow) reportDateRangeRow.style.display = allDates ? 'none' : 'grid';
    }
    reportAllDates?.addEventListener('change', applyReportAllDatesState);
    applyReportAllDatesState();

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
          loadRecords();
        });
        paginationContainer.appendChild(btn);
      }
    }

    async function loadRecords() {
      tableBody.innerHTML = `<tr class="loading-row"><td colspan="4"><div class="loading-state"><div class="spinner"></div><span>Yükleniyor...</span></div></td></tr>`;
      noResults.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (searchInput?.value) params.set('search', searchInput.value);
        params.set('page', currentPage.toString());
        params.set('limit', limit.toString());

        const response = await fetch(`/api/dahili-numaralar?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        tableBody.innerHTML = '';

        const total = document.getElementById('totalCount');
        const birimC = document.getElementById('birimCount');
        if (data.stats) {
          if (total) total.textContent = data.stats.total || '0';
          if (birimC) birimC.textContent = data.stats.birimCount || '0';
        }

        if (Array.isArray(data.birimler) && reportBirim && reportBirim.options.length <= 1) {
          data.birimler.forEach((b: string) => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            reportBirim.appendChild(opt);
          });
        }

        if (data.records.length === 0) {
          noResults.style.display = 'block';
          paginationContainer.style.display = 'none';
          return;
        }

        data.records.forEach((r: any) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td data-label="Dahili Numara"><span class="numara-badge">${r.dahili_numara || '-'}</span></td>
            <td class="birim-cell" data-label="Birim">${r.birim || '-'}</td>
            <td class="aciklama-cell" data-label="Açıklama">${r.aciklama || ''}</td>
            <td data-label="İşlem">${canManageDahili() ? `<div class="action-btns"><button class="btn-action btn-edit" data-id="${r.id}">✏️</button></div>` : '-'}</td>
          `;
          row.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(r));
          tableBody.appendChild(row);
        });
        
        const paginationTotalCount = Number(data.pagination?.totalCount ?? data.stats?.total ?? data.records?.length ?? 0);
        totalPages = Math.max(1, Number(data.pagination?.totalPages ?? Math.ceil(paginationTotalCount / limit) ?? 1));
        renderPagination();
      } catch (error: any) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#dc2626;">Hata: ${error.message}</td></tr>`;
      }
    }

    function openEditModal(record: any) {
      if (!canManageDahili()) return;
      editingId = record.id;
      modalTitle.textContent = 'Numarayı Düzenle';
      (document.getElementById('recordId') as HTMLInputElement).value = record.id;
      (document.getElementById('dahili_numara') as HTMLInputElement).value = record.dahili_numara || '';
      (document.getElementById('birim') as HTMLInputElement).value = record.birim || '';
      (document.getElementById('aciklama') as HTMLTextAreaElement).value = record.aciklama || '';
      
      const canEditAll = currentUserRole === 'sef' || currentUserRole === 'admin';
      (document.getElementById('dahili_numara') as HTMLInputElement).disabled = !canEditAll;
      (document.getElementById('birim') as HTMLInputElement).disabled = !canEditAll;
      (document.getElementById('aciklama') as HTMLTextAreaElement).disabled = !canEditAll;
      
      deleteRecordBtn.style.display = canEditAll ? 'block' : 'none';
      formMessage.style.display = 'none';
      showModal(modal);
    }

    newRecordBtn?.addEventListener('click', () => {
      if (!canManageDahili()) return;
      editingId = null;
      modalTitle.textContent = 'Yeni Dahili Numara';
      recordForm.reset();
      deleteRecordBtn.style.display = 'none';
      
      (document.getElementById('dahili_numara') as HTMLInputElement).disabled = false;
      (document.getElementById('birim') as HTMLInputElement).disabled = false;
      (document.getElementById('aciklama') as HTMLTextAreaElement).disabled = false;
      
      formMessage.style.display = 'none';
      showModal(modal);
    });

    closeModal?.addEventListener('click', () => hideModal(modal));
    cancelBtn?.addEventListener('click', () => hideModal(modal));
    modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(modal); });

    recordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canManageDahili()) {
        formMessage.className = 'form-message error';
        formMessage.textContent = 'Bu işlem için yetkiniz yok';
        formMessage.style.display = 'block';
        return;
      }
      const payload: any = {
        dahili_numara: (document.getElementById('dahili_numara') as HTMLInputElement).value,
        birim: (document.getElementById('birim') as HTMLInputElement).value,
        aciklama: (document.getElementById('aciklama') as HTMLTextAreaElement).value,
      };

      try {
        const url = editingId ? `/api/dahili-numaralar/${editingId}` : '/api/dahili-numaralar';
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        formMessage.className = 'form-message success';
        formMessage.textContent = editingId ? 'Güncellendi!' : 'Oluşturuldu!';
        formMessage.style.display = 'block';

        setTimeout(() => { hideModal(modal); currentPage = 1; loadRecords(); }, 800);
      } catch (error: any) {
        formMessage.className = 'form-message error';
        formMessage.textContent = error.message;
        formMessage.style.display = 'block';
      }
    });

    deleteRecordBtn?.addEventListener('click', async () => {
      if (!canManageDahili()) return;
      if (!editingId || !confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return;
      try {
        const response = await fetch(`/api/dahili-numaralar/${editingId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        hideModal(modal);
        currentPage = 1;
        loadRecords();
      } catch (error: any) { alert('Silme hatası: ' + error.message); }
    });

    let searchTimeout: ReturnType<typeof setTimeout>;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const value = (e.target as HTMLInputElement).value;
      searchClear.style.display = value ? 'flex' : 'none';
      searchTimeout = setTimeout(() => { currentPage = 1; loadRecords(); }, 300);
    });
    searchClear?.addEventListener('click', () => { searchInput.value = ''; searchClear.style.display = 'none'; currentPage = 1; loadRecords(); });

    reportBtn?.addEventListener('click', () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (reportStartDate) reportStartDate.value = thirtyDaysAgo.toISOString().split('T')[0];
      if (reportEndDate) reportEndDate.value = today.toISOString().split('T')[0];
      if (reportAllDates) reportAllDates.checked = false;
      applyReportAllDatesState();
      if (reportBirim) reportBirim.value = '';
      showModal(reportModal);
    });

    closeReportModal?.addEventListener('click', () => hideModal(reportModal));
    reportModal?.addEventListener('click', (e) => { if (e.target === reportModal) hideModal(reportModal); });

    const normalizeText = (text: string | null | undefined): string => String(text || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .trim();

    const resolveBirimForReport = (query: string): string => {
      const normalizedQuery = normalizeText(query);
      if (!normalizedQuery) return '';
      const options = Array.from(reportBirim.options || []).map((opt) => String(opt.value || '')).filter(Boolean);
      let bestBirim = '';
      let bestScore = 0;
      for (const birim of options) {
        const normalizedBirim = normalizeText(birim);
        const tokens = normalizedBirim.split(/\s+/).filter((t) => t.length >= 3);
        let score = 0;
        if (normalizedQuery.includes(normalizedBirim)) score = 120 + normalizedBirim.length;
        if (!score && tokens.length) {
          const matched = tokens.filter((t) => normalizedQuery.includes(t)).length;
          if (matched === tokens.length) score = 80 + tokens.length * 10;
          else if (matched > 0 && tokens.length > 1) score = 45 + matched * 10;
        }
        if (score > bestScore) {
          bestScore = score;
          bestBirim = birim;
        }
      }
      return bestScore >= 55 ? bestBirim : '';
    };

    const createDahiliReportPdf = async (openInNewWindow = false) => {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = 'Yükleniyor...';
      try {
        const params = new URLSearchParams();
        params.set('limit', '10000');
        if (reportBirim?.value) params.set('birim', reportBirim.value);

        const response = await fetch(`/api/dahili-numaralar?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Rapor verisi alınamadı');

        let reportData = Array.isArray(data.records) ? data.records : [];
        if (!reportAllDates?.checked && (reportStartDate?.value || reportEndDate?.value)) {
          reportData = reportData.filter((r: any) => {
            const recordDate = new Date(r.created_at || Date.now());
            if (reportStartDate?.value && recordDate < new Date(reportStartDate.value)) return false;
            if (reportEndDate?.value && recordDate > new Date(`${reportEndDate.value}T23:59:59`)) return false;
            return true;
          });
        }

        if (!reportData.length) {
          alert('Seçilen kriterlere uygun kayıt bulunamadı.');
          return;
        }

        await loadScriptOnce('/vendor/pdfmake.min.js');
        await loadScriptOnce('/vendor/vfs_fonts.js');
        const pdfMakeApi = (window as any).pdfMake;
        if (!pdfMakeApi) throw new Error('PDF kütüphanesi başlatılamadı');

        const dateRangeText = reportAllDates?.checked
          ? 'Tüm Tarihler'
          : `${reportStartDate?.value || '-'} - ${reportEndDate?.value || '-'}`;

        const tableBody = [
          [
            { text: 'Dahili Numara', style: 'tableHeader' },
            { text: 'Birim', style: 'tableHeader' },
            { text: 'Açıklama', style: 'tableHeader' },
            { text: 'Oluşturulma', style: 'tableHeader' },
          ],
          ...reportData.map((r: any) => [
            String(r.dahili_numara || '-'),
            String(r.birim || '-'),
            String(r.aciklama || '-'),
            r.created_at ? new Date(r.created_at).toLocaleString('tr-TR') : '-',
          ]),
        ];

        const content: any[] = [
          { text: 'Dahili Numaralar Raporu', style: 'title' },
          { text: `Tarih Aralığı: ${dateRangeText}`, style: 'subtitle' },
        ];
        if (reportBirim?.value) content.push({ text: `Birim: ${reportBirim.value}`, style: 'subtitle' });
        content.push({
          table: {
            headerRows: 1,
            widths: [70, 120, '*', 95],
            body: tableBody,
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? '#2563eb' : rowIndex % 2 === 0 ? '#f8fafc' : null),
            hLineColor: () => '#dbe3ee',
            vLineColor: () => '#dbe3ee',
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        });
        content.push({ text: `Toplam: ${reportData.length} kayıt`, style: 'footerNote' });

        const docDefinition = {
          pageSize: 'A4',
          pageOrientation: 'landscape',
          pageMargins: [20, 20, 20, 20],
          defaultStyle: { font: 'Roboto', fontSize: 9 },
          styles: {
            title: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
            subtitle: { fontSize: 10, alignment: 'center', margin: [0, 0, 0, 4] },
            tableHeader: { color: '#ffffff', bold: true, fontSize: 10 },
            footerNote: { fontSize: 10, margin: [0, 10, 0, 0] },
          },
          content,
        };

        const fileName = `Dahili_Numaralar_Rapor_${new Date().toISOString().split('T')[0]}.pdf`;
        if (openInNewWindow) {
          pdfMakeApi.createPdf(docDefinition).getBlob((blob: Blob) => {
            const blobUrl = URL.createObjectURL(blob);
            const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            if (!opened) pdfMakeApi.createPdf(docDefinition).download(fileName);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          });
        } else {
          pdfMakeApi.createPdf(docDefinition).download(fileName);
        }
        hideModal(reportModal);
      } catch (error: any) {
        alert(error.message || 'Rapor oluşturulurken hata oluştu');
      } finally {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = '📄 PDF Oluştur';
      }
    };

    downloadPdfBtn?.addEventListener('click', async () => {
      await createDahiliReportPdf(false);
    });

    const autoReport = pageParams.get('report');
    const autoBirim = pageParams.get('birim');
    const autoBirimQuery = pageParams.get('birimQuery');
    if (autoReport === 'pdf') {
      const chosenBirim = autoBirim || resolveBirimForReport(autoBirimQuery || '') || resolveBirimForReport(pageParams.get('search') || '');
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('report');
      nextParams.delete('birim');
      nextParams.delete('birimQuery');
      const nextQuery = nextParams.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`);
      if (chosenBirim) reportBirim.value = chosenBirim;
      reportAllDates.checked = true;
      applyReportAllDatesState();
      setTimeout(() => { createDahiliReportPdf(true); }, 120);
    }

    getUserRole().finally(async () => {
      await loadRecords();
      await tryOpenEditFromQuery();
    });

export function initDahiliNumaralar(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
