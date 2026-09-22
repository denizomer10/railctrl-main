// Yönetici paneli istemcisi. yonetici.astro tarafından bundled <script> ile çağrılır.
import { finalizeShell } from './app-shell';
import { api as apiClient } from './api-client';
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  gorevi?: string | null;
  istasyon?: string | null;
  is_active: boolean;
  last_login?: string | null;
  created_at?: string | null;
};
type AuditLog = {
  id: string;
  created_at?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  ip_address?: string | null;
};
type Feedback = {
  id: string;
  created_at?: string | null;
  full_name?: string | null;
  station?: string | null;
  mesaj: string;
};
type SystemRecord = {
  module_key: string;
  module_label: string;
  record_id: string;
  created_at?: string | null;
  creator_name?: string | null;
  details?: Record<string, unknown> | null;
};
type AdminFile = { name: string; size: number; modifiedAt?: string | null; url: string };
type Report = {
  users: number;
  mms: number;
  calisma: number;
  kayip_esya: number;
  notlar: number;
  geri_bildirimler: number;
};

const state = {
  activeTab: 'dashboard',
  isDesktop: window.innerWidth > 1200,
  menuOpen: window.innerWidth > 1200,
  users: [] as AdminUser[],
  logs: [] as AuditLog[],
  feedbacks: [] as Feedback[],
  systemRecords: [] as SystemRecord[],
  files: [] as AdminFile[],
  report: null as Report | null,
  recordsLoading: false,
  recordsPage: 1,
  recordsLimit: 100,
  recordsTotalCount: 0,
  recordsTotalPages: 1,
  recordsModule: 'mms',
  recordsSearch: '',
  loading: false,
  lastSync: null as number | null,
  editUserId: null as string | null,
};

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('tr-TR');
}

function roleLabel(role: unknown): string {
  const labels: Record<string, string> = {
    user: 'Personel',
    sef: 'Şef',
    gar_mudur: 'Gar Müdürü',
    admin: 'Admin',
  };
  return labels[String(role ?? '')] ?? String(role ?? '-') ?? '-';
}

function formatFileSize(bytes: unknown): string {
  const size = Number(bytes || 0);
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 * 1024)).toFixed(2) + ' MB';
}

async function api<T>(path: string, options: { method?: string; body?: string } = {}): Promise<T> {
  const json = options.body !== undefined ? JSON.parse(options.body) : undefined;
  return apiClient<T>(path, { method: (options.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined) ?? 'GET', json });
}

let toastTimer: number | undefined;
function notify(msg: string): void {
  const toast = el<HTMLDivElement>('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toast.textContent === msg) toast.hidden = true;
  }, 2400);
}

function detail(record: SystemRecord, key: string): string {
  const v = record.details?.[key];
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

const TITLES: Record<string, string> = {
  users: 'Personel Yönetimi',
  feedback: 'Geri Bildirimler',
  records: 'Sistem Kayıtları',
  files: 'Dosya Yönetimi',
  audit: 'Audit Kayıtları',
};

function setTab(tab: string): void {
  state.activeTab = tab;
  document.querySelectorAll<HTMLButtonElement>('#sideMenu .menu-btn[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll<HTMLElement>('[data-section]').forEach((s) => {
    s.hidden = s.dataset.section !== tab;
  });
  const title = el<HTMLElement>('topTitle');
  if (title) title.textContent = TITLES[tab] ?? 'Yönetici Paneli';
  if (tab === 'records') {
    state.recordsPage = 1;
    void loadSystemRecords();
  }
  if (!state.isDesktop) closeMenu();
  finalizeShell({ enablePwa: false, responsiveTables: true });
}

function applyMenu(): void {
  const sidebar = el<HTMLElement>('sidebar');
  const backdrop = el<HTMLElement>('menuBackdrop');
  const main = el<HTMLElement>('mainRight');
  if (sidebar) sidebar.classList.toggle('open', state.menuOpen);
  if (backdrop) backdrop.hidden = state.isDesktop || !state.menuOpen;
  if (main) main.classList.toggle('with-menu', state.menuOpen && state.isDesktop);
  const toggle = el<HTMLElement>('drawerToggle');
  if (toggle) toggle.style.display = state.isDesktop ? 'none' : '';
}

