/**
 * Notlar Tekil Kayıt API Endpoints
 * GET /api/notlar/[id] - Not detayı
 * PUT /api/notlar/[id] - Not güncelle
 * DELETE /api/notlar/[id] - Not sil
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';
import { deleteMediaFile, mediaNameFromAnyPath } from '../../../lib/media';
import { assertSafeHtml } from '../../../lib/sanitize';

export const prerender = false;

const PRIVATE_CATEGORY = 'Özel';

function getIstanbulTimestamp(): string {
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

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && !!v);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && !!v) : [];
  } catch {
    // Eski CSV/metin biçimi
    return raw.split(',').map((v) => v.trim()).filter(Boolean);
  }
}

function parseMedia(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Notun hedef kitlesi bu kullanıcıyı kapsıyor mu? */
function canViewNote(note: any, user: NonNullable<App.Locals['user']>): boolean {
  if (user.role === 'yonetici') return true;
  if (note.kategori === PRIVATE_CATEGORY) return false;

  const targets = parseJsonArray(note.hedef_roller);
  if (targets.length === 0) return true;
  return targets.includes(user.role);
}

/** Notta geçen tüm medya dosya adlarını topla (liste + içerik gövdesi). */
function getFileNamesFromNote(note: any): string[] {
  const names = new Set<string>();

  for (const item of parseMedia(note?.medya)) {
    const name = mediaNameFromAnyPath(item?.path ?? item?.name);
    if (name) names.add(name);
  }

  const html = typeof note?.icerik === 'string' ? note.icerik : '';
  for (const match of html.matchAll(/(?:src|href)=["'](?:\/files\/|\/api\/media\/)([^"']+)["']/gi)) {
    const name = mediaNameFromAnyPath(match[1]);
    if (name) names.add(name);
  }

  return Array.from(names);
}

async function deleteNoteFiles(fileNames: string[]): Promise<void> {
  await Promise.all(
    fileNames.map(async (name) => {
      try {
        await deleteMediaFile(name);
      } catch (error) {
        console.error('Dosya silinemedi:', name, error);
      }
    })
  );
}

// Tekil not getir
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Yetkisiz erişim' }, 401);

  try {
    await ensureAppSchema();
    const { id } = params;

    const result = await query<any>(`SELECT * FROM notlar WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return json({ error: 'Not bulunamadı' }, 404);
    }

    const note = result.rows[0];
    if (!canViewNote(note, locals.user)) {
      // Var olduğunu bile söylemeyiz; liste dışı notlar 404 gibi davranır.
      return json({ error: 'Not bulunamadı' }, 404);
    }

    return json({ record: note });
  } catch (error) {
    console.error('Notlar GET [id] error:', error);
    return json({ error: 'Not alınırken hata oluştu' }, 500);
  }
};

// Not güncelleme yönetici rolüne özeldir
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Yetkisiz erişim' }, 401);
  if (locals.user.role !== 'yonetici') return json({ error: 'Bu işlem için yetkiniz yok' }, 403);

  try {
    await ensureAppSchema();
    const { id } = params;
    const body = await request.json();

    const existing = await query<any>('SELECT * FROM notlar WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return json({ error: 'Not bulunamadı' }, 404);
    }

    // Sunucu tarafı inkâr listesi: aktif içerik asla veritabanına yazılmaz.
    try {
      assertSafeHtml(body.icerik);
    } catch (validationError) {
      return json(
        { error: validationError instanceof Error ? validationError.message : 'Geçersiz içerik' },
        400
      );
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = ['baslik', 'icerik', 'kategori', 'istasyon', 'hedef_roller', 'medya'];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;

      updates.push(`${field} = $${paramIndex}`);
      if (field === 'hedef_roller') {
        values.push(JSON.stringify(parseJsonArray(body[field])));
      } else if (field === 'medya') {
        values.push(JSON.stringify(parseMedia(body[field])));
      } else {
        values.push(body[field]);
      }
      paramIndex++;
    }

    // Kategori "Özel" ise hedef kitle her zaman yalnızca yöneticilerdir.
    const nextKategori = body.kategori !== undefined ? body.kategori : existing.rows[0].kategori;
    if (nextKategori === PRIVATE_CATEGORY) {
      const idx = updates.findIndex((u) => u.startsWith('hedef_roller ='));
      const serialized = JSON.stringify(['yonetici']);
      if (idx >= 0) {
        values[idx] = serialized;
      } else {
        updates.push(`hedef_roller = $${paramIndex}`);
        values.push(serialized);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return json({ error: 'Güncellenecek alan bulunamadı' }, 400);
    }

    updates.push(`updated_at = $${paramIndex}`);
    values.push(getIstanbulTimestamp());
    paramIndex++;
    values.push(id);

    const result = await query<any>(
      `UPDATE notlar SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.update',
      resourceType: 'notlar',
      resourceId: id || null,
      details: body,
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return json({ message: 'Not güncellendi', record: result.rows[0] });
  } catch (error) {
    console.error('Notlar PUT error:', error);
    return json({ error: 'Not güncellenirken hata oluştu' }, 500);
  }
};

// Not silme yönetici rolüne özeldir
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Yetkisiz erişim' }, 401);
  if (locals.user.role !== 'yonetici') return json({ error: 'Bu işlem için yetkiniz yok' }, 403);

  try {
    await ensureAppSchema();
    const { id } = params;

    const existing = await query<any>('SELECT kategori, medya, icerik FROM notlar WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return json({ error: 'Not bulunamadı' }, 404);
    }

    const fileNames = getFileNamesFromNote(existing.rows[0]);
    const result = await query<any>('DELETE FROM notlar WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return json({ error: 'Not bulunamadı' }, 404);
    }

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.delete',
      resourceType: 'notlar',
      resourceId: id || null,
      details: {},
    });

    await deleteNoteFiles(fileNames);

    return json({ message: 'Not silindi' });
  } catch (error) {
    console.error('Notlar DELETE error:', error);
    return json({ error: 'Not silinirken hata oluştu' }, 500);
  }
};