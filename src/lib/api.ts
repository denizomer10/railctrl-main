type JsonValue = Record<string, unknown> | unknown[];

export function jsonResponse(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function parsePagination(url: URL, defaults = { page: 1, limit: 50 }, maxLimit = 200) {
  const rawPage = Number.parseInt(url.searchParams.get('page') || String(defaults.page), 10);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || String(defaults.limit), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : defaults.page;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaults.limit;
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function requireUser(locals: App.Locals) {
  if (!locals.user) {
    return { ok: false as const, response: jsonResponse({ error: 'Yetkisiz erişim' }, 401) };
  }
  return { ok: true as const, user: locals.user };
}

export function requireRole(locals: App.Locals, roles: string[]) {
  const auth = requireUser(locals);
  if (!auth.ok) {
    return auth;
  }

  if (!roles.includes(auth.user.role)) {
    return { ok: false as const, response: jsonResponse({ error: 'Bu işlem için yetkiniz yok' }, 403) };
  }

  return auth;
}

/**
 * İstek gövdesini JSON nesnesi olarak okur. Bozuk, boş ya da nesne olmayan
 * gövdede 400 döndürür; böylece `await request.json()` istisnası 500'e
 * dönüşüp istemciye sunucu hatası olarak yansımaz.
 */
export async function readJsonBody<T = any>(
  request: Request
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return { ok: false, response: jsonResponse({ error: 'Geçersiz JSON gövdesi' }, 400) };
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, response: jsonResponse({ error: 'Geçersiz istek gövdesi' }, 400) };
  }

  return { ok: true, data: data as T };
}
