// Paylaşılan istemci yardımcıları: tipli fetch sarmalayıcı, vendor yükleyici,
// kaçış ve tarih biçimleyiciler. Sayfa scriptleri bunları import eder.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiOptions = Omit<RequestInit, 'method' | 'body'> & {
  method?: HttpMethod;
  body?: BodyInit | null;
  json?: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type ErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
};

/** JSON API'lere tipli istek atar; hata gövdesindeki mesajı taşır. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as ErrorPayload;
      if (data?.error) message = data.error;
      else if (data?.message) message = data.message;
      code = data?.code;
    } catch {
      /* JSON değilse varsayılan mesaj */
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const apiGet = <T>(path: string, init?: Omit<ApiOptions, 'method' | 'json'>): Promise<T> =>
  api<T>(path, { ...init, method: 'GET' });

export const apiPost = <T>(path: string, json?: unknown, init?: Omit<ApiOptions, 'method' | 'json'>): Promise<T> =>
  api<T>(path, { ...init, method: 'POST', json });

export const apiPut = <T>(path: string, json?: unknown, init?: Omit<ApiOptions, 'method' | 'json'>): Promise<T> =>
  api<T>(path, { ...init, method: 'PUT', json });

export const apiPatch = <T>(path: string, json?: unknown, init?: Omit<ApiOptions, 'method' | 'json'>): Promise<T> =>
  api<T>(path, { ...init, method: 'PATCH', json });

export const apiDelete = <T>(path: string, init?: Omit<ApiOptions, 'method' | 'json'>): Promise<T> =>
  api<T>(path, { ...init, method: 'DELETE' });

const loadedVendorScripts = new Set<string>();

/** Vendor betiklerini (pdfmake, exceljs...) tek sefer yükler. */
export function loadScriptOnce(src: string): Promise<void> {
  if (loadedVendorScripts.has(src)) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    loadedVendorScripts.add(src);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => {
      loadedVendorScripts.add(src);
      resolve();
    };
    el.onerror = () => reject(new Error(`Betik yüklenemedi: ${src}`));
    document.head.appendChild(el);
  });
}

/** HTML enjeksiyonuna karşı metin kaçışı. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ISO/SQLite tarihini dd.MM.yyyy HH:mm biçimine çevirir. */
export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO/SQLite tarihini dd.MM.yyyy biçimine çevirir. */
export function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Basit toast bildirimi; sayfada #toast yoksa sessizce atlar. */
export function notify(message: string, ms = 3200): void {
  const toast = el('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout((toast as HTMLElement & { __t?: number }).__t);
  (toast as HTMLElement & { __t?: number }).__t = window.setTimeout(() => {
    toast.hidden = true;
  }, ms);
}
