/**
 * Admin Dosya Yönetimi API Endpoints
 * GET    /api/admin/files - Medya deposundaki dosyaları listele
 * DELETE /api/admin/files - Medya deposundan dosya sil
 */

import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { deleteMediaFile, isSafeMediaName, listMediaFiles } from '../../../lib/media';

export const prerender = false;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ensureAdmin(locals: App.Locals): Response | null {
  if (!locals.user || locals.user.role !== 'yonetici') {
    return json({ error: 'Bu işlem için admin yetkisi gerekli' }, 403);
  }
  return null;
}

export const GET: APIRoute = async ({ locals }) => {
  const denied = ensureAdmin(locals);
  if (denied) return denied;

  try {
    const entries = await listMediaFiles();
    return json({
      files: entries.map(({ name, size, modifiedAt, path }) => ({ name, size, modifiedAt, url: path })),
    });
  } catch (error) {
    console.error('Admin files list error:', error);
    return json({ error: 'Dosyalar listelenemedi' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = ensureAdmin(locals);
  if (denied) return denied;

  try {
    const body = await request.json();
    const fileName = String(body?.name || '').trim();
    if (!isSafeMediaName(fileName)) {
      return json({ error: 'Geçersiz dosya adı' }, 400);
    }

    const removed = await deleteMediaFile(fileName);
    if (!removed) {
      return json({ error: 'Dosya bulunamadı' }, 404);
    }

    await logAudit({
      userId: locals.user!.id,
      action: 'admin.files.delete',
      resourceType: 'files',
      resourceId: fileName,
      details: { fileName },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return json({ message: 'Dosya silindi' });
  } catch (error) {
    console.error('Admin file delete error:', error);
    return json({ error: 'Dosya silinemedi' }, 500);
  }
};