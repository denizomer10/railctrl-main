// vardiya istemcisi. vardiya.astro tarafından bundled <script> ile çağrılır.
import type { PersonnelModel, WeekShiftModel, ShiftType, WeekKey, OffDay } from '../lib/vardiya';

type SchedulePerson = { fullName?: string; offDay?: string; week_shifts?: Partial<WeekShiftModel>; izinler?: LeaveEntry[] };
type ScheduleDay = { date: string; dayName: string; week: number; shift: ShiftType };
type ScheduleRecord = {
  id: string | number;
  istasyon: string;
  yil: number;
  ay: number;
  week_shifts: WeekShiftModel;
  personel: SchedulePerson[];
  takvim?: ScheduleDay[];
};
type LeaveEntry = { date: string; code: string };
type PdfMakeApi = { createPdf: (definition: unknown) => { download: (filename: string) => void } };
type ExcelJsApi = { Workbook: new () => any };

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} was not found`);
  return element as T;
}

declare global {
  interface Window {
    pdfMake?: PdfMakeApi;
    ExcelJS?: ExcelJsApi;
  }
}

const vardiyaRoot = document.getElementById("vardiya-root");
  const isManager = vardiyaRoot?.dataset.isManager === "1";
  const userStation = vardiyaRoot?.dataset.userStation || null;
  const monthFilter = document.getElementById('monthFilter') as HTMLSelectElement | null;
  const stationFilter = document.getElementById('stationFilter') as HTMLSelectElement | null;
  const currentCard = document.getElementById('currentCard') as HTMLElement | null;
  const cardTitle = document.getElementById('cardTitle') as HTMLElement | null;
  const weekSummary = document.getElementById('weekSummary') as HTMLElement | null;
  const matrixSvgWrap = document.getElementById('matrixSvgWrap') as HTMLElement | null;
  const message = document.getElementById('message') as HTMLElement | null;
  const printBtn = document.getElementById('printBtn') as HTMLButtonElement | null;
  const excelBtn = document.getElementById('excelBtn') as HTMLButtonElement | null;
  const editBtn = document.getElementById('editBtn') as HTMLButtonElement | null;
  const deleteBtn = document.getElementById('deleteBtn') as HTMLButtonElement | null;
  const currentYear = new Date().getFullYear();
  const pageParams = new URLSearchParams(window.location.search);
  const autoEditId = Number.parseInt(pageParams.get('editId') || '', 10);
  let openPlanModalForEdit: (() => void) | null = null;

  let currentRecord: ScheduleRecord | null = null;
  const monthNames = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  const dayShort: Record<string, string> = {
    Pazartesi: 'PT',
    Salı: 'SA',
    Çarşamba: 'CA',
    Perşembe: 'PE',
    Cuma: 'CU',
    Cumartesi: 'CT',
    Pazar: 'PZ',
  };
  const dayByIndex: Record<number, string> = {
    1: 'Pazartesi',
    2: 'Salı',
    3: 'Çarşamba',
    4: 'Perşembe',
    5: 'Cuma',
    6: 'Cumartesi',
    0: 'Pazar',
  };
  const leaveTypeLabels: Record<string, string> = {
    YI: 'Yıllık İzin',
    MI: 'Mazeret İzni',
    UOG: 'Ücretsiz İzin',
    EL: 'Evlenme İzni',
    DI: 'Doğum İzni',
    OL: 'Ölüm İzni',
    R: 'Raporlu',
    RT: 'Resmi Tatil',
    TKS: 'Takas',
    IDR: 'İdari İzin',
  };

  function showMessage(text: string, type: 'ok' | 'err' | 'warn' = 'ok') {
    if (!message) return;
    message.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';
    if (type !== 'warn') {
      setTimeout(() => {
        message.style.display = 'none';
      }, 2600);
    }
  }

  function shiftLabel(shift: string | null | undefined) {
    if (shift === 'sabah') return 'Sabah (08:00-16:00)';
    if (shift === 'ara') return 'Ara (16:00-00:00)';
    if (shift === 'gece') return 'Gece (00:00-08:00)';
    return '-';
  }

  function shiftMeta(shift: string | null | undefined) {
    if (shift === 'sabah') return { start: '08:00', end: '16:00', code: '3-1' };
    if (shift === 'ara') return { start: '16:00', end: '24:00', code: '3-2' };
    if (shift === 'gece') return { start: '00:00', end: '08:00', code: '3-3' };
    return { start: '', end: '', code: '' };
  }

  function formatMonthYear(month: number | string, year: number | string) {
    const monthIndex = Math.max(1, Math.min(12, Number(month) || 1)) - 1;
    const monthLabel = monthNames[monthIndex] || String(month);
    return `${monthLabel} ${year}`;
  }

  function shiftByWeekIndex(weekShifts: Partial<WeekShiftModel> | null | undefined, index: number): ShiftType {
    const safeIndex = Math.max(1, Math.min(5, Number(index) || 1));
    if (safeIndex === 1) return weekShifts?.hafta1 || 'sabah';
    if (safeIndex === 2) return weekShifts?.hafta2 || 'sabah';
    if (safeIndex === 3) return weekShifts?.hafta3 || 'sabah';
    if (safeIndex === 4) return weekShifts?.hafta4 || 'sabah';
    return weekShifts?.hafta5 || 'sabah';
  }

  function normalizeWeekShiftsClient(weekShifts: Partial<WeekShiftModel> | null | undefined): WeekShiftModel {
    return {
      hafta1: shiftByWeekIndex(weekShifts, 1),
      hafta2: shiftByWeekIndex(weekShifts, 2),
      hafta3: shiftByWeekIndex(weekShifts, 3),
      hafta4: shiftByWeekIndex(weekShifts, 4),
      hafta5: shiftByWeekIndex(weekShifts, 5),
    };
  }

  function buildPersonShiftRows(days: ScheduleDay[], person: SchedulePerson, fallbackWeekShifts: Partial<WeekShiftModel>): Array<{ off: boolean; shift: ShiftType | null; leaveCode: string | null }> {
    const personWeekShifts = normalizeWeekShiftsClient(person?.week_shifts || fallbackWeekShifts || {});
    const izinMap: Record<string, string> = {};
    if (Array.isArray(person?.izinler)) {
      person.izinler.forEach((entry) => {
        if (entry?.date && entry?.code) izinMap[String(entry.date)] = String(entry.code);
      });
    }
    let offDaysSeen = 0;
    return days.map((day) => {
      const leaveCode = izinMap[String(day?.date || '')];
      if (leaveCode) {
        return { off: false, shift: null, leaveCode };
      }
      const off = Boolean(person?.offDay) && day.dayName === person.offDay;
      if (off) {
        offDaysSeen += 1;
        return { off: true, shift: null, leaveCode: null };
      }
      const shift = shiftByWeekIndex(personWeekShifts, offDaysSeen + 1);
      return { off: false, shift, leaveCode: null };
    });
  }

  function getWeekIndexByDay(dayNumber: number): number {
    if (dayNumber <= 7) return 1;
    if (dayNumber <= 14) return 2;
    if (dayNumber <= 21) return 3;
    if (dayNumber <= 28) return 4;
    return 5;
  }

  function buildDaysBySelectedPeriod(record: ScheduleRecord): ScheduleDay[] {
    const selectedYear = Number(record?.yil || currentYear);
    const selectedMonth = Number(monthFilter?.value || record?.ay || new Date().getMonth() + 1);
    if (!Number.isFinite(selectedYear) || !Number.isFinite(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
      return Array.isArray(record?.takvim) ? record.takvim : [];
    }

    const totalDays = new Date(selectedYear, selectedMonth, 0).getDate();
    const weekShifts = record?.week_shifts || {};
    const rows = [];
    for (let day = 1; day <= totalDays; day += 1) {
      const dateObj = new Date(selectedYear, selectedMonth - 1, day);
      const dayName = dayByIndex[dateObj.getDay()] || 'Pazar';
      rows.push({
        date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        dayName,
        week: getWeekIndexByDay(day),
        shift: shiftByWeekIndex(weekShifts, getWeekIndexByDay(day)),
      });
    }
    return rows;
  }

  function safeJsonParse(text: string): any {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { error: text.slice(0, 200) || 'Beklenmeyen yanit alindi' };
    }
  }

  function clearAutoEditQuery() {
    const next = new URLSearchParams(window.location.search);
    next.delete('editId');
    next.delete('src');
    const qs = next.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }

  function loadScriptOnce(src: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[data-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve(true);
          return;
        }
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Script yuklenemedi: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve(true);
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Script yuklenemedi: ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function getDayNumber(dateText: string): number {
    const parts = String(dateText || '').split('-');
    return Number(parts[2] || 0);
  }

  function buildMatrix(record: ScheduleRecord): void {
    if (!matrixSvgWrap) return;
    const days = buildDaysBySelectedPeriod(record);
    const personnel = Array.isArray(record.personel) ? record.personel.slice(0, 4) : [];

    if (days.length === 0) {
      matrixSvgWrap.innerHTML = '<p style="padding:12px;margin:0">Bu ay icin vardiya takvimi olusturulamadi.</p>';
      return;
    }

    const monthLabel = monthNames[(record.ay || 1) - 1] || String(record.ay);
    const title = `${String(record.istasyon || '').toLocaleUpperCase('tr-TR')} PERSONEL ÇALIŞMA ÇİZELGESİ ${monthLabel.toLocaleUpperCase('tr-TR')} ${record.yil}`;
    const people = personnel
      .map((p) => ({
        fullName: String(p?.fullName || '').trim(),
        offDay: String(p?.offDay || '').trim(),
        week_shifts: normalizeWeekShiftsClient(p?.week_shifts || record.week_shifts || {}),
        izinler: Array.isArray(p?.izinler) ? p.izinler : [],
      }))
      .filter((p) => p.fullName.length > 0)
      .slice(0, 4);

    const dayHeader = days.map((d) => `<th class="day-head ${d.dayName === 'Pazar' ? 'sun' : ''}">${dayShort[d.dayName] || '-'}</th>`).join('');
    const dayNums = days.map((d) => `<th class="day-num">${getDayNumber(d.date)}</th>`).join('');

    const personRows = people.map((p) => {
      const personPlan = buildPersonShiftRows(days, p, record.week_shifts || {});
      const firstRow = days.map((_, dayIndex) => {
        const info = personPlan[dayIndex];
        const meta = shiftMeta(info?.shift);
        const off = Boolean(info?.off);
        const leaveCode = String(info?.leaveCode || '').trim();
        const cellClass = leaveCode ? 'leave' : (off ? 'off' : '');
        return `<td class="${cellClass}">${leaveCode || (off ? 'D' : meta.start)}</td>`;
      }).join('');
      const secondRow = days.map((_, dayIndex) => {
        const info = personPlan[dayIndex];
        const meta = shiftMeta(info?.shift);
        const off = Boolean(info?.off);
        const leaveCode = String(info?.leaveCode || '').trim();
        const cellClass = leaveCode ? 'leave' : (off ? 'off' : '');
        return `<td class="${cellClass}">${leaveCode ? '' : (off ? '' : meta.end)}</td>`;
      }).join('');
      const thirdRow = days.map((_, dayIndex) => {
        const info = personPlan[dayIndex];
        const meta = shiftMeta(info?.shift);
        const off = Boolean(info?.off);
        const leaveCode = String(info?.leaveCode || '').trim();
        const cellClass = leaveCode ? 'leave' : (off ? 'off' : '');
        return `<td class="${cellClass}">${leaveCode || (off ? 'D' : meta.code)}</td>`;
      }).join('');
      return `
        <tr>
          <th class="left-col off-day" rowspan="2">${p.offDay || ''}</th>
          ${firstRow}
        </tr>
        <tr>${secondRow}</tr>
        <tr class="name-row">
          <th class="left-col name">${p.fullName || ''}</th>
          ${thirdRow}
        </tr>
      `;
    }).join('');

    const bodyContent = people.length > 0
      ? personRows
      : `<tr><td class="no-personel" colspan="${days.length + 1}">Bu vardiya kaydinda personel bulunmuyor.</td></tr>`;

    matrixSvgWrap.innerHTML = `
      <section class="schedule-shell" aria-label="Aylik vardiya tablosu">
        <h2 class="matrix-title">${title}</h2>
        <div class="schedule-table-wrap">
          <table class="schedule-table">
            <colgroup>
              <col class="col-left" />
              ${days.map(() => '<col class="col-day" />').join('')}
            </colgroup>
            <thead>
              <tr>
                <th class="left-col" rowspan="2">GÜNLER</th>
                ${dayHeader}
              </tr>
              <tr>${dayNums}</tr>
            </thead>
            <tbody>
              ${bodyContent}
            </tbody>
          </table>
        </div>
        <p class="matrix-legend">(D: Dinlenme) (YI: Yillik Izin) (MI: Mazeret Izni) (UOG: Ucretsiz Izin) (EL: Evlenme Izni) (DI: Dogum Izni) (OL: Olum Izni) (R: Raporlu) (RT: Resmi Tatil) (TKS: Takas) (IDR: Idari Izin)</p>
        <p class="matrix-shift-legend">Sabah Vardiyasi (3-1): 08:00 - 16:00 | Ara Vardiya (3-2): 16:00 - 00:00 | Gece Vardiyasi (3-3): 00:00 - 08:00</p>
      </section>
    `;

    const tableWrap = matrixSvgWrap.querySelector('.schedule-table-wrap');
    if (tableWrap) {
      const resetScroll = () => {
        tableWrap.scrollLeft = 0;
        if (typeof tableWrap.scrollTo === 'function') {
          tableWrap.scrollTo({ left: 0, behavior: 'auto' });
        }
      };
      resetScroll();
      requestAnimationFrame(() => {
        resetScroll();
        requestAnimationFrame(resetScroll);
      });
    }
  }

  function renderRecord(record: ScheduleRecord): void {
    if (!currentCard || !cardTitle || !weekSummary || !message) return;
    currentRecord = record;
    message.style.display = 'none';
    currentCard.style.display = 'block';
    cardTitle.textContent = `${record.istasyon} - ${formatMonthYear(record.ay, record.yil)}`;

    const people = Array.isArray(record.personel) ? record.personel.slice(0, 4) : [];
    const validPeople = people.filter((p) => String(p?.fullName || '').trim());
    if (validPeople.length === 0) {
      const weekly = normalizeWeekShiftsClient(record.week_shifts || {});
      weekSummary.innerHTML = `
        <div class="week-item">1.Hafta: <strong>${shiftLabel(weekly.hafta1)}</strong></div>
        <div class="week-item">2.Hafta: <strong>${shiftLabel(weekly.hafta2)}</strong></div>
        <div class="week-item">3.Hafta: <strong>${shiftLabel(weekly.hafta3)}</strong></div>
        <div class="week-item">4.Hafta: <strong>${shiftLabel(weekly.hafta4)}</strong></div>
        <div class="week-item">5.Hafta: <strong>${shiftLabel(weekly.hafta5)}</strong></div>
      `;
    } else {
      weekSummary.innerHTML = validPeople.map((p, idx) => {
        const weekly = normalizeWeekShiftsClient(p?.week_shifts || record.week_shifts || {});
        return `
          <div class="week-item">
            <div class="week-item-title">${idx + 1}. Personel: <strong>${String(p?.fullName || '').trim()}</strong></div>
            <div class="week-item-line">1.Hafta: <strong>${shiftLabel(weekly.hafta1)}</strong></div>
            <div class="week-item-line">2.Hafta: <strong>${shiftLabel(weekly.hafta2)}</strong></div>
            <div class="week-item-line">3.Hafta: <strong>${shiftLabel(weekly.hafta3)}</strong></div>
            <div class="week-item-line">4.Hafta: <strong>${shiftLabel(weekly.hafta4)}</strong></div>
            <div class="week-item-line">5.Hafta: <strong>${shiftLabel(weekly.hafta5)}</strong></div>
          </div>
        `;
      }).join('');
    }

    buildMatrix(record);

    if (printBtn) printBtn.disabled = false;
    if (excelBtn) excelBtn.disabled = false;
    if (editBtn) editBtn.disabled = !isManager;
    if (deleteBtn) deleteBtn.disabled = !isManager;
  }

  async function loadRecord() {
    try {
      if (!monthFilter || !currentCard || !matrixSvgWrap) return;
      const month = monthFilter.value;
      const station = isManager ? stationFilter?.value : userStation;

      const params = new URLSearchParams({ month });
      if (station) params.set('station', station);

      const res = await fetch(`/api/vardiya?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const data = safeJsonParse(await res.text());

      if (!res.ok) {
        showMessage(data.error || 'Vardiya alinamadi', 'err');
        return;
      }

      if (!data.records || data.records.length === 0) {
        currentRecord = null;
        currentCard.style.display = 'none';
        matrixSvgWrap.innerHTML = '';
        if (printBtn) printBtn.disabled = true;
        if (excelBtn) excelBtn.disabled = true;
        if (editBtn) editBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        showMessage('Secilen kriterde vardiya bulunamadi', 'warn');
        return;
      }

      renderRecord(data.records[0]);
    } catch (error) {
      console.error('loadRecord error:', error);
      showMessage('Vardiya yuklenirken baglanti hatasi olustu', 'err');
    }
  }

  async function tryOpenEditFromQuery() {
    if (!Number.isFinite(autoEditId) || !isManager) return;
    clearAutoEditQuery();
    try {
      const res = await fetch(`/api/vardiya/${autoEditId}`, { credentials: 'include', cache: 'no-store' });
      const data = safeJsonParse(await res.text());
      if (!res.ok || !data?.record) throw new Error(data?.error || 'Vardiya kaydi bulunamadi');
      const record = data.record;
      if (stationFilter && record?.istasyon) stationFilter.value = String(record.istasyon);
      if (monthFilter && record?.ay) monthFilter.value = String(record.ay);
      renderRecord(record);
      openPlanModalForEdit?.();
    } catch (error) {
      console.error('tryOpenEditFromQuery error:', error);
      showMessage('Düzenleme penceresi açılamadı', 'err');
    }
  }

  async function createPdfFromSchedule() {
    try {
      if (!printBtn) return;
      if (!currentRecord) {
        showMessage('PDF olusturmak icin once vardiya secilmeli', 'warn');
        return;
      }
      const days = buildDaysBySelectedPeriod(currentRecord);
      if (days.length === 0) {
        showMessage('PDF icin takvim verisi bulunamadi', 'warn');
        return;
      }
      printBtn.disabled = true;
      const originalText = printBtn.textContent || 'PDF Oluştur';
      printBtn.textContent = 'PDF Hazirlaniyor...';

      await loadScriptOnce('/vendor/pdfmake.min.js');
      await loadScriptOnce('/vendor/vfs_fonts.js');

      const pdfMakeApi = window.pdfMake;
      if (!pdfMakeApi) throw new Error('PDF kutuphanesi baslatilamadi');

      const monthLabel = monthNames[(currentRecord.ay || 1) - 1] || String(currentRecord.ay);
      const title = `${String(currentRecord.istasyon || '').toLocaleUpperCase('tr-TR')} PERSONEL ÇALIŞMA ÇİZELGESİ ${monthLabel.toLocaleUpperCase('tr-TR')} ${currentRecord.yil}`;

      const headerTopRow = [
        {
          text: 'GÜNLER',
          rowSpan: 2,
          bold: true,
          fillColor: '#d1d5db',
          alignment: 'center',
          margin: [0, 8, 0, 8],
        },
        ...days.map((d) => ({
          text: dayShort[d.dayName] || '-',
          bold: true,
          alignment: 'center',
          fillColor: d.dayName === 'Pazar' ? '#fff200' : '#f1f5f9',
        })),
      ];
      const headerBottomRow = [
        {},
        ...days.map((d) => ({
          text: String(getDayNumber(d.date)),
          bold: true,
          alignment: 'center',
          fillColor: d.dayName === 'Pazar' ? '#fff200' : '#f6e9d2',
        })),
      ];
      const people = Array.isArray(currentRecord.personel) ? currentRecord.personel.filter((p) => String(p?.fullName || '').trim()) : [];
      const body = [headerTopRow, headerBottomRow];

      if (people.length === 0) {
        body.push([
          { text: 'Personel yok', alignment: 'center', bold: true, fillColor: '#f8fafc' },
          ...days.map(() => ({ text: '-', alignment: 'center' })),
        ]);
      } else {
        for (const person of people) {
          const name = String(person.fullName || '').trim();
          const offDay = String(person.offDay || '').trim();
          const personPlan = buildPersonShiftRows(days, person, currentRecord.week_shifts || {});
          body.push([
            {
              text: offDay || '-',
              rowSpan: 2,
              bold: true,
              alignment: 'center',
              fillColor: '#f8fafc',
              margin: [0, 8, 0, 8],
            },
            ...days.map((_, dayIndex) => {
              const plan = personPlan[dayIndex];
              const off = Boolean(plan?.off);
              return {
                text: off ? 'D' : shiftMeta(plan?.shift).start,
                alignment: 'center',
                fillColor: off ? '#8db5ea' : null,
              };
            }),
          ]);
          body.push([
            {},
            ...days.map((_, dayIndex) => {
              const plan = personPlan[dayIndex];
              const off = Boolean(plan?.off);
              return {
                text: off ? '' : shiftMeta(plan?.shift).end,
                alignment: 'center',
                fillColor: off ? '#8db5ea' : null,
              };
            }),
          ]);
          body.push([
            {
              text: name,
              bold: true,
              alignment: 'center',
              fillColor: '#eef3f9',
            },
            ...days.map((_, dayIndex) => {
              const plan = personPlan[dayIndex];
              const off = Boolean(plan?.off);
              return {
                text: off ? 'D' : shiftMeta(plan?.shift).code,
                alignment: 'center',
                fillColor: off ? '#8db5ea' : null,
              };
            }),
          ]);
        }
      }
      const marginLeft = 6;
      const marginRight = 6;
      const leftColWidth = 94;
      const widths = [leftColWidth, ...Array(days.length).fill('*')];

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [marginLeft, 8, marginRight, 8],
        defaultStyle: {
          font: 'Roboto',
          fontSize: 7.2,
        },
        content: [
          {
            text: title,
            alignment: 'center',
            bold: true,
            fontSize: 15,
            margin: [0, 0, 0, 5],
          },
          {
            table: {
              headerRows: 2,
              widths,
              body,
            },
            layout: {
              hLineColor: () => '#222',
              vLineColor: () => '#222',
              hLineWidth: () => 0.8,
              vLineWidth: () => 0.8,
              paddingLeft: () => 0.7,
              paddingRight: () => 0.7,
              paddingTop: () => 2.4,
              paddingBottom: () => 2.4,
            },
          },
          {
            text: '(D: Dinlenme) (Yİ: Yıllık İzin) (Mİ: Mazeret İzni) (ÜOG: Ücretsiz İzin) (Eİ: Evlenme İzni) (Dİ: Doğum İzni) (Öİ: Ölüm İzni) (R: Raporlu) (RT: Resmi Tatil) (TKS: Takas) (İDR: İdari İzin)',
            alignment: 'center',
            fontSize: 8.8,
            margin: [0, 5, 0, 2],
          },
          {
            text: 'Sabah Vardiyası (3-1): 08:00 - 16:00 | Ara Vardiya (3-2): 16:00 - 00:00 | Gece Vardiyası (3-3): 00:00 - 08:00',
            alignment: 'center',
            bold: true,
            fontSize: 9.6,
          },
        ],
      };

      const safeStation = String(currentRecord.istasyon || 'vardiya').replace(/\s+/g, '-').toLowerCase();
      const filename = `${safeStation}-${currentRecord.ay}-${currentRecord.yil}-vardiya.pdf`;
      pdfMakeApi.createPdf(docDefinition).download(filename);

      showMessage('PDF olusturuldu', 'ok');
      printBtn.textContent = originalText;
      printBtn.disabled = false;
    } catch (error) {
      console.error('createPdfFromSchedule error:', error);
      showMessage('PDF hazirlanirken hata olustu', 'err');
      if (printBtn) {
        printBtn.textContent = 'PDF Oluştur';
        printBtn.disabled = false;
      }
    }
  }

  printBtn?.addEventListener('click', createPdfFromSchedule);

  async function createExcelFromSchedule() {
    try {
      if (!excelBtn) return;
      if (!currentRecord) {
        showMessage('Excel olusturmak icin once vardiya secilmeli', 'warn');
        return;
      }
      const days = buildDaysBySelectedPeriod(currentRecord);
      if (days.length === 0) {
        showMessage('Excel icin takvim verisi bulunamadi', 'warn');
        return;
      }
      excelBtn.disabled = true;
      const originalText = excelBtn.textContent || 'Excel Oluştur';
      excelBtn.textContent = 'Excel Hazirlaniyor...';

      await loadScriptOnce('/vendor/exceljs.min.js');
      const ExcelJS = window.ExcelJS;
      if (!ExcelJS) throw new Error('Excel kutuphanesi baslatilamadi');

      const toColName = (colNum: number): string => {
        let n = colNum;
        let result = '';
        while (n > 0) {
          const rem = (n - 1) % 26;
          result = String.fromCharCode(65 + rem) + result;
          n = Math.floor((n - 1) / 26);
        }
        return result;
      };

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Vardiya');
      const totalCols = days.length + 1;
      const lastCol = toColName(totalCols);
      const monthLabel = monthNames[(currentRecord.ay || 1) - 1] || String(currentRecord.ay);
      const title = `${String(currentRecord.istasyon || '').toLocaleUpperCase('tr-TR')} PERSONEL ÇALIŞMA ÇİZELGESİ ${monthLabel.toLocaleUpperCase('tr-TR')} ${currentRecord.yil}`;

      const thinBorder = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      sheet.columns = [{ width: 22 }, ...days.map(() => ({ width: 6 }))];
      sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];
      sheet.mergeCells(`A1:${lastCol}1`);
      const titleCell = sheet.getCell('A1');
      titleCell.value = title;
      titleCell.font = { bold: true, size: 16, name: 'Calibri' };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 28;

      sheet.mergeCells('A2:A3');
      const daysCell = sheet.getCell('A2');
      daysCell.value = 'GÜNLER';
      daysCell.font = { bold: true };
      daysCell.alignment = { horizontal: 'center', vertical: 'middle' };
      daysCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
      daysCell.border = thinBorder;

      for (let i = 0; i < days.length; i += 1) {
        const col = i + 2;
        const day = days[i];
        const topCell = sheet.getCell(2, col);
        const bottomCell = sheet.getCell(3, col);
        const isSunday = day.dayName === 'Pazar';

        topCell.value = dayShort[day.dayName] || '-';
        topCell.font = { bold: true };
        topCell.alignment = { horizontal: 'center', vertical: 'middle' };
        topCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isSunday ? 'FFFFF200' : 'FFF1F5F9' },
        };
        topCell.border = thinBorder;

        bottomCell.value = getDayNumber(day.date);
        bottomCell.font = { bold: true };
        bottomCell.alignment = { horizontal: 'center', vertical: 'middle' };
        bottomCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isSunday ? 'FFFFF200' : 'FFF6E9D2' },
        };
        bottomCell.border = thinBorder;
      }

      let rowCursor = 4;
      const people = Array.isArray(currentRecord.personel) ? currentRecord.personel.filter((p) => String(p?.fullName || '').trim()) : [];

      if (people.length === 0) {
        sheet.mergeCells(`A${rowCursor}:${lastCol}${rowCursor}`);
        const cell = sheet.getCell(`A${rowCursor}`);
        cell.value = 'Bu vardiya kaydinda personel bulunmuyor.';
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { bold: true };
      } else {
        for (const person of people) {
          const name = String(person.fullName || '').trim();
          const offDay = String(person.offDay || '').trim();
          const personPlan = buildPersonShiftRows(days, person, currentRecord.week_shifts || {});

          sheet.mergeCells(`A${rowCursor}:A${rowCursor + 1}`);
          const offDayCell = sheet.getCell(`A${rowCursor}`);
          offDayCell.value = offDay || '-';
          offDayCell.font = { bold: true };
          offDayCell.alignment = { horizontal: 'center', vertical: 'middle' };
          offDayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          offDayCell.border = thinBorder;

          const nameCell = sheet.getCell(`A${rowCursor + 2}`);
          nameCell.value = name;
          nameCell.font = { bold: true };
          nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
          nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3F9' } };
          nameCell.border = thinBorder;

          for (let i = 0; i < days.length; i += 1) {
            const col = i + 2;
            const plan = personPlan[i];
            const off = Boolean(plan?.off);
            const meta = shiftMeta(plan?.shift);

            const startCell = sheet.getCell(rowCursor, col);
            const endCell = sheet.getCell(rowCursor + 1, col);
            const codeCell = sheet.getCell(rowCursor + 2, col);

            startCell.value = off ? 'D' : meta.start;
            endCell.value = off ? '' : meta.end;
            codeCell.value = off ? 'D' : meta.code;

            [startCell, endCell, codeCell].forEach((cell) => {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              cell.border = thinBorder;
              if (off) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8DB5EA' } };
              }
            });
          }

          sheet.getRow(rowCursor).height = 24;
          sheet.getRow(rowCursor + 1).height = 24;
          sheet.getRow(rowCursor + 2).height = 24;
          rowCursor += 3;
        }
      }

      rowCursor += 1;
      sheet.mergeCells(`A${rowCursor}:${lastCol}${rowCursor}`);
      const legendCell = sheet.getCell(`A${rowCursor}`);
      legendCell.value = '(D: Dinlenme) (Yİ: Yıllık İzin) (Mİ: Mazeret İzni) (ÜOG: Ücretsiz İzin) (Eİ: Evlenme İzni) (Dİ: Doğum İzni) (Öİ: Ölüm İzni) (R: Raporlu) (RT: Resmi Tatil) (TKS: Takas) (İDR: İdari İzin)';
      legendCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      legendCell.font = { size: 11 };

      rowCursor += 1;
      sheet.mergeCells(`A${rowCursor}:${lastCol}${rowCursor}`);
      const shiftLegendCell = sheet.getCell(`A${rowCursor}`);
      shiftLegendCell.value = 'Sabah Vardiyası (3-1): 08:00 - 16:00 | Ara Vardiya (3-2): 16:00 - 00:00 | Gece Vardiyası (3-3): 00:00 - 08:00';
      shiftLegendCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      shiftLegendCell.font = { bold: true, size: 12 };

      const safeStation = String(currentRecord.istasyon || 'vardiya').replace(/\s+/g, '-').toLowerCase();
      const filename = `${safeStation}-${currentRecord.ay}-${currentRecord.yil}-vardiya.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      showMessage('Excel olusturuldu', 'ok');
      excelBtn.textContent = originalText;
      excelBtn.disabled = false;
    } catch (error) {
      console.error('createExcelFromSchedule error:', error);
      showMessage('Excel hazirlanirken hata olustu', 'err');
      if (excelBtn) {
        excelBtn.textContent = 'Excel Oluştur';
        excelBtn.disabled = false;
      }
    }
  }

  excelBtn?.addEventListener('click', createExcelFromSchedule);

  if (monthFilter) monthFilter.value = String(new Date().getMonth() + 1);
  if (stationFilter && userStation) stationFilter.value = userStation;
  monthFilter?.addEventListener('change', loadRecord);
  stationFilter?.addEventListener('change', loadRecord);
  loadRecord().finally(() => {
    tryOpenEditFromQuery();
  });

  if (isManager) {
    const modal = requiredElement<HTMLElement>('planModal');
    // Render modal at document root so it is not constrained by page containers.
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    const newPlanBtn = document.getElementById('newPlanBtn');
    const closeModal = document.getElementById('closeModal');
    const cancelModal = document.getElementById('cancelModal');
    const planForm = requiredElement<HTMLFormElement>('planForm');
    const modalTitle = requiredElement<HTMLElement>('modalTitle');
    const saveBtn = requiredElement<HTMLButtonElement>('saveBtn');
    const saveMessage = requiredElement<HTMLElement>('saveMessage');

    const planId = requiredElement<HTMLInputElement>('planId');
    const planStation = requiredElement<HTMLSelectElement>('planStation');
    const planMonth = requiredElement<HTMLSelectElement>('planMonth');
    const personWeekTarget = document.getElementById('personWeekTarget') as HTMLSelectElement | null;
    const izinPersonTarget = document.getElementById('izinPersonTarget') as HTMLSelectElement | null;
    const izinDay = document.getElementById('izinDay') as HTMLInputElement | null;
    const izinStartDay = document.getElementById('izinStartDay') as HTMLInputElement | null;
    const izinEndDay = document.getElementById('izinEndDay') as HTMLInputElement | null;
    const izinType = document.getElementById('izinType') as HTMLSelectElement | null;
    const addIzinBtn = document.getElementById('addIzinBtn') as HTMLButtonElement | null;
    const addRangeIzinBtn = document.getElementById('addRangeIzinBtn') as HTMLButtonElement | null;
    const izinList = document.getElementById('izinList') as HTMLElement | null;
    const lockBodyScroll = () => document.body.classList.add('modal-open');
    const unlockBodyScroll = () => document.body.classList.remove('modal-open');
    const weekInputKeys: WeekKey[] = ['hafta1', 'hafta2', 'hafta3', 'hafta4', 'hafta5'];
    const defaultWeekShifts: WeekShiftModel = { hafta1: 'sabah', hafta2: 'sabah', hafta3: 'sabah', hafta4: 'sabah', hafta5: 'sabah' };
    let personWeekShiftsByIndex: Record<number, WeekShiftModel> = { 1: { ...defaultWeekShifts }, 2: { ...defaultWeekShifts }, 3: { ...defaultWeekShifts }, 4: { ...defaultWeekShifts } };
    let personLeavesByIndex: Record<number, LeaveEntry[]> = { 1: [], 2: [], 3: [], 4: [] };
    let selectedPersonIndex = 1;
    let selectedLeavePersonIndex = 1;

    function getDaysInSelectedMonth(): number {
      const monthValue = Math.max(1, Math.min(12, Number(planMonth?.value || new Date().getMonth() + 1)));
      return new Date(currentYear, monthValue, 0).getDate();
    }

    function getDateStringByDay(day: number): string {
      const monthValue = Math.max(1, Math.min(12, Number(planMonth?.value || new Date().getMonth() + 1)));
      return `${currentYear}-${String(monthValue).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
    }

    function getMonthDateBounds(): { first: string; last: string } {
      const monthValue = Math.max(1, Math.min(12, Number(planMonth?.value || new Date().getMonth() + 1)));
      const first = `${currentYear}-${String(monthValue).padStart(2, '0')}-01`;
      const last = `${currentYear}-${String(monthValue).padStart(2, '0')}-${String(getDaysInSelectedMonth()).padStart(2, '0')}`;
      return { first, last };
    }

    function refreshLeaveDayOptions(): void {
      if (!izinDay || !izinStartDay || !izinEndDay) return;
      const { first, last } = getMonthDateBounds();
      [izinDay, izinStartDay, izinEndDay].forEach((input) => {
        input.min = first;
        input.max = last;
        if (!input.value || input.value < first || input.value > last) input.value = first;
      });
      if (izinEndDay.value < izinStartDay.value) izinEndDay.value = izinStartDay.value;
    }

    function parseDayFromDate(value: string | null | undefined): number | null {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const [, yStr, mStr, dStr] = match;
      const y = Number(yStr);
      const m = Number(mStr);
      const d = Number(dStr);
      if (y !== currentYear) return null;
      const selectedMonth = Math.max(1, Math.min(12, Number(planMonth?.value || new Date().getMonth() + 1)));
      if (m !== selectedMonth) return null;
      const totalDays = getDaysInSelectedMonth();
      if (d < 1 || d > totalDays) return null;
      return d;
    }

    function ensureLeaveTargetEnabled(): void {
      if (!izinPersonTarget) return;
      const active = [];
      for (let i = 1; i <= 4; i += 1) {
        const name = (document.getElementById(`person_name_${i}`) as HTMLInputElement | null)?.value.trim() || '';
        if (name) active.push({ index: i, name });
      }

      if (active.length === 0) {
        izinPersonTarget.innerHTML = '<option value="">Önce personel adı girin</option>';
        izinPersonTarget.disabled = true;
        selectedLeavePersonIndex = 1;
        renderLeaveList();
        return;
      }

      izinPersonTarget.disabled = false;
      izinPersonTarget.innerHTML = active.map((item) => `<option value="${item.index}">${item.index}. Personel - ${item.name}</option>`).join('');
      const activeIndexes = active.map((item) => item.index);
      if (!activeIndexes.includes(selectedLeavePersonIndex)) selectedLeavePersonIndex = activeIndexes[0];
      izinPersonTarget.value = String(selectedLeavePersonIndex);
      renderLeaveList();
    }

    function renderLeaveList(): void {
      if (!izinList) return;
      const leaves = Array.isArray(personLeavesByIndex[selectedLeavePersonIndex]) ? personLeavesByIndex[selectedLeavePersonIndex] : [];
      if (leaves.length === 0) {
        izinList.innerHTML = '<div class="izin-empty">Seçili personel için izin günü eklenmedi.</div>';
        return;
      }

      const sorted = leaves
        .slice()
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''), 'tr'))
        .map((entry, idx) => {
          const dateText = String(entry.date || '');
          const day = Number(dateText.slice(-2)) || '-';
          const code = String(entry.code || '');
          const label = leaveTypeLabels[code] || code;
          return `<button type="button" class="izin-chip" data-remove-izin="${idx}">${day}. gün (${dateText}) - ${code} (${label}) ✕</button>`;
        })
        .join('');

      izinList.innerHTML = sorted;
    }

    function updateShiftOptionLabels(): void {
      const countsByWeek: Record<WeekKey, Record<ShiftType, number>> = {
        hafta1: { sabah: 0, ara: 0, gece: 0 },
        hafta2: { sabah: 0, ara: 0, gece: 0 },
        hafta3: { sabah: 0, ara: 0, gece: 0 },
        hafta4: { sabah: 0, ara: 0, gece: 0 },
        hafta5: { sabah: 0, ara: 0, gece: 0 },
      };
      const sourcePeople = Array.isArray(currentRecord?.personel) ? currentRecord.personel : [];
      sourcePeople.forEach((person) => {
        const weekly = normalizeWeekShiftsClient(person?.week_shifts || currentRecord?.week_shifts || {});
        weekInputKeys.forEach((weekKey) => {
          const val = weekly[weekKey];
          countsByWeek[weekKey][val] += 1;
        });
      });
      weekInputKeys.forEach((key) => {
        const selectEl = document.getElementById(key) as HTMLSelectElement | null;
        if (!selectEl) return;
        const selectedValue = selectEl.value;
        const weekCounts = countsByWeek[key];
        const labels: Record<ShiftType, string> = {
          sabah: `Sabah (08:00 - 16:00)${weekCounts.sabah > 0 ? ` (bu hafta ${weekCounts.sabah} personel)` : ''}`,
          ara: `Ara (16:00 - 00:00)${weekCounts.ara > 0 ? ` (bu hafta ${weekCounts.ara} personel)` : ''}`,
          gece: `Gece (00:00 - 08:00)${weekCounts.gece > 0 ? ` (bu hafta ${weekCounts.gece} personel)` : ''}`,
        };
        Array.from(selectEl.options).forEach((opt) => {
          const value = opt.value as ShiftType;
          if (value in labels) opt.textContent = labels[value];
        });
        selectEl.value = selectedValue;
      });
    }

    function readWeekInputs(): WeekShiftModel {
      return {
        hafta1: (document.getElementById('hafta1') as HTMLSelectElement).value as ShiftType,
        hafta2: (document.getElementById('hafta2') as HTMLSelectElement).value as ShiftType,
        hafta3: (document.getElementById('hafta3') as HTMLSelectElement).value as ShiftType,
        hafta4: (document.getElementById('hafta4') as HTMLSelectElement).value as ShiftType,
        hafta5: (document.getElementById('hafta5') as HTMLSelectElement).value as ShiftType,
      };
    }

    function applyWeekInputs(weekShifts: Partial<WeekShiftModel>): void {
      const weekly = normalizeWeekShiftsClient(weekShifts || {});
      weekInputKeys.forEach((key) => {
        (document.getElementById(key) as HTMLSelectElement).value = weekly[key];
      });
    }

    function setWeekInputsDisabled(disabled: boolean): void {
      weekInputKeys.forEach((key) => {
        const input = document.getElementById(key) as HTMLSelectElement | null;
        if (input) input.disabled = disabled;
      });
    }

    function renderPersonWeekTargetOptions(preferredIndex: number | null = null): void {
      if (!personWeekTarget) return;

      const active = [];
      for (let i = 1; i <= 4; i += 1) {
        const name = (document.getElementById(`person_name_${i}`) as HTMLInputElement | null)?.value.trim() || '';
        if (name) active.push({ index: i, name });
      }

      if (active.length === 0) {
        personWeekTarget.innerHTML = '<option value="">Önce personel adı girin</option>';
        personWeekTarget.value = '';
        personWeekTarget.disabled = true;
        setWeekInputsDisabled(true);
        applyWeekInputs(defaultWeekShifts);
        return;
      }

      personWeekTarget.disabled = false;
      setWeekInputsDisabled(false);
      personWeekTarget.innerHTML = active
        .map((item) => `<option value="${item.index}">${item.index}. Personel - ${item.name}</option>`)
        .join('');

      const requestedIndex = Number(preferredIndex);
      const currentIndex = Number(selectedPersonIndex);
      const activeIndexes = active.map((item) => item.index);
      if (activeIndexes.includes(requestedIndex)) {
        selectedPersonIndex = requestedIndex;
      } else if (activeIndexes.includes(currentIndex)) {
        selectedPersonIndex = currentIndex;
      } else {
        selectedPersonIndex = activeIndexes[0];
      }

      personWeekTarget.value = String(selectedPersonIndex);
      if (!personWeekShiftsByIndex[selectedPersonIndex]) {
        personWeekShiftsByIndex[selectedPersonIndex] = { ...defaultWeekShifts };
      }
      applyWeekInputs(personWeekShiftsByIndex[selectedPersonIndex]);
    }

    function resetPersonWeekShifts(baseWeekShifts: Partial<WeekShiftModel> = defaultWeekShifts): void {
      const weekly = normalizeWeekShiftsClient(baseWeekShifts);
      personWeekShiftsByIndex = {
        1: { ...weekly },
        2: { ...weekly },
        3: { ...weekly },
        4: { ...weekly },
      };
      personLeavesByIndex = { 1: [], 2: [], 3: [], 4: [] };
      selectedPersonIndex = 1;
      selectedLeavePersonIndex = 1;
      renderPersonWeekTargetOptions(1);
      ensureLeaveTargetEnabled();
      refreshLeaveDayOptions();
      updateShiftOptionLabels();
    }

    function persistSelectedPersonWeeks() {
      const safeIndex = Math.max(1, Math.min(4, Number(selectedPersonIndex) || 1));
      personWeekShiftsByIndex[safeIndex] = normalizeWeekShiftsClient(readWeekInputs());
    }

    function openModal(edit = false) {
      modal.style.display = 'flex';
      lockBodyScroll();
      modalTitle.textContent = edit ? 'Vardiya Düzenle' : 'Vardiya Oluştur';
      saveBtn.textContent = edit ? 'Güncelle' : 'Oluştur';
      refreshLeaveDayOptions();
      updateShiftOptionLabels();
    }

    function closePlanModal() {
      modal.style.display = 'none';
      unlockBodyScroll();
      planForm.reset();
      planId.value = '';
      saveMessage.style.display = 'none';
      resetPersonWeekShifts(defaultWeekShifts);
    }

    function fillModalFromCurrent() {
      if (!currentRecord) return;
      planId.value = String(currentRecord.id);
      planStation.value = currentRecord.istasyon || '';
      planMonth.value = String(currentRecord.ay);

      for (let i = 1; i <= 4; i++) {
        const p = currentRecord.personel?.[i - 1];
        (document.getElementById(`person_name_${i}`) as HTMLInputElement).value = p?.fullName || '';
        (document.getElementById(`person_off_${i}`) as HTMLSelectElement).value = p?.offDay || 'Pazar';
        personWeekShiftsByIndex[i] = normalizeWeekShiftsClient(p?.week_shifts || currentRecord.week_shifts || defaultWeekShifts);
        personLeavesByIndex[i] = Array.isArray(p?.izinler) ? p.izinler : [];
      }
      renderPersonWeekTargetOptions(1);
      ensureLeaveTargetEnabled();
      refreshLeaveDayOptions();
      updateShiftOptionLabels();
    }

    function collectPayload() {
      persistSelectedPersonWeeks();
      const personel = [];
      for (let i = 1; i <= 4; i++) {
        const fullName = (document.getElementById(`person_name_${i}`) as HTMLInputElement).value.trim();
        const offDay = (document.getElementById(`person_off_${i}`) as HTMLSelectElement).value as OffDay;
        if (fullName) {
          personel.push({
            fullName,
            offDay,
            week_shifts: normalizeWeekShiftsClient(personWeekShiftsByIndex[i] || defaultWeekShifts),
            izinler: (Array.isArray(personLeavesByIndex[i]) ? personLeavesByIndex[i] : []).slice(),
          });
        }
      }
      const weekShifts = normalizeWeekShiftsClient(personWeekShiftsByIndex[1] || defaultWeekShifts);

      return {
        istasyon: planStation.value,
        yil: currentYear,
        ay: Number(planMonth.value),
        week_shifts: weekShifts,
        personel,
      };
    }

    async function savePlan(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const editing = Boolean(planId.value);
      const url = editing ? `/api/vardiya/${planId.value}` : '/api/vardiya';
      const method = editing ? 'PUT' : 'POST';
      const payload = collectPayload();
      const existingNames = new Set((Array.isArray(currentRecord?.personel) ? currentRecord.personel : []).map((p) => String(p?.fullName || '').trim()).filter(Boolean));
      const incomingNames = (Array.isArray(payload.personel) ? payload.personel : []).map((p) => String(p?.fullName || '').trim()).filter(Boolean);
      const hasAdditionalPerson = incomingNames.some((name) => !existingNames.has(name));
      if (existingNames.size > 0 && hasAdditionalPerson) {
        const ok = confirm('Bu vardiyada kayıtlı personel var. Eklemek istediğinize emin misiniz?');
        if (!ok) return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = editing ? 'Güncelleniyor...' : 'Oluşturuluyor...';
      saveMessage.style.display = 'none';

      try {
        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = safeJsonParse(await res.text());
        if (!res.ok) {
          saveMessage.textContent = data.error || 'Kayit islemi basarisiz';
          saveMessage.className = 'message err';
          saveMessage.style.display = 'block';
          return;
        }

        showMessage(data.message || (editing ? 'Vardiya guncellendi' : 'Vardiya olusturuldu'), 'ok');
        closePlanModal();
        await loadRecord();
        window.dispatchEvent(new Event('notifications:refresh'));
      } catch (error) {
        console.error('savePlan error:', error);
        saveMessage.textContent = 'Kaydetme sirasinda baglanti hatasi olustu';
        saveMessage.className = 'message err';
        saveMessage.style.display = 'block';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editing ? 'Güncelle' : 'Oluştur';
      }
    }

    async function removeCurrent() {
      if (!currentRecord) return;
      if (!confirm('Bu vardiya kaydını kaldırmak istiyor musunuz?')) return;

      try {
        const res = await fetch(`/api/vardiya/${currentRecord.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = safeJsonParse(await res.text());

        if (!res.ok) {
          showMessage(data.error || 'Kaldirilamadi', 'err');
          return;
        }

        showMessage('Vardiya kaldirildi', 'ok');
        if (currentCard) currentCard.style.display = 'none';
        currentRecord = null;
      } catch (error) {
        console.error('removeCurrent error:', error);
        showMessage('Vardiya kaldirilirken baglanti hatasi olustu', 'err');
      }
    }

    newPlanBtn?.addEventListener('click', () => {
      openModal(false);
      if (stationFilter?.value) planStation.value = stationFilter.value;
      planMonth.value = monthFilter?.value || String(new Date().getMonth() + 1);
      resetPersonWeekShifts(defaultWeekShifts);
    });

    editBtn?.addEventListener('click', () => {
      if (!currentRecord) return;
      openModal(true);
      fillModalFromCurrent();
    });

    deleteBtn?.addEventListener('click', removeCurrent);
    closeModal?.addEventListener('click', closePlanModal);
    cancelModal?.addEventListener('click', closePlanModal);
    modal.addEventListener('click', (event: MouseEvent) => {
      if (event.target === modal) closePlanModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal?.style.display === 'flex') {
        closePlanModal();
      }
    });
    personWeekTarget?.addEventListener('change', () => {
      persistSelectedPersonWeeks();
      selectedPersonIndex = Math.max(1, Math.min(4, Number(personWeekTarget.value) || 1));
      if (!personWeekShiftsByIndex[selectedPersonIndex]) {
        personWeekShiftsByIndex[selectedPersonIndex] = { ...defaultWeekShifts };
      }
      applyWeekInputs(personWeekShiftsByIndex[selectedPersonIndex]);
    });
    for (let i = 1; i <= 4; i += 1) {
      const personNameInput = document.getElementById(`person_name_${i}`);
      personNameInput?.addEventListener('input', () => {
        persistSelectedPersonWeeks();
        renderPersonWeekTargetOptions(selectedPersonIndex || i);
        ensureLeaveTargetEnabled();
      });
    }
    weekInputKeys.forEach((key) => {
      document.getElementById(key)?.addEventListener('change', () => {
        persistSelectedPersonWeeks();
      });
    });
    planMonth?.addEventListener('change', refreshLeaveDayOptions);
    planStation?.addEventListener('change', updateShiftOptionLabels);
    izinPersonTarget?.addEventListener('change', () => {
      selectedLeavePersonIndex = Math.max(1, Math.min(4, Number(izinPersonTarget.value) || 1));
      renderLeaveList();
    });
    addIzinBtn?.addEventListener('click', () => {
      const personIndex = Math.max(1, Math.min(4, Number(izinPersonTarget?.value || selectedLeavePersonIndex) || 1));
      const day = parseDayFromDate(izinDay?.value);
      if (!day) {
        showMessage('Lütfen geçerli bir izin tarihi seçin', 'warn');
        return;
      }
      const code = String(izinType?.value || '').trim();
      if (!code) return;

      const date = getDateStringByDay(day);
      const currentLeaves = Array.isArray(personLeavesByIndex[personIndex]) ? personLeavesByIndex[personIndex].slice() : [];
      const existingIndex = currentLeaves.findIndex((item) => String(item?.date || '') === date);
      const nextItem = { date, code };
      if (existingIndex >= 0) currentLeaves[existingIndex] = nextItem;
      else currentLeaves.push(nextItem);
      personLeavesByIndex[personIndex] = currentLeaves;
      selectedLeavePersonIndex = personIndex;
      renderLeaveList();
    });
    addRangeIzinBtn?.addEventListener('click', () => {
      const personIndex = Math.max(1, Math.min(4, Number(izinPersonTarget?.value || selectedLeavePersonIndex) || 1));
      const startDay = parseDayFromDate(izinStartDay?.value);
      const endDay = parseDayFromDate(izinEndDay?.value);
      if (!startDay || !endDay) {
        showMessage('Lütfen geçerli başlangıç ve bitiş tarihi seçin', 'warn');
        return;
      }
      const code = String(izinType?.value || '').trim();
      if (!code) return;
      const minDay = Math.min(startDay, endDay);
      const maxDay = Math.max(startDay, endDay);
      const currentLeaves = Array.isArray(personLeavesByIndex[personIndex]) ? personLeavesByIndex[personIndex].slice() : [];
      const byDate = new Map(currentLeaves.map((item) => [String(item?.date || ''), item]));
      for (let day = minDay; day <= maxDay; day += 1) {
        const date = getDateStringByDay(day);
        byDate.set(date, { date, code });
      }
      personLeavesByIndex[personIndex] = Array.from(byDate.values());
      selectedLeavePersonIndex = personIndex;
      renderLeaveList();
    });
    izinList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const idx = Number(target.getAttribute('data-remove-izin'));
      if (!Number.isFinite(idx) || idx < 0) return;
      const currentLeaves = Array.isArray(personLeavesByIndex[selectedLeavePersonIndex]) ? personLeavesByIndex[selectedLeavePersonIndex].slice() : [];
      if (idx >= currentLeaves.length) return;
      currentLeaves.splice(idx, 1);
      personLeavesByIndex[selectedLeavePersonIndex] = currentLeaves;
      renderLeaveList();
    });
    planForm?.addEventListener('submit', savePlan);
  }

export function initVardiya(): void {
  // modül import edildiginde body zaten calisti; ek init gerekirse buraya
}
