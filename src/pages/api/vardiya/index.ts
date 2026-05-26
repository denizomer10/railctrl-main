import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { jsonResponse, requireRole, requireUser } from '../../../lib/api';
import { ensureAppSchema } from '../../../lib/schema';
import { buildMonthCalendar, normalizePersonnel, normalizeWeekShifts } from '../../../lib/vardiya';
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
  const result = await query<{ istasyon: string | null }>('SELECT istasyon FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.istasyon || null;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const auth = requireUser(locals);
  if (!auth.ok) return auth.response;

  try {
    await ensureAppSchema();

    const now = new Date();
    const yearParam = url.searchParams.get('year');
    const requestedYear = yearParam ? Number.parseInt(yearParam, 10) : Number.NaN;
    const safeYear = Number.isFinite(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100
      ? requestedYear
      : now.getFullYear();
    const requestedMonth = Number.parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
    const safeMonth = Number.isFinite(requestedMonth) ? requestedMonth : now.getMonth() + 1;

    let station = url.searchParams.get('station') || null;
    if (auth.user.role === 'user') {
      station = auth.user.station || (await getUserStation(auth.user.id));
      if (!station) {
        return jsonResponse({ error: 'Kullanıcının istasyon bilgisi bulunamadı' }, 400);
      }
    }

    const normalizedStation = station ? normalizeStationName(station) : '';
    const params: any[] = [];
    let whereText = 'WHERE is_active = true';
    let idx = 1;

    whereText += ` AND yil = $${idx++}`;
    params.push(safeYear);

    if (safeMonth >= 1 && safeMonth <= 12) {
      whereText += ` AND ay = $${idx++}`;
      params.push(safeMonth);
    }

    const result = await query<any>(
      `SELECT id, istasyon, yil, ay, week_shifts, personel, created_at, updated_at
       FROM vardiyalar
       ${whereText}
       ORDER BY yil DESC, ay DESC, created_at DESC`,
      params
    );
    const stationFilteredRows = normalizedStation
      ? result.rows.filter((row) => {
          const rowNorm = normalizeStationName(row.istasyon);
          if (rowNorm === normalizedStation) return true;
          return looseStationKey(rowNorm) === looseStationKey(normalizedStation);
        })
      : result.rows;

    const records = stationFilteredRows.map((row) => {
      const weekShifts = normalizeWeekShifts(row.week_shifts);
      const personnel = normalizePersonnel(row.personel);
      return {
        ...row,
        week_shifts: weekShifts,
        personel: personnel,
        takvim: buildMonthCalendar(Number(row.yil), Number(row.ay), weekShifts, personnel),
      };
    });

    return jsonResponse({ records });
  } catch (error) {
    console.error('Vardiya GET error:', error);
    return jsonResponse({ error: 'Vardiya kayıtları alınırken hata oluştu' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = requireRole(locals, ['admin', 'sef', 'gar_mudur']);
  if (!auth.ok) return auth.response;

  try {
    await ensureAppSchema();
    const body = await request.json();

    const istasyon = String(body.istasyon || '').trim();
    const yil = Number.parseInt(String(body.yil), 10);
    const ay = Number.parseInt(String(body.ay), 10);
    const weekShifts = normalizeWeekShifts(body.week_shifts);
    const personel = normalizePersonnel(body.personel);

    if (!istasyon) {
      return jsonResponse({ error: 'İstasyon zorunludur' }, 400);
    }
    if (!Number.isFinite(yil) || yil < 2020 || yil > 2100) {
      return jsonResponse({ error: 'Geçerli bir yıl girin' }, 400);
    }
    if (!Number.isFinite(ay) || ay < 1 || ay > 12) {
      return jsonResponse({ error: 'Geçerli bir ay girin' }, 400);
    }

    const existing = await query<{ id: number }>(
      `SELECT id FROM vardiyalar WHERE istasyon = $1 AND yil = $2 AND ay = $3 AND is_active = true LIMIT 1`,
      [istasyon, yil, ay]
    );

    let saved;

    if (existing.rows.length > 0) {
      saved = await query<any>(
        `UPDATE vardiyalar
         SET week_shifts = $1, personel = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING id, istasyon, yil, ay, week_shifts, personel, is_active, created_at, updated_at`,
        [JSON.stringify(weekShifts), JSON.stringify(personel), auth.user.id, existing.rows[0].id]
      );
    } else {
      saved = await query<any>(
        `INSERT INTO vardiyalar (istasyon, yil, ay, week_shifts, personel, created_by, updated_by, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 1)
         RETURNING id, istasyon, yil, ay, week_shifts, personel, is_active, created_at, updated_at`,
        [istasyon, yil, ay, JSON.stringify(weekShifts), JSON.stringify(personel), auth.user.id]
      );
    }

    const row = saved.rows[0];

    await createStationNotifications(istasyon, 'notify_vardiya', {
      category: 'vardiya',
      title: existing.rows.length > 0 ? 'Vardiya Güncellendi' : 'Yeni Vardiya Planı',
      message:
        existing.rows.length > 0
          ? `${istasyon} için ${ay}/${yil} vardiya planı güncellendi`
          : `${istasyon} için ${ay}/${yil} vardiya planı oluşturuldu`,
      resourceType: 'vardiyalar',
      resourceId: row.id,
      station: istasyon,
      actorUserId: auth.user.id,
    });

    await logAudit({
      userId: auth.user.id,
      action: existing.rows.length > 0 ? 'vardiya.update' : 'vardiya.create',
      resourceType: 'vardiyalar',
      resourceId: row.id,
      details: {
        istasyon,
        yil,
        ay,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return jsonResponse(
      {
        message: existing.rows.length > 0 ? 'Vardiya güncellendi' : 'Vardiya oluşturuldu',
        record: {
          ...row,
          week_shifts: normalizeWeekShifts(row.week_shifts),
          personel: normalizePersonnel(row.personel),
        },
      },
      existing.rows.length > 0 ? 200 : 201
    );
  } catch (error) {
    console.error('Vardiya POST error:', error);
    return jsonResponse({ error: 'Vardiya kaydı oluşturulurken hata oluştu' }, 500);
  }
};
