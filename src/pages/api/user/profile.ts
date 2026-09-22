import type { APIRoute } from 'astro';
import { query, Tables } from '../../../lib/database';
import { hashPassword, verifyPassword } from '../../../lib/auth';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

function toBool(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['1', 'true', 't', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'f', 'no', 'off'].includes(v)) return false;
  }
  return defaultValue;
}

// GET - Kendi profil bilgilerini al
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const result = await query(
      `SELECT id, username, email, full_name, role, gorevi, department, phone, istasyon, notify_mms, notify_calisma, notify_vardiya, notify_kayip_esya, created_at 
           FROM ${Tables.USERS} WHERE id = $1`,
      [locals.user.id]
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kullanıcı bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const row = result.rows[0] as any;
    const normalizedUser = {
      ...row,
      notify_mms: toBool(row.notify_mms, true),
      notify_calisma: toBool(row.notify_calisma, true),
      notify_vardiya: toBool(row.notify_vardiya, true),
      notify_kayip_esya: toBool(row.notify_kayip_esya, true),
    };

    return new Response(JSON.stringify({ user: normalizedUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return new Response(JSON.stringify({ error: 'Profil bilgileri alınamadı' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// PUT - Kendi profil bilgilerini güncelle
export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { full_name, email, istasyon, notify_mms, notify_calisma, notify_vardiya, notify_kayip_esya, current_password, new_password } = await request.json();

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Ad soyad güncelleme
    if (full_name && full_name.trim()) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(full_name.trim());
      paramIndex++;
    }

    if (istasyon !== undefined) {
      updates.push(`istasyon = $${paramIndex}`);
      values.push(istasyon?.trim() || null);
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

    if (notify_vardiya !== undefined) {
      updates.push(`notify_vardiya = $${paramIndex}`);
      values.push(Boolean(notify_vardiya));
      paramIndex++;
    }

    if (notify_kayip_esya !== undefined) {
      updates.push(`notify_kayip_esya = $${paramIndex}`);
      values.push(Boolean(notify_kayip_esya));
      paramIndex++;
    }

    // Email güncelleme
    if (email && email.trim()) {
      // Email formatı kontrolü
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ error: 'Geçersiz email formatı' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Email zaten kullanılıyor mu kontrol et
      const existing = await query(
              `SELECT id FROM ${Tables.USERS} WHERE email = $1 AND id != $2`,
        [email.toLowerCase(), locals.user.id]
      );
      if (existing.rows.length > 0) {
        return new Response(JSON.stringify({ error: 'Bu email adresi zaten kullanılıyor' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      updates.push(`email = $${paramIndex}`);
      values.push(email.toLowerCase().trim());
      paramIndex++;

      // Username'i de güncelle
      const newUsername = email.split('@')[0].toLowerCase();
      updates.push(`username = $${paramIndex}`);
      values.push(newUsername);
      paramIndex++;
    }

    // Şifre güncelleme
    if (new_password) {
      if (!current_password) {
        return new Response(JSON.stringify({ error: 'Mevcut şifrenizi girmelisiniz' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (new_password.length < 6) {
        return new Response(JSON.stringify({ error: 'Yeni şifre en az 6 karakter olmalı' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Mevcut şifreyi doğrula
      const userResult = await query(
              `SELECT password_hash FROM ${Tables.USERS} WHERE id = $1`,
        [locals.user.id]
      );

      if (userResult.rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Kullanıcı bulunamadı' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const isValidPassword = await verifyPassword(current_password, userResult.rows[0].password_hash);
      if (!isValidPassword) {
        return new Response(JSON.stringify({ error: 'Mevcut şifre hatalı' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Yeni şifreyi hashle
      const newPasswordHash = await hashPassword(new_password);
      updates.push(`password_hash = $${paramIndex}`);
      values.push(newPasswordHash);
      paramIndex++;
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'Güncellenecek bilgi bulunamadı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Updated_at ekle
    updates.push(`updated_at = NOW()`);

    values.push(locals.user.id);
    const result = await query(
          `UPDATE ${Tables.USERS} SET ${updates.join(', ')} WHERE id = $${paramIndex} 
       RETURNING id, username, email, full_name, role, gorevi, istasyon, notify_mms, notify_calisma, notify_vardiya, notify_kayip_esya`,
      values
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kullanıcı bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const updatedRow = result.rows[0] as any;
    const normalizedUpdatedUser = {
      ...updatedRow,
      notify_mms: toBool(updatedRow.notify_mms, true),
      notify_calisma: toBool(updatedRow.notify_calisma, true),
      notify_vardiya: toBool(updatedRow.notify_vardiya, true),
      notify_kayip_esya: toBool(updatedRow.notify_kayip_esya, true),
    };

    return new Response(JSON.stringify({
      success: true, 
      message: 'Profil güncellendi',
      user: normalizedUpdatedUser
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return new Response(JSON.stringify({ error: 'Profil güncellenemedi' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
