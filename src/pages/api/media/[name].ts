/**
 * Medya Sunum Endpoint'i
 * GET /api/media/[name] - Yüklenmiş not/referans medyasını kimlik doğrulamalı döndürür.
 *
 * Not ekleri gizli olabileceğinden (ör. "Şifre" kategorisi) dosyalar statik
 * `public/` altından değil, bu uç noktadan servis edilir.
 */

import type { APIRoute } from 'astro';
import { readMediaFile } from '../../../lib/media';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const rawName = params.name;
  const decoded = (() => {
    try {
      return decodeURIComponent(String(rawName || ''));
    } catch {
      return String(rawName || '');
    }
  })();

  const result = await readMediaFile(decoded);
  if (!result) {
    return new Response(JSON.stringify({ error: 'Dosya bulunamadı' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { bytes, mimeType } = result;
  const etag = `W/"${bytes.length.toString(16)}-${mimeType.length.toString(16)}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const isSvg = mimeType === 'image/svg+xml';

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(bytes.length),
      // SVG gibi etkin içerik taşıyabilen türler asla satır içi çalıştırılmaz.
      'Content-Disposition': `${isSvg ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(decoded)}`,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600, must-revalidate',
      ETag: etag,
    },
  });
};