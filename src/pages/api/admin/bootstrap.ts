import type { APIRoute } from 'astro';
import { createUser } from '../../../lib/auth';
import { ensureAppSchema } from '../../../lib/schema';
import { query, Tables } from '../../../lib/database';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    await ensureAppSchema();
    
    // Check if any admin exists
    const existingAdmin = await query(`SELECT id FROM ${Tables.USERS} WHERE role = 'admin' LIMIT 1`);
    
    if (existingAdmin.rows.length > 0) {
      return new Response(JSON.stringify({ error: 'Admin already exists' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const user = await createUser(
      'admin',
      'admin@tren.gov.tr',
      'admin123',
      'Sistem Yöneticisi',
      'admin',
      'Yönetim',
      'Merkez',
      'Sistem Yöneticisi',
      '+90 555 000 00 00'
    );
    
    return new Response(JSON.stringify({ success: true, user }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Bootstrap error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
