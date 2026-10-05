/**
 * Not Medya Yükleme API Endpoints
 * POST   /api/notlar/upload - Resim / medya / belge yükle
 * DELETE /api/notlar/upload - Nottan çıkarılan medyayı sil
 */

import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';
import {
  deleteMediaFile,
  mediaNameFromAnyPath,
  saveMediaFile,
  type StoredMedia,
} from '../../../../lib/media';

export const prerender = false;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

// SVG, HTML gibi etkin içerik taşıyabilen türler not eki olarak kabul edilmez.
const BLOCKED_MIME_TYPES = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml']);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requireManager(locals: App.Locals): Response | null {
  if (!locals.user) return json({ error: 'Yetkisiz erişim' }, 401);
  if (locals.user.role !== 'yonetici') return json({ error: 'Bu işlem için yetkiniz yok' }, 403);
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManager(locals);
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const uploaded = formData.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (uploaded.length === 0) {
      return json({ error: 'Yüklenecek dosya bulunamadı' }, 400);
    }

    const records: StoredMedia[] = [];

    for (const file of uploaded) {
      if (file.size > MAX_FILE_SIZE) {
        return json({ error: `${file.name} 10MB sınırını aşıyor` }, 400);
      }

      const mimeType = file.type || 'application/octet-stream';
      const isAllowed =
        !BLOCKED_MIME_TYPES.has(mimeType) &&
        (ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
          ALLOWED_MIME_TYPES.includes(mimeType));

      if (!isAllowed) {
        return json({ error: `${file.name} desteklenmeyen dosya türü` }, 400);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      records.push(await saveMediaFile(bytes, file.name, mimeType));
    }

    await logAudit({
      userId: locals.user!.id,
      action: 'notlar.media.upload',
      resourceType: 'notlar',
      resourceId: null,
      details: { count: records.length, files: records.map((r) => r.name) },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return json({ files: records });
  } catch (error) {
    console.error('Not media upload error:', error);
    return json({ error: 'Dosya yüklenirken hata oluştu' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = requireManager(locals);
  if (denied) return denied;

  try {
    const body = await request.json();
    const paths = Array.isArray(body?.paths) ? body.paths : [];
    if (paths.length === 0) {
      return json({ error: 'Silinecek dosya yolu bulunamadı' }, 400);
    }

    const deleted: string[] = [];
    for (const p of paths) {
      const name = mediaNameFromAnyPath(p);
      if (!name) continue;
      if (await deleteMediaFile(name)) deleted.push(name);
    }

    await logAudit({
      userId: locals.user!.id,
      action: 'notlar.media.delete',
      resourceType: 'notlar',
      resourceId: null,
      details: { deleted },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return json({ deleted });
  } catch (error) {
    console.error('Not media delete error:', error);
    return json({ error: 'Dosya silinirken hata oluştu' }, 500);
  }
};