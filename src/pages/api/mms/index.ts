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
    const durum = url.searchParams.get('durum');
    const istasyon = url.searchParams.get('istasyon');
    const search = url.searchParams.get('search');

    let queryText = `SELECT * FROM ${Tables.MMS_RECORDS} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (durum !== null && durum !== undefined) {
      if (durum === '') {
        queryText += " AND (durum IS NULL OR durum = '' OR durum = 'Beklemede')";
      } else {
        queryText += ` AND durum = $${paramIndex}`;
        params.push(durum);
        paramIndex++;
      }
    }

    if (istasyon) {
      queryText += ` AND istasyon = $${paramIndex}`;
      params.push(istasyon);
      paramIndex++;
    }

    if (search) {
      queryText += ` AND (
        mms_numarasi ILIKE $${paramIndex} OR
        ariza_tanimi ILIKE $${paramIndex} OR
        istasyon ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY zaman_damgasi DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query<any>(queryText, params);

    let countQuery = `SELECT COUNT(*) AS count FROM ${Tables.MMS_RECORDS} WHERE 1=1`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (durum !== null && durum !== undefined) {
      if (durum === '') {
        countQuery += " AND (durum IS NULL OR durum = '' OR durum = 'Beklemede')";
      } else {
        countQuery += ` AND durum = $${countParamIndex}`;
        countParams.push(durum);
        countParamIndex++;
      }
    }

    if (istasyon) {
      countQuery += ` AND istasyon = $${countParamIndex}`;
      countParams.push(istasyon);
      countParamIndex++;
    }

    if (search) {
      countQuery += ` AND (
        mms_numarasi ILIKE $${countParamIndex} OR
        ariza_tanimi ILIKE $${countParamIndex} OR
        istasyon ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query<any>(countQuery, countParams);
    const totalCount = Number.parseInt(countResult.rows[0].count, 10);

    const statsResult = await query<any>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN durum = 'Onarıldı' THEN 1 ELSE 0 END) as onarilan,
        SUM(CASE WHEN durum = 'Onarılmadı' THEN 1 ELSE 0 END) as onarilmadi,
        SUM(CASE WHEN durum = 'Onarımda' THEN 1 ELSE 0 END) as onarimda,
        SUM(CASE WHEN durum = 'Parça Bekleniyor' THEN 1 ELSE 0 END) as parca_bekleniyor,
        SUM(CASE WHEN durum IS NULL OR durum = '' OR durum = 'Beklemede' THEN 1 ELSE 0 END) as beklemede
          FROM ${Tables.MMS_RECORDS}
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
        onarilan: Number.parseInt(statsResult.rows[0].onarilan, 10) || 0,
        onarilmadi: Number.parseInt(statsResult.rows[0].onarilmadi, 10) || 0,
        onarimda: Number.parseInt(statsResult.rows[0].onarimda, 10) || 0,
        parca_bekleniyor: Number.parseInt(statsResult.rows[0].parca_bekleniyor, 10) || 0,
        beklemede: Number.parseInt(statsResult.rows[0].beklemede, 10) || 0,
      },
    });
  } catch (error) {
    console.error('MMS GET error:', error);
    return jsonResponse({ error: 'Kayıtlar alınırken hata oluştu' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = requireRole(locals, ['admin', 'sef', 'user']);
  if (!auth.ok) {
    return auth.response;
  }
  const user = auth.user;

  try {
    await ensureAppSchema();
    const body = await request.json();

    if (!body.mms_numarasi || !body.ariza_tanimi || !body.istasyon) {
      return jsonResponse({ error: 'MMS numarası, arıza tanımı ve istasyon zorunludur' }, 400);
    }

    const userInfo = await query<any>(`SELECT full_name, department FROM ${Tables.USERS} WHERE id = $1`, [user.id]);
    const acanAdSoyad = userInfo.rows[0]?.full_name || user.displayName || null;
    const acilanBirim = userInfo.rows[0]?.department || null;

    const result = await query<any>(
          `INSERT INTO ${Tables.MMS_RECORDS} (id, zaman_damgasi, mms_numarasi, ariza_tanimi, istasyon, durum, acan_ad_soyad, acilan_birim, created_by, "not", onarilma_tarihi)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $5 = 'Onarıldı' THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING *`,
      [crypto.randomUUID(), body.mms_numarasi, body.ariza_tanimi, body.istasyon, body.durum || 'Beklemede', acanAdSoyad, acilanBirim, user.id, body.not?.trim() || null]
    );

    await createStationNotifications(body.istasyon, 'notify_mms', {
      category: 'mms',
      title: 'Yeni MMS Kaydı',
      message: `${body.istasyon} için MMS ${body.mms_numarasi} açıldı`,
      resourceType: 'mms_records',
      resourceId: result.rows[0].id,
      station: body.istasyon,
      actorUserId: user.id,
    });

    await logAudit({
      userId: user.id,
      action: 'mms.create',
      resourceType: 'mms_records',
      resourceId: result.rows[0].id,
      details: {
        mms_numarasi: body.mms_numarasi,
        istasyon: body.istasyon,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return jsonResponse(
      {
        message: 'MMS kaydı oluşturuldu',
        record: result.rows[0],
      },
      201
    );
  } catch (error) {
    console.error('MMS POST error:', error);
    return jsonResponse({ error: 'Kayıt oluşturulurken hata oluştu' }, 500);
  }
};
