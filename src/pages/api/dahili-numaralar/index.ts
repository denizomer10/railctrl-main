import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { jsonResponse, parsePagination, requireRole, requireUser } from '../../../lib/api';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const auth = requireUser(locals);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    await ensureAppSchema();
    const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100 }, 300);
    const search = url.searchParams.get('search');
    const birim = url.searchParams.get('birim');

    let queryText = `SELECT * FROM ${Tables.DAHILI_NUMARALAR} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      queryText += ` AND (
        dahili_numara ILIKE $${paramIndex} OR
        birim ILIKE $${paramIndex} OR
        aciklama ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (birim) {
      queryText += ` AND birim = $${paramIndex}`;
      params.push(birim);
      paramIndex++;
    }

    queryText += ` ORDER BY dahili_numara ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query<any>(queryText, params);

    let countQuery = `SELECT COUNT(*) AS count FROM ${Tables.DAHILI_NUMARALAR} WHERE 1=1`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND (
        dahili_numara ILIKE $${countParamIndex} OR
        birim ILIKE $${countParamIndex} OR
        aciklama ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (birim) {
      countQuery += ` AND birim = $${countParamIndex}`;
      countParams.push(birim);
    }

    const countResult = await query<any>(countQuery, countParams);
    const totalCount = Number.parseInt(countResult.rows[0].count, 10);

    const statsResult = await query<any>(`
      SELECT COUNT(*) as total, COUNT(DISTINCT birim) as birim_sayisi
          FROM ${Tables.DAHILI_NUMARALAR}
    `);

    const birimlerResult = await query<any>(`
      SELECT DISTINCT birim
          FROM ${Tables.DAHILI_NUMARALAR}
      WHERE birim IS NOT NULL AND birim != ''
      ORDER BY birim
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
        birimCount: Number.parseInt(statsResult.rows[0].birim_sayisi, 10) || 0,
      },
      birimler: birimlerResult.rows.map((r: any) => r.birim),
    });
  } catch (error) {
    console.error('Dahili Numaralar GET error:', error);
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
    const body = await request.json();

    if (!body.dahili_numara || !body.birim) {
      return jsonResponse({ error: 'Dahili numara ve birim alanları zorunludur' }, 400);
    }

    const result = await query<any>(
          `INSERT INTO ${Tables.DAHILI_NUMARALAR} (id, dahili_numara, dahili_no, ad_soyad, birim, aciklama)
                 VALUES ($1, $2, $2, '', $3, $4)
       RETURNING *`,
                [crypto.randomUUID(), body.dahili_numara, body.birim, body.aciklama || null]
    );

    await logAudit({
      userId: user.id,
      action: 'dahili_numaralar.create',
      resourceType: 'dahili_numaralar',
      resourceId: result.rows[0].id,
      details: {
        dahili_numara: body.dahili_numara,
        birim: body.birim,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return jsonResponse(
      {
        message: 'Dahili numara eklendi',
        record: result.rows[0],
      },
      201
    );
  } catch (error) {
    console.error('Dahili Numaralar POST error:', error);
    return jsonResponse({ error: 'Kayıt oluşturulurken hata oluştu' }, 500);
  }
};
