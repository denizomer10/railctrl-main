import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { jsonResponse, parsePagination, readJsonBody, requireRole } from '../../../lib/api';
import { ensureAppSchema } from '../../../lib/schema';
import { createStationNotifications } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';

export const prerender = false;

/**
 * Arama ve istasyon filtrelerini tek yerde üretir; liste ve sayım sorguları
 * aynı filtre kümesini paylaşır.
 */
function buildCalismaFilters(
  search: string | null,
  istasyon: string | null
): { clause: string; params: any[] } {
  let clause = '';
  const params: any[] = [];

  if (search) {
    params.push(`%${search}%`);
    clause += ` AND (
      mms_numarasi ILIKE $${params.length} OR
      calisma_kodu ILIKE $${params.length} OR
      yapilacak_is ILIKE $${params.length} OR
      calisanlar ILIKE $${params.length} OR
      istasyon ILIKE $${params.length}
    )`;
  }

  if (istasyon) {
    params.push(`%${istasyon}%`);
    clause += ` AND istasyon ILIKE $${params.length}`;
  }

  return { clause, params };
}

export const GET: APIRoute = async ({ url }) => {
  try {
    await ensureAppSchema();
    const { page, limit, offset } = parsePagination(url, { page: 1, limit: 50 }, 200);
    const search = url.searchParams.get('search');
    const istasyon = url.searchParams.get('istasyon');

    const filters = buildCalismaFilters(search, istasyon);
    const queryText = `SELECT * FROM ${Tables.CALISMA_IZINLERI} WHERE 1=1${filters.clause}
      ORDER BY zaman_damgasi DESC, id DESC
      LIMIT $${filters.params.length + 1} OFFSET $${filters.params.length + 2}`;
    const result = await query<any>(queryText, [...filters.params, limit, offset]);

    const countQuery = `SELECT COUNT(*) AS count FROM ${Tables.CALISMA_IZINLERI} WHERE 1=1${filters.clause}`;
    const countResult = await query<any>(countQuery, filters.params);
    const totalCount = Number.parseInt(countResult.rows[0].count, 10);

    const statsResult = await query<any>(`
      SELECT COUNT(*) as total, COUNT(DISTINCT istasyon) as istasyon_sayisi
          FROM ${Tables.CALISMA_IZINLERI}
    `);

    const istasyonlarResult = await query<any>(`
      SELECT DISTINCT istasyon
          FROM ${Tables.CALISMA_IZINLERI}
      WHERE istasyon IS NOT NULL AND istasyon != ''
      ORDER BY istasyon
    `);

    return jsonResponse({
      records: result.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      stats: {
        total: Number.parseInt(statsResult.rows[0].total, 10) || 0,
        istasyonCount: Number.parseInt(statsResult.rows[0].istasyon_sayisi, 10) || 0,
      },
      istasyonlar: istasyonlarResult.rows.map((r: any) => r.istasyon),
    });
  } catch (error) {
    console.error('Çalışma İzni GET error:', error);
    return jsonResponse({ error: 'Kayıtlar alınırken hata oluştu' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = requireRole(locals, ['yonetici', 'personel']);
  if (!auth.ok) {
    return auth.response;
  }
  const user = auth.user;

  try {
    await ensureAppSchema();
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    if (!body.calisma_kodu || !body.yapilacak_is || !body.istasyon) {
      return jsonResponse({ error: 'Çalışma kodu, yapılacak iş ve istasyon zorunludur' }, 400);
    }

    const userInfo = await query<any>(
          `SELECT full_name FROM ${Tables.USERS} WHERE id = $1`,
      [user.id]
    );
    const bildirenAdSoyad =
      userInfo.rows[0]?.full_name ||
      user.displayName ||
      null;

    const result = await query<any>(
          `INSERT INTO ${Tables.CALISMA_IZINLERI} (
            id, zaman_damgasi, mms_numarasi, calisma_kodu, yapilacak_is, calisanlar, istasyon, bildiren_ad_soyad
          ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [crypto.randomUUID(), body.mms_numarasi || null, body.calisma_kodu, body.yapilacak_is, body.calisanlar || null, body.istasyon, bildirenAdSoyad]
    );

    await createStationNotifications(body.istasyon, 'notify_calisma', {
      category: 'calisma',
      title: 'Yeni Çalışma Kaydı',
      message: `${body.istasyon} için ${body.calisma_kodu} kodlu çalışma kaydı açıldı`,
      resourceType: 'calisma_izinleri',
      resourceId: result.rows[0].id,
      station: body.istasyon,
      actorUserId: user.id,
    });

    await logAudit({
      userId: user.id,
      action: 'calisma.create',
      resourceType: 'calisma_izinleri',
      resourceId: result.rows[0].id,
      details: {
        calisma_kodu: body.calisma_kodu,
        istasyon: body.istasyon,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return jsonResponse(
      {
        message: 'Çalışma izni kaydı oluşturuldu',
        record: result.rows[0],
      },
      201
    );
  } catch (error) {
    console.error('Çalışma İzni POST error:', error);
    return jsonResponse({ error: 'Kayıt oluşturulurken hata oluştu' }, 500);
  }
};