function handleResize(): void {
  state.isDesktop = window.innerWidth > 1200;
  state.menuOpen = state.isDesktop ? true : state.menuOpen;
  applyMenu();
}

function toggleMenu(): void {
  if (state.isDesktop) return;
  state.menuOpen = !state.menuOpen;
  applyMenu();
}

function closeMenu(): void {
  if (state.isDesktop) return;
  state.menuOpen = false;
  applyMenu();
}

function applyThemeToDom(theme: string): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch { /* yoksay */ }
  const label = theme === 'dark' ? 'Açık Tema' : 'Gece Tema';
  const pillCls = theme === 'dark' ? 'to-light' : 'to-dark';
  const tl = el<HTMLElement>('themeLabel');
  const ml = el<HTMLElement>('mThemeLabel');
  if (tl) tl.textContent = label;
  if (ml) ml.textContent = label;
  const tp = el<HTMLElement>('themePill');
  const mp = el<HTMLElement>('mThemePill');
  if (tp) tp.className = 'theme-pill ' + pillCls;
  if (mp) mp.className = 'theme-pill ' + pillCls;
}

function toggleTheme(): void {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyThemeToDom(cur === 'dark' ? 'light' : 'dark');
}

function setLoading(on: boolean): void {
  state.loading = on;
  el<HTMLElement>('refreshIcon')?.classList.toggle('spin', on);
  el<HTMLElement>('mRefreshIcon')?.classList.toggle('spin', on);
}

function renderSync(): void {
  const s = el<HTMLElement>('lastSync');
  if (s) s.textContent = state.lastSync ? new Date(state.lastSync).toLocaleString('tr-TR') : '-';
}

