import type { APIRoute } from 'astro';
import { query, Tables } from '../../../lib/database';
import { hashPassword } from '../../../lib/auth';
import { ensureAppSchema } from '../../../lib/schema';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// GET - List all users (sadece yönetici erişebilir)
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'yonetici') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const result = await query(
      `SELECT id, username AS nickname, full_name AS name, role, is_active, created_at, last_login, notify_mms, notify_calisma
         FROM ${Tables.USERS}
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

// POST - Create new user (sadece yönetici erişebilir)
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'yonetici') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { nickname, name, password, role, gorevi, notify_mms, notify_calisma } = await request.json();
    const normalizedNickname = String(nickname || '').trim().toLowerCase();

    // Validate input
    if (!normalizedNickname || !name || !password || !role) {
      return new Response(JSON.stringify({ error: 'All fields are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const nicknamePattern = /^[a-z0-9_.-]{3,32}$/;
    if (!nicknamePattern.test(normalizedNickname)) {
      return new Response(JSON.stringify({ error: 'Nickname 3–32 karakter olmalı; harf, sayı, nokta, tire ve alt çizgi kullanabilirsiniz.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const existing = await query('SELECT id FROM users WHERE username = $1', [normalizedNickname]);
    if (existing.rows.length > 0) {
      return new Response(JSON.stringify({ error: 'Bu nickname zaten kullanılıyor' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate role
    const validRoles = ['personel', 'yonetici'];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Rol Personel veya Yönetici olmalı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (gorevi !== 'personel' && gorevi !== 'yonetici') {
      return new Response(JSON.stringify({ error: 'Görevi Personel veya Yönetici olmalı' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const passwordHash = await hashPassword(password);

    const result = await query(
      `INSERT INTO ${Tables.USERS} (id, username, email, password_hash, full_name, role, gorevi, istasyon, notify_mms, notify_calisma, notify_vardiya, notify_kayip_esya)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, 1, 1)
       RETURNING id, username AS nickname, full_name AS name, role, gorevi, is_active, created_at, notify_mms, notify_calisma`,
      [crypto.randomUUID(), normalizedNickname, `${normalizedNickname}@local.invalid`, passwordHash, name.trim(), role, gorevi, notify_mms ?? true, notify_calisma ?? true]
    );

    await logAudit({
      userId: locals.user.id,
      action: 'admin.user.create',
      resourceType: 'personel',
      resourceId: result.rows[0].id,
      details: {
        nickname: normalizedNickname,
        role,
        gorevi,
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
        return new Response(JSON.stringify({ error: 'Bu nickname zaten kullanılıyor.' }), {
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
