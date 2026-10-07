import { db, sql } from 'astro:db';

export interface DBQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DBTransactionClient {
  query<T = any>(text: string, params?: any[]): Promise<DBQueryResult<T>>;
}

function normalizeResult<T = any>(result: any): DBQueryResult<T> {
  if (!result) {
    return { rows: [], rowCount: 0 };
  }

  if (Array.isArray(result)) {
    return { rows: result as T[], rowCount: result.length };
  }

  if ('rows' in result) {
    return {
      rows: (result.rows || []) as T[],
      rowCount:
        typeof result.rowCount === 'number'
          ? result.rowCount
          : (typeof result.rowsAffected === 'number' ? result.rowsAffected : 0),
    };
  }

  if ('rowsAffected' in result && typeof result.rowsAffected === 'number') {
    return { rows: [], rowCount: result.rowsAffected };
  }

  return { rows: [], rowCount: 0 };
}

function isBinaryValue(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
  );
}

function quoteSqlValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';

  // BLOB değerleri (şifreli dosya içeriği, IV) SQLite blob literal'ı olarak
  // yazılmalıdır. JSON'a çevrilirse `{"type":"Buffer","data":[...]}` metni
  // kaydedilir ve dosya çözülemez hale gelir.
  if (isBinaryValue(value)) {
    return `X'${Buffer.from(value).toString('hex')}'`;
  }

  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
  if (Array.isArray(value)) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

const SQL_STRING_LITERAL = /'(?:[^']|'')*'/g;

/**
 * String literallerini maskeleyerek yapısal dönüşümlerin veriye dokunmasını
 * engeller; dönüşümden sonra eski yerlerine geri konur.
 */
function withMaskedLiterals(text: string, transform: (masked: string) => string): string {
  const literals: string[] = [];
  const masked = text.replace(SQL_STRING_LITERAL, (match) => {
    literals.push(match);
    return `\u0000${literals.length - 1}\u0000`;
  });
  return transform(masked).replace(/\u0000(\d+)\u0000/g, (_m, index: string) => literals[Number(index)] ?? '');
}

/**
 * Türkçe duyarlı küçük harfe çevirme SQL ifadesi.
 * SQLite `LOWER()` yalnızca ASCII harfleri küçültür; İ/ı/Ş/ş/Ğ/ğ/Ü/ü/Ö/ö/Ç/ç
 * eşleşmezdi. Her iki tarafı da aynı kanonik forma katlarız.
 */
function foldTrSql(expr: string): string {
  return (
    `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(` +
    `LOWER(REPLACE(REPLACE(${expr},'ı','i'),'İ','i'))` +
    `,'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')`
  );
}

// `col ILIKE $1` gibi karşılaştırmalarda operant sınırlarını bulmak için:
// `$n`, `tablo.sutun` veya `COALESCE(a, 'b')` gibi dengeli parantezli çağrılar.
const SQL_OPERAND_SOURCE =
  String.raw`\$\d+|[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?(?:\((?:[^()']|'(?:[^']|'')*')*\))?`;

function foldLikeComparisons(chunk: string): string {
  const pattern = new RegExp(`(${SQL_OPERAND_SOURCE})\\s+ILIKE\\s+(${SQL_OPERAND_SOURCE})`, 'gi');
  return chunk.replace(pattern, (_match, left: string, right: string) =>
    `${foldTrSql(left)} LIKE ${foldTrSql(right)}`
  );
}

/**
 * Literal desenini bilerek eşleştiren dönüşümler. Bu aşamada kullanıcı verisi
 * henüz metne karışmadığı için literal'lara bakmak güvenlidir
 * (ör. `TO_CHAR(x, 'FM00')`).
 */
function applyLiteralAwareTransforms(text: string): string {
  return text.replace(/TO_CHAR\(([^,]+),\s*'FM00'\)/gi, "printf('%02d', $1)");
}

/**
 * PostgreSQL sözdizimini SQLite'a uyarlar. String literaller maskeliyken
 * çalışır; böylece `::` temizliği veya `= true` -> `= 1` kuralları veriye
 * dokunmaz.
 */
function applyStructuralTransforms(text: string): string {
  let out = text;

  out = out.replace(/\bNOW\(\)/g, 'CURRENT_TIMESTAMP');
  out = out.replace(/::\s*[a-zA-Z_][a-zA-Z0-9_]*(\([^)]*\))?(\[\])?/g, '');
  out = out.replace(/\bUUID\b/g, 'TEXT');
  out = out.replace(/\bJSONB\b/g, 'TEXT');
  out = out.replace(/\bINET\b/g, 'TEXT');
  out = out.replace(/\bBIGSERIAL\b/g, 'INTEGER');
  out = out.replace(/\bSERIAL\b/g, 'INTEGER');
  out = out.replace(/BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/gi, 'INTEGER NOT NULL DEFAULT 1');
  out = out.replace(/BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/gi, 'INTEGER NOT NULL DEFAULT 0');
  out = out.replace(/BOOLEAN\s+DEFAULT\s+true/gi, 'INTEGER DEFAULT 1');
  out = out.replace(/BOOLEAN\s+DEFAULT\s+false/gi, 'INTEGER DEFAULT 0');
  out = out.replace(/jsonb_array_length\(/gi, 'json_array_length(');
  out = out.replace(/jsonb_build_object\(/gi, 'json_object(');
  out = out.replace(/TRUNCATE TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+RESTART IDENTITY/gi, 'DELETE FROM $1');
  out = out.replace(/=\s*true\b/gi, '= 1');
  out = out.replace(/=\s*false\b/gi, '= 0');
  out = out.replace(/\bNULLS\s+LAST\b/gi, '');

  // PostgreSQL aggregate FILTER to SQLite-compatible CASE WHEN
  out = out.replace(
    /COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+([^)]+)\)/gi,
    'SUM(CASE WHEN $1 THEN 1 ELSE 0 END)'
  );

  return out;
}

