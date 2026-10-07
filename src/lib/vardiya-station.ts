import { query, Tables } from './database';

/**
 * İstasyon adlarını karşılaştırmak için kanonik forma indirger.
 * Türkçe karakterler, büyük/küçük harf ve noktalama farklarını yok sayar.
 */
export function normalizeStationName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]/g, '');
}

/** `normalizeStationName` çıktısında `i` harfini de yok sayan gevşek anahtar. */
export function looseStationKey(value: string): string {
  return value.replace(/i/g, '');
}

/** İki istasyon adının aynı yeri ifade edip etmediğini belirler. */
export function isSameStation(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeStationName(a);
  const right = normalizeStationName(b);
  return left === right || looseStationKey(left) === looseStationKey(right);
}

/** Kullanıcının kayıtlı istasyonunu veritabanından okur. */
export async function getUserStation(userId: string): Promise<string | null> {
  const result = await query<{ istasyon: string | null }>(
    `SELECT istasyon FROM ${Tables.USERS} WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.istasyon || null;
}