function renderReport(): void {
  const cards = el<HTMLElement>('reportCards');
  const empty = el<HTMLElement>('reportEmpty');
  if (!cards || !empty) return;
  if (!state.report) {
    cards.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const r = state.report;
  const items: Array<[string, number]> = [
    ['Toplam Kullanıcı', r.users],
    ['MMS Kayıt', r.mms],
    ['Çalışma Kayıt', r.calisma],
    ['Kayıp Eşya', r.kayip_esya],
    ['Notlar', r.notlar],
    ['Geri Bildirim', r.geri_bildirimler],
  ];
  cards.innerHTML = items
    .map(([k, v]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`)
    .join('');
}

function renderRecentAudit(): void {
  const body = el<HTMLElement>('recentAuditBody');
  const wrap = el<HTMLElement>('recentAuditWrap');
  const empty = el<HTMLElement>('recentAuditEmpty');
  if (!body || !wrap || !empty) return;
  const rows = state.logs.slice(0, 10);
  wrap.hidden = rows.length === 0;
  empty.hidden = rows.length !== 0;
  body.innerHTML = rows
    .map(
      (l) =>
        `<tr><td>${esc(fmtDate(l.created_at))}</td><td>${esc(l.user_name || l.user_email || '-')}</td><td>${esc(l.action)}</td></tr>`
    )
    .join('');
}

function renderUsers(): void {
  const body = el<HTMLElement>('usersBody');
  const wrap = el<HTMLElement>('usersDesktopWrap');
  const list = el<HTMLElement>('usersMobileList');
  const empty = el<HTMLElement>('usersEmpty');
  if (!body || !wrap || !list || !empty) return;
  const has = state.users.length > 0;
  empty.hidden = has;
  wrap.hidden = !has || !state.isDesktop;
  body.innerHTML = state.users
    .map(
      (u) => `<tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="tag role">${esc(roleLabel(u.role))}</span></td>
        <td>${esc(u.gorevi || '-')}</td>
        <td>${esc(u.istasyon || '-')}</td>
        <td><span class="tag ${u.is_active ? 'active' : 'passive'}">${u.is_active ? 'Aktif' : 'Pasif'}</span></td>
        <td>${esc(fmtDate(u.last_login))}</td>
        <td><div class="actions">
          <button class="btn soft" data-act="edit" data-id="${esc(u.id)}">Düzenle</button>
          <button class="btn soft" data-act="toggle" data-id="${esc(u.id)}">${u.is_active ? 'Pasifleştir' : 'Aktifleştir'}</button>
          <button class="btn danger" data-act="delete" data-id="${esc(u.id)}">Sil</button>
        </div></td>
      </tr>`
    )
    .join('');
  list.innerHTML = state.users
    .map(
      (u) => `<div class="user-mobile-card">
        <div class="user-mobile-row"><div class="user-mobile-k">Ad Soyad</div><div class="user-mobile-v">${esc(u.name)}</div></div>
        <div class="user-mobile-row"><div class="user-mobile-k">E-posta</div><div class="user-mobile-v">${esc(u.email)}</div></div>
        <div class="user-mobile-row"><div class="user-mobile-k">Rol</div><div class="user-mobile-v"><span class="tag role">${esc(roleLabel(u.role))}</span></div></div>
        <div class="user-mobile-row"><div class="user-mobile-k">Görevi</div><div class="user-mobile-v">${esc(u.gorevi || '-')}</div></div>
        <div class="user-mobile-row"><div class="user-mobile-k">İstasyon</div><div class="user-mobile-v">${esc(u.istasyon || '-')}</div></div>
        <div class="user-mobile-row"><div class="user-mobile-k">Durum</div><div class="user-mobile-v"><span class="tag ${u.is_active ? 'active' : 'passive'}">${u.is_active ? 'Aktif' : 'Pasif'}</span></div></div>
        <div class="user-mobile-row"><div class="user-mobile-k">Son Giriş</div><div class="user-mobile-v">${esc(fmtDate(u.last_login))}</div></div>
        <div class="user-mobile-actions">
          <button class="btn soft" data-act="edit" data-id="${esc(u.id)}">Düzenle</button>
          <button class="btn soft" data-act="toggle" data-id="${esc(u.id)}">${u.is_active ? 'Pasifleştir' : 'Aktifleştir'}</button>
          <button class="btn danger" data-act="delete" data-id="${esc(u.id)}">Sil</button>
        </div>
      </div>`
    )
    .join('');
  list.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
    b.addEventListener('click', () => void handleUserAction(b.dataset.act || '', b.dataset.id || ''))
  );
  body.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
    b.addEventListener('click', () => void handleUserAction(b.dataset.act || '', b.dataset.id || ''))
  );
  finalizeShell({ enablePwa: false, responsiveTables: true });
}

function renderFeedback(): void {
  const body = el<HTMLElement>('feedbackBody');
  const wrap = el<HTMLElement>('feedbackWrap');
  const empty = el<HTMLElement>('feedbackEmpty');
  if (!body || !wrap || !empty) return;
  wrap.hidden = state.feedbacks.length === 0;
  empty.hidden = state.feedbacks.length !== 0;
  body.innerHTML = state.feedbacks
    .map(
      (f) => `<tr>
        <td>${esc(fmtDate(f.created_at))}</td>
        <td>${esc(f.full_name || '-')}</td>
        <td>${esc(f.station || '-')}</td>
        <td>${esc(f.mesaj)}</td>
        <td><button class="btn danger" data-fb="${esc(f.id)}">Sil</button></td>
      </tr>`
    )
    .join('');
  body.querySelectorAll<HTMLButtonElement>('button[data-fb]').forEach((b) =>
    b.addEventListener('click', () => void deleteFeedback(String(b.dataset.fb || '')))
  );
}

const RECORD_COLUMNS: Record<string, string[]> = {
  mms: ['MMS No', 'Arıza Tanımı', 'İstasyon', 'Durum', 'Bildiren', 'Tarih', 'İşlem'],
  calisma: ['MMS No', 'Çalışma Kodu', 'Yapılacak İş', 'Çalışanlar', 'İstasyon', 'Tarih', 'İşlem'],
  dahili: ['Dahili Numara', 'Birim', 'Açıklama', 'Oluşturan', 'Tarih', 'İşlem'],
  vardiya: ['İstasyon', 'Ay / Yıl', 'Personel Sayısı', 'Oluşturan', 'Tarih', 'İşlem'],
  kayip_esya: ['Belge No', 'Eşya Tanımı', 'Durum', 'Teslim Alan', 'Tarih', 'İşlem'],
};

function recordCells(r: SystemRecord): string {
  const m = state.recordsModule;
  if (m === 'mms')
    return `<td>${esc(detail(r, 'mms_numarasi'))}</td><td>${esc(detail(r, 'ariza_tanimi'))}</td><td>${esc(detail(r, 'istasyon'))}</td><td>${esc(detail(r, 'durum'))}</td><td>${esc(detail(r, 'bildiren') !== '-' ? detail(r, 'bildiren') : r.creator_name || '-')}</td><td>${esc(fmtDate(r.created_at))}</td>`;
  if (m === 'calisma')
    return `<td>${esc(detail(r, 'mms_numarasi'))}</td><td>${esc(detail(r, 'calisma_kodu'))}</td><td>${esc(detail(r, 'yapilacak_is'))}</td><td>${esc(detail(r, 'calisanlar'))}</td><td>${esc(detail(r, 'istasyon'))}</td><td>${esc(fmtDate(r.created_at))}</td>`;
  if (m === 'dahili')
    return `<td>${esc(detail(r, 'dahili_numara'))}</td><td>${esc(detail(r, 'birim'))}</td><td>${esc(detail(r, 'aciklama'))}</td><td>${esc(r.creator_name || '-')}</td><td>${esc(fmtDate(r.created_at))}</td>`;
  if (m === 'vardiya') {
    const ay = detail(r, 'ay');
    const yil = detail(r, 'yil');
    return `<td>${esc(detail(r, 'istasyon'))}</td><td>${esc(ay)} / ${esc(yil)}</td><td>${esc(detail(r, 'personel_sayisi'))}</td><td>${esc(r.creator_name || '-')}</td><td>${esc(fmtDate(r.created_at))}</td>`;
  }
  return `<td>${esc(detail(r, 'belge_no'))}</td><td>${esc(detail(r, 'esya_tanimi'))}</td><td>${esc(detail(r, 'durumu'))}</td><td>${esc(detail(r, 'teslim_alan'))}</td><td>${esc(fmtDate(r.created_at))}</td>`;
}

function renderRecords(): void {
  const head = el<HTMLElement>('recordsHead');
  const body = el<HTMLElement>('recordsBody');
  const wrap = el<HTMLElement>('recordsTableWrap');
  const empty = el<HTMLElement>('recordsEmpty');
  const loading = el<HTMLElement>('recordsLoading');
  const total = el<HTMLElement>('recordsTotal');
  const label = el<HTMLElement>('recordsPageLabel');
  const prev = el<HTMLButtonElement>('prevRecordsBtn');
  const next = el<HTMLButtonElement>('nextRecordsBtn');
  if (!head || !body || !wrap || !empty || !loading || !total || !label || !prev || !next) return;
  loading.hidden = !state.recordsLoading;
  const cols = RECORD_COLUMNS[state.recordsModule] ?? RECORD_COLUMNS['kayip_esya'];
  head.innerHTML = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  wrap.hidden = state.systemRecords.length === 0;
  empty.hidden = state.systemRecords.length !== 0 || state.recordsLoading;
  body.innerHTML = state.systemRecords
    .map(
      (r) => `<tr>${recordCells(r)}<td><div class="actions">
        <button class="btn soft" data-rec-act="edit" data-rec-mod="${esc(r.module_key)}" data-rec-id="${esc(r.record_id)}">Düzenle</button>
        <button class="btn danger" data-rec-act="delete" data-rec-mod="${esc(r.module_key)}" data-rec-id="${esc(r.record_id)}">Kaldır</button>
      </div></td></tr>`
    )
    .join('');
  body.querySelectorAll<HTMLButtonElement>('button[data-rec-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const rec: SystemRecord = {
        module_key: String(b.dataset.recMod || ''),
        module_label: '',
        record_id: String(b.dataset.recId || ''),
      };
      if (b.dataset.recAct === 'edit') editSystemRecord(rec);
      else void deleteSystemRecord(rec);
    })
  );
  total.textContent = ' ' + String(state.recordsTotalCount);
  label.textContent = `${state.recordsPage} / ${state.recordsTotalPages}`;
  prev.disabled = state.recordsPage <= 1 || state.recordsLoading;
  next.disabled = state.recordsPage >= state.recordsTotalPages || state.recordsLoading;
  finalizeShell({ enablePwa: false, responsiveTables: true });
}

function renderFiles(): void {
  const body = el<HTMLElement>('filesBody');
  const wrap = el<HTMLElement>('filesWrap');
  const empty = el<HTMLElement>('filesEmpty');
  if (!body || !wrap || !empty) return;
  wrap.hidden = state.files.length === 0;
  empty.hidden = state.files.length !== 0;
  body.innerHTML = state.files
    .map(
      (f) => `<tr>
        <td>${esc(f.name)}</td>
        <td>${esc(formatFileSize(f.size))}</td>
        <td>${esc(fmtDate(f.modifiedAt))}</td>
        <td><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" class="btn soft">Aç</a></td>
        <td><button class="btn danger" data-file="${esc(f.name)}">Sil</button></td>
      </tr>`
    )
    .join('');
  body.querySelectorAll<HTMLButtonElement>('button[data-file]').forEach((b) =>
    b.addEventListener('click', () => void deleteFile(String(b.dataset.file || '')))
  );
}

function renderAudit(): void {
  const body = el<HTMLElement>('auditBody');
  const wrap = el<HTMLElement>('auditWrap');
  const empty = el<HTMLElement>('auditEmpty');
  if (!body || !wrap || !empty) return;
  wrap.hidden = state.logs.length === 0;
  empty.hidden = state.logs.length !== 0;
  body.innerHTML = state.logs
    .map(
      (l) => `<tr>
        <td>${esc(fmtDate(l.created_at))}</td>
        <td>${esc(l.user_name || l.user_email || '-')}</td>
        <td>${esc(l.action)}</td>
        <td>${esc(l.resource_type || '-')} #${esc(l.resource_id || '-')}</td>
        <td>${esc(l.ip_address || '-')}</td>
      </tr>`
    )
    .join('');
  renderRecentAudit();
}

function renderAll(): void {
  renderSync();
  renderReport();
  renderUsers();
  renderFeedback();
  renderRecords();
  renderFiles();
  renderAudit();
  setLoading(state.loading);
}

async function loadSystemRecords(): Promise<void> {
  state.recordsLoading = true;
  renderRecords();
  try {
    const params = new URLSearchParams();
    params.set('page', String(state.recordsPage));
    params.set('limit', String(state.recordsLimit));
    if (state.recordsModule) params.set('module', state.recordsModule);
    if (state.recordsSearch.trim()) params.set('search', state.recordsSearch.trim());
    const payload = await api<{
      records?: SystemRecord[];
      pagination?: { totalCount?: number; totalPages?: number };
    }>('/api/admin/system-records?' + params.toString());
    state.systemRecords = payload.records || [];
    state.recordsTotalCount = payload.pagination?.totalCount || 0;
    state.recordsTotalPages = payload.pagination?.totalPages || 1;
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Sistem kayıtları alınamadı');
  } finally {
    state.recordsLoading = false;
    renderRecords();
  }
}

async function refreshAll(showToast = false): Promise<void> {
  try {
    setLoading(true);
    const [u, l, f, r, fs] = await Promise.all([
      api<{ users?: AdminUser[] }>('/api/admin/users'),
      api<{ logs?: AuditLog[] }>('/api/admin/audit-logs?limit=300'),
      api<{ feedbacks?: Feedback[] }>('/api/feedback'),
      api<{ report?: Report }>('/api/admin/report'),
      api<{ files?: AdminFile[] }>('/api/admin/files'),
    ]);
    state.users = u.users || [];
    state.logs = l.logs || [];
    state.feedbacks = f.feedbacks || [];
    state.report = r.report || null;
    state.files = fs.files || [];
    renderAll();
    await loadSystemRecords();
    state.lastSync = Date.now();
    renderSync();
    if (showToast) notify('Veriler yenilendi');
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Veri alınamadı');
  } finally {
    setLoading(false);
    renderSync();
  }
}

function recordApiPath(moduleKey: string, recordId: string): string {
  const id = encodeURIComponent(String(recordId));
  if (moduleKey === 'mms') return '/api/mms/' + id;
  if (moduleKey === 'calisma') return '/api/calisma-izni/' + id;
  if (moduleKey === 'dahili') return '/api/dahili-numaralar/' + id;
  if (moduleKey === 'vardiya') return '/api/vardiya/' + id;
  if (moduleKey === 'kayip_esya') return '/api/kayip-esya/' + id;
  return '';
}

function editSystemRecord(record: SystemRecord): void {
  const id = encodeURIComponent(String(record.record_id));
  if (record.module_key === 'mms') window.location.href = `/mms?editId=${id}&src=admin-records`;
  else if (record.module_key === 'calisma') window.location.href = `/calisma-izni?editId=${id}&src=admin-records`;
  else if (record.module_key === 'dahili') window.location.href = `/dahili-numaralar?editId=${id}&src=admin-records`;
  else if (record.module_key === 'kayip_esya') window.location.href = `/kayip-esya?editId=${id}&src=admin-records`;
  else if (record.module_key === 'vardiya') window.location.href = `/vardiya?editId=${id}&src=admin-records`;
}

async function deleteSystemRecord(record: SystemRecord): Promise<void> {
  const apiPath = recordApiPath(record.module_key, record.record_id);
  if (!apiPath) return;
  if (!confirm(`Kayıt (#${record.record_id}) kaldırılsın mı?`)) return;
  try {
    await api(apiPath, { method: 'DELETE' });
    notify('Kayıt kaldırıldı');
    await loadSystemRecords();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Kayıt kaldırılamadı');
  }
}

function recordsBaseParams(): URLSearchParams {
  const params = new URLSearchParams();
  if (state.recordsModule) params.set('module', state.recordsModule);
  if (state.recordsSearch.trim()) params.set('search', state.recordsSearch.trim());
  return params;
}

function openCreate(): void {
  (el<HTMLInputElement>('new-user-name') as HTMLInputElement).value = '';
  (el<HTMLInputElement>('new-user-email') as HTMLInputElement).value = '';
  (el<HTMLInputElement>('new-user-password') as HTMLInputElement).value = '';
  (el<HTMLSelectElement>('new-user-role') as HTMLSelectElement).value = 'user';
  (el<HTMLSelectElement>('new-user-job') as HTMLSelectElement).value = 'Personel';
  (el<HTMLSelectElement>('new-user-station') as HTMLSelectElement).value = '';
  const m = el<HTMLElement>('createModal');
  if (m) m.hidden = false;
}

function closeCreate(): void {
  const m = el<HTMLElement>('createModal');
  if (m) m.hidden = true;
}

async function createUser(): Promise<void> {
  const name = (el<HTMLInputElement>('new-user-name') as HTMLInputElement).value.trim();
  const email = (el<HTMLInputElement>('new-user-email') as HTMLInputElement).value.trim();
  const password = (el<HTMLInputElement>('new-user-password') as HTMLInputElement).value;
  const role = (el<HTMLSelectElement>('new-user-role') as HTMLSelectElement).value;
  const gorevi = (el<HTMLSelectElement>('new-user-job') as HTMLSelectElement).value;
  const istasyon = (el<HTMLSelectElement>('new-user-station') as HTMLSelectElement).value;
  if (!name || !email || !password) {
    notify('Ad, email ve şifre zorunlu');
    return;
  }
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role, gorevi, istasyon }),
    });
    closeCreate();
    notify('Personel eklendi');
    await refreshAll();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Personel eklenemedi');
  }
}

