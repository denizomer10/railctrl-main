import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID zorunlu' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await query<any>('DELETE FROM geri_bildirimler WHERE id = $1 RETURNING id', [id]);

    if (!result.rows.length) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'feedback.delete',
      resourceType: 'geri_bildirimler',
      resourceId: id,
      details: {},
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Feedback delete error:', error);
    return new Response(JSON.stringify({ error: 'Silme işlemi başarısız' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
