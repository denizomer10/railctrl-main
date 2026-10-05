/**
 * Not ve referans medyaları için disk tabanlı depolama servisi.
 *
 * Dosyalar `public/` altında değil, çalışma zamanı dizininde tutulur. Böylece
 * hem geliştirme hem de üretim (standalone) sunucusunda aynı şekilde servis
 * edilirler ve her istekte kimlik doğrulamasından geçerler. `public/files`
 * klasörüne yazmak üretimde kırılırdı: `astro build` anındaki içerik
 * `dist/client` içine kopyalanır, sonradan eklenen dosyalar oraya düşmezdi.
 */

import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

export const MEDIA_URL_PREFIX = '/api/media/';

const EXTENSION_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
};

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface StoredMedia {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  type: MediaKind;
}

export interface MediaEntry extends StoredMedia {
  modifiedAt: string;
}

export interface SaveMediaOptions {
  /** Aynı ada sahip dosya varsa üzerine yaz (sabit referans görselleri için). */
  overwrite?: boolean;
}

/** Çalışma zamanı medya dizini. `MEDIA_DIR` ile değiştirilebilir. */
export function getMediaDir(): string {
  const configured = process.env.MEDIA_DIR;
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), '.data', 'media');
}

export function guessMimeType(fileName: string): string {
  return EXTENSION_MIME[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

export function mediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Dosya adını yola ayrılabilecek her şeyden arındırır. Türkçe karakterler
 * korunur; yalnızca yol ayırıcıları, kontrol karakterleri ve tehlikeli
 * kalıplar temizlenir.
 */
export function sanitizeMediaName(name: string): string {
  const cleaned = String(name || '')
    .normalize('NFC')
    .replace(/[\/\\<>:"|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/-+$/, '')
    .trim();

  return cleaned || `dosya-${Date.now()}`;
}

export function isSafeMediaName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 200 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..') &&
    !name.startsWith('.')
  );
}

export function mediaUrl(name: string): string {
  return `${MEDIA_URL_PREFIX}${encodeURIComponent(name)}`;
}

/**
 * `/files/ad.png`, `/api/media/ad.png` veya çıplak `ad.png` girdisinden
 * güvenli dosya adını çıkarır. Geçersizse `null` döner.
 */
export function mediaNameFromAnyPath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;

  for (const prefix of [MEDIA_URL_PREFIX, '/files/']) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }

  // Sorgu/parça artıklarını at
  value = value.split('?')[0].split('#')[0];

  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }

  value = value.trim();
  return isSafeMediaName(value) ? value : null;
}

async function ensureMediaDir(): Promise<string> {
  const dir = getMediaDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function uniqueName(dir: string, preferred: string): Promise<string> {
  const ext = path.extname(preferred);
  const base = path.basename(preferred, ext);
  let candidate = preferred;
  let attempt = 1;

  while (true) {
    try {
      await stat(path.join(dir, candidate));
    } catch {
      return candidate;
    }
    candidate = `${base}-${attempt}${ext}`;
    attempt += 1;
    if (attempt > 500) {
      return `${base}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    }
  }
}

export async function saveMediaFile(
  bytes: Uint8Array,
  originalName: string,
  mimeType: string,
  options: SaveMediaOptions = {}
): Promise<StoredMedia> {
  const dir = await ensureMediaDir();
  const preferred = sanitizeMediaName(originalName);
  const name = options.overwrite ? preferred : await uniqueName(dir, preferred);
  const resolvedMime = mimeType && mimeType !== 'application/octet-stream' ? mimeType : guessMimeType(name);

  await writeFile(path.join(dir, name), bytes);

  return {
    name,
    path: mediaUrl(name),
    mimeType: resolvedMime,
    size: bytes.length,
    type: mediaKind(resolvedMime),
  };
}

export async function readMediaFile(name: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!isSafeMediaName(name)) return null;
  try {
    const bytes = await readFile(path.join(getMediaDir(), name));
    return { bytes, mimeType: guessMimeType(name) };
  } catch {
    return null;
  }
}

export async function deleteMediaFile(name: string): Promise<boolean> {
  if (!isSafeMediaName(name)) return false;
  try {
    await unlink(path.join(getMediaDir(), name));
    return true;
  } catch {
    return false;
  }
}

export async function listMediaFiles(): Promise<MediaEntry[]> {
  let names: string[];
  try {
    names = await readdir(getMediaDir());
  } catch {
    return [];
  }

  const entries: MediaEntry[] = [];
  for (const name of names) {
    if (!isSafeMediaName(name)) continue;
    try {
      const info = await stat(path.join(getMediaDir(), name));
      if (!info.isFile()) continue;
      const mimeType = guessMimeType(name);
      entries.push({
        name,
        path: mediaUrl(name),
        mimeType,
        size: info.size,
        type: mediaKind(mimeType),
        modifiedAt: info.mtime.toISOString(),
      });
    } catch {
      /* dosya yarışta silinmiş olabilir */
    }
  }

  entries.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  return entries;
}

export default {
  getMediaDir,
  guessMimeType,
  mediaKind,
  sanitizeMediaName,
  isSafeMediaName,
  mediaUrl,
  mediaNameFromAnyPath,
  saveMediaFile,
  readMediaFile,
  deleteMediaFile,
  listMediaFiles,
};