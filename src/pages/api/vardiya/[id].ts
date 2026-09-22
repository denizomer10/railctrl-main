import type { APIRoute } from 'astro';
import { query, Tables } from '../../../lib/database';
import { jsonResponse, requireRole, requireUser } from '../../../lib/api';
import { ensureAppSchema } from '../../../lib/schema';
import { normalizePersonnel, normalizeWeekShifts } from '../../../lib/vardiya';
import { createStationNotifications } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

function normalizeStationName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]/g, '');
}

function looseStationKey(value: string): string {
  return value.replace(/i/g, '');
}

async function getUserStation(userId: string): Promise<string | null> {
  const result = await query<{ istasyon: string | null }>(`SELECT istasyon FROM ${Tables.USERS} WHERE id = $1`, [userId]);
  return result.rows[0]?.istasyon || null;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const auth = requireUser(locals);
  if (!auth.ok) return auth.response;

  try {
    await ensureAppSchema();
    const id = Number.parseInt(params.id || '', 10);
    if (!Number.isFinite(id)) return jsonResponse({ error: 'Geçersiz kayıt id' }, 400);

    const result = await query<any>(
      `SELECT id, istasyon, yil, ay, week_shifts, personel, created_at, updated_at
       FROM vardiyalar WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (result.rows.length === 0) return jsonResponse({ error: 'Kayıt bulunamadı' }, 404);

    const row = result.rows[0];

    if (auth.user.role === 'user') {
      const station = auth.user.station || (await getUserStation(auth.user.id));
      const requestedNorm = normalizeStationName(station);
      const rowNorm = normalizeStationName(row.istasyon);
      const isStationMatch = requestedNorm === rowNorm || looseStationKey(requestedNorm) === looseStationKey(rowNorm);
      if (!station || !isStationMatch) {
        return jsonResponse({ error: 'Bu kaydı görüntüleme yetkiniz yok' }, 403);
      }
    }

    return jsonResponse({
      record: {
        ...row,
        week_shifts: normalizeWeekShifts(row.week_shifts),
        personel: normalizePersonnel(row.personel),
      },
    });
  } catch (error) {
    console.error('Vardiya detail GET error:', error);
    return jsonResponse({ error: 'Kayıt alınırken hata oluştu' }, 500);
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const auth = requireRole(locals, ['admin', 'sef', 'gar_mudur']);
  if (!auth.ok) return auth.response;

  try {
    await ensureAppSchema();
    const id = Number.parseInt(params.id || '', 10);
    if (!Number.isFinite(id)) return jsonResponse({ error: 'Geçersiz kayıt id' }, 400);

    const body = await request.json();

    const istasyon = String(body.istasyon || '').trim();
    const yil = Number.parseInt(String(body.yil), 10);
    const ay = Number.parseInt(String(body.ay), 10);
    const weekShifts = normalizeWeekShifts(body.week_shifts);
    const personel = normalizePersonnel(body.personel);

    if (!istasyon) return jsonResponse({ error: 'İstasyon zorunludur' }, 400);
    if (!Number.isFinite(yil) || yil < 2020 || yil > 2100) return jsonResponse({ error: 'Geçerli yıl girin' }, 400);
    if (!Number.isFinite(ay) || ay < 1 || ay > 12) return jsonResponse({ error: 'Geçerli ay girin' }, 400);

    const result = await query<any>(
      `UPDATE vardiyalar
       SET istasyon = $1,
           yil = $2,
           ay = $3,
           week_shifts = $4,
           personel = $5,
           updated_by = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND is_active = true
       RETURNING id, istasyon, yil, ay, week_shifts, personel, created_at, updated_at`,
      [istasyon, yil, ay, JSON.stringify(weekShifts), JSON.stringify(personel), auth.user.id, id]
    );

    if (result.rows.length === 0) return jsonResponse({ error: 'Kayıt bulunamadı' }, 404);
    const updatedRow = result.rows[0];

    await createStationNotifications(updatedRow.istasyon, 'notify_vardiya', {
      category: 'vardiya',
      title: 'Vardiya Güncellendi',
      message: `${updatedRow.istasyon} için ${updatedRow.ay}/${updatedRow.yil} vardiya planı güncellendi`,
      resourceType: 'vardiyalar',
      resourceId: updatedRow.id,
      station: updatedRow.istasyon,
      actorUserId: auth.user.id,
    });

    await logAudit({
      userId: auth.user.id,
      action: 'vardiya.update',
      resourceType: 'vardiyalar',
      resourceId: updatedRow.id,
      details: {
        istasyon: updatedRow.istasyon,
        yil: updatedRow.yil,
        ay: updatedRow.ay,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return jsonResponse({
      message: 'Vardiya güncellendi',
      record: {
        ...updatedRow,
        week_shifts: normalizeWeekShifts(updatedRow.week_shifts),
        personel: normalizePersonnel(updatedRow.personel),
      },
    });
  } catch (error) {
    console.error('Vardiya PUT error:', error);
    return jsonResponse({ error: 'Kayıt güncellenirken hata oluştu' }, 500);
  }
};

export const DELETE: APIRoute = async ({ params, locals, request }) => {
  const auth = requireRole(locals, ['admin', 'sef', 'gar_mudur']);
  if (!auth.ok) return auth.response;

  try {
    await ensureAppSchema();
    const id = Number.parseInt(params.id || '', 10);
    if (!Number.isFinite(id)) return jsonResponse({ error: 'Geçersiz kayıt id' }, 400);

    const result = await query(
      `UPDATE vardiyalar SET is_active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND is_active = true`,
      [auth.user.id, id]
    );

    if (result.rowCount === 0) return jsonResponse({ error: 'Kayıt bulunamadı' }, 404);

    await logAudit({
      userId: auth.user.id,
      action: 'vardiya.delete',
      resourceType: 'vardiyalar',
      resourceId: id,
      details: {},
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return jsonResponse({ message: 'Vardiya kaldırıldı' });
  } catch (error) {
    console.error('Vardiya DELETE error:', error);
    return jsonResponse({ error: 'Kayıt silinirken hata oluştu' }, 500);
  }
};
