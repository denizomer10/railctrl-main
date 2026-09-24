import type { APIRoute } from 'astro';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logAudit } from '../../../../lib/audit';

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
];

function normalizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'dosya';
}

function buildPublicUrl(fileName: string): string {
  return `/files/${encodeURIComponent(fileName)}`;
}

function fileNameFromPublicPath(publicPath: string): string | null {
  if (!publicPath.startsWith('/files/')) return null;
  const name = decodeURIComponent(publicPath.slice('/files/'.length)).trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  return name;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (locals.user.role !== 'yonetici') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const uploaded = formData.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (uploaded.length === 0) {
      return new Response(JSON.stringify({ error: 'Yüklenecek dosya bulunamadı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const filesDir = path.join(process.cwd(), 'public', 'files');
    await mkdir(filesDir, { recursive: true });

    const records: Array<Record<string, unknown>> = [];

    for (const file of uploaded) {
      if (file.size > MAX_FILE_SIZE) {
        return new Response(JSON.stringify({ error: `${file.name} 10MB sınırını aşıyor` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const mimeType = file.type || 'application/octet-stream';
      const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || ALLOWED_MIME_TYPES.includes(mimeType);
      if (!isAllowed) {
        return new Response(JSON.stringify({ error: `${file.name} desteklenmeyen dosya türü` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const originalName = normalizeFileName(file.name);
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      const uniqueName = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const targetPath = path.join(filesDir, uniqueName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(targetPath, bytes);

      records.push({
        name: originalName,
        path: buildPublicUrl(uniqueName),
        mimeType,
        size: file.size,
        type: mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'file',
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.media.upload',
      resourceType: 'notlar',
      resourceId: null,
      details: { count: records.length, files: records.map((r) => r.name) },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ files: records }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Not media upload error:', error);
    return new Response(JSON.stringify({ error: 'Dosya yüklenirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (locals.user.role !== 'yonetici') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const paths = Array.isArray(body?.paths) ? body.paths : [];
    if (paths.length === 0) {
      return new Response(JSON.stringify({ error: 'Silinecek dosya yolu bulunamadı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const filesDir = path.join(process.cwd(), 'public', 'files');
    const deleted: string[] = [];

    for (const p of paths) {
      if (typeof p !== 'string') continue;
      const fileName = fileNameFromPublicPath(p);
      if (!fileName) continue;
      try {
        await unlink(path.join(filesDir, fileName));
        deleted.push(fileName);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') console.error('Not media delete error:', error);
      }
    }

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.media.delete',
      resourceType: 'notlar',
      resourceId: null,
      details: { deleted },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ deleted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Not media delete error:', error);
    return new Response(JSON.stringify({ error: 'Dosya silinirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
