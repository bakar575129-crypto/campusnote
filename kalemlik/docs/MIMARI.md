# Kalemlik — Mimari

## Genel akış

```
Tarayıcı (React)                      Sunucu (Express)                MySQL / MariaDB
┌──────────────────────┐   HTTPS    ┌──────────────────────┐        ┌────────────────┐
│ Ekranlar / Editör     │  JSON API  │ /api/auth  oturumlar │  SQL   │ users, sessions│
│   ↓ put()             │ ─────────▶ │ /api/sync  kayıtlar  │ ─────▶ │ notebooks,     │
│ Yerel depo (bellek)   │            │ /api/files dosyalar  │        │ notebook_pages │
│   ↓ IndexedDB         │ ◀───────── │ /api/ocr   tanıma    │        │ lessons, tasks │
│ Eşitleme motoru       │            │ /api/storage plan    │        │ files, plans…  │
└──────────────────────┘            └──────────────────────┘        └────────────────┘
                                          │ storage/<kullanıcı>/<dosya>
```

## Veri modeli

| Tablo | İçerik |
|---|---|
| `users`, `sessions`, `password_resets` | Hesap, sunucu tarafı oturum (token'ın SHA-256 özeti), tek kullanımlık sıfırlama |
| `notebooks` | Başlık, ders, dönem, renk, varsayılan şablon, kapak (JSON), favori, `trashed_at` |
| `notebook_pages` | Defter başına sıralı sayfalar (`position` DOUBLE — araya ekleme kolay), içerik JSON |
| `user_stickers`, `fonts`, `files` | Sticker ve yazı tipi arşivi, yüklenen dosyaların meta verisi |
| `lessons`, `tasks`, `focus_sessions` | Ders programı, ödev/sınav/yapılacak, Pomodoro oturumları |
| `user_settings` | Kalem, düzeltme, tema, odak ayarları (JSON) |
| `plans`, `subscriptions`, `storage_usage` (görünüm) | Plan tanımları, kullanıcı abonelikleri, anlık kullanım |
| `deletions` | Silinen kayıtların izi (diğer cihazlar eşitlemede öğrenir) |
| `rate_limits`, `ocr_usage` | Kötüye kullanım koruması ve günlük tanıma sayacı |

**Sayfa içeriği** (`notebook_pages.content`): `{template, width, height, renkler, background?, strokes[], texts[], stickers[]}`.
Bir çizgi (stroke) `{id, t: pen|shape|text, pen, c, w, o, pts: [x, y, basınç, …]}` biçimindedir; noktalar düz dizi olarak saklanır (JSON'da ~3 kat daha küçük). Çizgileri ayrı satırlarda tutmak yerine sayfa başına tek satır seçildi: bir sayfa atomik olarak kaydedilir, geri al/eşitleme sayfa düzeyinde tutarlıdır ve her kalem darbesi için bir veritabanı satırı yazılmaz. Büyük defterlerde yalnızca değişen sayfa gönderilir.

## Eşitleme ve çevrimdışı

1. Her değişiklik `put()` ile bellekteki depoya yazılır, 250 ms içinde IndexedDB'ye kaydedilir (sekme kapanırken hemen) ve "kirli" işaretlenir.
2. Eşitleme motoru 1,2 sn sonra (ve bağlantı gelince, sekme öne gelince, dakikada bir) önce bekleyen dosyaları, sonra kirli kayıtları sırayla gönderir: `PUT /api/sync/:tür/:id {rev, data}`.
3. Sunucu **iyimser kilit** uygular: gönderilen `rev` sunucudakiyle aynıysa yazar ve `rev+1` döner; değilse `409` ile güncel kaydı döndürür.
4. Çakışma çözümü (hiçbir düzenleme sessizce kaybolmaz):
   - İçerik aynıysa (ör. yanıtı kaybolmuş başarılı istek) sunucu revizyonu benimsenir.
   - **Sayfa:** sunucudaki sürüm yerinde kalır, bu cihazdaki sürüm hemen arkasına ayrı bir sayfa olarak eklenir; kullanıcı bilgilendirilir.
   - **Ödev/ders:** iki sürüm de listede kalır ("(bu cihaz)").
   - **Defter bilgisi, ayarlar, arşiv:** bu cihazdaki son düzenleme uygulanır.
   - Başka cihazda değiştirilmiş kaydı silmek iptal edilir, kayıt geri gelir.
5. `GET /api/sync?since=` değişiklikleri (sayfa içerikleri hariç) ve silme izlerini getirir; sayfa içerikleri defter açılınca `GET /api/notebooks/:id/pages` ile gelir ve cihazda saklanır.
6. Dosyaların kimliğini istemci üretir; dosya cihazda saklanır, sayfalar hemen ona başvurabilir, bağlantı gelince yüklenir. Sunucu, kayıttaki dosyaların o kullanıcıya ait olduğunu doğrular.

## Editör

- Katmanlar: şablon + PDF/fotoğraf arka planı (tuval) → mürekkep (tuval) → stickerlar ve metin kutuları (DOM) → canlı çizim (tuval) → seçim.
- Görünüm: kâğıt tek bir `translate + scale` dönüşümüyle yakınlaşır; araç çubukları dönüşümün dışındadır. Yakınlaşma durunca tuval çözünürlüğü `zoom × devicePixelRatio`'ya yeniden ayarlanır (iOS tuval sınırı gözetilir).
- Giriş: Pointer Events; kalem/dokunma/fare ayrımı, birleşik olaylar, basınç; iki parmak = kaydır/yakınlaştır; kalem temasından sonraki 600 ms'de dokunmalar avuç içi sayılır.
- Geri al/yinele: içerik değişmez nesne olduğundan önceki/sonraki hâli saklamak ucuzdur; sayfa ekleme/silme/taşıma da geri alınabilir.
- Otomatik düzeltme: `features/editor/autowrite.ts` — satırlara/kelimelere ayırma, gövde yüksekliği ve taban çizgisi tahmini (yüzdelik), satıra/kareye oturtma, itme ve alt satıra geçirme.

## Güvenlik

- Parolalar scrypt ile özetlenir; hesap yokken de aynı süre çalışır.
- Oturum: 256 bit rastgele token, veritabanında yalnızca özeti; `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` önek; kayan süre; şifre değişince diğer oturumlar kapanır.
- CSRF: durum değiştiren isteklerde `X-Kalemlik: 1` başlığı ve izin verilen `Origin` zorunlu.
- SQL: yalnızca parametreli sorgular; tablo/sütun adları sabit eşlemeden gelir.
- XSS: React kaçışlaması, `dangerouslySetInnerHTML` yok, sıkı CSP (`script-src 'self'`), kullanıcı dosyaları `sandbox` CSP ile ve yalnızca sahibine sunulur.
- Dosyalar: içerik imzasına göre tür doğrulama (PNG/JPEG/WEBP/PDF/TTF/OTF/WOFF/WOFF2), tür başına boyut sınırı, kullanıcı kotası, `dist/` dışında saklama.
- Hız sınırları: IP ve e-posta başına giriş, yükleme, OCR, şifre işlemleri (birden çok Node sürecinde tutarlı, veritabanı tabanlı) + süreç içi genel sınır.
- Gizli anahtarlar (veritabanı, Anthropic, SMTP) yalnızca sunucudaki `.env` dosyasındadır.

## 1.1.2 eklemeleri

- **Ortak onarıcı:** `shared/repair.mjs` (türleri `shared/repair.d.mts`). Sunucu `server/sync.mjs` içinde her kaydı `repairRecord` → Zod şeması sırasıyla işler; istemci `src/lib/sanitize.ts` üzerinden aynı fonksiyonu göndermeden önce çalıştırır. Koordinat sınırları (`LIMITS`) şemayla paylaşılır. İçeriği olmayan sayfa boş sayfaya çevrilmez (sunucudaki içeriği silmesin diye reddedilir).
- **Eksik revizyon** 0 sayılır → kayıt sunucuda varsa 409 çakışma, istemci güncel kaydı alır.
- **İstemci son çaresi:** `400 VALIDATION` yanıtındaki `field` bir sayfa öğesini gösteriyorsa (`content.strokes.N` …) o öğe çıkarılıp sayfa yeniden gönderilir.
- **Sürüm uyumu:** uyarıda sunucu/uygulama sürümü farklıysa yeniden başlatma önerilir; `main.tsx` görünürlük değişiminde `/api/config` sürümünü kontrol edip gerekirse sayfayı yeniler.

## 1.1.1 eklemeleri

- **Gönderim öncesi temizlik:** `src/lib/sanitize.ts`, `server/schemas.mjs` ile aynı sınırları uygular (koordinat −20000…30000, NaN noktaların atılması, 30000 noktadan uzun çizgilerin bölünmesi, benzersiz çizgi kimlikleri, `hh:mm` saatleri). `store.ts` her gönderimde çalıştırır; veri değiştiyse yerel kaydı da günceller.
- **Doğrulama hatası:** sunucu `400 VALIDATION` yanıtına `field` (ör. `content.strokes.0.pts`) ekler ve günlüğe yazar.
- **Bloknotlar:** `builtin.ts` içinde `blok-` önekli hazır stickerlar (kendi en/boy oranlarıyla). Sayfa stickerları artık iki katmanda çizilir: görseller mürekkep tuvalinin **altında** (`PageCanvas` `underlay`), tutamaçlar ve çerçeve üstünde (`PlacedLayer mode="controls"`). PDF/küçük resim çiziminde de stickerlar mürekkepten önce çizilir.

## 1.1.0 eklemeleri

- **Geçişler:** `server/migrate.mjs` şemayı ve sürümlü geçişleri uygular; sunucu her açılışta çalıştırır (`schema_migrations`). Sürüm 2: `users.extra_storage_mb`, `users.extra_notebooks`, `users.disabled`, `users.last_login_at`, `app_settings`.
- **Plan hesabı:** geçerli plan + yöneticinin verdiği ek depolama ve ek defter hakkı (`server/plans.mjs`).
- **Yönetim API'si:** `/api/admin/*` (yalnızca `role = admin`) — `server/admin.mjs`.
- **El yazısı tanıma zinciri (ön yüz):** sunucu (anahtar varsa) → cihazda Tesseract (WebAssembly, Türkçe `tur` verisi `/ocr/` altında, CSP'de yalnızca `'wasm-unsafe-eval'`) → güven eşiği altında kalırsa el yazısı korunur ve hizalanır.
- **Sunucu tanıma:** `server/ocr.mjs` anahtarın biçiminden sağlayıcıyı seçer (Anthropic / OpenAI), yoksa model için sıradakine geçer, sağlayıcı hatasını Türkçe açıklamaya çevirir ve son hatayı yönetim paneline bildirir. Anahtar `app_settings` tablosunda (panelden) veya `.env`'de tutulur.
- **Hazır stickerlar:** `src/features/stickers/builtin.ts` (uygulamaya gömülü SVG). Sayfada `{builtin: "kedi"}` olarak saklanır (dosya yüklemez, depolama kullanmaz). Sevimli kapak desenleri aynı çizimlerden üretilir.
