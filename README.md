# RailCtrl - Tren İstasyon Operasyon Yönetim Sistemi

RailCtrl, Tren saha ve istasyon operasyonlarını tek noktadan yönetmek için geliştirilmiş Astro tabanlı bir web uygulamasıdır.

## Mimari

- `Astro` (server output)
- `@astrojs/node` standalone adapter
- `Astro DB / SQLite` (lokal veritabanı)
- Rastgele anahtarla imzalanan yerel oturum doğrulaması
- API uçları: `src/pages/api/*`

## Tam Lokal Çalışma Politikası

Bu proje artık **tamamen lokal kullanım** hedefiyle yapılandırılmıştır.

- Cloudflare / tunnel / wrangler bağımlılıkları kaldırılmıştır.
- Build komutu lokal çalışır: `npm run build`
- Varsayılan erişim: `http://localhost:3000`
- Oturum imzalama anahtarı ilk kullanımda `.astro/session.key` dosyasında otomatik oluşturulur; bu dosyayı yedekleyin ve paylaşmayın.

## Gereksinimler

- `Node.js >= 22.12.0` (Astro 6+ için zorunlu)
- `npm >= 10`

Kontrol:

```bash
node -v
npm -v
```

> **Not:** Ubuntu/Debian depolarındaki Node.js sürümü eski olabilir. Node.js 22+ için `nvm` (Node Version Manager) kullanımı önerilir:

```bash
# nvm kurulumu
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Node.js 22 kurulumu
nvm install 22
nvm use 22
nvm alias default 22
```

## Hızlı Başlangıç (Tek Komut)

```bash
# 1. Node.js 22+ kurulu değilse:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22 && nvm alias default 22

# 2. Projeyi klonlayın ve kurun:
git clone <repo-url>
cd railctrl
npm install

# 3. .env dosyasını oluşturun:
cp .env.example .env  # veya manuel oluşturun
# ENCRYPTION_KEY değerini güncelleyin

# 4. Geliştirme sunucusunu başlatın:
npm run dev
# → http://localhost:3000
```

## Kurulum (Detaylı)

`.env` örneği (`.env.example` olarak kaydedin):

```env
# Gerekli
ENCRYPTION_KEY=your-32-char-encryption-key-1234

# Opsiyonel: geliştirme sunucusu portu (varsayılan: 3000)
# PORT=3000
# NODE_ENV=development
```

`ENCRYPTION_KEY` **mutlaka** değiştirin. Production'da güçlü rastgele anahtar kullanın. Oturum imzalama anahtarı `.astro/session.key` içinde otomatik oluşturulur; deployment'lar arasında aynı kalması için dosyayı yedekleyin. Farklı bir konum için `RAILCTRL_SESSION_KEY_FILE` ayarlanabilir.

```bash
# Rastgele anahtar üretmek için:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Lokal Çalıştırma

### Geliştirme (Hot reload):

```bash
npm run dev
# → http://localhost:3000
```

### Production Build:

```bash
npm run build
# Çıktı: ./dist/
```

### Build'i Önizleme:

```bash
npm run preview
# → http://localhost:4321
```

### Veritabanı Sıfırlama (geliştirme):

```bash
rm -rf .astro/content.db
npm run dev
```

## Veritabanı ve Yedekleme

- Lokal DB: `.astro/content.db`
- Yedek klasörü: `backups/`

Öneri:

- `.env` ve yedekleri repoya koymayın
- DB yedeklerini düzenli alın
- Kurumsal kurulumda proje dışı güvenli dizinde saklayın

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `Node.js v20 is not supported` | `nvm install 22 && nvm use 22` |
| `ENOENT: no such file .env` | `.env.example` kopyalayıp `.env` oluşturun |
| Port 3000 kullanımda | `PORT=3001 npm run dev` (veya `.env` içinde `PORT=3001`) |
| DB kilitli / hata veriyor | `rm -rf .astro/content.db && npm run dev` |
| Modül bulunamıyor | `rm -rf node_modules package-lock.json && npm install` |

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
