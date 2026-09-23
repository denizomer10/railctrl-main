/**
 * Notlar API Endpoints
 * GET /api/notlar - Tüm notları listele
 * POST /api/notlar - Yeni not oluştur
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';

export const prerender = false;

function getIstanbulTimestamp(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

// Notları listele
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    await query(
      `DELETE FROM ${Tables.NOTLAR}
       WHERE baslik IN ('Tren Saatleri Çizelgesi', 'İdari Ceza Çizelgesi')
       AND created_by = 'system'`
    );
    const search = url.searchParams.get('search');
    const kategori = url.searchParams.get('kategori');
    const istasyon = url.searchParams.get('istasyon');
    const userRole = locals.user.role;
    const isPrivileged = userRole === 'admin' || userRole === 'sef' || userRole === 'gar_mudur';
    const userStationResult = await query<any>(`SELECT istasyon FROM ${Tables.USERS} WHERE id = $1`, [locals.user.id]);
    const userStation = userStationResult.rows[0]?.istasyon || null;

    let queryText = `SELECT * FROM ${Tables.NOTLAR} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    // hedef_roller may contain valid JSON array, legacy CSV/text, or be null.
    queryText += ` AND (
      hedef_roller IS NULL
      OR hedef_roller = ''
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
    )`;
    params.push(userRole);
    paramIndex++;

    if (istasyon) {
      queryText += ` AND (istasyon IS NULL OR istasyon = '' OR istasyon = $${paramIndex})`;
      params.push(istasyon);
      paramIndex++;
    } else if (userStation) {
      queryText += ` AND (istasyon IS NULL OR istasyon = '' OR istasyon = $${paramIndex})`;
      params.push(userStation);
      paramIndex++;
    }

    if (kategori) {
      queryText += ` AND kategori = $${paramIndex}`;
      params.push(kategori);
      paramIndex++;
    }

    if (!isPrivileged) {
      queryText += ` AND COALESCE(kategori, '') <> $${paramIndex}`;
      params.push('Özel');
      paramIndex++;
    }

    if (search) {
      queryText += ` AND (
        baslik ILIKE $${paramIndex} OR
        icerik ILIKE $${paramIndex} OR
        kategori ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY created_at DESC`;

    const result = await query<any>(queryText, params);

    // Kategorileri de getir
    const kategorilerResult = await query<any>(`SELECT DISTINCT kategori FROM ${Tables.NOTLAR} WHERE kategori IS NOT NULL ORDER BY kategori`);

    return new Response(JSON.stringify({
      notes: result.rows,
      kategoriler: kategorilerResult.rows.map((r: any) => r.kategori)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Notlar GET error:', error);
    return new Response(JSON.stringify({ error: 'Notlar alınırken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Yeni not oluştur (sef veya admin)
export const POST: APIRoute = async ({ request, locals }) => {
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
    const body = await request.json();

    const hasContent = typeof body.icerik === 'string' && body.icerik.trim().length > 0;
    const hasMedia = Array.isArray(body.medya) && body.medya.length > 0;
    if (!body.baslik || (!hasContent && !hasMedia)) {
      return new Response(JSON.stringify({ error: 'Başlık ve (içerik veya dosya) zorunludur' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const hedefRoller = Array.isArray(body.hedef_roller) && body.hedef_roller.length > 0
      ? body.hedef_roller
      : ['user', 'sef', 'gar_mudur', 'admin'];

    const result = await query<any>(`
      INSERT INTO ${Tables.NOTLAR} (id, baslik, icerik, kategori, istasyon, hedef_roller, created_by, medya, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      crypto.randomUUID(),
      body.baslik,
      body.icerik || '',
      body.kategori || null,
      body.istasyon || null,
      JSON.stringify(hedefRoller),
      locals.user.id,
      JSON.stringify(Array.isArray(body.medya) ? body.medya : []),
      getIstanbulTimestamp()
    ]);

    await logAudit({
      userId: locals.user.id,
      action: 'notlar.create',
      resourceType: 'notlar',
      resourceId: result.rows[0].id,
      details: {
        baslik: body.baslik,
        istasyon: body.istasyon || null,
        hedef_roller: hedefRoller,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({
      message: 'Not oluşturuldu',
      record: result.rows[0]
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Notlar POST error:', error);
    return new Response(JSON.stringify({ error: 'Not oluşturulurken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
