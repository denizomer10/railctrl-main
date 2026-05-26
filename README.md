# RailCtrl - TCDD İstasyon Operasyon Yönetim Sistemi

RailCtrl, TCDD saha ve istasyon operasyonlarını tek noktadan yönetmek için geliştirilmiş Astro tabanlı bir web uygulamasıdır.

## Mimari

- `Astro` (server output)
- `@astrojs/node` standalone adapter
- `Astro DB / SQLite` (lokal veritabanı)
- JWT tabanlı kimlik doğrulama
- API uçları: `src/pages/api/*`

## Tam Lokal Çalışma Politikası

Bu proje artık **tamamen lokal kullanım** hedefiyle yapılandırılmıştır.

- Cloudflare / tunnel / wrangler bağımlılıkları kaldırılmıştır.
- Build komutu lokal çalışır: `npm run build`
- Varsayılan erişim: `http://localhost:3000`

## Gereksinimler

- `Node.js >= 20`
- `npm >= 10`

Kontrol:

```bash
node -v
npm -v
```

## Kurulum

```bash
npm install
```

`.env` örneği:

```env
JWT_SECRET=change-this-jwt-secret
ENCRYPTION_KEY=change-this-32-char-key
```

## Lokal Çalıştırma

Geliştirme:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Preview:

```bash
npm run preview
```

## Veritabanı ve Yedekleme

- Lokal DB: `.astro/content.db`
- Yedek klasörü: `backups/`

Öneri:

- `.env` ve yedekleri repoya koymayın
- DB yedeklerini düzenli alın
- Kurumsal kurulumda proje dışı güvenli dizinde saklayın

## Yetki Modeli

- `user`: günlük operasyon işlemleri
- `sef`: ekip/operasyon yönetimi
- `gar_mudur`: üst operasyon yönetimi
- `admin`: tam yetki

## Proje Yapısı

- `src/pages/*.astro`: ekranlar
- `src/pages/api/*`: backend uçları
- `src/lib/*`: auth, schema, yardımcılar
- `public/files/*`: statik form içerikleri
- `.astro/content.db`: lokal veritabanı
