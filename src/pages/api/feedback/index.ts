import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';
import { Tables } from '../../../lib/database';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();

    const result = locals.user.role === 'yonetici'
      ? await query<any>(
        `SELECT id, user_id, full_name, station, mesaj, status, created_at
             FROM ${Tables.GERI_BILDIRIMLER}
         ORDER BY created_at DESC
         LIMIT 500`
      )
      : await query<any>(
        `SELECT id, user_id, full_name, station, mesaj, status, created_at
             FROM ${Tables.GERI_BILDIRIMLER}
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [locals.user.id]
      );

    return new Response(JSON.stringify({ feedbacks: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Feedback GET error:', error);
    return new Response(JSON.stringify({ error: 'Geri bildirimler alınamadı' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();
    const body = await request.json();

    if (!body?.mesaj || !String(body.mesaj).trim()) {
      return new Response(JSON.stringify({ error: 'Mesaj zorunludur' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const userInfo = await query<any>(
          `SELECT full_name, istasyon FROM ${Tables.USERS} WHERE id = $1`,
      [locals.user.id]
    );

    const fullName = userInfo.rows[0]?.full_name || locals.user.displayName;
    const station = userInfo.rows[0]?.istasyon || null;

    const result = await query<any>(
          `INSERT INTO ${Tables.GERI_BILDIRIMLER} (user_id, full_name, station, mesaj)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [locals.user.id, fullName, station, String(body.mesaj).trim()]
    );

    await logAudit({
      userId: locals.user.id,
      action: 'feedback.create',
      resourceType: 'geri_bildirimler',
      resourceId: result.rows[0].id,
      details: { station },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ success: true, feedback: result.rows[0] }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Feedback POST error:', error);
    return new Response(JSON.stringify({ error: 'Geri bildirim gönderilemedi' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
