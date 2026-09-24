// izin-istegi istemcisi. izin-istegi.astro tarafından bundled <script> ile çağrılır.
// State
  const SABIT_BIRIM = '1/ V Trafik ve İstasyon Yönetim Müdürlüğü';
  let selectedType: string | null = null;
  let personelData: any = null;

  // Elements
  const createNewBtn = document.getElementById('createNewBtn');
  const personelInfo = document.getElementById('personelInfo');
  const typeModal = document.getElementById('typeModal');
  const izinModal = document.getElementById('izinModal');
  const pdfModal = document.getElementById('pdfModal');
  const typeBtns = document.querySelectorAll('.type-btn');
  const continueTypeBtn = document.getElementById('continueTypeBtn') as HTMLButtonElement;
  const previewPdfBtn = document.getElementById('previewPdfBtn');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const printPdfBtn = document.getElementById('printPdfBtn');

  // Sayfa yüklendiğinde kullanıcı bilgilerini getir
  async function loadPersonelData() {
    try {
      const res = await fetch('/api/user/profile');
      const data = await res.json();

      if (!res.ok || !data.user) return;

      const user = data.user;
      personelData = {
        id: null,
        user_id: user.id,
        ad_soyad: user.full_name || '',
        birim: SABIT_BIRIM,
        gorevi: user.gorevi || '',
        izindeki_adres: null,
      };
      showPersonelInfo();
    } catch (err) {
      console.error('Personel bilgisi yüklenemedi:', err);
    }
  }

  function showPersonelInfo() {
    if (!personelData) return;
    
    document.getElementById('infoAdSoyad')!.textContent = personelData.ad_soyad;
    document.getElementById('infoBirim')!.textContent = personelData.birim;
    document.getElementById('infoGorevi')!.textContent = personelData.gorevi || '-';
    personelInfo!.style.display = 'block';
  }

  // Sayfa yüklendiğinde personel bilgilerini getir
  loadPersonelData();

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      const modal = document.getElementById(modalId!);
      if (modal) modal.style.display = 'none';
    });
  });

  // Close modal on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        (modal as HTMLElement).style.display = 'none';
      }
    });
  });

  // Create new button
  createNewBtn?.addEventListener('click', () => {
    selectedType = null;
    typeBtns.forEach(btn => btn.classList.remove('selected'));
    continueTypeBtn.disabled = true;
    typeModal!.style.display = 'flex';
  });

  // Type selection
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedType = btn.getAttribute('data-type');
      updateContinueBtn();
    });
  });

  function updateContinueBtn() {
    continueTypeBtn.disabled = !selectedType;
  }

  // Continue from type selection
  continueTypeBtn?.addEventListener('click', async () => {
    typeModal!.style.display = 'none';

    if (!personelData) {
      await loadPersonelData();
    }
    if (!personelData?.ad_soyad || !personelData?.birim || !personelData?.gorevi) {
      alert('İzin oluşturmak için ad soyad, birim ve görev bilgileri dolu olmalı.');
      return;
    }

    openIzinForm();
  });

  function openIzinForm() {
    if (!personelData) return;

    // Personel bilgilerini doldur
    (document.getElementById('izinAdSoyad') as HTMLInputElement).value = personelData.ad_soyad;
    (document.getElementById('izinBirim') as HTMLInputElement).value = personelData.birim;
    (document.getElementById('izinGorevi') as HTMLInputElement).value = personelData.gorevi || '';
    (document.getElementById('personelId') as HTMLInputElement).value = personelData.id || '';
    (document.getElementById('izinTuru') as HTMLInputElement).value = selectedType!;
    (document.getElementById('izindekiAdres') as HTMLInputElement).value = personelData.izindeki_adres || '';

    // Yıl
    const currentYear = new Date().getFullYear();
    (document.getElementById('aitOlduguYil') as HTMLInputElement).value = currentYear.toString();

    // İzin türü gösterimi
    const typeLabels: Record<string, string> = {
      'yillik': '🏖️ Yıllık İzin',
      'mazeret': '📋 Mazeret İzni',
      'hastalik': '🏥 Hastalık İzni',
      'ucretsiz': '💼 Ücretsiz İzin'
    };
    document.getElementById('izinTuruDisplay')!.textContent = typeLabels[selectedType!] || selectedType!;

    // Bugünün tarihi
    const today = new Date();
    const dateStr = today.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    (document.getElementById('istemTarihi') as HTMLInputElement).value = dateStr;
    document.getElementById('signatureName')!.textContent = personelData.ad_soyad;

    // Tarih alanlarını ayarla
    const todayISO = today.toISOString().split('T')[0];
    (document.getElementById('baslangicTarihi') as HTMLInputElement).value = todayISO;
    (document.getElementById('bitisTarihi') as HTMLInputElement).min = todayISO;

    izinModal!.style.display = 'flex';
  }

  // Tarih değişikliğinde gün sayısını hesapla
  const baslangicInput = document.getElementById('baslangicTarihi') as HTMLInputElement;
  const bitisInput = document.getElementById('bitisTarihi') as HTMLInputElement;
  const gunSayisiInput = document.getElementById('izinGunSayisi') as HTMLInputElement;
  const isBasiInput = document.getElementById('isBasiTarihi') as HTMLInputElement;

  function formatInputDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function updateIsBasiTarihi() {
    if (!bitisInput?.value) return;
    const bitisDate = new Date(bitisInput.value + 'T00:00:00');
    if (Number.isNaN(bitisDate.getTime())) return;

    bitisDate.setDate(bitisDate.getDate() + 1);
    isBasiInput.value = formatInputDate(bitisDate);
  }

  function calculateDays() {
    if (!baslangicInput?.value || !bitisInput?.value) return;
    const start = new Date(baslangicInput.value);
    const end = new Date(bitisInput.value);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      gunSayisiInput.value = diffDays.toString();
    }
  }

  baslangicInput?.addEventListener('change', () => {
    bitisInput.min = baslangicInput.value;
    calculateDays();
  });

  bitisInput?.addEventListener('change', () => {
    calculateDays();
    updateIsBasiTarihi();
  });

  // PDF Preview
  previewPdfBtn?.addEventListener('click', async () => {
    const form = document.getElementById('izinForm') as HTMLFormElement;
    const formData = new FormData(form);
    const data: any = {};
    formData.forEach((value, key) => data[key] = value);

    if (!data.baslangic_tarihi || !data.bitis_tarihi || !data.izin_gun_sayisi) {
      alert('Lütfen tüm zorunlu alanları doldurun');
      return;
    }

    // İzin isteğini veritabanına kaydet
    try {
      const saveRes = await fetch('/api/izin-istegi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personel_id: data.personel_id || null,
          ad_soyad: data.ad_soyad,
          birim: SABIT_BIRIM,
          gorevi: personelData?.gorevi || '',
          izin_turu: data.izin_turu,
          baslangic_tarihi: data.baslangic_tarihi,
          bitis_tarihi: data.bitis_tarihi,
          izin_gun_sayisi: Number(data.izin_gun_sayisi),
          yol_izni: Number(data.yol_izni || 0),
          kalan_izin: data.kalan_izin ? Number(data.kalan_izin) : null,
          is_basi_tarihi: data.is_basi_tarihi || null,
          aciklama: data.aciklama || null,
          izindeki_adres: data.izindeki_adres || null
        })
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok || !saveJson?.success) {
        throw new Error(saveJson?.error || 'İzin isteği kaydedilemedi');
      }
    } catch (err: any) {
      alert(err?.message || 'İzin isteği oluşturulamadı');
      return;
    }

    generatePdfPreview(data);

    izinModal!.style.display = 'none';
    pdfModal!.style.display = 'flex';
  });

  function generatePdfPreview(data: any) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const baslangic = new Date(data.baslangic_tarihi).toLocaleDateString('tr-TR');
    const bitis = new Date(data.bitis_tarihi).toLocaleDateString('tr-TR');
    const isBasiTarihi = data.is_basi_tarihi ? new Date(data.is_basi_tarihi).toLocaleDateString('tr-TR') : '';
    const yillikChecked = data.izin_turu === 'yillik' ? '☑' : '☐';
    const mazeretChecked = data.izin_turu === 'mazeret' ? '☑' : '☐';
    const hastalikChecked = data.izin_turu === 'hastalik' ? '☑' : '☐';
    const ucretsizChecked = data.izin_turu === 'ucretsiz' ? '☑' : '☐';

    const html = '<div style="font-family: Arial, sans-serif; max-width: 750px; margin: 0 auto; padding: 20px; color: #000; font-size: 11px;">' +
      '<!-- Header with Model Number -->' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">' +
        '<div style="flex: 1;"></div>' +
        '<div style="text-align: right;">' +
          '<span style="color: #0066cc; font-weight: bold;">(8005)</span>' +
        '</div>' +
      '</div>' +
      
      '<!-- Title and Notes -->' +
      '<div style="display: flex; gap: 30px; margin-bottom: 15px;">' +
        '<div style="flex: 1;">' +
          '<h2 style="margin: 0; font-size: 14px; font-weight: bold;">İZİN İSTEĞİ VE ONAYI</h2>' +
        '</div>' +
        '<div style="flex: 1.5; font-size: 10px; color: #0066cc;">' +
          '<p style="margin: 0;"><strong>DİKKAT:</strong> 1. Bu form Kamu kuruluşlarında görevli izinlerinin istem ve onayında kullanılır</p>' +
          '<p style="margin: 5px 0 0;">2. Form memurun izin dönüşünde 711.002 "İşe başlama ve Ayrılma Bildiriminin" ekinde ilgili birime gönderilir.</p>' +
        '</div>' +
      '</div>' +
      
      '<!-- İzin Türü Seçimi -->' +
      '<div style="display: flex; justify-content: center; gap: 40px; margin: 25px 0; font-size: 12px;">' +
        '<span><span style="font-size: 14px;">' + yillikChecked + '</span> YILLIK İZİN</span>' +
        '<span><span style="font-size: 14px;">' + mazeretChecked + '</span> MAZERET</span>' +
        '<span><span style="font-size: 14px;">' + hastalikChecked + '</span> HASTALIK</span>' +
        '<span><span style="font-size: 14px;">' + ucretsizChecked + '</span> ÜCRETSİZ</span>' +
      '</div>' +
      
      '<!-- Ana Tablo -->' +
      '<table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">' +
        '<!-- Satır 1: Birimi, Sicil No, Ait Olduğu Yıl -->' +
        '<tr>' +
          '<td style="border: 1px solid #000; padding: 6px; width: 15%;"><strong>Birimi:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px; width: 25%;">' + (data.birim || '') + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px; width: 12%;"><strong>Sicil No:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px; width: 20%;">' + (data.sicil_no || '') + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px; width: 15%;"><strong>Ait Olduğu Yıl:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px; width: 13%;">' + (data.ait_oldugu_yil || new Date().getFullYear()) + '</td>' +
        '</tr>' +
        '<!-- Satır 2: Adı Soyadı, Başlangıç, Bitiş -->' +
        '<tr>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Adı Soyadı:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + (data.ad_soyad || '') + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Başlangıç Tarihi:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + baslangic + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Bitiş Tarihi:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + bitis + '</td>' +
        '</tr>' +
        '<!-- Satır 3: Görevi, Yol İzni, Kullanacağı İzin -->' +
        '<tr>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Görevi:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + (data.gorevi || '') + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Yol izni:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + (data.yol_izni || '') + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Kullanacağı İzin Toplamı:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + (data.izin_gun_sayisi || '') + '</td>' +
        '</tr>' +
        '<!-- Satır 4: Boş, Kalan İzin, İş Başı Tarihi -->' +
        '<tr>' +
          '<td style="border: 1px solid #000; padding: 6px;"></td>' +
          '<td style="border: 1px solid #000; padding: 6px;"></td>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Kalan izin:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + (data.kalan_izin || '') + '</td>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>İş başı tarihi:</strong></td>' +
          '<td style="border: 1px solid #000; padding: 6px;">' + isBasiTarihi + '</td>' +
        '</tr>' +
        '<!-- Satır 5: Açıklama -->' +
        '<tr>' +
          '<td style="border: 1px solid #000; padding: 6px;"><strong>Açıklama:</strong></td>' +
          '<td colspan="5" style="border: 1px solid #000; padding: 6px;">' + (data.aciklama || '') + '</td>' +
        '</tr>' +
        '<!-- Satır 6: İzindeki Adres Başlık -->' +
        '<tr>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px;"><strong>İzindeki Adresi:</strong></td>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px;"><strong>İstemde bulunanın tarihi, imzası:</strong></td>' +
        '</tr>' +
        '<!-- Satır 7: İzindeki Adres Değer -->' +
        '<tr>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px; height: 30px;">' + (data.izindeki_adres || '') + '</td>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px; height: 30px;">' + dateStr + '</td>' +
        '</tr>' +
        '<!-- Satır 8: İmza Bölümleri Başlık -->' +
        '<tr>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px;"><strong>İzin Veren yetkilinin adı soyadı, ünvanı, imzası:</strong></td>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px;"><strong>Onaylayanın adı soyadı, ünvanı, imzası:</strong></td>' +
        '</tr>' +
        '<!-- Satır 9-10: İmza Alanları -->' +
        '<tr>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px; height: 80px; vertical-align: top;"></td>' +
          '<td colspan="3" style="border: 1px solid #000; padding: 6px; height: 80px; vertical-align: top;"></td>' +
        '</tr>' +
      '</table>' +
    '</div>';

    document.getElementById('pdfPreview')!.innerHTML = html;
  }

  // Print PDF
  printPdfBtn?.addEventListener('click', () => {
    const content = document.getElementById('pdfPreview')!.innerHTML;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(
        '<!DOCTYPE html><html><head><title>İzin İsteği Formu - 8005</title>' +
        '<style>body { margin: 0; padding: 20px; } @media print { body { padding: 0; } }</style>' +
        '</head><body>' + content + 
        '<scr' + 'ipt>window.onload = function() { window.print(); }</scr' + 'ipt>' +
        '</body></html>'
      );
      printWindow.document.close();
    }
  });

  // Download PDF
  downloadPdfBtn?.addEventListener('click', async () => {
    const content = document.getElementById('pdfPreview')!.innerHTML;
    
    // Create a blob with the HTML content
    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<title>İzin İsteği Formu - 8005</title></head><body>' + content + '</body></html>';
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'izin-istegi-' + new Date().toISOString().split('T')[0] + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Load existing requests
  async function loadRequests() {
    try {
      const res = await fetch('/api/izin-istegi');
      const data = await res.json();
      
      if (data.istekler && data.istekler.length > 0) {
        document.getElementById('requestsList')!.style.display = 'block';
        // Render requests...
      }
    } catch (err) {
      console.error('İstekler yüklenemedi:', err);
    }
  }

  // Initial load
  loadRequests();

  // Modal açıkken body scroll-lock (mobilde yanlış dokunma/scroll sapmasını azaltır)
  const allModals = Array.from(document.querySelectorAll('.modal')) as HTMLElement[];
  allModals.forEach((modal) => {
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  });

  const syncModalLock = () => {
    const hasOpenModal = allModals.some((modal) => getComputedStyle(modal).display !== 'none');
    document.body.classList.toggle('modal-open', hasOpenModal);
  };

  const modalObserver = new MutationObserver(syncModalLock);
  allModals.forEach((modal) => {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
  });
  syncModalLock();

export function initIzinIstegi(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
