# Kalemlik — Kurulum Kılavuzu

Bu kılavuz Kalemlik'i **cPanel + Node.js** barındırmada (Passenger) yayına almayı ve yerelde çalıştırmayı anlatır. Docker gerekmez.

## 1. Gereksinimler

- Node.js **20.19 veya üzeri** (22 LTS önerilir) — cPanel'de "Setup Node.js App"
- MySQL **8+** veya MariaDB **10.6+**
- HTTPS'li bir alan adı veya alt alan adı (ör. `not.ornekuniversite.com`). Kalemlik alt klasörde (`/kalemlik`) değil, alan adının kökünde çalışır.
- Yaklaşık 60 MB disk (uygulama) + kullanıcı dosyaları için alan

## 2. Paketi yükleme

1. `kalemlik-1.0.0.zip` dosyasını cPanel **Dosya Yöneticisi** ile ev klasörüne (ör. `/home/kullanici/kalemlik`) yükleyip açın.
   **public_html içine açmayın** — `.env` ve kullanıcı dosyaları herkese açık klasörde olmamalı.
2. Paket hazır derleme (`dist/`) içerir; sunucuda derleme yapmanız gerekmez.

## 3. Veritabanı

1. cPanel → **MySQL Veritabanları**: bir veritabanı (ör. `kullanici_kalemlik`) ve kullanıcı oluşturun; kullanıcıya veritabanında **TÜM YETKİLER**'i verin.
2. Şemayı uygulayın — iki yoldan biri:
   - Terminal/SSH: `npm run db:migrate` (5. adımdan sonra)
   - veya phpMyAdmin → veritabanını seçin → **İçe Aktar** → `sql/schema.sql`

Şema tekrar uygulanabilir; mevcut veriler korunur. Karakter seti `utf8mb4` (Türkçe ve emoji desteği).

## 4. Node.js uygulaması (cPanel)

cPanel → **Setup Node.js App** → **Create Application**:

| Alan | Değer |
|---|---|
| Node.js version | 22.x (en az 20.19) |
| Application mode | Production |
| Application root | `kalemlik` (paketi açtığınız klasör) |
| Application URL | alan adınız (kök) |
| Application startup file | `app.js` |

Oluşturduktan sonra **Run NPM Install** düğmesine basın (veya terminalde uygulamanın sanal ortamında `npm ci --omit=dev`). Yalnızca sunucu bağımlılıkları kurulur; ön yüz zaten `dist/` içinde derlenmiştir.

## 5. `.env` ayarları

`.env.example` dosyasını `.env` adıyla kopyalayın ve düzenleyin:

```ini
NODE_ENV=production
APP_URL=https://not.ornekuniversite.com
DB_NAME=kullanici_kalemlik
DB_USER=kullanici_kalemlik
DB_PASSWORD=güçlü-veritabanı-şifresi
REGISTRATION_OPEN=true
```

- `APP_URL` tam site adresi olmalı ve canlıda `https://` ile başlamalıdır (güvenli çerezler ve CSRF denetimi bu adrese göre çalışır).
- `STORAGE_DIR` (varsayılan `./storage`) kullanıcı dosyalarının yeridir; yedeklemeye dahil edin.
- İsteğe bağlı: `ANTHROPIC_API_KEY` (el yazısını metne çevirme), `SMTP_*` (şifre sıfırlama e-postası).

