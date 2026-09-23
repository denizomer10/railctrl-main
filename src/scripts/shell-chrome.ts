// Paylaşılan kabuk istemcisi: bildirimler + geri bildirim + global arama.
// PageLayout ve HomeLayout tarafından kullanılır. Saf TypeScript, tekrarsız.

type NotificationItem = {
  id?: string | number | null;
  title?: string | null;
  message?: string | null;
  created_at?: string | null;
  is_read?: boolean | null;
};

type SearchResultItem = {
  title: string;
  subtitle?: string;
  href: string;
  type: string;
  external?: boolean;
  searchValue?: string;
};

type StaticPage = {
  title: string;
  subtitle: string;
  href: string;
  type: string;
  keywords: string;
  external?: boolean;
  passSearch?: boolean;
};

type ShellChromeOptions = {
  seedLocalSearch?: boolean;
};

export function initShellChrome(options: ShellChromeOptions = {}): void {
  const notifyBell = document.getElementById('notifyBell') as HTMLElement | null;
  const notifyBadge = document.getElementById('notifyBadge') as HTMLElement | null;
  const notifyPanel = document.getElementById('notifyPanel') as HTMLElement | null;
  const notifyList = document.getElementById('notifyList') as HTMLElement | null;
  const markAllBtn = document.getElementById('markAllNotifications');
  const clearBtn = document.getElementById('clearNotifications');
  const notifyToast = document.getElementById('notifyToast') as HTMLElement | null;
  const isEnglish = () => document.documentElement.lang === 'en';
  const uiText = (turkish: string, english: string) => isEnglish() ? english : turkish;
  const feedbackIconBtn = document.getElementById('feedbackIconBtn');
  const feedbackModal = document.getElementById('feedbackModal') as HTMLElement | null;
  const feedbackCloseBtn = document.getElementById('feedbackCloseBtn');
  const feedbackCancelBtn = document.getElementById('feedbackCancelBtn');
  const feedbackSendBtn = document.getElementById('feedbackSendBtn') as HTMLButtonElement | null;
  const feedbackModalText = document.getElementById('feedbackModalText') as HTMLTextAreaElement | null;
  const feedbackModalMsg = document.getElementById('feedbackModalMsg') as HTMLElement | null;
  const fab = document.getElementById('globalSearchFab');
  const modal = document.getElementById('globalSearchModal') as HTMLElement | null;
  const closeBtn = document.getElementById('globalSearchClose');
  const input = document.getElementById('globalSearchInput') as HTMLInputElement | null;
  const hint = document.getElementById('globalSearchHint') as HTMLElement | null;
  const resultsEl = document.getElementById('globalSearchResults') as HTMLElement | null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let initialized = false;
  let prevUnread = 0;
  let latestNotificationId: string | number | null = null;

  const staticPages: StaticPage[] = [
    { title: 'Güzergahlar', subtitle: 'Tren güzergahları ve ulaşım bilgileri', href: '/guzergah', type: 'Sayfa', keywords: 'guzergah harita ulaşım tren route maps' },
    { title: 'Vardiya', subtitle: 'Aylık vardiya planlama ekranı', href: '/vardiya', type: 'Sayfa', keywords: 'vardiya planlama istasyon ay hafta' },
    { title: 'Arıza Kayıtları', subtitle: 'Arıza kayıtları', href: '/problem-records', type: 'Sayfa', keywords: 'arıza kayıt problem records bakım', passSearch: true },
    { title: 'Çalışma İzinleri', subtitle: 'Saha çalışma izinleri', href: '/calisma-izni', type: 'Sayfa', keywords: 'calisma izni saha is emniyet', passSearch: true },
    { title: 'Notlar', subtitle: 'Prosedür, şifre, adres notları', href: '/notlar', type: 'Sayfa', keywords: 'not prosedur sifre adres', passSearch: true },
    { title: 'Kayıp Eşya', subtitle: 'Kayıp eşya kayıtları', href: '/kayip-esya', type: 'Sayfa', keywords: 'kayip esya teslim imha depo', passSearch: true },
    { title: 'Dahili Numaralar', subtitle: 'Birim rehberi', href: '/dahili-numaralar', type: 'Sayfa', keywords: 'dahili numara birim telefon rehber', passSearch: true },
    { title: 'İzin İsteği', subtitle: 'İzin talep ekranı', href: '/izin-istegi', type: 'Sayfa', keywords: 'izin yillik mazeret hastalik personel' },
  ];

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeQuery = '';
  const resetTransientUi = (): void => {
    modal?.setAttribute('aria-hidden', 'true');
    if (modal) modal.style.display = 'none';
    feedbackModal?.setAttribute('aria-hidden', 'true');
    if (feedbackModal) feedbackModal.style.display = 'none';
    if (notifyPanel) notifyPanel.style.display = 'none';
    document.body.style.overflow = '';
  };

  resetTransientUi();
  window.addEventListener('pageshow', resetTransientUi);

  const escapeHtml = (value: unknown): string => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const renderNotifications = (items: NotificationItem[] = []): void => {
    if (!notifyList) return;
    if (!items.length) {
      notifyList.textContent = uiText('Yeni bildirim yok', 'No new notifications');
      return;
    }
    notifyList.innerHTML = items.map((n) => {
      const date = n.created_at ? new Date(n.created_at).toLocaleString(isEnglish() ? 'en-US' : 'tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
      return `<div class="notify-item ${n.is_read ? '' : 'unread'}">
        <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(n.title || uiText('Bildirim', 'Notification'))}</div>
        <div style="margin-bottom:6px;">${escapeHtml(n.message || '')}</div>
        <small style="opacity:.75;">${escapeHtml(date)}</small>
      </div>`;
    }).join('');
  };

  const bumpBell = (): void => {
    if (notifyBell) {
      notifyBell.classList.remove('bump');
      void notifyBell.offsetWidth;
      notifyBell.classList.add('bump');
    }
    if (notifyBadge) {
      notifyBadge.classList.remove('pulse');
      void notifyBadge.offsetWidth;
      notifyBadge.classList.add('pulse');
    }
  };

  const showNotificationToast = (item: NotificationItem | null, unreadCount: number): void => {
    if (!notifyToast || !item) return;
    const date = item.created_at
      ? new Date(item.created_at).toLocaleTimeString(isEnglish() ? 'en-US' : 'tr-TR', { hour: '2-digit', minute: '2-digit' })
      : '';
    notifyToast.innerHTML = `
      <div class="notify-toast-title">${uiText('Yeni Bildirim', 'New notification')} (${unreadCount})</div>
      <div class="notify-toast-message">${escapeHtml(item.title || uiText('Bildirim', 'Notification'))} - ${escapeHtml(item.message || '')}</div>
      <div class="notify-toast-meta">${escapeHtml(date)}</div>
    `;
    notifyToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => notifyToast.classList.remove('show'), 3600);
  };

  const loadNotifications = async (): Promise<void> => {
    try {
      const res = await fetch('/api/notifications?limit=20', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data.notifications) ? data.notifications : [];
      renderNotifications(items);

      const unread = Number(data.unreadCount || 0);
      const firstItem = items[0] || null;
      const firstId = firstItem?.id || null;
      const hasFreshNotification = initialized && unread > prevUnread && firstId && firstId !== latestNotificationId;
      if (hasFreshNotification) {
        bumpBell();
        showNotificationToast(firstItem, unread);
      }

      if (notifyBadge) {
        notifyBadge.textContent = unread > 99 ? '99+' : String(unread);
        notifyBadge.style.display = unread > 0 ? 'inline-block' : 'none';
      }
      initialized = true;
      prevUnread = unread;
      latestNotificationId = firstId || latestNotificationId;
    } catch (_error) {
      // ignore
    }
  };

  notifyBell?.addEventListener('click', () => {
    if (!notifyPanel) return;
    const isOpen = notifyPanel.style.display === 'block';
    notifyPanel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) loadNotifications();
  });

  markAllBtn?.addEventListener('click', async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    });
    loadNotifications();
  });

  clearBtn?.addEventListener('click', async () => {
    await fetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    });
    if (notifyToast) notifyToast.classList.remove('show');
    prevUnread = 0;
    latestNotificationId = null;
    loadNotifications();
  });

  document.addEventListener('click', (event) => {
    if (!notifyPanel || !notifyBell) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!notifyPanel.contains(target) && !notifyBell.contains(target)) notifyPanel.style.display = 'none';
  });

  const POLL_INTERVAL_MS = 30000;
  loadNotifications();
  setInterval(() => {
    if (document.visibilityState === 'visible') loadNotifications();
  }, POLL_INTERVAL_MS);
  window.addEventListener('notifications:refresh', () => loadNotifications());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadNotifications();
  });
  window.addEventListener('focus', () => loadNotifications());

  const openFeedbackModal = (): void => {
    if (!feedbackModal || !feedbackModalText || !feedbackModalMsg) return;
    feedbackModal.style.display = 'flex';
    feedbackModal.setAttribute('aria-hidden', 'false');
    feedbackModalMsg.textContent = '';
    feedbackModalMsg.className = 'feedback-msg';
    setTimeout(() => feedbackModalText?.focus(), 30);
  };

  const closeFeedbackModal = (): void => {
    if (!feedbackModal || !feedbackModalText || !feedbackModalMsg || !feedbackSendBtn) return;
    feedbackModal.style.display = 'none';
    feedbackModal.setAttribute('aria-hidden', 'true');
    if (feedbackModalText) feedbackModalText.value = '';
    feedbackModalMsg.textContent = '';
    feedbackModalMsg.className = 'feedback-msg';
    feedbackSendBtn.disabled = false;
    feedbackSendBtn.textContent = uiText('Gönder', 'Send');
  };

  feedbackIconBtn?.addEventListener('click', openFeedbackModal);
  feedbackCloseBtn?.addEventListener('click', closeFeedbackModal);
  feedbackCancelBtn?.addEventListener('click', closeFeedbackModal);
  feedbackModal?.addEventListener('click', (event) => {
    if (event.target === feedbackModal) closeFeedbackModal();
  });

  feedbackSendBtn?.addEventListener('click', async () => {
    const mesaj = (feedbackModalText?.value || '').trim();
    if (!mesaj) {
      if (feedbackModalMsg) {
        feedbackModalMsg.className = 'feedback-msg';
        feedbackModalMsg.textContent = uiText('Geri bildirim mesajı boş olamaz', 'Feedback message cannot be empty');
      }
      return;
    }

    if (feedbackSendBtn) {
      feedbackSendBtn.disabled = true;
      feedbackSendBtn.textContent = uiText('Gönderiliyor...', 'Sending...');
    }

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mesaj })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Geri bildirim gönderilemedi');

      if (feedbackModalMsg) {
        feedbackModalMsg.className = 'feedback-msg success';
        feedbackModalMsg.textContent = uiText('Geri bildiriminiz için teşekkür ederiz', 'Thank you for your feedback');
      }
      setTimeout(() => closeFeedbackModal(), 900);
    } catch (error) {
      if (feedbackModalMsg) {
        feedbackModalMsg.className = 'feedback-msg';
        feedbackModalMsg.textContent = error instanceof Error ? error.message : 'Geri bildirim gönderilemedi';
      }
      if (feedbackSendBtn) {
        feedbackSendBtn.disabled = false;
        feedbackSendBtn.textContent = uiText('Gönder', 'Send');
      }
    }
  });

  if (!fab || !modal || !input || !hint || !resultsEl) return;

  const normalize = (text: unknown): string => String(text || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');

  const clipText = (text: unknown, max = 72): string => {
    const value = String(text || '').trim().replace(/\s+/g, ' ');
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
  };

  const openModal = (): void => {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 30);
  };

  const closeModal = (): void => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    input.value = '';
    resultsEl.innerHTML = '';
    hint.textContent = uiText('En az 2 karakter yazın', 'Enter at least 2 characters');
  };

  const renderResults = (items: SearchResultItem[]): void => {
    if (!items.length) {
      resultsEl.innerHTML = `<div class="spotlight-empty">${uiText('Sonuç bulunamadı', 'No results found')}</div>`;
      return;
    }

    resultsEl.innerHTML = items.map((item) => {
      const target = item.searchValue
        ? `${item.href}${item.href.includes('?') ? '&' : '?'}search=${encodeURIComponent(item.searchValue)}`
        : item.href;
      const targetAttr = item.external ? ' target="_blank" rel="noopener noreferrer"' : '';
      const subtitle = clipText(item.subtitle || '', 72);
      return `
        <a class="spotlight-result" href="${escapeHtml(target)}"${targetAttr}>
          <div class="spotlight-result-main">
            <div class="spotlight-result-title">${escapeHtml(item.title)}</div>
            <div class="spotlight-result-sub">${escapeHtml(subtitle)}</div>
          </div>
          <span class="spotlight-badge">${escapeHtml(item.type)}</span>
        </a>
      `;
    }).join('');
  };

  const fetchSearchResults = async (query: string): Promise<SearchResultItem[]> => {
    const q = encodeURIComponent(query);
    const normalizedQuery = normalize(query);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const stationAliases = [
      { slug: 'atalar', names: ['atalar'] },
      { slug: 'aydintepe', names: ['aydintepe'] },
      { slug: 'basak', names: ['basak'] },
      { slug: 'bostanci-dogu-konkors', names: ['bostanci dogu konkors', 'bostanci dogu', 'bostanci'] },
      { slug: 'bostanci-peron-bati-konkors', names: ['bostanci peron bati konkors', 'bostanci peron bati'] },
      { slug: 'cayirova', names: ['cayirova'] },
      { slug: 'cevizli', names: ['cevizli'] },
      { slug: 'darica', names: ['darica'] },
      { slug: 'erenkoy', names: ['erenkoy'] },
      { slug: 'fatih', names: ['fatih'] },
      { slug: 'feneryolu', names: ['feneryolu'] },
      { slug: 'gebze-konkors', names: ['gebze konkors', 'gebze'] },
      { slug: 'gebze-peron', names: ['gebze peron'] },
      { slug: 'goztepe', names: ['goztepe'] },
      { slug: 'guzelyali', names: ['guzelyali'] },
      { slug: 'icmeler', names: ['icmeler'] },
      { slug: 'idealtepe', names: ['idealtepe'] },
      { slug: 'kartal', names: ['kartal'] },
      { slug: 'kaynarca', names: ['kaynarca'] },
      { slug: 'kücükyali', names: ['kucukyali', 'kucuk yali'] },
      { slug: 'maltepe', names: ['maltepe'] },
      { slug: 'osmangazi', names: ['osman gazi', 'osmangazi'] },
      { slug: 'pendik', names: ['pendik'] },
      { slug: 'sogutlucesme', names: ['sogutlucesme', 'sogutlu cesme'] },
      { slug: 'suadiye', names: ['suadiye'] },
      { slug: 'sureyya-plaji', names: ['sureyya plaji'] },
      { slug: 'tersane', names: ['tersane'] },
      { slug: 'tuzla', names: ['tuzla'] },
      { slug: 'yunus', names: ['yunus'] }
    ];
    const findStationSlug = (): string => {
      let bestSlug = '';
      let bestScore = 0;
      for (const station of stationAliases) {
        for (const name of station.names) {
          const alias = normalize(name);
          const aliasTokens = alias.split(/\s+/).filter((t) => t.length >= 3);
          let score = 0;
          if (normalizedQuery.includes(alias)) score = 120 + alias.length;
          if (!score && aliasTokens.length) {
            const matched = aliasTokens.filter((t) => normalizedQuery.includes(t)).length;
            if (matched === aliasTokens.length) score = 80 + aliasTokens.length * 10;
            else if (matched > 0 && aliasTokens.length > 1) score = 45 + matched * 10;
          }
          if (score > bestScore) {
            bestScore = score;
            bestSlug = station.slug;
          }
        }
      }
      return bestScore >= 55 ? bestSlug : '';
    };
    const matchedStationSlug = findStationSlug();
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const dedupeMap = new Map();
    const pushUnique = (item: SearchResultItem): void => {
      const key = `${item.title}|${item.href}`;
      if (!dedupeMap.has(key)) dedupeMap.set(key, item);
    };
    const scoreEntry = (entry: StaticPage): number => {
      const haystack = normalize(`${entry.title} ${entry.subtitle || ''} ${entry.keywords || ''}`);
      if (!haystack) return 0;
      if (!haystack.includes(normalizedQuery) && !tokens.every((t) => haystack.includes(t))) return 0;
      let score = 0;
      if (normalize(entry.title).includes(normalizedQuery)) score += 120;
      if (haystack.includes(normalizedQuery)) score += 70;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 14;
      }
      if (entry.type === 'Sayfa') score += 10;
      return score;
    };

    const now = new Date();
    const requests = [
      fetch(`/api/mms?search=${q}&limit=5&page=1`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/calisma-izni?search=${q}&limit=5&page=1`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/notlar?search=${q}`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/kayip-esya?search=${q}&limit=5&page=1`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/dahili-numaralar?search=${q}&limit=5&page=1`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/vardiya?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null)
    ];

    const [mms, izin, notlar, kayip, dahili, vardiya] = await Promise.all(requests);
    const items: SearchResultItem[] = [];

    if ((normalizedQuery.includes('ariza') && normalizedQuery.includes('kaydi') && (normalizedQuery.includes('olustur') || normalizedQuery.includes('ekle'))) || normalizedQuery.includes('ariza kaydi olustur')) {
      pushUnique({
        title: 'Arıza Kaydı Oluştur',
        subtitle: 'MMS yeni kayıt penceresini aç',
        href: '/problem-records?open=new',
        type: 'Hızlı İşlem'
      });
    }
    if (
      normalizedQuery.includes('calisma izni ekle') ||
      normalizedQuery.includes('calisma izni olustur') ||
      (normalizedQuery.includes('calisma') && normalizedQuery.includes('izni') && (normalizedQuery.includes('ekle') || normalizedQuery.includes('olustur')))
    ) {
      pushUnique({
        title: 'Çalışma İzni Ekle',
        subtitle: 'Çalışma izni yeni kayıt penceresini aç',
        href: '/calisma-izni?open=new',
        type: 'Hızlı İşlem'
      });
    }
    const mmsReportStationList = [
      'halkali', 'mustafa kemal', 'kucukcekmece', 'florya', 'florya akvaryum', 'yesilkoy', 'yesilyurt',
      'atakoy', 'bakirkoy', 'yenimahalle', 'zeytinburnu', 'kazlicesme', 'yenikapi', 'sirkeci', 'uskudar',
      'ayrilik cesmesi', 'sogutlucesme', 'acibadem', 'unalan', 'goztepe', 'feneryolu', 'bostanci',
      'kucukyali', 'idealtepe', 'sureyya plaji', 'maltepe', 'cevizli', 'atalar', 'kartal', 'yunus',
      'pendik', 'tersane', 'guzelyali', 'aydintepe', 'icmeler', 'tuzla', 'cayirova', 'osmangazi', 'gebze'
    ];
    const matchedMmsReportStation = mmsReportStationList.find((s) => normalizedQuery.includes(s)) || '';
    const wantsMmsReport = normalizedQuery.includes('rapor') && (normalizedQuery.includes('mms') || normalizedQuery.includes('ariza') || Boolean(matchedMmsReportStation));
    const wantsAllStationsMmsReport = normalizedQuery.includes('tum istasyon') || normalizedQuery.includes('butun istasyon') || normalizedQuery.includes('hepsi');
    if (wantsMmsReport) {
      if (wantsAllStationsMmsReport) {
        pushUnique({
          title: 'MMS Arıza Raporu',
          subtitle: 'Tüm istasyonlar için PDF rapor oluştur',
          href: '/problem-records?report=pdf&allStations=1',
          type: 'Hızlı İşlem'
        });
      } else if (matchedMmsReportStation) {
        pushUnique({
          title: 'MMS Arıza Raporu',
          subtitle: `${query.trim()} için PDF rapor oluştur`,
          href: `/problem-records?report=pdf&stationQuery=${encodeURIComponent(matchedMmsReportStation)}`,
          type: 'Hızlı İşlem'
        });
      }
    }
    const wantsCalismaReport = normalizedQuery.includes('rapor') && (normalizedQuery.includes('calisma') || normalizedQuery.includes('calisma kaydi') || normalizedQuery.includes('calisma kayit'));
    if (wantsCalismaReport) {
      if (wantsAllStationsMmsReport) {
        pushUnique({
          title: 'Çalışma İzni Raporu',
          subtitle: 'Tüm istasyonlar için PDF rapor oluştur',
          href: '/calisma-izni?report=pdf&allStations=1',
          type: 'Hızlı İşlem'
        });
      } else if (matchedMmsReportStation) {
        pushUnique({
          title: 'Çalışma İzni Raporu',
          subtitle: `${query.trim()} için PDF rapor oluştur`,
          href: `/calisma-izni?report=pdf&stationQuery=${encodeURIComponent(matchedMmsReportStation)}`,
          type: 'Hızlı İşlem'
        });
      } else {
        pushUnique({
          title: 'Çalışma İzni Raporu',
          subtitle: 'Çalışma izinleri için PDF rapor oluştur',
          href: '/calisma-izni?report=pdf',
          type: 'Hızlı İşlem'
        });
      }
    }
    if (normalizedQuery.includes('rapor') && normalizedQuery.includes('kayip') && normalizedQuery.includes('esya')) {
      pushUnique({
        title: 'Kayıp Eşya Raporu',
        subtitle: `${query.trim()} için PDF rapor oluştur`,
        href: `/kayip-esya?report=pdf&durumQuery=${encodeURIComponent(normalizedQuery)}`,
        type: 'Hızlı İşlem'
      });
    }
    if (normalizedQuery.includes('rapor') && (normalizedQuery.includes('dahili') || normalizedQuery.includes('telefon') || normalizedQuery.includes('numara'))) {
      pushUnique({
        title: 'Dahili Numaralar Raporu',
        subtitle: `${query.trim()} için PDF rapor oluştur`,
        href: `/dahili-numaralar?report=pdf&birimQuery=${encodeURIComponent(normalizedQuery)}`,
        type: 'Hızlı İşlem'
      });
    }
    if (matchedStationSlug) {
      pushUnique({
        title: 'İstasyon Şeması',
        subtitle: `${query.trim()} için istasyon şemasını aç`,
        href: `/istasyon-semalari/${matchedStationSlug}`,
        type: 'Hızlı İşlem',
        searchValue: ''
      });
    }

    (mms?.records || []).slice(0, 5).forEach((r: Record<string, any>) => {
      pushUnique({ title: `MMS #${r.mms_numarasi || '-'}`, subtitle: `${clipText(r.ariza_tanimi || '', 52)} • ${clipText(r.istasyon || '-', 14)}`, href: `/problem-records?editId=${encodeURIComponent(String(r.id || ''))}`, type: 'MMS', searchValue: query });
    });
    (izin?.records || []).slice(0, 5).forEach((r: Record<string, any>) => {
      pushUnique({ title: `Çalışma ${r.calisma_kodu || '-'}`, subtitle: `${clipText(r.yapilacak_is || '', 52)} • ${clipText(r.istasyon || '-', 14)}`, href: `/calisma-izni?editId=${encodeURIComponent(String(r.id || ''))}`, type: 'Çalışma', searchValue: query });
    });
    (notlar?.notes || []).slice(0, 5).forEach((n: Record<string, any>) => {
      pushUnique({ title: clipText(n.baslik || 'İsimsiz Not', 46), subtitle: `${clipText(n.kategori || 'Genel', 16)} • ${clipText(n.icerik || '', 52)}`, href: `/notlar?viewId=${encodeURIComponent(String(n.id || ''))}`, type: 'Not', searchValue: query });
    });
    (kayip?.records || []).slice(0, 5).forEach((r: Record<string, any>) => {
      pushUnique({ title: `Belge ${r.belge_no || '-'}`, subtitle: `${clipText(r.esya_tanimi || '', 46)} • ${clipText(r.esya_sahibi_ad_soyad || '-', 20)}`, href: `/kayip-esya?editId=${encodeURIComponent(String(r.id || ''))}`, type: 'Kayıp Eşya', searchValue: query });
    });
    (dahili?.records || []).slice(0, 5).forEach((r: Record<string, any>) => {
      pushUnique({ title: `${clipText(r.dahili_numara || '-', 10)} • ${clipText(r.birim || '-', 24)}`, subtitle: clipText(r.aciklama || 'Dahili numara kaydı', 56), href: '/dahili-numaralar', type: 'Dahili', searchValue: query });
    });

    (vardiya?.records || []).forEach((r: Record<string, any>) => {
      const personNames = Array.isArray(r.personel)
        ? r.personel.map((p) => String(p?.fullName || '').trim()).filter(Boolean).slice(0, 3)
        : [];
      const ayNo = Number(r.ay || 0);
      const ayLabel = ayNo >= 1 && ayNo <= 12 ? monthNames[ayNo - 1] : String(r.ay || '-');
      const title = `Vardiya ${clipText(r.istasyon || '-', 26)} - ${ayLabel} ${r.yil || ''}`.trim();
      const subtitle = personNames.length
        ? `Personel: ${clipText(personNames.join(', '), 58)}`
        : 'Personel bilgisi bulunmuyor';
      const haystack = normalize(`${title} ${subtitle} ${r.istasyon || ''} ${ayLabel} ${r.yil || ''}`);
      if (!haystack.includes(normalizedQuery) && !tokens.every((t) => haystack.includes(t))) return;
      pushUnique({ title, subtitle, href: '/vardiya', type: 'Vardiya', searchValue: String(r.istasyon || '').trim() });
    });

    const rankedStatic = staticPages
      .map((entry) => ({ entry, score: scoreEntry(entry) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map(({ entry }) => ({
        title: entry.title,
        subtitle: entry.subtitle,
        href: entry.href,
        type: entry.type,
        external: Boolean(entry.external),
        searchValue: entry.passSearch ? query : ''
      }));

    rankedStatic.forEach((item) => pushUnique(item));
    dedupeMap.forEach((value) => items.push(value));
    return items.slice(0, 30);
  };

  const onSearch = async (): Promise<void> => {
    const query = input.value.trim();
    activeQuery = query;
    if (query.length < 2) {
      hint.textContent = uiText('En az 2 karakter yazın', 'Enter at least 2 characters');
      resultsEl.innerHTML = '';
      return;
    }
    hint.textContent = uiText('Aranıyor...', 'Searching...');
    const items = await fetchSearchResults(query);
    if (activeQuery !== query) return;
    hint.textContent = isEnglish() ? `${items.length} results` : `${items.length} sonuç`;
    renderResults(items);
  };

  fab.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onSearch, 220);
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault();
      openModal();
    }
    if (key === 'escape' && modal.style.display === 'flex') closeModal();
  });

  if (options.seedLocalSearch) {
    const pageSearch = new URLSearchParams(window.location.search).get('search');
    if (pageSearch) {
      const localSearch = document.getElementById('searchInput');
      if (localSearch && 'value' in localSearch) {
        setTimeout(() => {
          (localSearch as HTMLInputElement).value = pageSearch;
          localSearch.dispatchEvent(new Event('input', { bubbles: true }));
          localSearch.dispatchEvent(new Event('change', { bubbles: true }));
        }, 120);
      }
    }
  }
}
