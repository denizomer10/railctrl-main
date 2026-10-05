/**
 * Notlar API Endpoints
 * GET /api/notlar - Yetkiye göre filtrelenmiş notları listele
 * POST /api/notlar - Yeni not oluştur (yönetici)
 */

import type { APIRoute } from 'astro';
import { query, Tables } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';
import { parsePagination } from '../../../lib/api';
import { assertSafeHtml } from '../../../lib/sanitize';

export const prerender = false;

const PRIVATE_CATEGORY = 'Özel';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

// Notları listele
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Yetkisiz erişim' }, 401);

  try {
    await ensureAppSchema();
    const { page, limit } = parsePagination(url, { page: 1, limit: 30 }, 100);
    const search = url.searchParams.get('search');
    const kategori = url.searchParams.get('kategori');
    const istasyon = url.searchParams.get('istasyon');
    const userRole = locals.user.role;
    const isPrivileged = userRole === 'yonetici';

    const userStationResult = await query<any>(`SELECT istasyon FROM ${Tables.USERS} WHERE id = $1`, [
      locals.user.id,
    ]);
    const userStation = userStationResult.rows[0]?.istasyon || null;

    const conditions: string[] = ['is_active = 1'];
    const params: any[] = [];
    let paramIndex = 1;

    // hedef_roller geçerli JSON dizisi, eski CSV/metin ya da boş olabilir.
    conditions.push(`(
      hedef_roller IS NULL
      OR hedef_roller = ''
      OR hedef_roller = '[]'
      OR (
        json_valid(hedef_roller)
        AND EXISTS (SELECT 1 FROM json_each(hedef_roller) WHERE value = $${paramIndex})
      )
      OR (
        NOT json_valid(hedef_roller)
        AND (
          LOWER(hedef_roller) = LOWER($${paramIndex})
          OR LOWER(hedef_roller) LIKE '%' || LOWER($${paramIndex}) || '%'
        )
      )
    )`);
    params.push(userRole);
    paramIndex++;

    const stationFilter = istasyon || userStation;
    if (stationFilter) {
      conditions.push(`(istasyon IS NULL OR istasyon = '' OR istasyon = $${paramIndex})`);
      params.push(stationFilter);
      paramIndex++;
    }

    if (kategori) {
      conditions.push(`kategori = $${paramIndex}`);
      params.push(kategori);
      paramIndex++;
    }

    if (!isPrivileged) {
      conditions.push(`COALESCE(kategori, '') <> $${paramIndex}`);
      params.push(PRIVATE_CATEGORY);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        baslik ILIKE $${paramIndex} OR
        icerik ILIKE $${paramIndex} OR
        kategori ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${Tables.NOTLAR} WHERE ${whereClause}`,
      params
    );
    const totalCount = Number(countResult.rows[0]?.count || 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const resolvedPage = Math.min(page, totalPages);
    const resolvedOffset = (resolvedPage - 1) * limit;

    const result = await query<any>(
      `SELECT * FROM ${Tables.NOTLAR} WHERE ${whereClause}
       ORDER BY created_at DESC, rowid DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, resolvedOffset]
    );

    const kategorilerResult = await query<any>(
      `SELECT DISTINCT kategori FROM ${Tables.NOTLAR}
       WHERE is_active = 1 AND kategori IS NOT NULL AND kategori <> ''
       ORDER BY kategori`
    );

    return json({
      notes: result.rows,
      kategoriler: kategorilerResult.rows.map((r: any) => r.kategori),
      pagination: { page: resolvedPage, limit, totalCount, totalPages },
    });
  } catch (error) {
    console.error('Notlar GET error:', error);
    return json({ error: 'Notlar alınırken hata oluştu' }, 500);
  }
};

// Yeni not oluştur (yönetici)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Yetkisiz erişim' }, 401);
  if (locals.user.role !== 'yonetici') return json({ error: 'Bu işlem için yetkiniz yok' }, 403);

  try {
    await ensureAppSchema();
    const body = await request.json();

    const baslik = typeof body.baslik === 'string' ? body.baslik.trim() : '';
    const icerik = typeof body.icerik === 'string' ? body.icerik : '';
    const medya = parseMedia(body.medya);

    if (!baslik || (icerik.trim().length === 0 && medya.length === 0)) {
      return json({ error: 'Başlık ve (içerik veya dosya) zorunludur' }, 400);
    }

    // Sunucu tarafı inkâr listesi: aktif içerik asla veritabanına yazılmaz.
    try {
      assertSafeHtml(icerik);
    } catch (validationError) {
      return json(
        { error: validationError instanceof Error ? validationError.message : 'Geçersiz içerik' },
        400
      );
    }

    const kategori = typeof body.kategori === 'string' && body.kategori ? body.kategori : null;
    const hedefRoller =
      kategori === PRIVATE_CATEGORY ? ['yonetici'] : ['personel', 'yonetici'];

    const result = await query<any>(
      `INSERT INTO ${Tables.NOTLAR}
         (id, baslik, icerik, kategori, istasyon, hedef_roller, created_by, medya, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        crypto.randomUUID(),
        baslik,
        icerik,
        kategori,
        typeof body.istasyon === 'string' && body.istasyon ? body.istasyon : null,
        JSON.stringify(hedefRoller),
        locals.user.id,
        JSON.stringify(medya),
        getIstanbulTimestamp(),
      ]
    );

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.create',
      resourceType: 'notlar',
      resourceId: result.rows[0].id,
      details: { baslik, istasyon: body.istasyon || null, hedef_roller: hedefRoller },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return json({ message: 'Not oluşturuldu', record: result.rows[0] }, 201);
  } catch (error) {
    console.error('Notlar POST error:', error);
    return json({ error: 'Not oluşturulurken hata oluştu' }, 500);
  }
};