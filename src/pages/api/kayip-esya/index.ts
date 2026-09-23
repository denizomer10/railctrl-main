/**
 * Kayıp Eşya API Endpoints
 * GET /api/kayip-esya - Tüm kayıtları listele
 * POST /api/kayip-esya - Yeni kayıt oluştur
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { createGlobalNotifications } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';

export const prerender = false;

// Kayıp eşya kayıtlarını listele
export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search');
    const durum = url.searchParams.get('durum');
    const offset = (page - 1) * limit;

    let queryText = `SELECT * FROM ${Tables.KAYIP_ESYA} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    // Durum filtresi - gerçek veritabanı değerlerine göre LIKE ile
    if (durum !== null && durum !== undefined) {
      if (durum === 'Beklemede' || durum === '') {
        // Beklemede = boş, null, tcdd hesabı işlemleri veya tanımsız
        queryText += ` AND (durumu IS NULL OR durumu = '' OR LOWER(durumu) LIKE '%tcdd hesab%' OR LOWER(durumu) LIKE '%işlem no%' OR (LOWER(durumu) NOT LIKE '%teslim%' AND LOWER(durumu) NOT LIKE '%imha%' AND LOWER(durumu) NOT LIKE '%iett%' AND LOWER(durumu) NOT LIKE '%büroda%' AND LOWER(durumu) NOT LIKE '%depoda%'))`;
      } else if (durum === 'Teslim Edildi') {
        queryText += ` AND LOWER(durumu) LIKE '%teslim%' AND LOWER(durumu) NOT LIKE '%iett%'`;
      } else if (durum === 'İmha Edildi') {
        queryText += ` AND (LOWER(durumu) LIKE '%imha%' OR LOWER(durumu) LIKE '%iett%')`;
      } else if (durum === 'Depoda') {
        queryText += ` AND (LOWER(durumu) LIKE '%büroda%' OR LOWER(durumu) LIKE '%depoda%' OR LOWER(durumu) = 'depoda')`;
      }
    }

    if (search) {
      queryText += ` AND (
        belge_no ILIKE $${paramIndex} OR
        esya_tanimi ILIKE $${paramIndex} OR
        esya_sahibi_ad_soyad ILIKE $${paramIndex} OR
        teslim_alan ILIKE $${paramIndex} OR
        durumu ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY tarih DESC NULLS LAST, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query<any>(queryText, params);

    // Toplam sayı
    let countQuery = `SELECT COUNT(*) AS count FROM ${Tables.KAYIP_ESYA} WHERE 1=1`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    // Durum filtresi - count için (gerçek veritabanı değerlerine göre)
    if (durum !== null && durum !== undefined) {
      if (durum === 'Beklemede' || durum === '') {
        countQuery += ` AND (durumu IS NULL OR durumu = '' OR LOWER(durumu) LIKE '%tcdd hesab%' OR LOWER(durumu) LIKE '%işlem no%' OR (LOWER(durumu) NOT LIKE '%teslim%' AND LOWER(durumu) NOT LIKE '%imha%' AND LOWER(durumu) NOT LIKE '%iett%' AND LOWER(durumu) NOT LIKE '%büroda%' AND LOWER(durumu) NOT LIKE '%depoda%'))`;
      } else if (durum === 'Teslim Edildi') {
        countQuery += ` AND LOWER(durumu) LIKE '%teslim%' AND LOWER(durumu) NOT LIKE '%iett%'`;
      } else if (durum === 'İmha Edildi') {
        countQuery += ` AND (LOWER(durumu) LIKE '%imha%' OR LOWER(durumu) LIKE '%iett%')`;
      } else if (durum === 'Depoda') {
        countQuery += ` AND (LOWER(durumu) LIKE '%büroda%' OR LOWER(durumu) LIKE '%depoda%' OR LOWER(durumu) = 'depoda')`;
      }
    }

    if (search) {
      countQuery += ` AND (
        belge_no ILIKE $${countParamIndex} OR
        esya_tanimi ILIKE $${countParamIndex} OR
        esya_sahibi_ad_soyad ILIKE $${countParamIndex} OR
        teslim_alan ILIKE $${countParamIndex} OR
        durumu ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query<any>(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // İstatistikler - gerçek veri formatına göre
    const statsResult = await query<any>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(COALESCE(durumu, '')) LIKE '%teslim%' AND LOWER(COALESCE(durumu, '')) NOT LIKE '%iett%' THEN 1 ELSE 0 END) as teslim,
        SUM(CASE WHEN LOWER(COALESCE(durumu, '')) LIKE '%imha%' OR LOWER(COALESCE(durumu, '')) LIKE '%iett%' THEN 1 ELSE 0 END) as imha,
        SUM(CASE WHEN LOWER(COALESCE(durumu, '')) LIKE '%büroda%' OR LOWER(COALESCE(durumu, '')) LIKE '%depoda%' OR LOWER(COALESCE(durumu, '')) = 'depoda' THEN 1 ELSE 0 END) as depo,
        SUM(CASE WHEN durumu IS NULL OR durumu = '' OR LOWER(durumu) LIKE '%tcdd hesab%' OR LOWER(durumu) LIKE '%işlem no%' OR (LOWER(durumu) NOT LIKE '%teslim%' AND LOWER(durumu) NOT LIKE '%imha%' AND LOWER(durumu) NOT LIKE '%iett%' AND LOWER(durumu) NOT LIKE '%büroda%' AND LOWER(durumu) NOT LIKE '%depoda%') THEN 1 ELSE 0 END) as beklemede
          FROM ${Tables.KAYIP_ESYA}
    `);

    return new Response(JSON.stringify({
      records: result.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      stats: {
        total: parseInt(statsResult.rows[0].total) || 0,
        teslim: parseInt(statsResult.rows[0].teslim) || 0,
        imha: parseInt(statsResult.rows[0].imha) || 0,
        depo: parseInt(statsResult.rows[0].depo) || 0,
        beklemede: parseInt(statsResult.rows[0].beklemede) || 0
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Kayıp Eşya GET error:', error);
    return new Response(JSON.stringify({ error: 'Kayıtlar alınırken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Yeni kayıp eşya kaydı oluştur (user, sef veya admin)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (locals.user.role !== 'admin' && locals.user.role !== 'sef' && locals.user.role !== 'user') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const body = await request.json();

    if (!body.esya_tanimi) {
      return new Response(JSON.stringify({ error: 'Eşya tanımı zorunludur' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await query<any>(`
          INSERT INTO ${Tables.KAYIP_ESYA} (
            id, tarih, belge_no, teslim_alan, buroya_teslim_eden,
        buroya_teslim_tarihi, teslim_alan_buro_gorevlisi,
        esya_tanimi, durumu, esya_sahibi_ad_soyad, esya_sahibi_tel
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      crypto.randomUUID(),
      body.tarih ? new Date(body.tarih) : new Date(),
      body.belge_no || null,
      body.teslim_alan || null,
      body.buroya_teslim_eden || null,
      body.buroya_teslim_tarihi ? new Date(body.buroya_teslim_tarihi) : null,
      body.teslim_alan_buro_gorevlisi || null,
      body.esya_tanimi,
      body.durumu || null,
      body.esya_sahibi_ad_soyad || null,
      body.esya_sahibi_tel || null
    ]);

    await createGlobalNotifications({
      category: 'kayip-esya',
      title: 'Kayıp Eşya Kaydı Eklendi',
      message: `${body.esya_tanimi} için yeni kayıt oluşturuldu`,
      resourceType: 'kayip_esya',
      resourceId: result.rows[0].id,
    }, 'notify_kayip_esya');

    await logAudit({
      userId: locals.user.id,
      action: 'kayip_esya.create',
      resourceType: 'kayip_esya',
      resourceId: result.rows[0].id,
      details: {
        esya_tanimi: body.esya_tanimi,
        durumu: body.durumu || null,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({
      message: 'Kayıp eşya kaydı oluşturuldu',
      record: result.rows[0]
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Kayıp Eşya POST error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt oluşturulurken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
