import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { hashPassword } from '../../../lib/auth';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// GET - List all users (sadece admin erişebilir)
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const result = await query(
      `SELECT id, email, full_name as name, role, gorevi, is_active, created_at, last_login, istasyon, sicil_no, kky_no, bagli_birim, notify_mms, notify_calisma
       FROM users 
       ORDER BY created_at DESC`
    );

    return new Response(JSON.stringify({ users: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST - Create new user (sadece admin erişebilir)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { email, name, password, role, gorevi, istasyon, sicil_no, kky_no, bagli_birim, notify_mms, notify_calisma } = await request.json();

    // Validate input
    if (!email || !name || !password || !role) {
      return new Response(JSON.stringify({ error: 'All fields are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return new Response(JSON.stringify({ error: 'Bu e-posta adresi zaten kayıtlı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate role
    const validRoles = ['user', 'sef', 'gar_mudur', 'admin'];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash password

    // Hash password
    const passwordHash = await hashPassword(password);

    // Username from email (before @)
    const username = email.split('@')[0].toLowerCase();

    // Create user
    const result = await query(
      `INSERT INTO users (id, username, email, password_hash, full_name, role, gorevi, istasyon, sicil_no, kky_no, bagli_birim, notify_mms, notify_calisma) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING id, email, full_name as name, role, gorevi, is_active, created_at, istasyon, sicil_no, kky_no, bagli_birim, notify_mms, notify_calisma`,
      [crypto.randomUUID(), username, email, passwordHash, name, role, gorevi || null, istasyon || null, sicil_no || null, kky_no || null, bagli_birim || null, notify_mms ?? true, notify_calisma ?? true]
    );

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user.create',
      resourceType: 'user',
      resourceId: result.rows[0].id,
      details: {
        email,
        role,
        gorevi: gorevi || null,
        istasyon: istasyon || null,
        sicil_no: sicil_no || null,
        kky_no: kky_no || null,
        bagli_birim: bagli_birim || null,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ success: true, user: result.rows[0] }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error creating user:', error);

    if (error?.code === '23505') {
      const detail = String(error?.detail || '');
      if (detail.includes('(username)')) {
        return new Response(JSON.stringify({ error: 'Bu kullanıcı adı zaten kayıtlı (email @ öncesi).' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (detail.includes('(email)')) {
        return new Response(JSON.stringify({ error: 'Bu e-posta adresi zaten kayıtlı' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Kullanıcı zaten mevcut' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Personel oluşturulamadı' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
