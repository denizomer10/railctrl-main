import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100);
    const unreadOnly = url.searchParams.get('unread') === '1';

    const result = await query<any>(
      `SELECT id, category, title, message, resource_type, resource_id, station, is_read, created_at
       FROM notifications
       WHERE user_id = $1
         ${unreadOnly ? 'AND is_read = false' : ''}
       ORDER BY created_at DESC
       LIMIT $2`,
      [locals.user.id, limit]
    );

    const unreadCountResult = await query<any>(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [locals.user.id]
    );

    return new Response(JSON.stringify({
      notifications: result.rows,
      unreadCount: unreadCountResult.rows[0]?.count || 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return new Response(JSON.stringify({ error: 'Bildirimler alınamadı' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const PUT: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();
    const body = await request.json().catch(() => ({}));

    if (body?.id) {
      await query(
        `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
        [body.id, locals.user.id]
      );
    } else {
      await query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [locals.user.id]);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Notifications PUT error:', error);
    return new Response(JSON.stringify({ error: 'Bildirim güncellenemedi' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();
    const body = await request.json().catch(() => ({}));

    if (body?.id) {
      await query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [body.id, locals.user.id]);
    } else {
      await query(`DELETE FROM notifications WHERE user_id = $1`, [locals.user.id]);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Notifications DELETE error:', error);
    return new Response(JSON.stringify({ error: 'Bildirimler temizlenemedi' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
