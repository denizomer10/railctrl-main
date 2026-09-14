import type { APIRoute } from 'astro';
import { query } from '../../../../lib/database';
import { hashPassword } from '../../../../lib/auth';
import { ensureAppSchema } from '../../../../lib/schema';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// PUT - Update user (şef ve admin erişebilir)
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'sef')) {
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

  try {
    await ensureAppSchema();
    const { name, email, role, gorevi, password, istasyon, notify_mms, notify_calisma } = await request.json();

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (email) {
      updates.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
      // Also update username
      updates.push(`username = $${paramIndex}`);
      values.push(email.split('@')[0].toLowerCase());
      paramIndex++;
    }

    // Rol değişikliği sadece admin yapabilir
    if (role && locals.user.role === 'admin') {
      const validRoles = ['user', 'sef', 'gar_mudur', 'admin'];
      if (validRoles.includes(role)) {
        updates.push(`role = $${paramIndex}`);
        values.push(role);
        paramIndex++;
      }
    }

    if (password && password.length >= 6) {
      const passwordHash = await hashPassword(password);
      updates.push(`password_hash = $${paramIndex}`);
      values.push(passwordHash);
      paramIndex++;
    }

    if (istasyon !== undefined) {
      updates.push(`istasyon = $${paramIndex}`);
      values.push(istasyon || null);
      paramIndex++;
    }

    if (gorevi !== undefined) {
      updates.push(`gorevi = $${paramIndex}`);
      values.push(gorevi || null);
      paramIndex++;
    }

    if (notify_mms !== undefined) {
      updates.push(`notify_mms = $${paramIndex}`);
      values.push(Boolean(notify_mms));
      paramIndex++;
    }

    if (notify_calisma !== undefined) {
      updates.push(`notify_calisma = $${paramIndex}`);
      values.push(Boolean(notify_calisma));
      paramIndex++;
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    values.push(id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, full_name as name, role, gorevi, is_active, istasyon, notify_mms, notify_calisma`,
      values
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user.update',
      resourceType: 'user',
      resourceId: id,
      details: {
        name,
        email,
        role,
        gorevi,
        istasyon,
        notify_mms,
        notify_calisma,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ success: true, user: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return new Response(JSON.stringify({ error: 'Failed to update user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// DELETE - Delete user (sadece admin)
export const DELETE: APIRoute = async ({ params, locals }) => {
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

  // Prevent self-deletion
  if (id === locals.user.id) {
    return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    // Delete user's sessions first
    await query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    
    // Delete user
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user.delete',
      resourceType: 'user',
      resourceId: id,
      details: {},
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
