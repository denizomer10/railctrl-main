// kayip-esya istemcisi. kayip-esya.astro tarafından bundled <script> ile çağrılır.

    const chips = document.querySelectorAll('.chip');
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
    const durumGroup = document.getElementById('durumGroup') as HTMLElement;
    const deleteRecordBtn = document.getElementById('deleteRecordBtn') as HTMLButtonElement;
    const reportStartDate = document.getElementById('reportStartDate') as HTMLInputElement;
    const reportEndDate = document.getElementById('reportEndDate') as HTMLInputElement;
    const reportAllDates = document.getElementById('reportAllDates') as HTMLInputElement;
    const reportDateRangeRow = document.getElementById('reportDateRangeRow') as HTMLElement;
    const reportDurum = document.getElementById('reportDurum') as HTMLSelectElement;
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchClear = document.getElementById('searchClear') as HTMLElement;
    const tarihInput = document.getElementById('tarih') as HTMLInputElement;
    // Initialize search input from URL
    const initialSearch = new URLSearchParams(window.location.search).get('search');
    if (initialSearch && searchInput) {
      searchInput.value = initialSearch;
      searchClear.style.display = 'flex';
    }
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

let currentDurum: string | null = null;
    let currentPage = 1;
    let totalPages = 1;
    const limit = 30;
    let editingId: number | null = null;
    let currentUserRole = 'user';
    const pageParams = new URLSearchParams(window.location.search);
    const autoEditId = Number.parseInt(pageParams.get('editId') || '', 10);
    const autoViewId = Number.parseInt(pageParams.get('viewId') || '', 10);

    function clearAutoQueryParams() {
      const next = new URLSearchParams(window.location.search);
      next.delete('editId');
      next.delete('viewId');
      next.delete('src');
      const qs = next.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }

    function canEditKayipEsya() {
      return currentUserRole === 'user' || currentUserRole === 'sef' || currentUserRole === 'admin';
    }

    function canDeleteKayipEsya() {
      return currentUserRole === 'sef' || currentUserRole === 'admin';
    }

    // Kullanıcı rolü
    async function getUserRole() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          currentUserRole = data.user?.role || 'user';
        }
      } catch (e) { currentUserRole = 'user'; }
    }

    async function tryOpenEditFromQuery() {
      if (!Number.isFinite(autoEditId)) return;
      clearAutoQueryParams();
      try {
        const res = await fetch(`/api/kayip-esya/${autoEditId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data?.record) throw new Error(data?.error || 'Kayıt bulunamadı');
        openEditModal(data.record);
      } catch (error: any) {
        alert(`Düzenleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
      }
    }

    async function tryOpenViewFromQuery() {
      if (!Number.isFinite(autoViewId)) return;
      clearAutoQueryParams();
      try {
        const res = await fetch(`/api/kayip-esya/${autoViewId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data?.record) throw new Error(data?.error || 'Kayıt bulunamadı');
        openEditModal(data.record, true);
      } catch (error: any) {
        alert(`Görüntüleme penceresi açılamadı: ${error.message || 'Bilinmeyen hata'}`);
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

    bindDatePickerOpen(tarihInput);
    bindDatePickerOpen(reportStartDate);
    bindDatePickerOpen(reportEndDate);

    function applyReportAllDatesState() {
      const allDates = Boolean(reportAllDates?.checked);
      if (reportDateRangeRow) reportDateRangeRow.style.display = allDates ? 'none' : 'grid';
    }
    reportAllDates?.addEventListener('change', applyReportAllDatesState);
    applyReportAllDatesState();

    function getStatusBadge(durum: string | null) {
      const d = (durum || '').toLowerCase();
      // Gerçek veritabanı değerlerine göre sınıflandırma
      if (d.includes('teslim') && !d.includes('iett')) return `<span class="status-badge status-success">✅ Teslim Edildi</span>`;
      if (d.includes('imha') || d.includes('iett')) return `<span class="status-badge status-danger">🗑️ İmha Edildi</span>`;
      if (d.includes('büroda') || d.includes('depoda') || d === 'depoda') return `<span class="status-badge status-info">📦 Depoda</span>`;
      if (d === '' || d.includes('tcdd hesab') || d.includes('işlem no')) return `<span class="status-badge status-warning">⏳ Beklemede</span>`;
      return `<span class="status-badge status-secondary">📋 ${durum || 'Belirsiz'}</span>`;
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
      tableBody.innerHTML = `<tr class="loading-row"><td colspan="6"><div class="loading-state"><div class="spinner"></div><span>Yükleniyor...</span></div></td></tr>`;
      noResults.style.display = 'none';

      try {
        const params = new URLSearchParams();
        // Use current URL search params
        const currentSearch = new URLSearchParams(window.location.search).get('search');
        if (currentSearch) params.set('search', currentSearch);
        if (currentDurum !== null) params.set('durum', currentDurum);
params.set('page', currentPage.toString());
        params.set('limit', limit.toString());

        const response = await fetch(`/api/kayip-esya?${params}`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        tableBody.innerHTML = '';

        // Stats - backend'den gelen istatistikleri kullan
        const total = document.getElementById('totalCount');
        const bekleyen = document.getElementById('bekleyenCount');
        const teslim = document.getElementById('teslimCount');
        const imha = document.getElementById('imhaCount');
        const depo = document.getElementById('depoCount');
        
        // Backend'den gelen stats objesini kullan
        if (data.stats) {
          if (total) total.textContent = data.stats.total?.toString() || '0';
          if (bekleyen) bekleyen.textContent = data.stats.beklemede?.toString() || '0';
          if (teslim) teslim.textContent = data.stats.teslim?.toString() || '0';
          if (imha) imha.textContent = data.stats.imha?.toString() || '0';
          if (depo) depo.textContent = data.stats.depo?.toString() || '0';
        }

        if (data.records.length === 0) {
          noResults.style.display = 'block';
          paginationContainer.style.display = 'none';
          return;
        }

        data.records.forEach((r: any) => {
          const row = document.createElement('tr');
          const tarih = r.tarih ? new Date(r.tarih).toLocaleDateString('tr-TR') : '-';
          
          row.innerHTML = `
            <td data-label="Belge No"><span class="belge-no">${r.belge_no || '-'}</span></td>
            <td data-label="Tarih"><span class="date-cell">${tarih}</span></td>
            <td class="esya-cell" data-label="Eşya Tanımı" title="${r.esya_tanimi || ''}">${(r.esya_tanimi || '-').substring(0, 60)}${(r.esya_tanimi?.length > 60) ? '...' : ''}</td>
            <td data-label="Durum">${getStatusBadge(r.durumu)}</td>
            <td data-label="Eşya Sahibi">${r.esya_sahibi_ad_soyad || '-'}</td>
            <td data-label="İşlem"><div class="action-btns"><button class="btn-action btn-edit" data-id="${r.id}">✏️</button></div></td>
          `;
          
          row.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(r));
          tableBody.appendChild(row);
        });
        
        const paginationTotalCount = Number(data.pagination?.totalCount ?? data.stats?.total ?? data.records?.length ?? 0);
        totalPages = Math.max(1, Number(data.pagination?.totalPages ?? Math.ceil(paginationTotalCount / limit) ?? 1));
        renderPagination();
      } catch (error: any) {
        console.error('Load error:', error);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#dc2626;">Hata: ${error.message}</td></tr>`;
      }
    }

    function openEditModal(record: any, viewOnly: boolean = false) {
      editingId = record.id;
      modalTitle.textContent = viewOnly ? 'Kayıp Eşya Kaydı' : 'Kaydı Düzenle';
      (document.getElementById('recordId') as HTMLInputElement).value = record.id;
      (document.getElementById('belge_no') as HTMLInputElement).value = record.belge_no || '';
      (document.getElementById('tarih') as HTMLInputElement).value = record.tarih ? record.tarih.split('T')[0] : '';
      (document.getElementById('esya_tanimi') as HTMLTextAreaElement).value = record.esya_tanimi || '';
      (document.getElementById('durumu') as HTMLSelectElement).value = record.durumu || '';
      (document.getElementById('esya_sahibi_ad_soyad') as HTMLInputElement).value = record.esya_sahibi_ad_soyad || '';
      (document.getElementById('esya_sahibi_tel') as HTMLInputElement).value = record.esya_sahibi_tel || '';
      (document.getElementById('teslim_alan') as HTMLInputElement).value = record.teslim_alan || '';
      (document.getElementById('buroya_teslim_eden') as HTMLInputElement).value = record.buroya_teslim_eden || '';
      (document.getElementById('teslim_alan_buro_gorevlisi') as HTMLInputElement).value = record.teslim_alan_buro_gorevlisi || '';
      
      durumGroup.style.display = 'block';
      
      const canEdit = viewOnly ? false : canEditKayipEsya();
      deleteRecordBtn.style.display = (!viewOnly && canDeleteKayipEsya()) ? 'block' : 'none';
      
      // Tüm alanları etkinleştir/devre dışı bırak
      const inputs = recordForm.querySelectorAll('input:not([type="hidden"]), select, textarea');
      inputs.forEach((input: any) => {
        input.disabled = !canEdit;
      });
      
      formMessage.style.display = 'none';
      showModal(modal);
    }

    newRecordBtn?.addEventListener('click', () => {
      editingId = null;
      modalTitle.textContent = 'Yeni Kayıp Eşya Kaydı';
      recordForm.reset();
      durumGroup.style.display = 'none';
      deleteRecordBtn.style.display = 'none';
      
      // Yeni kayıtta tarih alanını bugünün tarihi yap
      (document.getElementById('tarih') as HTMLInputElement).value = new Date().toISOString().split('T')[0];
      
      // Tüm alanları etkinleştir
      const inputs = recordForm.querySelectorAll('input:not([type="hidden"]), select, textarea');
      inputs.forEach((input: any) => {
        input.disabled = false;
      });
      
      formMessage.style.display = 'none';
      showModal(modal);
    });

    closeModal?.addEventListener('click', () => hideModal(modal));
    cancelBtn?.addEventListener('click', () => hideModal(modal));
    modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(modal); });

    recordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload: any = {
        belge_no: (document.getElementById('belge_no') as HTMLInputElement).value,
        tarih: (document.getElementById('tarih') as HTMLInputElement).value,
        esya_tanimi: (document.getElementById('esya_tanimi') as HTMLTextAreaElement).value,
        esya_sahibi_ad_soyad: (document.getElementById('esya_sahibi_ad_soyad') as HTMLInputElement).value,
        esya_sahibi_tel: (document.getElementById('esya_sahibi_tel') as HTMLInputElement).value,
        teslim_alan: (document.getElementById('teslim_alan') as HTMLInputElement).value,
        buroya_teslim_eden: (document.getElementById('buroya_teslim_eden') as HTMLInputElement).value,
        teslim_alan_buro_gorevlisi: (document.getElementById('teslim_alan_buro_gorevlisi') as HTMLInputElement).value,
      };
      if (editingId) {
        payload.durumu = (document.getElementById('durumu') as HTMLSelectElement).value;
      }

      try {
        const url = editingId ? `/api/kayip-esya/${editingId}` : '/api/kayip-esya';
        const method = editingId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        formMessage.className = 'form-message success';
        formMessage.textContent = editingId ? 'Güncellendi!' : 'Oluşturuldu!';
        formMessage.style.display = 'block';

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
      if (!canDeleteKayipEsya()) return;
      if (!editingId || !confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return;
      
      try {
        const response = await fetch(`/api/kayip-esya/${editingId}`, { method: 'DELETE', credentials: 'include' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        hideModal(modal);
        currentPage = 1;
        loadRecords();
      } catch (error: any) {
        alert('Silme hatası: ' + error.message);
      }
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

    // Search functionality
    searchInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      searchClear.style.display = value ? 'flex' : 'none';
      // Update URL search param
      const url = new URL(window.location.href);
      if (value) url.searchParams.set('search', value);
      else url.searchParams.delete('search');
      window.history.replaceState({}, '', url);
      currentPage = 1;
      loadRecords();
    });

    searchClear?.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      // Update URL search param
      const url = new URL(window.location.href);
      url.searchParams.delete('search');
      window.history.replaceState({}, '', url);
      currentPage = 1;
      loadRecords();
    });

    
    // Rapor modal davranisi
    reportBtn?.addEventListener('click', () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (reportStartDate) reportStartDate.value = thirtyDaysAgo.toISOString().split('T')[0];
      if (reportEndDate) reportEndDate.value = today.toISOString().split('T')[0];
      if (reportAllDates) reportAllDates.checked = false;
      applyReportAllDatesState();
      if (reportDurum) reportDurum.value = '';
      showModal(reportModal);
    });

    closeReportModal?.addEventListener('click', () => hideModal(reportModal));
    reportModal?.addEventListener('click', (e) => { if (e.target === reportModal) hideModal(reportModal); });

    const normalizeText = (text) => String(text || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .trim();

    const resolveDurumForReport = (query) => {
      const said = normalizeText(query);
      if (!said) return '';
      if (said.includes('teslim')) return 'Teslim Edildi';
      if (said.includes('imha')) return 'İmha Edildi';
      if (said.includes('depo') || said.includes('buroda')) return 'Büroda';
      if (said.includes('beklemede') || said.includes('bekleyen')) return 'Beklemede';
      return '';
    };

    const createKayipEsyaReportPdf = async (openInNewWindow = false) => {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = 'Yükleniyor...';

      try {
        const params = new URLSearchParams();
        params.set('limit', '10000');
        if (reportDurum?.value) {
          params.set('durum', reportDurum.value === 'Beklemede' ? '' : reportDurum.value);
        }

        const response = await fetch(`/api/kayip-esya?${params}`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Rapor verisi alınamadı');

        let reportData = data.records || [];
        if (!reportAllDates?.checked && (reportStartDate?.value || reportEndDate?.value)) {
          reportData = reportData.filter((r: any) => {
            const recordDate = new Date(r.tarih);
            if (reportStartDate?.value && recordDate < new Date(reportStartDate.value)) return false;
            if (reportEndDate?.value && recordDate > new Date(`${reportEndDate.value}T23:59:59`)) return false;
            return true;
          });
        }

        if (reportData.length === 0) {
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
            { text: 'Belge No', style: 'tableHeader' },
            { text: 'Tarih', style: 'tableHeader' },
            { text: 'Eşya Tanımı', style: 'tableHeader' },
            { text: 'Durum', style: 'tableHeader' },
            { text: 'Eşya Sahibi', style: 'tableHeader' },
          ],
          ...reportData.map((r: any) => [
            String(r.belge_no || '-'),
            r.tarih ? new Date(r.tarih).toLocaleDateString('tr-TR') : '-',
            String(r.esya_tanimi || '-'),
            String(r.durumu || 'Beklemede'),
            String(r.esya_sahibi_ad_soyad || '-'),
          ]),
        ];

        const content: any[] = [
          { text: 'Kayıp Eşya Raporu', style: 'title' },
          { text: `Tarih Aralığı: ${dateRangeText}`, style: 'subtitle' },
        ];
        if (reportDurum?.value) content.push({ text: `Durum: ${reportDurum.value}`, style: 'subtitle' });
        content.push({
          table: {
            headerRows: 1,
            widths: [70, 52, '*', 70, 95],
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

        const fileName = `Kayip_Esya_Rapor_${new Date().toISOString().split('T')[0]}.pdf`;
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
      } catch (error: any) {
        alert(error.message || 'Rapor oluşturulurken hata oluştu');
      } finally {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = '📄 PDF Oluştur';
      }
    };

    downloadPdfBtn?.addEventListener('click', async () => {
      await createKayipEsyaReportPdf(false);
    });

    const autoReport = pageParams.get('report');
    const autoDurum = pageParams.get('durum');
    const autoDurumQuery = pageParams.get('durumQuery');
    if (autoReport === 'pdf') {
      const chosenDurum = autoDurum || resolveDurumForReport(autoDurumQuery || '') || resolveDurumForReport(pageParams.get('search') || '');
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('report');
      nextParams.delete('durum');
      nextParams.delete('durumQuery');
      const nextQuery = nextParams.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`);
      if (chosenDurum) reportDurum.value = chosenDurum;
      reportAllDates.checked = true;
      applyReportAllDatesState();
      setTimeout(() => { createKayipEsyaReportPdf(true); }, 120);
    }

    getUserRole().finally(async () => {
      await loadRecords();
      await tryOpenViewFromQuery();
      await tryOpenEditFromQuery();
    });

export function initKayipEsya(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
