import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { jsonResponse, parsePagination, readJsonBody, requireRole, requireUser } from '../../../lib/api';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

/**
 * Arama ve birim filtrelerini tek yerde üretir; liste ve sayım sorguları aynı
 * filtre kümesini paylaşır.
 */
function buildDahiliFilters(
  search: string | null,
  birim: string | null
): { clause: string; params: any[] } {
  let clause = '';
  const params: any[] = [];

  if (search) {
    params.push(`%${search}%`);
    clause += ` AND (
      dahili_numara ILIKE $${params.length} OR
      birim ILIKE $${params.length} OR
      aciklama ILIKE $${params.length}
    )`;
  }

  if (birim) {
    params.push(birim);
    clause += ` AND birim = $${params.length}`;
  }

  return { clause, params };
}

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

    const filters = buildDahiliFilters(search, birim);
    const queryText = `SELECT * FROM ${Tables.DAHILI_NUMARALAR} WHERE 1=1${filters.clause}
      ORDER BY dahili_numara ASC, id ASC
      LIMIT $${filters.params.length + 1} OFFSET $${filters.params.length + 2}`;
    const result = await query<any>(queryText, [...filters.params, limit, offset]);

    const countQuery = `SELECT COUNT(*) AS count FROM ${Tables.DAHILI_NUMARALAR} WHERE 1=1${filters.clause}`;
    const countResult = await query<any>(countQuery, filters.params);
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
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

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
