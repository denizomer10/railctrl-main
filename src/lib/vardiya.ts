export const SHIFT_TYPES = {
  SABAH: 'sabah',
  ARA: 'ara',
  GECE: 'gece',
} as const;

export type ShiftType = (typeof SHIFT_TYPES)[keyof typeof SHIFT_TYPES];
export type WeekKey = 'hafta1' | 'hafta2' | 'hafta3' | 'hafta4' | 'hafta5';

export const SHIFT_LABELS: Record<ShiftType, string> = {
  sabah: 'Sabah (08:00 - 16:00)',
  ara: 'Ara (16:00 - 00:00)',
  gece: 'Gece (00:00 - 08:00)',
};

export const DAY_OPTIONS = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

export type OffDay = (typeof DAY_OPTIONS)[number];

export interface WeekShiftModel {
  hafta1: ShiftType;
  hafta2: ShiftType;
  hafta3: ShiftType;
  hafta4: ShiftType;
  hafta5: ShiftType;
}

export interface PersonnelModel {
  fullName: string;
  offDay: OffDay;
  week_shifts: WeekShiftModel;
  izinler?: Array<{ date: string; code: string }>;
}

const DEFAULT_SHIFT: ShiftType = SHIFT_TYPES.SABAH;

function parseJsonSafe(input: any): any {
  if (typeof input !== 'string') return input;
  const raw = input.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeWeekShifts(input: any): WeekShiftModel {
  const fallback: WeekShiftModel = {
    hafta1: DEFAULT_SHIFT,
    hafta2: DEFAULT_SHIFT,
    hafta3: DEFAULT_SHIFT,
    hafta4: DEFAULT_SHIFT,
    hafta5: DEFAULT_SHIFT,
  };

  const normalizedInput = parseJsonSafe(input);
  if (!normalizedInput || typeof normalizedInput !== 'object') {
    return fallback;
  }

  return {
    hafta1: normalizeShift(normalizedInput.hafta1),
    hafta2: normalizeShift(normalizedInput.hafta2),
    hafta3: normalizeShift(normalizedInput.hafta3),
    hafta4: normalizeShift(normalizedInput.hafta4),
    hafta5: normalizeShift(normalizedInput.hafta5),
  };
}

function normalizeShift(input: any): ShiftType {
  if (input === SHIFT_TYPES.SABAH || input === SHIFT_TYPES.ARA || input === SHIFT_TYPES.GECE) {
    return input;
  }
  return DEFAULT_SHIFT;
}

export function normalizePersonnel(input: any): PersonnelModel[] {
  const normalizedInput = parseJsonSafe(input);
  if (!Array.isArray(normalizedInput)) return [];

  return normalizedInput
    .slice(0, 4)
    .map((item: any) => {
      const izinler = Array.isArray(item?.izinler)
        ? item.izinler
            .map((entry: any) => ({
              date: String(entry?.date || '').trim(),
              code: String(entry?.code || '').trim().toUpperCase(),
            }))
            .filter((entry: any) => entry.date && entry.code)
        : [];

      return {
        fullName: String(item?.fullName || '').trim(),
        offDay: normalizeOffDay(item?.offDay),
        week_shifts: normalizeWeekShifts(item?.week_shifts ?? item?.weekShifts),
        izinler,
      };
    })
    .filter((item: PersonnelModel) => item.fullName.length > 0);
}

function normalizeOffDay(input: any): OffDay {
  if (DAY_OPTIONS.includes(input)) return input;
  return 'Pazar';
}

export function getWeekIndex(dayOfMonth: number): 1 | 2 | 3 | 4 | 5 {
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  if (dayOfMonth <= 28) return 4;
  return 5;
}

export function shiftByWeekIndex(weekShifts: WeekShiftModel, weekIndex: 1 | 2 | 3 | 4 | 5): ShiftType {
  if (weekIndex === 1) return weekShifts.hafta1;
  if (weekIndex === 2) return weekShifts.hafta2;
  if (weekIndex === 3) return weekShifts.hafta3;
  if (weekIndex === 4) return weekShifts.hafta4;
  return weekShifts.hafta5;
}

export function shiftByDay(weekShifts: WeekShiftModel, dayOfMonth: number): ShiftType {
  return shiftByWeekIndex(weekShifts, getWeekIndex(dayOfMonth));
}

export function shiftByOffDayProgress(
  weekShifts: WeekShiftModel,
  dayName: OffDay,
  offDay: OffDay,
  offDaysSeenBefore: number
): ShiftType | null {
  if (dayName === offDay) return null;
  const safeIndex = Math.min(Math.max(offDaysSeenBefore + 1, 1), 5) as 1 | 2 | 3 | 4 | 5;
  return shiftByWeekIndex(weekShifts, safeIndex);
}

const OFF_DAY_BY_INDEX: Record<number, OffDay> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
  0: 'Pazar',
};

export function buildMonthCalendar(
  year: number,
  month: number,
  weekShifts: WeekShiftModel,
  personnel: PersonnelModel[]
) {
  const totalDays = new Date(year, month, 0).getDate();
  const rows: Array<{
    date: string;
    dayName: OffDay;
    week: 1 | 2 | 3 | 4 | 5;
    shift: ShiftType;
    personnel: Array<{ fullName: string; state: string; shift: ShiftType | null }>;
  }> = [];

  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, month - 1, day);
    const dayName = OFF_DAY_BY_INDEX[dateObj.getDay()];
    const shift = shiftByDay(weekShifts, day);
    const week = getWeekIndex(day);

    rows.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dayName,
      week,
      shift,
      personnel: personnel.map((p) => ({
        fullName: p.fullName,
        state: '',
        shift: null,
      })),
    });
  }

  for (const [personIndex, person] of personnel.entries()) {
    let offDaysSeen = 0;
    for (const row of rows) {
      const personRow = row.personnel[personIndex];
      if (!personRow) continue;

      const assignedShift = shiftByOffDayProgress(person.week_shifts || weekShifts, row.dayName, person.offDay, offDaysSeen);
      personRow.shift = assignedShift;
      personRow.state = assignedShift ? SHIFT_LABELS[assignedShift] : 'Tatil';

      if (row.dayName === person.offDay) {
        offDaysSeen += 1;
      }
    }
  }

  return rows;
}