/**
 * `$n` yer tutucularını tek geçişte, string literallerin dışına bakarak
 * gerçek değerlerle değiştirir. İki aşamalı `__PARAM_n__` yaklaşımının aksine
 * parametre değeri `__PARAM_1__` gibi bir metin içerse bile bozulmaz.
 */
function substituteParams(text: string, params: any[]): string {
  if (params.length === 0) return text;

  let out = '';
  let buffer = '';
  let inLiteral = false;

  const flush = () => {
    out += buffer;
    buffer = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inLiteral) {
      buffer += ch;
      if (ch === "'") {
        if (text[i + 1] === "'") {
          buffer += "'";
          i += 1;
          continue;
        }
        inLiteral = false;
      }
      continue;
    }

    if (ch === "'") {
      inLiteral = true;
      buffer += ch;
      continue;
    }

    if (ch === '$') {
      const match = /^\$(\d+)/.exec(text.slice(i));
      if (match) {
        const index = Number(match[1]);
        if (index >= 1 && index <= params.length) {
          flush();
          out += quoteSqlValue(params[index - 1]);
          i += match[0].length - 1;
          continue;
        }
      }
    }

    buffer += ch;
  }

  flush();
  return out;
}

function buildExecutableSql(text: string, params: any[] = []): string {
  // 1) Literal desenli dönüşümler (kullanıcı verisi henüz metinde değil)
  let out = applyLiteralAwareTransforms(text);
  // 2) ILIKE -> Turkce duyarli LIKE (yer tutucular henuz `$n`)
  out = foldLikeComparisons(out);
  // 3) Yapisal donusumler, literaller maskeli
  out = withMaskedLiterals(out, applyStructuralTransforms);
  // 4) Parametreler en son yerlestirilir; boylece hicbir donusum veriye dokunmaz
  return params.length ? substituteParams(out, params) : out;
}

// Parametresiz SQL metinleri (DDL, istatistikler, PRAGMA) her istekte yeniden
// donusturulmesin. Sonlu bir onbellekle siniirlariz.
const staticSqlCache = new Map<string, string>();
const STATIC_SQL_CACHE_LIMIT = 500;

function buildExecutableSqlCached(text: string, params: any[] = []): string {
  if (params.length > 0) return buildExecutableSql(text, params);
  const cached = staticSqlCache.get(text);
  if (cached !== undefined) return cached;
  const built = buildExecutableSql(text);
  if (staticSqlCache.size < STATIC_SQL_CACHE_LIMIT) staticSqlCache.set(text, built);
  return built;
}

function isBusyError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error);
  return message.includes('SQLITE_BUSY') || message.includes('database is locked');
}

async function runAstroDb(text: string, params?: any[]): Promise<any> {
  const executable = buildExecutableSqlCached(text, params || []);
  let attempt = 0;
  // WAL modunda bile kısa süreli kilit çakışmaları olabilir; küçük bir geri
  // çekilme ile yeniden denemek 500 dönmesini engeller.
  for (;;) {
    try {
      return await db.run(sql.raw(executable));
    } catch (error) {
      if (isBusyError(error) && attempt < 4) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
        continue;
      }
      console.error('SQL exec failed:', executable);
      throw error;
    }
  }
}

// Tek libSQL bağlantısı üzerinden BEGIN/COMMIT'in birbirine karışmaması için
// tüm veritabanı işlemlerini tek bir sıraya alan basit bir FIFO kilit.
let dbLockChain: Promise<unknown> = Promise.resolve();

function withDbLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = dbLockChain.then(operation, operation);
  dbLockChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<DBQueryResult<T>> {
  const start = Date.now();

  try {
    const result = normalizeResult<T>(await withDbLock(() => runAstroDb(text, params)));

    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn(`Slow query (${duration}ms):`, text.substring(0, 120));
    }

    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function transaction<T>(callback: (client: DBTransactionClient) => Promise<T>): Promise<T> {
  return withDbLock(async () => {
    try {
      await runAstroDb('BEGIN');
      const client: DBTransactionClient = {
        query: async <R = any>(text: string, params?: any[]) =>
          normalizeResult<R>(await runAstroDb(text, params)),
      };
      const result = await callback(client);
      await runAstroDb('COMMIT');
      return result;
    } catch (error) {
      try {
        await runAstroDb('ROLLBACK');
      } catch (rollbackError) {
        console.error('ROLLBACK failed:', rollbackError);
      }
      throw error;
    }
  });
}

export async function checkConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as ok');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export const Tables = {
  USERS: 'users',
  SESSIONS: 'sessions',
  REFRESH_TOKENS: 'refresh_tokens',
  AUDIT_LOGS: 'audit_logs',
  MMS_RECORDS: 'mms_records',
  CALISMA_IZINLERI: 'calisma_izinleri',
  NOTLAR: 'notlar',
  DAHILI_NUMARALAR: 'dahili_numaralar',
  PERSONEL_KAYITLARI: 'personel_kayitlari',
  IZIN_ISTEKLERI: 'izin_istekleri',
  GERI_BILDIRIMLER: 'geri_bildirimler',
  VARDIYALAR: 'vardiyalar',
  KAYIP_ESYA: 'kayip_esya',
  NOTIFICATIONS: 'notifications',
} as const;

export type TableName = (typeof Tables)[keyof typeof Tables];
