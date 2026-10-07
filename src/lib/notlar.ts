/**
 * Not modülü ortak yardımcıları.
 *
 * Hem `/api/notlar` (liste/oluştur) hem `/api/notlar/[id]` (detay/güncelle/sil)
 * uç noktaları aynı zaman damgası ve medya ayrıştırma davranışını paylaşır;
 * mantık tek yerde tutulur ki iki uç nokta arasında kaymasın.
 */

/** Yalnızca yöneticilerin görebileceği not kategorisi. */
export const PRIVATE_NOTE_CATEGORY = 'Özel';

/**
 * Avrupa/İstanbul saat diliminde `YYYY-MM-DD HH:MM:SS` biçiminde zaman
 * damgası üretir. Notların `created_at`/`updated_at` alanları bu yerel biçimi
 * kullanır (bkz. schema.ts varsayılanı).
 */
export function getIstanbulTimestamp(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

/** Not eki listesini (JSON dizi ya da boş) güvenli şekilde ayrıştırır. */
export function parseMedia(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
