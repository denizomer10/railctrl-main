import { escapeHtml } from './api-client';
// mms istemcisi. mms.astro tarafından bundled <script> ile çağrılır.

    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchClear = document.getElementById('searchClear') as HTMLElement;
    const chips = document.querySelectorAll('.chip');
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
    const durumGroup = document.getElementById('durumGroup') as HTMLElement;
    const notGroup = document.getElementById('notGroup') as HTMLElement;
    const deleteRecordBtn = document.getElementById('deleteRecordBtn') as HTMLButtonElement;
    const stationFilter = document.getElementById('stationFilter') as HTMLInputElement;
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

    let currentDurum: string | null = null; // null = all, '' = Beklemede
    let currentStation: string = ''; // '' = all stations
    let currentPage = 1;
    let totalPages = 1;
    const limit = 30;
    let editingId: number | null = null;
    let currentUserRole = 'personel';
    const pageParams = new URLSearchParams(window.location.search);
    const autoEditId = Number.parseInt(pageParams.get('editId') || '', 10);


    function clearAutoEditQuery() {
      const next = new URLSearchParams(window.location.search);
      next.delete('editId');
      next.delete('src');
      const qs = next.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }

    // Kullanıcı rolü
    function canEditMms() {
      return currentUserRole === 'personel' || currentUserRole === 'yonetici';
    }

    function canDeleteMms() {
      return currentUserRole === 'yonetici';
    }

    function canCreateMms() {
      return currentUserRole === 'personel' || currentUserRole === 'yonetici';
    }

    async function getUserRole() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          currentUserRole = data.user?.role || 'personel';
        }
      } catch (e) { currentUserRole = 'personel'; }
      if (newRecordBtn) {
        newRecordBtn.style.display = canCreateMms() ? 'inline-flex' : 'none';
      }
    }

    async function tryOpenEditFromQuery() {
      if (!Number.isFinite(autoEditId)) return;
      clearAutoEditQuery();
      try {
        const res = await fetch(`/api/mms/${autoEditId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data?.record) throw new Error(data?.error || 'Kayıt bulunamadı');
        openEditModal(data.record);
      } catch (error: any) {
        alert(`Düzenleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
      }
    }

    function getStatusBadge(durum: string | null) {
      const d = durum || '';
      if (d === '' || d === 'Beklemede') return `<span class="status-badge status-warning">⏳ Beklemede</span>`;
      if (d === 'Onarıldı') return `<span class="status-badge status-success">✅ Onarıldı</span>`;
      if (d === 'Onarılmadı') return `<span class="status-badge status-danger">❌ Onarılmadı</span>`;
      if (d === 'Onarımda') return `<span class="status-badge status-info">🔧 Onarımda</span>`;
      if (d === 'Parça Bekleniyor') return `<span class="status-badge status-purple">📦 Parça Bek.</span>`;
      return `<span class="status-badge status-warning">⏳ Beklemede</span>`;
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
      tableBody.innerHTML = `<tr class="loading-row"><td colspan="7"><div class="loading-state"><div class="spinner"></div><span>Yükleniyor...</span></div></td></tr>`;
      noResults.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (searchInput?.value) params.set('search', searchInput.value);
        if (currentDurum !== null) params.set('durum', currentDurum);
        if (currentStation) params.set('istasyon', currentStation);
        params.set('page', currentPage.toString());
        params.set('limit', limit.toString());

        const response = await fetch(`/api/mms?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        tableBody.innerHTML = '';

        // Stats
        const total = document.getElementById('totalCount');
        const bekleyen = document.getElementById('bekleyenCount');
        const onarilan = document.getElementById('onarilanCount');
        const onarilmadi = document.getElementById('onarilmadiCount');
        const onarimda = document.getElementById('onarimdaCount');
        
        if (data.stats) {
          if (total) total.textContent = data.stats.total || '0';
          if (bekleyen) bekleyen.textContent = data.stats.beklemede || '0';
          if (onarilan) onarilan.textContent = data.stats.onarilan || '0';
          if (onarilmadi) onarilmadi.textContent = data.stats.onarilmadi || '0';
          if (onarimda) onarimda.textContent = data.stats.onarimda || '0';
        }

        if (data.records.length === 0) {
          noResults.style.display = 'block';
          paginationContainer.style.display = 'none';
          return;
        }

        data.records.forEach((r: any) => {
          const row = document.createElement('tr');
          const tarih = r.zaman_damgasi ? new Date(r.zaman_damgasi).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
          }) : '-';
          const onarilmaTarihi = r.onarilma_tarihi ? new Date(r.onarilma_tarihi).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
          }) : '';
          const tarihGosterimi = onarilmaTarihi ? `${tarih}<br><small>Onarıldı: ${onarilmaTarihi}</small>` : tarih;
          const notGosterimi = r.not ? `<div class="mms-note">Not: ${escapeHtml(r.not)}</div>` : '';
          
          row.innerHTML = `
            <td data-label="MMS No"><span class="mms-no">${r.mms_numarasi || '-'}</span></td>
            <td data-label="Tarih"><span class="date-cell">${tarihGosterimi}</span></td>
            <td class="ariza-cell" data-label="Arıza Tanımı">${escapeHtml(r.ariza_tanimi || '-')} ${notGosterimi}</td>
            <td class="istasyon-cell" data-label="İstasyon">${r.istasyon || '-'}</td>
            <td data-label="Bildiren">${r.acan_ad_soyad || '-'}</td>
            <td data-label="Durum">${getStatusBadge(r.durum)}</td>
            <td data-label="İşlem">${canEditMms() ? `<div class="action-btns"><button class="btn-action btn-edit" data-id="${r.id}">✏️</button></div>` : '-'}</td>
          `;
          
          row.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(r));
          tableBody.appendChild(row);
        });
        
        const paginationTotalCount = Number(data.pagination?.totalCount ?? data.stats?.total ?? data.records?.length ?? 0);
        totalPages = Math.max(1, Number(data.pagination?.totalPages ?? Math.ceil(paginationTotalCount / limit) ?? 1));
        renderPagination();
      } catch (error: any) {
        console.error('Load error:', error);
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#dc2626;">Hata: ${error.message}</td></tr>`;
      }
    }

    function openEditModal(record: any) {
      editingId = record.id;
      modalTitle.textContent = 'Kaydı Düzenle';
      (document.getElementById('recordId') as HTMLInputElement).value = record.id;
      (document.getElementById('mms_numarasi') as HTMLInputElement).value = record.mms_numarasi || '';
      (document.getElementById('ariza_tanimi') as HTMLTextAreaElement).value = record.ariza_tanimi || '';
      (document.getElementById('istasyon') as HTMLSelectElement).value = record.istasyon || '';
      (document.getElementById('durum') as HTMLSelectElement).value = record.durum || '';
      (document.getElementById('not') as HTMLTextAreaElement).value = record.not || '';
      
      durumGroup.style.display = 'block';
      notGroup.style.display = 'block';
      
      const canEdit = canEditMms();
      (document.getElementById('mms_numarasi') as HTMLInputElement).disabled = !canEdit;
      (document.getElementById('ariza_tanimi') as HTMLTextAreaElement).disabled = !canEdit;
      (document.getElementById('istasyon') as HTMLSelectElement).disabled = !canEdit;
      
      deleteRecordBtn.style.display = canDeleteMms() ? 'block' : 'none';
      
      formMessage.style.display = 'none';
      showModal(modal);
    }

    function openNewRecordModal() {
      if (!canCreateMms()) return;
      editingId = null;
      modalTitle.textContent = 'Yeni MMS Kaydı';
      recordForm.reset();
      durumGroup.style.display = 'none';
      notGroup.style.display = 'none';
      deleteRecordBtn.style.display = 'none';
      
      (document.getElementById('mms_numarasi') as HTMLInputElement).disabled = false;
      (document.getElementById('ariza_tanimi') as HTMLTextAreaElement).disabled = false;
      (document.getElementById('istasyon') as HTMLSelectElement).disabled = false;
      
      formMessage.style.display = 'none';
      showModal(modal);
    }

    newRecordBtn?.addEventListener('click', openNewRecordModal);

    closeModal?.addEventListener('click', () => hideModal(modal));
    cancelBtn?.addEventListener('click', () => hideModal(modal));
    modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(modal); });

    const autoOpenNew = new URLSearchParams(window.location.search).get('open');
    if ((autoOpenNew === 'new' || autoOpenNew === 'create') && canCreateMms()) {
      setTimeout(() => openNewRecordModal(), 80);
    }

    recordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canCreateMms()) {
        formMessage.className = 'form-message error';
        formMessage.textContent = 'Bu işlem için yetkiniz yok';
        formMessage.style.display = 'block';
        return;
      }
      const payload: any = {
        mms_numarasi: (document.getElementById('mms_numarasi') as HTMLInputElement).value,
        ariza_tanimi: (document.getElementById('ariza_tanimi') as HTMLTextAreaElement).value,
        istasyon: (document.getElementById('istasyon') as HTMLSelectElement).value,
      };
      if (editingId) {
        payload.durum = (document.getElementById('durum') as HTMLSelectElement).value;
        payload.not = (document.getElementById('not') as HTMLTextAreaElement).value.trim() || null;
      }

      try {
        const url = editingId ? `/api/mms/${editingId}` : '/api/mms';
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        formMessage.className = 'form-message success';
        formMessage.textContent = editingId ? 'Güncellendi!' : 'Oluşturuldu!';
        formMessage.style.display = 'block';
        window.dispatchEvent(new Event('notifications:refresh'));

        setTimeout(() => {
          hideModal(modal);
          currentPage = 1;
          loadRecords();
        }, 800);
      } catch (error: any) {
        formMessage.className = 'form-message error';
        formMessage.textContent = error.message;
        formMessage.style.display = 'block';
      }
    });

    deleteRecordBtn?.addEventListener('click', async () => {
      if (!editingId || !confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return;
      
      try {
        const response = await fetch(`/api/mms/${editingId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        hideModal(modal);
        window.dispatchEvent(new Event('notifications:refresh'));
        currentPage = 1;
        loadRecords();
      } catch (error: any) {
        alert('Silme hatası: ' + error.message);
      }
    });

    let searchTimeout: ReturnType<typeof setTimeout>;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const value = (e.target as HTMLInputElement).value;
      searchClear.style.display = value ? 'flex' : 'none';
      searchTimeout = setTimeout(() => { currentPage = 1; loadRecords(); }, 300);
    });

    searchClear?.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      currentPage = 1;
      loadRecords();
    });

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const durumVal = (chip as HTMLElement).dataset.durum;
        currentDurum = durumVal === 'all' ? null : (durumVal ?? '');
        currentPage = 1;
        loadRecords();
      });
    });

    // Station filter
    let stationSearchTimeout: number | undefined;
    stationFilter?.addEventListener('input', () => {
      currentStation = stationFilter.value;
      currentPage = 1;
      window.clearTimeout(stationSearchTimeout);
      stationSearchTimeout = window.setTimeout(loadRecords, 250);
    });


    // Rapor Modal Elements
    const reportBtn = document.getElementById('reportBtn') as HTMLButtonElement;
    const reportModal = document.getElementById('reportModal') as HTMLElement;
    const closeReportModal = document.getElementById('closeReportModal') as HTMLElement;
    const reportStartDate = document.getElementById('reportStartDate') as HTMLInputElement;
    const reportEndDate = document.getElementById('reportEndDate') as HTMLInputElement;
    const reportAllDates = document.getElementById('reportAllDates') as HTMLInputElement;
    const reportDateRangeRow = document.getElementById('reportDateRangeRow') as HTMLElement;
    const reportStation = document.getElementById('reportStation') as HTMLInputElement;
    const reportDurum = document.getElementById('reportDurum') as HTMLSelectElement;
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

    const normalizeText = (text: string | null | undefined): string => String(text || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .trim();

    const resolveStationForReport = (query: string): string => {
      const normalizedQuery = normalizeText(query);
      if (!normalizedQuery) return '';
      const stationInput = reportStation.value.trim();
      if (stationInput && normalizedQuery.includes(normalizeText(stationInput))) return stationInput;
      return '';
    };

    const createMmsReportPdf = async (openInNewWindow = false) => {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = 'Yükleniyor...';

      const params = new URLSearchParams();
      params.set('limit', '10000');
      if (reportStation.value) params.set('istasyon', reportStation.value);
      if (reportDurum.value) {
        if (reportDurum.value === 'Beklemede') {
          params.set('durum', '');
        } else {
          params.set('durum', reportDurum.value);
        }
      }

      try {
        const response = await fetch(`/api/mms?${params}`);
        const data = await response.json();
        
        let reportData = data.records || [];
        
        // Tarihe göre filtrele
        if (!reportAllDates?.checked && (reportStartDate.value || reportEndDate.value)) {
          reportData = reportData.filter((r: any) => {
            const recordDate = new Date(r.zaman_damgasi);
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
            { text: 'Tarih', style: 'tableHeader' },
            { text: 'İstasyon', style: 'tableHeader' },
            { text: 'Bildiren', style: 'tableHeader' },
            { text: 'Arıza Tanımı', style: 'tableHeader' },
            { text: 'Durum', style: 'tableHeader' },
          ],
          ...reportData.map((r: any) => [
            String(r.mms_numarasi || '-'),
            r.zaman_damgasi ? new Date(r.zaman_damgasi).toLocaleDateString('tr-TR') : '-',
            String(r.istasyon || '-'),
            String(r.acan_ad_soyad || '-'),
            String(r.ariza_tanimi || '-'),
            String(r.durum || 'Beklemede'),
          ]),
        ];

        const content: any[] = [
          { text: 'MMS Arıza Raporu', style: 'title' },
          { text: `Tarih Aralığı: ${dateRangeText}`, style: 'subtitle' },
        ];
        if (reportStation.value) content.push({ text: `İstasyon: ${reportStation.value}`, style: 'subtitle' });
        if (reportDurum.value) content.push({ text: `Durum: ${reportDurum.value}`, style: 'subtitle' });
        content.push({
          table: {
            headerRows: 1,
            widths: [52, 48, 65, 75, '*', 56],
            body: tableBody,
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? '#667eea' : rowIndex % 2 === 0 ? '#f8fafc' : null),
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

        const fileName = `MMS_Rapor_${new Date().toISOString().split('T')[0]}.pdf`;
        if (openInNewWindow) {
          pdfMakeApi.createPdf(docDefinition).getBlob((blob: Blob) => {
            const blobUrl = URL.createObjectURL(blob);
            const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            if (!opened) {
              pdfMakeApi.createPdf(docDefinition).download(fileName);
            }
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
      await createMmsReportPdf(false);
    });

    const autoReport = pageParams.get('report');
    const autoAllStations = pageParams.get('allStations');
    const autoStation = pageParams.get('station');
    const autoStationQuery = pageParams.get('stationQuery');
    const shouldAutoReport = autoReport === 'pdf';
    if (shouldAutoReport) {
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
      setTimeout(() => { createMmsReportPdf(true); }, 120);
    }

    getUserRole().finally(async () => {
      await loadRecords();
      await tryOpenEditFromQuery();
    });

export function initMms(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