function openEdit(id: string): void {
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  state.editUserId = u.id;
  (el<HTMLInputElement>('edit-user-name') as HTMLInputElement).value = u.name || '';
  (el<HTMLInputElement>('edit-user-email') as HTMLInputElement).value = u.email || '';
  (el<HTMLSelectElement>('edit-user-role') as HTMLSelectElement).value = u.role || 'user';
  (el<HTMLSelectElement>('edit-user-job') as HTMLSelectElement).value = u.gorevi || 'Personel';
  (el<HTMLSelectElement>('edit-user-station') as HTMLSelectElement).value = u.istasyon || '';
  (el<HTMLInputElement>('edit-user-password') as HTMLInputElement).value = '';
  const m = el<HTMLElement>('editModal');
  if (m) m.hidden = false;
}

function closeEdit(): void {
  state.editUserId = null;
  const m = el<HTMLElement>('editModal');
  if (m) m.hidden = true;
}

async function saveEdit(): Promise<void> {
  if (!state.editUserId) return;
  try {
    const password = (el<HTMLInputElement>('edit-user-password') as HTMLInputElement).value;
    const payload: Record<string, unknown> = {
      name: (el<HTMLInputElement>('edit-user-name') as HTMLInputElement).value,
      email: (el<HTMLInputElement>('edit-user-email') as HTMLInputElement).value,
      role: (el<HTMLSelectElement>('edit-user-role') as HTMLSelectElement).value,
      gorevi: (el<HTMLSelectElement>('edit-user-job') as HTMLSelectElement).value,
      istasyon: (el<HTMLSelectElement>('edit-user-station') as HTMLSelectElement).value,
    };
    if (password) payload.password = password;
    await api('/api/admin/users/' + state.editUserId, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    notify('Personel güncellendi');
    closeEdit();
    await refreshAll();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Güncelleme hatası');
  }
}

async function handleUserAction(act: string, id: string): Promise<void> {
  if (act === 'edit') {
    openEdit(id);
    return;
  }
  if (act === 'toggle') {
    try {
      await api('/api/admin/users/' + id + '/toggle', { method: 'POST' });
      notify('Durum güncellendi');
      await refreshAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Durum güncellenemedi');
    }
    return;
  }
  if (act === 'delete') {
    const u = state.users.find((x) => x.id === id);
    if (!confirm((u?.name || 'Kullanıcı') + ' silinsin mi?')) return;
    try {
      await api('/api/admin/users/' + id, { method: 'DELETE' });
      notify('Kullanıcı silindi');
      await refreshAll();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Silinemedi');
    }
  }
}

async function deleteFeedback(id: string): Promise<void> {
  if (!confirm('Geri bildirim silinsin mi?')) return;
  try {
    await api('/api/feedback/' + id, { method: 'DELETE' });
    notify('Geri bildirim silindi');
    await refreshAll();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Geri bildirim silinemedi');
  }
}

async function refreshFiles(): Promise<void> {
  try {
    const payload = await api<{ files?: AdminFile[] }>('/api/admin/files');
    state.files = payload.files || [];
    renderFiles();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Dosyalar alınamadı');
  }
}

async function deleteFile(name: string): Promise<void> {
  if (!confirm(name + ' dosyası silinsin mi?')) return;
  try {
    await api('/api/admin/files', {
      method: 'DELETE',
      body: JSON.stringify({ name }),
    });
    notify('Dosya silindi');
    await refreshFiles();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Dosya silinemedi');
  }
}

async function clearAuditLogs(): Promise<void> {
  if (!confirm('Tüm audit kayıtları silinsin mi? Bu işlem geri alınamaz.')) return;
  try {
    await api('/api/admin/audit-logs', { method: 'DELETE' });
    state.logs = [];
    renderAudit();
    notify('Audit kayıtları temizlendi');
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Audit kayıtları silinemedi');
  }
}

function bind(): void {
  el<HTMLElement>('drawerToggle')?.addEventListener('click', toggleMenu);
  el<HTMLElement>('menuBackdrop')?.addEventListener('click', closeMenu);
  document.querySelectorAll<HTMLButtonElement>('#sideMenu .menu-btn[data-tab]').forEach((b) =>
    b.addEventListener('click', () => setTab(String(b.dataset.tab || 'dashboard')))
  );
  el<HTMLElement>('homeBtn')?.addEventListener('click', () => {
    window.location.href = '/';
  });
  el<HTMLElement>('refreshBtn')?.addEventListener('click', () => void refreshAll(true));
  el<HTMLElement>('mRefreshBtn')?.addEventListener('click', () => void refreshAll(true));
  el<HTMLElement>('themeBtn')?.addEventListener('click', toggleTheme);
  el<HTMLElement>('mThemeBtn')?.addEventListener('click', toggleTheme);

  el<HTMLElement>('openCreateBtn')?.addEventListener('click', openCreate);
  el<HTMLElement>('closeCreateBtn')?.addEventListener('click', closeCreate);
  el<HTMLElement>('cancelCreateBtn')?.addEventListener('click', closeCreate);
  el<HTMLElement>('submitCreateBtn')?.addEventListener('click', () => void createUser());
  el<HTMLElement>('closeEditBtn')?.addEventListener('click', closeEdit);
  el<HTMLElement>('cancelEditBtn')?.addEventListener('click', closeEdit);
  el<HTMLElement>('saveEditBtn')?.addEventListener('click', () => void saveEdit());

  el<HTMLElement>('applyRecordsBtn')?.addEventListener('click', () => {
    state.recordsModule = (el<HTMLSelectElement>('recordsModule') as HTMLSelectElement).value;
    state.recordsSearch = (el<HTMLInputElement>('recordsSearch') as HTMLInputElement).value;
    state.recordsPage = 1;
    void loadSystemRecords();
  });
  el<HTMLElement>('clearRecordsBtn')?.addEventListener('click', () => {
    state.recordsModule = 'mms';
    state.recordsSearch = '';
    (el<HTMLSelectElement>('recordsModule') as HTMLSelectElement).value = 'mms';
    (el<HTMLInputElement>('recordsSearch') as HTMLInputElement).value = '';
    state.recordsPage = 1;
    void loadSystemRecords();
  });
  el<HTMLInputElement>('recordsSearch')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      state.recordsModule = (el<HTMLSelectElement>('recordsModule') as HTMLSelectElement).value;
      state.recordsSearch = (e.target as HTMLInputElement).value;
      state.recordsPage = 1;
      void loadSystemRecords();
    }
  });
  el<HTMLSelectElement>('recordsModule')?.addEventListener('change', (e) => {
    state.recordsModule = (e.target as HTMLSelectElement).value;
    state.recordsPage = 1;
    void loadSystemRecords();
  });
  el<HTMLElement>('prevRecordsBtn')?.addEventListener('click', () => {
    if (state.recordsPage <= 1) return;
    state.recordsPage -= 1;
    void loadSystemRecords();
  });
  el<HTMLElement>('nextRecordsBtn')?.addEventListener('click', () => {
    if (state.recordsPage >= state.recordsTotalPages) return;
    state.recordsPage += 1;
    void loadSystemRecords();
  });
  el<HTMLElement>('exportRecordsCsv')?.addEventListener('click', () => {
    const params = recordsBaseParams();
    params.set('format', 'csv');
    params.set('export_limit', '20000');
    window.location.href = '/api/admin/system-records?' + params.toString();
  });
  el<HTMLElement>('exportRecordsExcel')?.addEventListener('click', () => {
    const params = recordsBaseParams();
    params.set('format', 'excel');
    params.set('export_limit', '20000');
    window.location.href = '/api/admin/system-records?' + params.toString();
  });

  el<HTMLElement>('refreshFilesBtn')?.addEventListener('click', () => void refreshFiles());
  el<HTMLElement>('exportAuditExcel')?.addEventListener('click', () => {
    window.location.href = '/api/admin/audit-logs?format=excel&limit=5000';
  });
  el<HTMLElement>('exportAuditCsv')?.addEventListener('click', () => {
    window.location.href = '/api/admin/audit-logs?format=csv&limit=5000';
  });
  el<HTMLElement>('clearAuditBtn')?.addEventListener('click', () => void clearAuditLogs());

  window.addEventListener('resize', handleResize, { passive: true });
}

applyThemeToDom(document.documentElement.getAttribute('data-theme') || 'light');
handleResize();
bind();
setTab('dashboard');
void refreshAll(false);
window.setInterval(() => void refreshAll(false), 30000);

export function initYonetici(): void {
  // modül import edildiginde boot kodu zaten calisti; ek init gerekirse buraya
}
