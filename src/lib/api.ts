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
