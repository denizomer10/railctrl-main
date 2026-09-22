// calisma-izni istemcisi. calisma-izni.astro tarafından bundled <script> ile çağrılır.

    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchClear = document.getElementById('searchClear') as HTMLElement;
    const istasyonFilter = document.getElementById('istasyonFilter') as HTMLSelectElement;
    const tableBody = document.getElementById('tableBody') as HTMLElement;
    const noResults = document.getElementById('noResults') as HTMLElement;
    const paginationContainer = document.getElementById('paginationContainer') as HTMLElement;
    const newRecordBtn = document.getElementById('newRecordBtn') as HTMLButtonElement;
    const modal = document.getElementById('recordModal') as HTMLElement;
    const modalTitle = document.getElementById('modalTitle') as HTMLElement;
    const closeModal = document.getElementById('closeModal') as HTMLElement;
    const cancelBtn = document.getElementById('cancelBtn') as HTMLElement;
    const recordForm = document.getElementById('recordForm') as HTMLFormElement;
    const formMessage = document.getElementById('formMessage') as HTMLElement;
    const deleteRecordBtn = document.getElementById('deleteRecordBtn') as HTMLButtonElement;
    const allModals: HTMLElement[] = [];

    const registerModal = (m?: HTMLElement | null) => {
      if (!m) return;
      if (m.parentElement !== document.body) document.body.appendChild(m);
      if (!allModals.includes(m)) allModals.push(m);
    };

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

    registerModal(modal);

    let currentIstasyon = '';
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

    function canEditCalisma() {
      return currentUserRole === 'user' || currentUserRole === 'sef' || currentUserRole === 'admin';
    }

    function canCreateCalisma() {
      return currentUserRole === 'user' || currentUserRole === 'sef' || currentUserRole === 'admin';
    }

    function canDeleteCalisma() {
      return currentUserRole === 'sef' || currentUserRole === 'admin';
    }

    async function getUserRole() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) { const data = await res.json(); currentUserRole = data.user?.role || 'user'; }
      } catch (e) { currentUserRole = 'user'; }
    }
    getUserRole();

    async function tryOpenEditFromQuery() {
      if (!Number.isFinite(autoEditId)) return;
      clearAutoEditQuery();
      try {
        const res = await fetch(`/api/calisma-izni/${autoEditId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data?.record) throw new Error(data?.error || 'Kayıt bulunamadı');
        openEditModal(data.record);
      } catch (error: any) {
        alert(`Düzenleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
      }
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
          loadRecords();
        });
        paginationContainer.appendChild(btn);
      }
    }

    async function loadRecords() {
      tableBody.innerHTML = `<tr class="loading-row"><td colspan="8"><div class="loading-state"><div class="spinner"></div><span>Yükleniyor...</span></div></td></tr>`;
      noResults.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (searchInput?.value) params.set('search', searchInput.value);
        if (currentIstasyon) params.set('istasyon', currentIstasyon);
        params.set('page', currentPage.toString());
        params.set('limit', limit.toString());

        const response = await fetch(`/api/calisma-izni?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        tableBody.innerHTML = '';

        const total = document.getElementById('totalCount');
        const istCount = document.getElementById('istasyonCount');
        if (data.stats) {
          if (total) total.textContent = data.stats.total || '0';
          if (istCount) istCount.textContent = data.stats.istasyonCount || '0';
        }

        if (data.istasyonlar && istasyonFilter.options.length <= 1) {
          data.istasyonlar.forEach((ist: string) => {
            const opt = document.createElement('option');
            opt.value = ist;
            opt.textContent = ist;
            istasyonFilter.appendChild(opt);
          });
        }

        if (data.records.length === 0) {
          noResults.style.display = 'block';
          paginationContainer.style.display = 'none';
          return;
        }

        data.records.forEach((r: any) => {
          const row = document.createElement('tr');
          const tarih = r.zaman_damgasi ? new Date(r.zaman_damgasi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
          
          row.innerHTML = `
            <td data-label="MMS No"><span class="mms-no">${r.mms_numarasi || '-'}</span></td>
            <td data-label="Çalışma Kodu"><span class="kod-badge">${r.calisma_kodu || '-'}</span></td>
            <td data-label="Tarih"><span class="date-cell">${tarih}</span></td>
            <td class="is-cell" data-label="Yapılacak İş">${r.yapilacak_is || '-'}</td>
            <td class="calisan-cell" data-label="Çalışanlar">${r.calisanlar || '-'}</td>
            <td data-label="İstasyon"><span class="istasyon-badge">${r.istasyon || '-'}</span></td>
            <td data-label="Bildiren">${r.bildiren_ad_soyad || '-'}</td>
            <td data-label="İşlem">${canEditCalisma() ? `<div class="action-btns"><button class="btn-action btn-edit" data-id="${r.id}">✏️</button></div>` : '-'}</td>
          `;
          row.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(r));
          tableBody.appendChild(row);
        });
        
        const paginationTotalCount = Number(data.pagination?.totalCount ?? data.stats?.total ?? data.records?.length ?? 0);
        totalPages = Math.max(1, Number(data.pagination?.totalPages ?? Math.ceil(paginationTotalCount / limit) ?? 1));
        renderPagination();
      } catch (error: any) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#dc2626;">Hata: ${error.message}</td></tr>`;
      }
    }

    function openEditModal(record: any) {
      editingId = record.id;
      modalTitle.textContent = 'Kaydı Düzenle';
      (document.getElementById('recordId') as HTMLInputElement).value = record.id;
      (document.getElementById('mms_numarasi') as HTMLInputElement).value = record.mms_numarasi || '';
      (document.getElementById('calisma_kodu') as HTMLInputElement).value = record.calisma_kodu || '';
      (document.getElementById('yapilacak_is') as HTMLTextAreaElement).value = record.yapilacak_is || '';
      (document.getElementById('istasyon') as HTMLSelectElement).value = record.istasyon || '';
      (document.getElementById('calisanlar') as HTMLInputElement).value = record.calisanlar || '';
      
      const canEdit = canEditCalisma();
      (document.getElementById('mms_numarasi') as HTMLInputElement).disabled = !canEdit;
      (document.getElementById('calisma_kodu') as HTMLInputElement).disabled = !canEdit;
      (document.getElementById('yapilacak_is') as HTMLTextAreaElement).disabled = !canEdit;
      (document.getElementById('istasyon') as HTMLSelectElement).disabled = !canEdit;
      (document.getElementById('calisanlar') as HTMLInputElement).disabled = !canEdit;
      
      deleteRecordBtn.style.display = canDeleteCalisma() ? 'block' : 'none';
      formMessage.style.display = 'none';
      showModal(modal);
    }

    function openNewRecordModal() {
      if (!canCreateCalisma()) return;
      editingId = null;
      modalTitle.textContent = 'Yeni Çalışma İzni';
      recordForm.reset();
      deleteRecordBtn.style.display = 'none';
      
      (document.getElementById('mms_numarasi') as HTMLInputElement).disabled = false;
      (document.getElementById('calisma_kodu') as HTMLInputElement).disabled = false;
      (document.getElementById('yapilacak_is') as HTMLTextAreaElement).disabled = false;
      (document.getElementById('istasyon') as HTMLSelectElement).disabled = false;
      (document.getElementById('calisanlar') as HTMLInputElement).disabled = false;
      
      formMessage.style.display = 'none';
      showModal(modal);
    }

    newRecordBtn?.addEventListener('click', openNewRecordModal);

    closeModal?.addEventListener('click', () => hideModal(modal));
    cancelBtn?.addEventListener('click', () => hideModal(modal));
    modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(modal); });

    const autoOpenNew = new URLSearchParams(window.location.search).get('open');
    if ((autoOpenNew === 'new' || autoOpenNew === 'create') && canCreateCalisma()) {
      setTimeout(() => openNewRecordModal(), 80);
    }

    recordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload: any = {
        mms_numarasi: (document.getElementById('mms_numarasi') as HTMLInputElement).value,
        calisma_kodu: (document.getElementById('calisma_kodu') as HTMLInputElement).value,
        yapilacak_is: (document.getElementById('yapilacak_is') as HTMLTextAreaElement).value,
        istasyon: (document.getElementById('istasyon') as HTMLSelectElement).value,
        calisanlar: (document.getElementById('calisanlar') as HTMLInputElement).value,
      };

      try {
        const url = editingId ? `/api/calisma-izni/${editingId}` : '/api/calisma-izni';
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        formMessage.className = 'form-message success';
        formMessage.textContent = editingId ? 'Güncellendi!' : 'Oluşturuldu!';
        formMessage.style.display = 'block';
        window.dispatchEvent(new Event('notifications:refresh'));

        setTimeout(() => { hideModal(modal); currentPage = 1; loadRecords(); }, 800);
      } catch (error: any) {
        formMessage.className = 'form-message error';
        formMessage.textContent = error.message;
        formMessage.style.display = 'block';
      }
    });

    deleteRecordBtn?.addEventListener('click', async () => {
      if (!editingId || !confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return;
      if (!canDeleteCalisma()) return;
      try {
        const response = await fetch(`/api/calisma-izni/${editingId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        hideModal(modal);
        window.dispatchEvent(new Event('notifications:refresh'));
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
    istasyonFilter?.addEventListener('change', () => { currentIstasyon = istasyonFilter.value; currentPage = 1; loadRecords(); });

    // Rapor Modal Elements
    const reportBtn = document.getElementById('reportBtn') as HTMLButtonElement;
    const reportModal = document.getElementById('reportModal') as HTMLElement;
    const closeReportModal = document.getElementById('closeReportModal') as HTMLElement;
    const reportStartDate = document.getElementById('reportStartDate') as HTMLInputElement;
    const reportEndDate = document.getElementById('reportEndDate') as HTMLInputElement;
    const reportAllDates = document.getElementById('reportAllDates') as HTMLInputElement;
    const reportDateRangeRow = document.getElementById('reportDateRangeRow') as HTMLElement;
    const reportStation = document.getElementById('reportStation') as HTMLSelectElement;
    const downloadPdfBtn = document.getElementById('downloadPdfBtn') as HTMLButtonElement;
    registerModal(reportModal);

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

    // Default dates - son 30 gün
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (reportStartDate) reportStartDate.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (reportEndDate) reportEndDate.value = today.toISOString().split('T')[0];
    bindDatePickerOpen(reportStartDate);
    bindDatePickerOpen(reportEndDate);

    function applyReportAllDatesState() {
      const allDates = Boolean(reportAllDates?.checked);
      if (reportDateRangeRow) reportDateRangeRow.style.display = allDates ? 'none' : 'grid';
    }
    reportAllDates?.addEventListener('change', applyReportAllDatesState);
    applyReportAllDatesState();

    reportBtn?.addEventListener('click', () => {
      if (reportAllDates) reportAllDates.checked = false;
      applyReportAllDatesState();
      showModal(reportModal);
    });

    closeReportModal?.addEventListener('click', () => {
      hideModal(reportModal);
    });

    reportModal?.addEventListener('click', (e) => {
      if (e.target === reportModal) hideModal(reportModal);
    });

    const normalizeText = (text) => String(text || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .trim();

    const resolveStationForReport = (query) => {
      const normalizedQuery = normalizeText(query);
      if (!normalizedQuery) return '';
      const options = Array.from(reportStation.options || []).map((opt) => String(opt.value || '')).filter(Boolean);
      let bestStation = '';
      let bestScore = 0;
      for (const station of options) {
        const normalizedStation = normalizeText(station);
        const tokens = normalizedStation.split(/\s+/).filter((t) => t.length >= 3);
        let score = 0;
        if (normalizedQuery.includes(normalizedStation)) score = 120 + normalizedStation.length;
        if (!score && tokens.length) {
          const matched = tokens.filter((t) => normalizedQuery.includes(t)).length;
          if (matched === tokens.length) score = 80 + tokens.length * 10;
          else if (matched > 0 && tokens.length > 1) score = 45 + matched * 10;
        }
        if (score > bestScore) {
          bestScore = score;
          bestStation = station;
        }
      }
      return bestScore >= 55 ? bestStation : '';
    };

    const createCalismaReportPdf = async (openInNewWindow = false) => {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = 'Yükleniyor...';

      const params = new URLSearchParams();
      params.set('limit', '10000');
      if (reportStation.value) params.set('istasyon', reportStation.value);

      try {
        const response = await fetch(`/api/calisma-izni?${params}`);
        const data = await response.json();
        
        let reportData = data.records || [];
        
        // Tarihe göre filtrele
        if (!reportAllDates?.checked && (reportStartDate.value || reportEndDate.value)) {
          reportData = reportData.filter((r: any) => {
            const recordDate = new Date(r.zaman_damgasi || r.created_at);
            if (reportStartDate.value && recordDate < new Date(reportStartDate.value)) return false;
            if (reportEndDate.value && recordDate > new Date(reportEndDate.value + 'T23:59:59')) return false;
            return true;
          });
        }

        if (reportData.length === 0) {
          alert('Seçilen kriterlere uygun kayıt bulunamadı.');
          downloadPdfBtn.disabled = false;
          downloadPdfBtn.textContent = '📄 PDF Oluştur';
          return;
        }

        await loadScriptOnce('/vendor/pdfmake.min.js');
        await loadScriptOnce('/vendor/vfs_fonts.js');
        const pdfMakeApi = (window as any).pdfMake;
        if (!pdfMakeApi) throw new Error('PDF kütüphanesi başlatılamadı');

        const dateRangeText = reportAllDates?.checked
          ? 'Tüm Tarihler'
          : `${reportStartDate.value || '-'} - ${reportEndDate.value || '-'}`;

        const tableBody = [
          [
            { text: 'MMS No', style: 'tableHeader' },
            { text: 'Çalışma Kodu', style: 'tableHeader' },
            { text: 'Tarih', style: 'tableHeader' },
            { text: 'Yapılacak İş', style: 'tableHeader' },
            { text: 'Çalışanlar', style: 'tableHeader' },
            { text: 'İstasyon', style: 'tableHeader' },
            { text: 'Bildiren', style: 'tableHeader' },
          ],
          ...reportData.map((r: any) => [
            String(r.mms_numarasi || '-'),
            String(r.calisma_kodu || '-'),
            r.zaman_damgasi ? new Date(r.zaman_damgasi).toLocaleDateString('tr-TR') : '-',
            String(r.yapilacak_is || '-'),
            String(r.calisanlar || '-'),
            String(r.istasyon || '-'),
            String(r.bildiren_ad_soyad || '-'),
          ]),
        ];

        const content: any[] = [
          { text: 'Çalışma İzni Raporu', style: 'title' },
          { text: `Tarih Aralığı: ${dateRangeText}`, style: 'subtitle' },
        ];
        if (reportStation.value) content.push({ text: `İstasyon: ${reportStation.value}`, style: 'subtitle' });
        content.push({
          table: {
            headerRows: 1,
            widths: [45, 62, 45, '*', 75, 55, 65],
            body: tableBody,
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? '#10b981' : rowIndex % 2 === 0 ? '#f8fafc' : null),
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
        content.push({ text: `Toplam: ${reportData.length} kayıt | Oluşturulma: ${new Date().toLocaleString('tr-TR')}`, style: 'footerNote' });

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

        const fileName = `Calisma_Izni_Rapor_${new Date().toISOString().split('T')[0]}.pdf`;
        if (openInNewWindow) {
          pdfMakeApi.createPdf(docDefinition).getBlob((blob) => {
            const blobUrl = URL.createObjectURL(blob);
            const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            if (!opened) pdfMakeApi.createPdf(docDefinition).download(fileName);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          });
        } else {
          pdfMakeApi.createPdf(docDefinition).download(fileName);
        }
        hideModal(reportModal);

      } catch (err) {
        console.error('Rapor verisi alınamadı:', err);
        alert('Rapor oluşturulurken hata oluştu');
      }

      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = '📄 PDF Oluştur';
    };

    downloadPdfBtn?.addEventListener('click', async () => {
      await createCalismaReportPdf(false);
    });

    const autoReport = pageParams.get('report');
    const autoAllStations = pageParams.get('allStations');
    const autoStation = pageParams.get('station');
    const autoStationQuery = pageParams.get('stationQuery');
    if (autoReport === 'pdf') {
      const normalizedAll = normalizeText(autoAllStations || '');
      const isAllStations = normalizedAll === '1' || normalizedAll === 'true' || normalizedAll === 'evet' || normalizedAll === 'tum';
      const chosenStation = !isAllStations
        ? (autoStation || resolveStationForReport(autoStationQuery || '') || resolveStationForReport(pageParams.get('search') || ''))
        : '';
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('report');
      nextParams.delete('allStations');
      nextParams.delete('station');
      nextParams.delete('stationQuery');
      const nextQuery = nextParams.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`);
      reportStation.value = chosenStation || '';
      reportAllDates.checked = true;
      applyReportAllDatesState();
      setTimeout(() => { createCalismaReportPdf(true); }, 120);
    }

    loadRecords().finally(() => {
      tryOpenEditFromQuery();
    });

export function initCalismaIzni(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
