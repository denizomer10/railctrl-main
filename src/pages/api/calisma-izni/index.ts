import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { jsonResponse, parsePagination, requireRole } from '../../../lib/api';
import { ensureAppSchema } from '../../../lib/schema';
import { createStationNotifications } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    await ensureAppSchema();
    const { page, limit, offset } = parsePagination(url, { page: 1, limit: 50 }, 200);
    const search = url.searchParams.get('search');
    const istasyon = url.searchParams.get('istasyon');

    let queryText = `SELECT * FROM ${Tables.CALISMA_IZINLERI} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      queryText += ` AND (
        mms_numarasi ILIKE $${paramIndex} OR
        calisma_kodu ILIKE $${paramIndex} OR
        yapilacak_is ILIKE $${paramIndex} OR
        calisanlar ILIKE $${paramIndex} OR
        istasyon ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (istasyon) {
      queryText += ` AND istasyon = $${paramIndex}`;
      params.push(istasyon);
      paramIndex++;
    }

    queryText += ` ORDER BY zaman_damgasi DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query<any>(queryText, params);

    let countQuery = `SELECT COUNT(*) FROM ${Tables.CALISMA_IZINLERI} WHERE 1=1`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND (
        mms_numarasi ILIKE $${countParamIndex} OR
        calisma_kodu ILIKE $${countParamIndex} OR
        yapilacak_is ILIKE $${countParamIndex} OR
        calisanlar ILIKE $${countParamIndex} OR
        istasyon ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (istasyon) {
      countQuery += ` AND istasyon = $${countParamIndex}`;
      countParams.push(istasyon);
    }

    const countResult = await query<any>(countQuery, countParams);
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
  const auth = requireRole(locals, ['admin', 'sef', 'user']);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    await ensureAppSchema();
    const body = await request.json();

    if (!body.calisma_kodu || !body.yapilacak_is || !body.istasyon) {
      return jsonResponse({ error: 'Çalışma kodu, yapılacak iş ve istasyon zorunludur' }, 400);
    }

    const userInfo = await query<any>(
          `SELECT full_name FROM ${Tables.USERS} WHERE id = $1`,
      [locals.user.id]
    );
    const bildirenAdSoyad =
      userInfo.rows[0]?.full_name ||
      locals.user.displayName ||
      null;

    const result = await query<any>(
          `INSERT INTO ${Tables.CALISMA_IZINLERI} (
        zaman_damgasi, mms_numarasi, calisma_kodu, yapilacak_is, calisanlar, istasyon, bildiren_ad_soyad
      ) VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [body.mms_numarasi || null, body.calisma_kodu, body.yapilacak_is, body.calisanlar || null, body.istasyon, bildirenAdSoyad]
    );

    await createStationNotifications(body.istasyon, 'notify_calisma', {
      category: 'calisma',
      title: 'Yeni Çalışma Kaydı',
      message: `${body.istasyon} için ${body.calisma_kodu} kodlu çalışma kaydı açıldı`,
      resourceType: 'calisma_izinleri',
      resourceId: result.rows[0].id,
      station: body.istasyon,
      actorUserId: locals.user.id,
    });

    await logAudit({
      userId: locals.user.id,
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
