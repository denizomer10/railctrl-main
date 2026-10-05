/**
 * Not içeriği sanitizasyonu — iki katmanlı savunma.
 *
 * 1. `sanitizeHtml` (tarayıcı): DOM tabanlı beyaz liste. Zengin metin
 *    editörünün ürettiği ve veritabanından gelen HTML'i güvenli hale getirir.
 * 2. `assertSafeHtml` (sunucu): İnkâr listesi kontrolü. İstemci atlatılsa
 *    bile aktif içerik (`<script>`, `javascript:`, olay öznitelikleri...)
 *    veritabanına hiç yazılmaz.
 */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'DIV', 'SPAN', 'HR',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'INS', 'MARK', 'SUB', 'SUP', 'CODE', 'KBD', 'ABBR',
  'H1', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI',
  'BLOCKQUOTE', 'PRE',
  'A', 'IMG', 'FIGURE', 'FIGCAPTION',
  'VIDEO', 'AUDIO', 'SOURCE',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION',
  'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD',
]);

/** Etiket başına ek öznitelik izinleri. */
const TAG_EXTRA_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel', 'title']),
  IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
  VIDEO: new Set(['src', 'controls', 'poster', 'width', 'height', 'preload']),
  AUDIO: new Set(['src', 'controls', 'preload']),
  SOURCE: new Set(['src', 'type']),
  TD: new Set(['colspan', 'rowspan']),
  TH: new Set(['colspan', 'rowspan', 'scope']),
  LI: new Set(['data-checked']),
  OL: new Set(['start', 'type']),
  UL: new Set(['class']),
  SPAN: new Set(['class']),
  DIV: new Set(['class']),
  CODE: new Set(['class']),
  PRE: new Set(['class']),
  BLOCKQUOTE: new Set(['class']),
  DETAILS: new Set(['open']),
  ABBR: new Set(['title']),
};

/** Her etikette serbest olan öznitelikler. */
const GLOBAL_ATTRS = new Set(['class', 'style', 'title', 'dir', 'lang']);

const SAFE_STYLE_PROPS = new Set([
  'color', 'background-color',
  'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'text-align', 'vertical-align',
  'width', 'height', 'max-width', 'max-height',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'border', 'border-radius', 'float', 'display', 'white-space', 'object-fit',
]);

const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/** `style` özniteliklerinden yalnızca güvenli özellikleri geçirir. */
export function sanitizeStyleValue(value: string): string {
  const kept: string[] = [];
  for (const decl of value.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    if (!SAFE_STYLE_PROPS.has(prop)) continue;
    // `expression()`, `url()` ve `javascript:` tabanlı değerleri ele.
    if (/expression\s*\(|javascript\s*:|@import|url\s*\(/i.test(val)) continue;
    kept.push(`${prop}: ${val}`);
  }
  return kept.join('; ');
}

/** Göreli `/api/media/...` ve `/files/...` yolları dahil güvenli URL doğrulaması. */
export function isSafeUrl(raw: string, opts: { allowRelative?: boolean } = {}): boolean {
  const value = (raw || '').trim();
  if (!value) return false;
  if (/[\u0000-\u001f\u007f\s]/.test(value.replace(/^\s+/, ''))) return false;

  if (value.startsWith('//')) return false;

  if (value.startsWith('/')) {
    return opts.allowRelative !== false;
  }

  try {
    const url = new URL(value);
    return SAFE_URL_PROTOCOLS.includes(url.protocol.toLowerCase());
  } catch {
    return false;
  }
}

function isSafeMediaSrc(src: string): boolean {
  const value = (src || '').trim();
  if (!value) return false;
  if (value.startsWith('data:')) {
    return /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(value);
  }
  if (value.startsWith('blob:')) return true;
  return isSafeUrl(value);
}

/**
 * DOM tabanlı beyaz liste temizliği. Yalnızca tarayıcıda çağrılmalıdır.
 */
export function sanitizeHtml(raw: string): string {
  if (typeof document === 'undefined') return '';

  const template = document.createElement('template');
  template.innerHTML = raw || '';

  const toRemove: Element[] = [];
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    const tag = el.tagName;

    if (!ALLOWED_TAGS.has(tag)) {
      toRemove.push(el);
      continue;
    }

    const allowedAttrs = TAG_EXTRA_ATTRS[tag] || new Set<string>();

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      // Olay öznitelikleri ve veri betikleri asla geçmez.
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style') {
        const cleaned = sanitizeStyleValue(value);
        if (cleaned) el.setAttribute('style', cleaned);
        else el.removeAttribute('style');
        continue;
      }

      const permitted = GLOBAL_ATTRS.has(name) || allowedAttrs.has(name);
      if (!permitted) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'href' || name === 'src' || name === 'poster') {
        const ok = name === 'src' && (tag === 'IMG' || tag === 'SOURCE' || tag === 'VIDEO' || tag === 'AUDIO')
          ? isSafeMediaSrc(value)
          : isSafeUrl(value);
        if (!ok) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      if (name === 'target') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        continue;
      }

      if (name === 'type' && tag === 'SOURCE') {
        if (!/^(image|video|audio)\/[a-z0-9.+-]+$/i.test(value)) el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan' || name === 'start') {
        if (!/^\d{1,5}(px|%|em|rem|vw|vh)?$/i.test(value.trim())) el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'data-checked') {
        el.setAttribute('data-checked', value === '1' || value === 'true' ? '1' : '0');
      }
    }

    // Kontrolsüz `class` dışındaki sınıfları sadeleştir.
    if (el.hasAttribute('class')) {
      const safeClasses = (el.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => /^[a-z][a-z0-9_-]{0,40}$/i.test(c))
        .slice(0, 8);
      if (safeClasses.length) el.setAttribute('class', safeClasses.join(' '));
      else el.removeAttribute('class');
    }
  }

  // Kaldırılacak düğümleri içerikleriyle birlikte dışarı at.
  for (const el of toRemove) {
    el.replaceWith(...Array.from(el.childNodes));
  }

  return template.innerHTML;
}

/**
 * HTML kaçışlama. `innerHTML` şablonlarında kullanıcı verisi kullanılacaksa
 * mutlaka bu fonksiyondan geçirilmelidir.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML öznitelik değeri kaçışlama. Çift tırnaklı özniteliklerde güvenlidir.
 */
export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

const DANGEROUS_PATTERNS: RegExp[] = [
  /<\s*(script|iframe|object|embed|form|input|button|textarea|select|meta|base|link|style|math|svg)\b/i,
  /\bon[a-z]+\s*=/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /srcdoc\s*=/i,
  /formaction\s*=/i,
  /<\s*!\[CDATA\[/i,
  /expression\s*\(/i,
];

/**
 * Sunucu tarafı inkâr listesi. Tehlikeli kalıp görürse hata fırlatır.
 * `sanitizeHtml` beyaz listesinin yanında savunma derinliği olarak durur.
 */
export function assertSafeHtml(raw: unknown, field = 'icerik'): void {
  if (raw === undefined || raw === null) return;
  if (typeof raw !== 'string') {
    throw new Error(`${field} metin olmalıdır`);
  }
  if (!raw.trim()) return;

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(raw)) {
      throw new Error(`${field} geçersiz veya desteklenmeyen içerik içeriyor`);
    }
  }
}

export default { sanitizeHtml, assertSafeHtml, isSafeUrl, sanitizeStyleValue, escapeHtml, escapeAttr };