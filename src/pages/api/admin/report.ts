import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();

    const [users, mms, calisma, kayip, notlar, feedback] = await Promise.all([
      query<any>(`SELECT COUNT(*)::int AS count FROM users`),
      query<any>(`SELECT COUNT(*)::int AS count FROM mms_records`),
      query<any>(`SELECT COUNT(*)::int AS count FROM calisma_izinleri`),
      query<any>(`SELECT COUNT(*)::int AS count FROM kayip_esya`),
      query<any>(`SELECT COUNT(*)::int AS count FROM notlar`),
      query<any>(`SELECT COUNT(*)::int AS count FROM geri_bildirimler`),
    ]);

    return new Response(JSON.stringify({
      report: {
        users: users.rows[0]?.count || 0,
        mms: mms.rows[0]?.count || 0,
        calisma: calisma.rows[0]?.count || 0,
        kayip_esya: kayip.rows[0]?.count || 0,
        notlar: notlar.rows[0]?.count || 0,
        geri_bildirimler: feedback.rows[0]?.count || 0,
        generated_at: new Date().toISOString(),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Admin report GET error:', error);
    return new Response(JSON.stringify({ error: 'Rapor oluşturulamadı' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
