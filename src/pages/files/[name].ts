/**
 * Legacy Medya Rotası
 * GET /files/[name] - Eski not içeriklerindeki `/files/...` bağlantılarını
 * yeni medya deposuna yönlendirir. Kimlik doğrulaması middleware'de yapılır.
 */

import type { APIRoute } from 'astro';
import { isSafeMediaName, mediaUrl } from '../../lib/media';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  let name = '';
  try {
    name = decodeURIComponent(String(params.name || ''));
  } catch {
    name = String(params.name || '');
  }

  if (!isSafeMediaName(name)) {
    return new Response(JSON.stringify({ error: 'Geçersiz dosya adı' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: mediaUrl(name) },
  });
};