Ardından terminalde (cPanel'in gösterdiği `source .../activate` komutuyla sanal ortama girip):

```bash
npm run db:migrate   # şemayı uygular
npm run check        # ayarları, derlemeyi ve veritabanını kontrol eder
```

cPanel'de uygulamayı **Restart** edin ve sitenizi açın.

## 6. İlk hesap

Siteyi açıp **Kayıt ol** ile ilk hesabı oluşturun — ilk hesap otomatik olarak **yönetici** olur. Yalnızca davet ettiğiniz kişilerin kullanmasını istiyorsanız hesaplar açıldıktan sonra `.env` içinde `REGISTRATION_OPEN=false` yapıp uygulamayı yeniden başlatın.

## 7. HTTPS ve güvenlik

- cPanel → **SSL/TLS Status** ile ücretsiz sertifikayı (AutoSSL) etkinleştirin; HTTP'yi HTTPS'e yönlendirin.
- Uygulama canlıda: `Secure` + `HttpOnly` + `SameSite=Lax` oturum çerezi (`__Host-` önekli), HSTS, sıkı CSP, Origin ve özel başlık tabanlı CSRF denetimi, veritabanı tabanlı hız sınırları, dosya içeriği imza doğrulaması, kullanıcı bazlı depolama kotası uygular.
- `.env` dosyasının izinlerini `600` yapın. `storage/` klasörü `700` izniyle oluşturulur.

## 8. İsteğe bağlı özellikler

**El yazısını metne çevirme:** Anahtar gerekmez — tanıma varsayılan olarak **cihazda** (tarayıcıda, internetsiz) çalışır. Daha dağınık el yazısında isabet için isteğe bağlı olarak bir yapay zekâ anahtarı ekleyebilirsiniz:
- En kolayı: **Yönetim → Sistem → El yazısı tanıma** alanına anahtarı yapıştırıp **Kaydet**, sonra **Bağlantıyı test et**. Yeniden başlatma gerekmez; hata varsa gerçek nedeni (geçersiz anahtar, bakiye yok, model yok) orada yazar.
- Veya `.env`: `ANTHROPIC_API_KEY=sk-ant-...` ya da `OPENAI_API_KEY=sk-...` (sonra uygulamayı **Restart** edin).
Anahtar yalnızca sunucuda kalır. Kullanıcı başına günlük sunucu tanıma sınırı plandaki "günlük tanıma hakkı"dır; sınır dolunca tanıma cihazda sürer.

**Şifre sıfırlama e-postası:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` ayarlayın (cPanel e-posta hesabınızın SMTP bilgileri). SMTP yoksa sıfırlama bağlantısı sunucu günlüğüne (`stderr.log`) yazılır; ayrıca `npm run password:reset -- e-posta` ile şifre doğrudan sıfırlanabilir.

**Yönetim paneli:** İlk kayıt olan hesap yöneticidir; menüde **Yönetim** görünür (`/yonetim`). Buradan kullanıcılara abonelik paketi (süreli), ek GB depolama ve ek defter hakkı verebilir, şifre sıfırlama bağlantısı gönderebilir (SMTP yoksa bağlantı size gösterilir, kopyalayıp iletirsiniz), hesap kapatabilir, başka yöneticiler atayabilir ve plan limitlerini düzenleyebilirsiniz.

**Planlar:** Ücretsiz / Plus / Pro planları yönetim panelinden (Planlar sekmesi) veya `plans` tablosundan düzenlenir (depolama, defter sınırı — 0 = sınırsız, günlük tanıma). Komut satırından plan tanımlamak için:

```bash
npm run plan:grant -- ogrenci@ornek.com plus 30
```

Çevrimiçi ödeme entegrasyonu için bkz. `docs/ODEME.md`.

## 9. PWA (uygulama olarak yükleme)

Site HTTPS üzerinden açıldığında tarayıcı uygulamayı yüklemeyi önerir:
- **iPad / iPhone (Safari):** Paylaş → Ana Ekrana Ekle
- **Android (Chrome):** menü → Uygulamayı yükle
- **Windows / Mac (Chrome, Edge):** adres çubuğundaki yükle simgesi

Uygulama bir kez internetle açıldıktan sonra çevrimdışı da açılır; açılmış defterler cihazda saklanır.

## 10. Güncelleme

1. Uygulamayı cPanel'den **Stop** edin.
2. `.env` ve `storage/` klasörünü **koruyarak** yeni paketteki dosyaları üzerine kopyalayın (`dist/`, `server/`, `sql/`, `scripts/`, `shared/`, `package*.json`, `app.js`).
3. `npm ci --omit=dev` → **Restart**. Veritabanı güncellemeleri sunucu açılırken otomatik uygulanır (isterseniz `npm run db:migrate` ile elle de çalıştırabilirsiniz).

## 11. Yedekleme

- Veritabanı: cPanel → **Yedekleme** veya `mysqldump`.
- Dosyalar: `storage/` klasörü (ve `.env`).

## 12. Yerel geliştirme

```bash
npm install
cp .env.example .env    # NODE_ENV=development, APP_URL=http://localhost:3000, DB_* ayarları
npm run db:migrate
npm run dev             # http://localhost:5173
```

Testler: `npm test` (birim), `TEST_DB_NAME=... TEST_DB_USER=... TEST_DB_PASSWORD=... npm run test:api` (boş bir test veritabanı gerekir; tablolar silinip yeniden kurulur), `npm run build && npm start` sonrası `npm run test:e2e` (Playwright ve Chromium gerekir).

## 13. Sorun giderme

| Belirti | Çözüm |
|---|---|
| "Veritabanına bağlanılamadı" | `DB_*` ayarlarını ve kullanıcı yetkilerini kontrol edin; `npm run check` |
| "Veritabanı tabloları eksik" | `npm run db:migrate` veya `sql/schema.sql`'i içe aktarın |
| "Tanıma hizmeti yanıt vermedi" / tanıma çalışmıyor | Yönetim → Sistem → **Bağlantıyı test et**: gerçek neden yazılır (anahtar geçersiz, bakiye yok, model yok, sunucu dışarı bağlanamıyor). Anahtarsız da cihazda tanıma çalışır |
| "İstek doğrulanamadı" (403) | `APP_URL` tarayıcıdaki adresle birebir aynı olmalı (http/https, www dahil) |
| Uygulama açılmıyor | cPanel'deki `stderr.log`; `.env`'de eksik ayar varsa uygulama açıklayıcı hata ile durur |
| Yüklemede "Depolama alanın doldu" | Plan & Depolama → kullanılmayan dosyaları temizle veya planı yükselt |
| Değişiklikler başka cihazda görünmüyor | Eşitleme göstergesine dokunun; çevrimdışıysa bağlantı gelince otomatik eşitlenir |
