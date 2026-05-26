import type { APIRoute } from 'astro';
import { query, transaction } from '../../../../../lib/database';
import { ensureAppSchema } from '../../../../../lib/schema';
import { logAudit } from '../../../../../lib/audit';

export const prerender = false;

// POST - Toggle user active status
export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'User ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Prevent self-deactivation
  if (id === locals.user.id) {
    return new Response(JSON.stringify({ error: 'Cannot deactivate your own account' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const result = await transaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE users 
         SET is_active = NOT is_active, updated_at = NOW() 
         WHERE id = $1 
         RETURNING id, is_active`,
        [id]
      );

      // If deactivated, invalidate all sessions/tokens atomically.
      if (updateResult.rows[0] && !updateResult.rows[0].is_active) {
        await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
        await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
      }

      return updateResult;
    });

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user.toggle',
      resourceType: 'user',
      resourceId: id,
      details: { is_active: result.rows[0].is_active },
    });

    return new Response(JSON.stringify({ success: true, user: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    return new Response(JSON.stringify({ error: 'Failed to update user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
