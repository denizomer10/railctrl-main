/**
 * RailCtrl uçtan uca duman testi.
 *
 * Gerçek veriyi kirletmemek için izole bir çalışma dizininde (os.tmpdir) test
 * veritabanı ve oturum anahtarı kopyası üzerinden derlenmiş standalone sunucuyu
 * başlatır, ardından tüm API uç noktalarını ve temel sayfaları dener.
 *
 * Kullanım: node tools/e2e.mjs
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'railctrl-e2e-'));
const PORT = String(3200 + Math.floor(Math.random() * 500));
const BASE = `http://127.0.0.1:${PORT}`;
const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const runtimeDir = path.join(TMP, 'run');
fs.mkdirSync(path.join(runtimeDir, '.astro'), { recursive: true });
fs.mkdirSync(path.join(runtimeDir, '.data', 'media'), { recursive: true });

for (const suffix of ['', '-wal', '-shm']) {
  const src = path.join(PROJECT_ROOT, '.astro', `content.db${suffix}`);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(runtimeDir, '.astro', `content.db${suffix}`));
}
const keyCopy = path.join(runtimeDir, '.astro', 'session.key');
fs.copyFileSync(path.join(PROJECT_ROOT, '.astro', 'session.key'), keyCopy);
const sessionKey = fs.readFileSync(keyCopy);

const server = spawn(process.execPath, [path.join(PROJECT_ROOT, 'dist/server/entry.mjs')], {
  cwd: runtimeDir,
  env: {
    ...process.env,
    PORT,
    HOST: '127.0.0.1',
    ENCRYPTION_KEY,
    RAILCTRL_SESSION_KEY_FILE: keyCopy,
    NODE_ENV: 'production',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

function cleanup() {
  try { server.kill('SIGKILL'); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function makeToken(userId, type = 'access') {
  const lifetimeSec = type === 'refresh' ? 30 * 24 * 60 * 60 : 86400;
  const encodedPayload = Buffer.from(JSON.stringify({ userId, type })).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSec;
  const signedValue = `rc1.${encodedPayload}.${nonce}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', sessionKey).update(signedValue).digest('hex');
  return `${signedValue}.${signature}`;
}

// --- mini test runner -----------------------------------------------------
const results = [];
let currentGroup = '';

function group(name) { currentGroup = name; console.log(`\n## ${name}`); }

function record(name, ok, detail = '') {
  results.push({ group: currentGroup, name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function req(method, url, { token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h['Cookie'] = `access-token=${token}`;
  if (body !== undefined && !raw) {
    h['Content-Type'] = 'application/json';
  }
  let payload;
  if (raw) payload = body;
  else if (body !== undefined) payload = JSON.stringify(body);
  let res;
  try {
    res = await fetch(`${BASE}${url}`, { method, headers: h, body: payload, redirect: 'manual' });
  } catch (error) {
    return { status: 0, error: error.message, text: '', json: null, headers: new Headers() };
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, headers: res.headers };
}

async function expect(name, method, url, expected, opts = {}) {
  const res = await req(method, url, opts);
  const wanted = Array.isArray(expected) ? expected : [expected];
  const ok = wanted.includes(res.status);
  record(name, ok, ok ? '' : `beklenen ${wanted.join('/')}, gelen ${res.status}${res.error ? ' (' + res.error + ')' : ''}`);
  return res;
}

// --- token'lar ------------------------------------------------------------
const adminToken = makeToken('admin-id');

async function main() {
  if (!(await waitForHealth())) {
    console.error('Sunucu başlatılamadı:\n' + serverLog);
    cleanup();
    process.exit(1);
  }

  // === Kimlik doğrulama gerektirmeyen uç noktalar =========================
  group('public / auth');
  await expect('health 200', 'GET', '/api/health', 200);
  const health = await req('GET', '/api/health');
  record('health gövdesi healthy', health.json?.status === 'healthy', health.json?.status);
  await expect('login sayfası 200', 'GET', '/login', 200);
  await expect('ana sayfa (girişsiz) login yönlendirme', 'GET', '/', 302);
  await expect('me (token yok) 401', 'GET', '/api/auth/me', 401);
  await expect('refresh (cookie yok) 401', 'POST', '/api/auth/refresh', 401);
  await expect('logout 200', 'POST', '/api/auth/logout', 200);
  await expect('problem-records (token yok) 401', 'GET', '/api/problem-records', 401);
  await expect('korumalı sayfa (token yok) login yönlendirme', 'GET', '/problem-records', 302);
  await expect('bilinmeyen sayfa (girişsiz) login yönlendirme', 'GET', '/bu-sayfa-yok-xyz', 302);

  group('login');
  await expect('login yanlış bilgi 401', 'POST', '/api/auth/login', 401, {
    body: { nickname: 'admin', password: 'kesinlikle-yanlis' },
  });
  await expect('login boş gövde 400', 'POST', '/api/auth/login', 400, { body: {} });
  await expect('login bozuk json 400', 'POST', '/api/auth/login', 400, {
    body: '{bozuk', raw: true, headers: { 'Content-Type': 'application/json' },
  });

  group('me (admin)');
  const me = await expect('me 200', 'GET', '/api/auth/me', 200, { token: adminToken });
  record('me rol yonetici', me.json?.user?.role === 'yonetici', me.json?.user?.role);
  await expect('ana sayfa (girişli) 200', 'GET', '/', 200, { token: adminToken });

  // === Arıza kayıtları (mms) =============================================
  group('problem-records');
  await expect('liste 200', 'GET', '/api/problem-records', 200, { token: adminToken });
  const prCreate = await expect('oluştur 201', 'POST', '/api/problem-records', 201, {
    token: adminToken,
    body: { mms_numarasi: `T-${Date.now()}`, ariza_tanimi: 'Test arıza', istasyon: 'Ankara' },
  });
  const prId = prCreate.json?.record?.id;
  if (prId) {
    await expect('detay 200', 'GET', `/api/problem-records/${prId}`, 200, { token: adminToken });
    await expect('güncelle 200', 'PUT', `/api/problem-records/${prId}`, 200, {
      token: adminToken, body: { durum: 'Onarıldı' },
    });
    const det = await req('GET', `/api/problem-records/${prId}`, { token: adminToken });
    record('durum kalıcı', det.json?.record?.durum === 'Onarıldı', det.json?.record?.durum);
    await expect('sil 200', 'DELETE', `/api/problem-records/${prId}`, 200, { token: adminToken });
    await expect('silinen detay 404', 'GET', `/api/problem-records/${prId}`, 404, { token: adminToken });
  } else {
    record('problem-records id alındı', false, JSON.stringify(prCreate.json));
  }
  await expect('zorunlu alan eksik 400', 'POST', '/api/problem-records', 400, { token: adminToken, body: { ariza_tanimi: 'x' } });
  await expect('arama 200', 'GET', '/api/problem-records?search=test&durum=&page=1&limit=5', 200, { token: adminToken });

  // === Çalışma izinleri ===================================================
  group('calisma-izni');
  await expect('liste 200', 'GET', '/api/calisma-izni', 200, { token: adminToken });
  const ciCreate = await expect('oluştur 201', 'POST', '/api/calisma-izni', 201, {
    token: adminToken,
    body: { calisma_kodu: `C-${Date.now()}`, yapilacak_is: 'Test iş', istasyon: 'İzmir', calisanlar: 'A, B' },
  });
  const ciId = ciCreate.json?.record?.id;
  if (ciId) {
    await expect('detay 200', 'GET', `/api/calisma-izni/${ciId}`, 200, { token: adminToken });
    await expect('güncelle 200', 'PUT', `/api/calisma-izni/${ciId}`, 200, { token: adminToken, body: { yapilacak_is: 'Güncel iş' } });
    await expect('sil 200', 'DELETE', `/api/calisma-izni/${ciId}`, 200, { token: adminToken });
  } else {
    record('calisma-izni id alındı', false, JSON.stringify(ciCreate.json));
  }
  await expect('zorunlu alan eksik 400', 'POST', '/api/calisma-izni', 400, { token: adminToken, body: { istasyon: 'X' } });

  // === Dahili numaralar ===================================================
  group('dahili-numaralar');
  await expect('liste 200', 'GET', '/api/dahili-numaralar', 200, { token: adminToken });
  const dnCreate = await expect('oluştur 201', 'POST', '/api/dahili-numaralar', 201, {
    token: adminToken, body: { dahili_numara: String(1000 + Math.floor(Math.random() * 8000)), birim: 'Test Birim' },
  });
  const dnId = dnCreate.json?.record?.id;
  if (dnId) {
    await expect('detay 200', 'GET', `/api/dahili-numaralar/${dnId}`, 200, { token: adminToken });
    await expect('güncelle 200', 'PUT', `/api/dahili-numaralar/${dnId}`, 200, { token: adminToken, body: { dahili_numara: '1234', birim: 'Yeni Birim', aciklama: 'a' } });
    await expect('sil 200', 'DELETE', `/api/dahili-numaralar/${dnId}`, 200, { token: adminToken });
  } else {
    record('dahili-numaralar id alındı', false, JSON.stringify(dnCreate.json));
  }
  await expect('zorunlu alan eksik 400', 'POST', '/api/dahili-numaralar', 400, { token: adminToken, body: { birim: 'X' } });

  // === Notlar =============================================================
  group('notlar');
  await expect('liste 200', 'GET', '/api/notlar', 200, { token: adminToken });
  const noteCreate = await expect('oluştur 201', 'POST', '/api/notlar', 201, {
    token: adminToken, body: { baslik: 'Test notu', icerik: '<p>Merhaba</p>', kategori: 'Genel' },
  });
  const noteId = noteCreate.json?.record?.id;
  if (noteId) {
    await expect('detay 200', 'GET', `/api/notlar/${noteId}`, 200, { token: adminToken });
    await expect('güncelle 200', 'PUT', `/api/notlar/${noteId}`, 200, { token: adminToken, body: { baslik: 'Güncel not' } });
    await expect('sil 200', 'DELETE', `/api/notlar/${noteId}`, 200, { token: adminToken });
  } else {
    record('notlar id alındı', false, JSON.stringify(noteCreate.json));
  }
  await expect('xss reddi 400', 'POST', '/api/notlar', 400, { token: adminToken, body: { baslik: 'x', icerik: '<script>alert(1)</script>' } });
  await expect('başlık/içerik eksik 400', 'POST', '/api/notlar', 400, { token: adminToken, body: { baslik: '' } });

  group('notlar/upload');
  const fd = new FormData();
  fd.append('files', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'test.pdf');
  const up = await req('POST', '/api/notlar/upload', { token: adminToken, body: fd, raw: true });
  record('pdf yükleme 200', up.status === 200, `gelen ${up.status}`);
  const uploadedName = up.json?.files?.[0]?.name;
  if (uploadedName) {
    await expect('medya indirilebilir 200', 'GET', `/api/media/${encodeURIComponent(uploadedName)}`, 200, { token: adminToken });
    await expect('medya silme 200', 'DELETE', '/api/notlar/upload', 200, { token: adminToken, body: { paths: [`/api/media/${uploadedName}`] } });
  }
  await expect('medya yok 404', 'GET', '/api/media/yok-boyle-dosya.png', 404, { token: adminToken });
  await expect('şifreli dosya yok 404', 'GET', '/api/files/yok-boyle-dosya.pdf', 404, { token: adminToken });

  // === Geri bildirim ======================================================
  group('feedback');
  await expect('liste 200', 'GET', '/api/feedback', 200, { token: adminToken });
  const fb = await expect('oluştur 201', 'POST', '/api/feedback', 201, { token: adminToken, body: { mesaj: 'Test geri bildirim' } });
  const fbId = fb.json?.feedback?.id;
  if (fbId) {
    await expect('sil 200', 'DELETE', `/api/feedback/${fbId}`, 200, { token: adminToken });
  } else {
    record('feedback id alındı', false, JSON.stringify(fb.json));
  }
  await expect('boş mesaj 400', 'POST', '/api/feedback', 400, { token: adminToken, body: { mesaj: '   ' } });

  // === Bildirimler ========================================================
  group('notifications');
  await expect('liste 200', 'GET', '/api/notifications', 200, { token: adminToken });
  await expect('okundu işaretle 200', 'PUT', '/api/notifications', 200, { token: adminToken, body: {} });
  await expect('temizle 200', 'DELETE', '/api/notifications', 200, { token: adminToken, body: {} });

  // === Profil =============================================================
  group('user/profile');
  await expect('profil 200', 'GET', '/api/user/profile', 200, { token: adminToken });
  await expect('ad soyad güncelle 200', 'PUT', '/api/user/profile', 200, { token: adminToken, body: { full_name: 'Test Yönetici' } });
  await expect('rol değişimi reddi 403', 'PUT', '/api/user/profile', 403, { token: adminToken, body: { role: 'personel' } });
  await expect('boş güncelleme 400', 'PUT', '/api/user/profile', 400, { token: adminToken, body: {} });

  // === Vardiya =============================================================
  group('vardiya');
  await expect('liste 200', 'GET', '/api/vardiya', 200, { token: adminToken });
  const vd = await expect('oluştur 201', 'POST', '/api/vardiya', 201, {
    token: adminToken,
    body: { istasyon: 'Test İstasyon', yil: 2030, ay: 3, week_shifts: {}, personel: [{ fullName: 'Ali Veli', offDay: 'Pazar' }] },
  });
  const vdId = vd.json?.record?.id;
  if (vdId) {
    await expect('detay 200', 'GET', `/api/vardiya/${vdId}`, 200, { token: adminToken });
    await expect('güncelle 200', 'PUT', `/api/vardiya/${vdId}`, 200, {
      token: adminToken, body: { istasyon: 'Test İstasyon', yil: 2030, ay: 3, personel: [] },
    });
    await expect('sil 200', 'DELETE', `/api/vardiya/${vdId}`, 200, { token: adminToken });
  } else {
    record('vardiya id alındı', false, JSON.stringify(vd.json));
  }
  await expect('geçersiz yıl 400', 'POST', '/api/vardiya', 400, { token: adminToken, body: { istasyon: 'X', yil: 1900, ay: 1 } });

  // === Kayıp eşya ==========================================================
  group('kayip-esya');
  await expect('liste 200', 'GET', '/api/kayip-esya', 200, { token: adminToken });
  const ke = await expect('oluştur 201', 'POST', '/api/kayip-esya', 201, { token: adminToken, body: { esya_tanimi: 'Test çanta' } });
  const keId = ke.json?.record?.id;
  if (keId) {
    await expect('detay 200', 'GET', `/api/kayip-esya/${keId}`, 200, { token: adminToken });
    await expect('güncelle 200', 'PUT', `/api/kayip-esya/${keId}`, 200, { token: adminToken, body: { durumu: 'Teslim Edildi' } });
    await expect('sil 200', 'DELETE', `/api/kayip-esya/${keId}`, 200, { token: adminToken });
  } else {
    record('kayip-esya id alındı', false, JSON.stringify(ke.json));
  }
  await expect('zorunlu alan eksik 400', 'POST', '/api/kayip-esya', 400, { token: adminToken, body: {} });
  await expect('durum filtresi 200', 'GET', '/api/kayip-esya?durum=Beklemede&limit=5', 200, { token: adminToken });

  // === İzin istekleri ======================================================
  group('izin-istegi');
  await expect('liste 200', 'GET', '/api/izin-istegi', 200, { token: adminToken });
  const iz = await expect('oluştur 201', 'POST', '/api/izin-istegi', 201, {
    token: adminToken,
    body: { ad_soyad: 'Test Kişi', birim: 'X', izin_turu: 'yillik', baslangic_tarihi: '2030-01-01', bitis_tarihi: '2030-01-05', izin_gun_sayisi: 5 },
  });
  record('izin isteği döndü', Boolean(iz.json?.istek), JSON.stringify(iz.json));
  await expect('geçersiz tür 400', 'POST', '/api/izin-istegi', 400, {
    token: adminToken, body: { ad_soyad: 'X', birim: 'X', izin_turu: 'gecersiz', baslangic_tarihi: '2030-01-01', bitis_tarihi: '2030-01-02', izin_gun_sayisi: 1 },
  });
  await expect('zorunlu alan eksik 400', 'POST', '/api/izin-istegi', 400, { token: adminToken, body: { ad_soyad: 'X' } });

  group('izin-istegi/personel');
  await expect('get 200', 'GET', '/api/izin-istegi/personel', 200, { token: adminToken });
  await expect('kaydet 200', 'POST', '/api/izin-istegi/personel', 200, { token: adminToken, body: { ad_soyad: 'Test', birim: 'B', gorevi: 'G' } });
  await expect('sil 200', 'DELETE', '/api/izin-istegi/personel', 200, { token: adminToken });

  // === Admin ===============================================================
  group('admin/users');
  await expect('kullanıcı listesi 200', 'GET', '/api/admin/users', 200, { token: adminToken });
  const uname = `testuser${Date.now().toString(36)}`;
  const newUser = await expect('kullanıcı oluştur 201', 'POST', '/api/admin/users', 201, {
    token: adminToken, body: { nickname: uname, name: 'Test Personel', password: 'gizli123', role: 'personel' },
  });
  const newUserId = newUser.json?.user?.id;
  record('yeni kullanıcı id', Boolean(newUserId), JSON.stringify(newUser.json));
  await expect('aynı nickname 409', 'POST', '/api/admin/users', 409, {
    token: adminToken, body: { nickname: uname, name: 'X', password: 'gizli123', role: 'personel' },
  });
  if (newUserId) {
    await expect('kullanıcı güncelle 200', 'PUT', `/api/admin/users/${newUserId}`, 200, { token: adminToken, body: { name: 'Güncel Ad' } });
    await expect('durum değiştir 200', 'POST', `/api/admin/users/${newUserId}/toggle`, 200, { token: adminToken });
    await expect('tekrar aç 200', 'POST', `/api/admin/users/${newUserId}/toggle`, 200, { token: adminToken });
    await expect('kendini silme reddi 400', 'DELETE', '/api/admin/users/admin-id', 400, { token: adminToken });
  }

  group('admin/diğer');
  await expect('rapor 200', 'GET', '/api/admin/report', 200, { token: adminToken });
  await expect('audit log 200', 'GET', '/api/admin/audit-logs', 200, { token: adminToken });
  const csv = await req('GET', '/api/admin/audit-logs?format=csv', { token: adminToken });
  record('audit csv 200', csv.status === 200 && csv.text.startsWith('id,'), `gelen ${csv.status}`);
  await expect('audit excel 200', 'GET', '/api/admin/audit-logs?format=excel', 200, { token: adminToken });
  await expect('audit export 200', 'GET', '/api/admin/audit-logs?format=export', 200, { token: adminToken });
  await expect('sistem kayıtları 200', 'GET', '/api/admin/system-records', 200, { token: adminToken });
  await expect('sistem kayıtları csv 200', 'GET', '/api/admin/system-records?format=csv', 200, { token: adminToken });
  await expect('sistem kayıtları excel 200', 'GET', '/api/admin/system-records?format=excel', 200, { token: adminToken });
  await expect('medya dosyaları 200', 'GET', '/api/admin/files', 200, { token: adminToken });

  // === Rol kısıtlamaları (personel) =======================================
  group('rol kısıtlamaları');
  if (newUserId) {
    const pToken = makeToken(newUserId);
    await expect('personel admin/users erişemez 403', 'GET', '/api/admin/users', 403, { token: pToken });
    await expect('personel admin/report erişemez 403', 'GET', '/api/admin/report', 403, { token: pToken });
    await expect('personel not oluşturmaz 403', 'POST', '/api/notlar', 403, { token: pToken, body: { baslik: 'x', icerik: 'y' } });
    await expect('personel vardiya oluşturmaz 403', 'POST', '/api/vardiya', 403, { token: pToken, body: { istasyon: 'X', yil: 2030, ay: 1 } });
    await expect('personel arıza listeler 200', 'GET', '/api/problem-records', 200, { token: pToken });
    // temizlik
    await req('DELETE', `/api/admin/users/${newUserId}`, { token: pToken });
    await expect('admin kullanıcıyı siler 200', 'DELETE', `/api/admin/users/${newUserId}`, 200, { token: adminToken });
  }

  // === Sayfa render ======================================================
  group('sayfa render');
  const pages = [
    '/notlar',
    '/problem-records',
    '/calisma-izni',
    '/vardiya',
    '/kayip-esya',
    '/dahili-numaralar',
    '/izin-istegi',
    '/yonetici',
  ];
  for (const page of pages) {
    const res = await req('GET', page, { token: adminToken });
    record(`${page} 200`, res.status === 200, `gelen ${res.status}`);
  }
  const notlarPage = await req('GET', '/notlar', { token: adminToken });
  record('notlar editör kabuğu HTML içeriyor', notlarPage.text.includes('note-editor-shell'));
  record(
    'notlar sayfası stil bağlantısı içeriyor',
    /<link[^>]+stylesheet[^>]+_astro\/notlar/.test(notlarPage.text),
    'notlar css bağlantısı bulunamadı'
  );

  // === Determinizm =========================================================
  group('determinizm');
  const a1 = await req('GET', '/api/dahili-numaralar?limit=10', { token: adminToken });
  const a2 = await req('GET', '/api/dahili-numaralar?limit=10', { token: adminToken });
  record('liste sırası kararlı', JSON.stringify(a1.json?.records) === JSON.stringify(a2.json?.records));
  const p1 = await req('GET', '/api/problem-records?limit=10', { token: adminToken });
  const p2 = await req('GET', '/api/problem-records?limit=10', { token: adminToken });
  record('arıza listesi kararlı', JSON.stringify(p1.json?.records) === JSON.stringify(p2.json?.records));
  const sr1 = await req('GET', '/api/admin/system-records?limit=10', { token: adminToken });
  const sr2 = await req('GET', '/api/admin/system-records?limit=10', { token: adminToken });
  record(
    'sistem kayıtları sırası kararlı',
    JSON.stringify(sr1.json?.records) === JSON.stringify(sr2.json?.records)
  );
  const u1 = await req('GET', '/api/admin/users', { token: adminToken });
  const u2 = await req('GET', '/api/admin/users', { token: adminToken });
  record('kullanıcı listesi kararlı', JSON.stringify(u1.json?.users) === JSON.stringify(u2.json?.users));
  const f1 = await req('GET', '/api/feedback', { token: adminToken });
  const f2 = await req('GET', '/api/feedback', { token: adminToken });
  record(
    'geri bildirim listesi kararlı',
    JSON.stringify(f1.json?.feedbacks) === JSON.stringify(f2.json?.feedbacks)
  );

  // === Dayanıklılık / eşzamanlılık ========================================
  group('dayanıklılık');
  const writes = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      req('POST', '/api/dahili-numaralar', {
        token: adminToken,
        body: { dahili_numara: String(9000 + i), birim: `Yük-${i}` },
      })
    )
  );
  const okWrites = writes.filter((w) => w.status === 201).length;
  record('20 eşzamanlı yazma 201', okWrites === 20, `başarılı ${okWrites}/20`);
  const errs = writes.filter((w) => w.status >= 500);
  record('eşzamanlı yazmada 5xx yok', errs.length === 0, errs.map((e) => e.status).join(','));

  const mixed = await Promise.all([
    ...Array.from({ length: 10 }, (_, i) =>
      req('POST', '/api/problem-records', {
        token: adminToken,
        body: { mms_numarasi: `MX-${i}`, ariza_tanimi: 'Yük testi', istasyon: 'Test İstasyon' },
      })
    ),
    ...Array.from({ length: 10 }, () => req('GET', '/api/problem-records?limit=20', { token: adminToken })),
    ...Array.from({ length: 10 }, () => req('GET', '/api/kayip-esya?limit=20', { token: adminToken })),
  ]);
  const mixErrs = mixed.filter((r) => r.status >= 500);
  record(
    'karışık eşzamanlı okuma/yazmada 5xx yok',
    mixErrs.length === 0,
    mixErrs.map((e) => e.status).join(',')
  );

  const weird = await req('GET', "/api/problem-records?search=%27%20OR%201%3D1--&istasyon=%3Bdrop", { token: adminToken });
  record('SQL injection denemesi güvenli', weird.status === 200, `gelen ${weird.status}`);
  await expect('pagination limit clamp 200', 'GET', '/api/problem-records?page=-5&limit=99999', 200, { token: adminToken });
  await expect('kayip-esya bozuk sayfalama 200', 'GET', '/api/kayip-esya?page=abc&limit=xyz', 200, { token: adminToken });
  await expect('kayip-esya aşırı limit clamp 200', 'GET', '/api/kayip-esya?page=-3&limit=999999', 200, { token: adminToken });
  await expect('bildirim bozuk limit 200', 'GET', '/api/notifications?limit=abc', 200, { token: adminToken });
  await expect('bildirim negatif limit 200', 'GET', '/api/notifications?limit=-5', 200, { token: adminToken });

  const badJson = await req('POST', '/api/notlar', {
    token: adminToken,
    raw: true,
    body: '{bozuk json',
    headers: { 'Content-Type': 'application/json' },
  });
  record('bozuk json 400 (notlar)', badJson.status === 400, `gelen ${badJson.status}`);
  const emptyBody = await req('POST', '/api/dahili-numaralar', {
    token: adminToken,
    raw: true,
    body: '',
    headers: { 'Content-Type': 'application/json' },
  });
  record('boş gövde 400 (dahili)', emptyBody.status === 400, `gelen ${emptyBody.status}`);
  const arrayBody = await req('POST', '/api/feedback', {
    token: adminToken,
    raw: true,
    body: '[1,2,3]',
    headers: { 'Content-Type': 'application/json' },
  });
  record('dizi gövde 400 (feedback)', arrayBody.status === 400, `gelen ${arrayBody.status}`);

}

main()
  .catch((error) => {
    console.error('Test çalıştırma hatası:', error);
    results.push({ group: currentGroup, name: 'runner', ok: false, detail: String(error) });
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n=========================`);
    console.log(`Toplam: ${results.length}  Geçen: ${results.length - failed.length}  Kalan: ${failed.length}`);
    if (failed.length) {
      console.log('\nBaşarısız testler:');
      for (const f of failed) console.log(`  - [${f.group}] ${f.name} ${f.detail ? '— ' + f.detail : ''}`);
    }
    cleanup();
    process.exit(failed.length ? 1 : 0);
  });
