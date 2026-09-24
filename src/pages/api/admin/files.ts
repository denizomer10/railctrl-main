import type { APIRoute } from 'astro';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

function ensureAdmin(locals: App.Locals): Response | null {
  if (!locals.user || locals.user.role !== 'yonetici') {
    return new Response(JSON.stringify({ error: 'Bu işlem için admin yetkisi gerekli' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

function isSafeName(name: string): boolean {
  return !!name && !name.includes('/') && !name.includes('\\') && !name.includes('..');
}

export const GET: APIRoute = async ({ locals }) => {
  const denied = ensureAdmin(locals);
  if (denied) return denied;

  try {
    const dir = path.join(process.cwd(), 'public', 'files');
    const names = await readdir(dir);
    const files: Array<{ name: string; size: number; modifiedAt: string; url: string }> = [];

    for (const name of names) {
      if (!isSafeName(name)) continue;
      const full = path.join(dir, name);
      const info = await stat(full);
      if (!info.isFile()) continue;
      files.push({
        name,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        url: `/files/${encodeURIComponent(name)}`,
      });
    }

    files.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));

    return new Response(JSON.stringify({ files }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Admin files list error:', error);
    return new Response(JSON.stringify({ error: 'Dosyalar listelenemedi' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = ensureAdmin(locals);
  if (denied) return denied;

  try {
    const body = await request.json();
    const fileName = String(body?.name || '').trim();
    if (!isSafeName(fileName)) {
      return new Response(JSON.stringify({ error: 'Geçersiz dosya adı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dir = path.join(process.cwd(), 'public', 'files');
    await unlink(path.join(dir, fileName));

    await logAudit({
      userId: locals.user!.id,
      action: 'admin.files.delete',
      resourceType: 'files',
      resourceId: fileName,
      details: { fileName },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ message: 'Dosya silindi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Admin file delete error:', error);
    return new Response(JSON.stringify({ error: 'Dosya silinemedi' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
