/**
 * Notlar Tekil Kayıt API Endpoints
 * GET /api/notlar/[id] - Not detayı
 * PUT /api/notlar/[id] - Not güncelle
 * DELETE /api/notlar/[id] - Not sil
 */

import type { APIRoute } from 'astro';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

function getFileNamesFromNote(note: any): string[] {
  const names = new Set<string>();

  const medyaRaw = note?.medya;
  const medya = Array.isArray(medyaRaw)
    ? medyaRaw
    : (() => {
        try { return JSON.parse(medyaRaw || '[]'); } catch { return []; }
      })();

  for (const item of medya) {
    const mediaPath = item?.path;
    if (typeof mediaPath === 'string' && mediaPath.startsWith('/files/')) {
      const fileName = decodeURIComponent(mediaPath.replace('/files/', '').trim());
      if (fileName && !fileName.includes('/') && !fileName.includes('\\') && !fileName.includes('..')) {
        names.add(fileName);
      }
    }
  }

  const html = typeof note?.icerik === 'string' ? note.icerik : '';
  const matches = html.matchAll(/(?:src|href)=["']\/files\/([^"']+)["']/gi);
  for (const match of matches) {
    const fileName = decodeURIComponent((match[1] || '').trim());
    if (fileName && !fileName.includes('/') && !fileName.includes('\\') && !fileName.includes('..')) {
      names.add(fileName);
    }
  }

  return Array.from(names);
}

async function deleteNoteFiles(fileNames: string[]): Promise<void> {
  if (fileNames.length === 0) return;
  const filesDir = path.join(process.cwd(), 'public', 'files');

  await Promise.all(fileNames.map(async (name) => {
    const target = path.join(filesDir, name);
    try {
      await unlink(target);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.error('Dosya silinemedi:', name, error);
      }
    }
  }));
}

// Tekil not getir
export const GET: APIRoute = async ({ params }) => {
  try {
    await ensureAppSchema();
    const { id } = params;

    const result = await query<any>(`SELECT * FROM notlar WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Not bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ record: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Notlar GET [id] error:', error);
    return new Response(JSON.stringify({ error: 'Not alınırken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Not güncelle (sef veya admin)
export const PUT: APIRoute = async ({ params, request, locals }) => {
  // Yetki kontrolü
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (locals.user.role !== 'admin' && locals.user.role !== 'sef' && locals.user.role !== 'gar_mudur') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { id } = params;
    const body = await request.json();

    // Mevcut kaydı kontrol et
    const existing = await query<any>('SELECT * FROM notlar WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Not bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Güncelleme alanlarını oluştur
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = ['baslik', 'icerik', 'kategori', 'istasyon', 'hedef_roller', 'medya'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        if (field === 'hedef_roller') {
          const normalizedRoles = Array.isArray(body[field]) ? body[field] : [body[field]];
          values.push(JSON.stringify(normalizedRoles.filter(Boolean)));
        } else if (field === 'medya') {
          values.push(JSON.stringify(Array.isArray(body[field]) ? body[field] : []));
        } else {
          values.push(body[field]);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'Güncellenecek alan bulunamadı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // updated_at alanını güncelle
    updates.push(`updated_at = NOW()`);
    
    values.push(id);

    const result = await query<any>(`
      UPDATE notlar 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.update',
      resourceType: 'notlar',
      resourceId: id || null,
      details: body,
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({
      message: 'Not güncellendi',
      record: result.rows[0]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Notlar PUT error:', error);
    return new Response(JSON.stringify({ error: 'Not güncellenirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Not sil (sef veya admin)
export const DELETE: APIRoute = async ({ params, locals }) => {
  // Yetki kontrolü
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (locals.user.role !== 'admin' && locals.user.role !== 'sef' && locals.user.role !== 'gar_mudur') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { id } = params;

    const existing = await query<any>('SELECT medya, icerik FROM notlar WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Not bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const fileNames = getFileNamesFromNote(existing.rows[0]);
    const result = await query<any>('DELETE FROM notlar WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Not bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.delete',
      resourceType: 'notlar',
      resourceId: id || null,
      details: {},
    });

    await deleteNoteFiles(fileNames);

    return new Response(JSON.stringify({ message: 'Not silindi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Notlar DELETE error:', error);
    return new Response(JSON.stringify({ error: 'Not silinirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
