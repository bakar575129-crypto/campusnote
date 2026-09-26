# Kalemlik

Üniversite öğrencileri için **dijital defter, planlayıcı ve odaklanma** platformu. Tablet ve kalemle not almak için tasarlandı; telefonda ve masaüstünde de çalışır, uygulama olarak yüklenebilir (PWA) ve internet yokken de kullanılabilir.

> Kalemlik bağımsız, sıfırdan yazılmış bir projedir. CampusNote 1.5.0 yalnızca **özellik referansı** olarak incelendi (bkz. [docs/REFERANS-ANALIZI.md](docs/REFERANS-ANALIZI.md)); ondan kod, stil, bileşen ya da şema alınmadı ve Kalemlik'in çalışmak için CampusNote'a ihtiyacı yoktur.

**Kurulum:** [KURULUM.md](KURULUM.md) · **Mimari:** [docs/MIMARI.md](docs/MIMARI.md) · **Ödeme altyapısı:** [docs/ODEME.md](docs/ODEME.md)

## 1.1.1'de yenilikler

- **"Kaydedilemedi: Gönderilen bilgileri kontrol et" hatası giderildi.** Neden: uzaklaştırılmış görünümde kâğıdın dışına taşan çizgiler ve seçimi sayfanın çok dışına taşımak, sunucunun koordinat sınırını aşıyordu; sayfa bu yüzden hiç kaydedilemiyordu. Sınırlar genişletildi ve uygulama artık her kaydı göndermeden önce sunucu kurallarına uydurur (geçersiz noktaları onarır, çok uzun çizgileri böler, saatleri düzeltir). Daha önce takılıp kalmış kayıtlar da kendiliğinden onarılıp gönderilir. Bir alan yine de reddedilirse sunucu hangi alan olduğunu bildirir ve uyarı bir kez gösterilir.
- **16 bloknot çeşidi** (Stickerlar → **Bloknotlar**): sarı/pembe/mavi/yeşil yapışkan notlar, spiralli (çizgili ve kareli) bloknot, yırtık defter kâğıdı, fiş kartı, yapılacaklar listesi, kalp, bulut, panolu not, kraft not, haftalık mini plan, sınav notu kartı, noktalı (ataşlı) not. Sayfanın her yerine konur, taşınır, boyutlandırılır, döndürülür ve **üstüne kalemle yazılır** (mürekkep bloknotun üstünde görünür; PDF'te de). Otomatik yazı düzeltme bloknot üstündeki yazıya dokunmaz.

## 1.1.0'da yenilikler

- **API'siz el yazısı tanıma:** yazı tipi kipinde el yazısı artık **cihazda** (internetsiz, ücretsiz; Türkçe dil verisiyle) tanınır. API anahtarı varsa önce sunucu denenir, olmazsa cihaz; ikisi de emin değilse el yazısı korunur.
- **Sunucu tanıma hatası giderildi:** anahtarın sağlayıcısı (Anthropic `sk-ant-…` / OpenAI `sk-…`) otomatik anlaşılır, hesapta olmayan Claude modelinde başka modele geçilir, gerçek hata nedeni (geçersiz anahtar, bakiye yok, model yok…) yönetim panelinde gösterilir. Anahtar `.env` yerine **yönetim panelinden** de girilebilir (yeniden başlatma gerekmez).
- **Galeriden görsel:** sayfaya fotoğraf/görsel eklenir; taşınır, köşeden boyutlandırılır, döndürülür, çoğaltılır, silinir.
- **Yönetim paneli** (`/yonetim`, yalnızca yönetici): kullanıcı arama, abonelik paketi verme (süreli), ek GB depolama ve ek defter hakkı, şifre sıfırlama bağlantısı (e-posta + kopyalanabilir bağlantı), hesabı kapatma/açma, yönetici yapma, plan limitlerini düzenleme, tanıma anahtarı ve bağlantı testi, e-posta testi, istatistikler.
- **44 hazır sevimli sticker:** hayvanlar, böcekler, yiyecekler, doğa, okul, etiketler ("Harika!", "Sınav günü"…), washi bantlar.
- **14 sevimli kapak deseni:** patiler, kediler, tavşanlar, ayıcıklar, papatyalar, laleler, arılar, uğur böcekleri, kelebekler, kalpler, yıldızlar, çilekler, bulutlar, mantarlar.
- **Kapaktan sayfalara kaydırarak geçiş:** defter açılınca kapağın hemen altında ilk sayfa görünür; aşağı kaydırınca deftere geçilir ("aç" düğmesi yok). İlk sayfanın başında yukarı kaydırınca kapağa dönülür.
- Veritabanı geçişleri sunucu açılışında **otomatik** uygulanır.

## Özellikler

**Defterler** — ad, ders, dönem, renk, kapak; favoriler, çöp kutusu (geri getir / kalıcı sil / çöpü boşalt), kopyala, ara, ders ve döneme göre süz, kart/liste görünümü. Defter açılınca ilk ekran kapaktır.

**Kapak** — renk, 9 desen (deftere uygun, çizgili, kareli, noktalı, çapraz, dama, dalga, üçgen), desen rengi/yoğunluğu/boyutu, yazı tipi, ders/dönem gösterimi, kapak notu ve 20'ye kadar sticker. Kart, düzenleyici, editör ve PDF'te aynı görünür.

**24 akademik şablon** — boş; standart/dar/geniş/kenar boşluklu çizgili; standart/ince/geniş kareli; noktalı; Cornell (çizgili/kareli/noktalı); laboratuvar raporu; kelime tablosu; haftalık plan; zihin haritası; mühendislik kareleri; koordinat düzlemi; polar; yarı-log; çift-log; izometrik; altıgen/kimya; porte. Sayfa bazında zemin, çizgi, şablon yazısı rengi ve aralık; "tüm sayfalara uygula".

**Kalemler ve çizim** — tükenmez, dolma kalem (yöne duyarlı uç), kurşun kalem (dokulu), ince uç, fırça (baskıyla genişler), keçeli, fosforlu (yazının altında kalır). Her kalemin kendi rengi, kalınlığı ve opaklığı hesaba kaydedilir; başka araca geçip dönmek ayarları bozmaz. Basınç (kalem), hızdan tahmin edilen baskı (parmak/fare), yüksek DPI, birleşik (coalesced) olaylarla düşük gecikme.

**Araçlar** — kalem, fosforlu, kısmi/çizgi silgi, alan seç, kement (taşı, boyutlandır, kopyala, çoğalt, renk değiştir, sil, metne çevir), metin kutusu (yazı tipi, boyut, kalın, renk, madde/numaralı liste — Enter ile devam), 10 şekil (çizgi, ok, kare, dikdörtgen, daire, elips, üçgen, eşkenar dörtgen, altıgen, yıldız), sticker, sayfayı kaydır, geri al/yinele, sayfa ekle/sil/çoğalt/taşı, şablon değiştir, kapak düzenle, PDF içe/dışa aktar, fotoğrafı sayfa yap.

**Yakınlaştırma** — iki parmakla sıkıştırma, Ctrl + tekerlek / trackpad, + / −, sayfaya ve genişliğe sığdır, yüzde göstergesi. Yalnızca kâğıt büyür; araç çubukları sabit kalır. **Kilit** açıkken yakınlaştırma kapalı, iki parmakla kaydırma açık.

**Yalnızca kalem modu** — stylus yazar; parmak ve avuç içi yazmaz, kalem değerken gelen dokunuşlar yok sayılır; iki parmak hareketleri çalışır; iki satır kaydırma düğmeleri. Kalemin yan tuşu ve silgi ucu için eylem atanabilir.

**Otomatik el yazısı düzeltme** — kapalı / kelime / cümle. Kalem kısa süre durunca (0,2–1,5 sn, ayarlanabilir) çalışır; yazarken hiçbir şey kaymaz. Satırlara ve kelimelere ayırır; çizgili sayfada satır çizgisine, kareli sayfada karelerin içine oturtur; okunur boyuttaki yazıyı küçültmez; kelimeleri üst üste bindirmez, sağdaki yazıyı iter, taşan kelimeyi alt satıra alır; boyut, kalınlık, harf aralığı ayarlanır; tek adımda geri alınır.
- **Kendi el yazım**: yazı metne çevrilmeden hizalanır (cihazda, internetsiz).
- **Yazı tipiyle**: yazı tanınır ve seçilen yazı tipinde metne dönüşür — cihazda (internetsiz) ya da API anahtarı tanımlıysa sunucuda. Tanıma emin değilse el yazısı silinmez, düzeltilerek korunur.

**Yazı tipleri** — 7 hazır Türkçe karakterli yazı tipi (Caveat, Kalam, Patrick Hand, Playpen Sans, Nunito, Lora, JetBrains Mono); TTF/OTF/WOFF/WOFF2 yükleme (≤5 MB), eksik Türkçe harf uyarısı, hesapla eşitlenir.

**Sticker** — 44 hazır sevimli sticker; fotoğraftan oluştur: kırp (orijinal/kare/daire/yuvarlak köşe), yakınlaştır/konumla, arka planı kaldır (dokunulan renkten, hassasiyet ayarlı), beyaz kenar; kişisel arşiv. Sayfada ve kapakta taşı, büyüt/küçült, döndür, çoğalt, öne getir, sil.

**PDF** — PDF'i (150 sayfaya kadar) içe aktar; her sayfa yazılabilir defter sayfası olur (yatay sayfalar korunur). Üzerine yaz, çiz, sticker ekle; kapakla birlikte PDF olarak indir.

**Planlayıcı** — haftalık ders programı (7 gün, saat ızgarası, çakışma uyarısı, derslik, öğretim görevlisi, renk, not, "şimdi" çizgisi; telefonda gün görünümü), ödev/sınav/yapılacak (ders, açıklama, tarih, saat, renk, tamamlandı; gecikmiş/bugün/bu hafta grupları), ay takvimi (kayıtlar + ders günleri, gün ayrıntısı).

**Odaklan** — Pomodoro (varsayılan 25/5, uzun mola ve sıklık ayarlı), başlat/duraklat/devam/sıfırla/atla, çalışılan konu ve ders, sesli ve sistem bildirimi, sekme kapansa da doğru süre, 7 günlük grafik ve geçmiş.

**Hesap ve güvenlik** — kayıt, giriş, çıkış, şifre değiştirme (diğer oturumlar kapanır), e-postayla şifre sıfırlama, profil, açık oturumlar, diğer cihazlardan çıkış, hesap silme. Veriler kullanıcı bazında tamamen ayrıdır.

**Eşitleme ve çevrimdışı** — her değişiklik önce cihazda (IndexedDB) saklanır, sonra sunucuya gönderilir (otomatik kaydetme; "Kaydet" düğmesi yok). İnternet yokken yazmaya devam edilir; bağlantı gelince eşitlenir. Çakışmada hiçbir sürüm sessizce kaybolmaz (bkz. docs/MIMARI.md).

**Plan ve depolama** — ücretsiz ve ücretli plan altyapısı (depolama kotası, defter sınırı, günlük tanıma hakkı), kullanım göstergeleri, dosya listesi, kullanılmayan dosyaları temizleme.

## Teknoloji

- **Ön yüz:** React 19, TypeScript, Vite; kendi tasarım sistemi (CSS değişkenleri, açık/koyu tema); Canvas 2D çizim motoru; pdf.js, pdf-lib; lucide ikonları.
- **Arka uç:** Node.js 20+ ve Express 5 (derleme adımı gerektirmeyen ES modülleri), mysql2, zod, helmet, multer, nodemailer, Anthropic SDK (isteğe bağlı OCR).
- **Veritabanı:** MySQL 8+ / MariaDB 10.6+ (`sql/schema.sql`).
- **Dağıtım:** cPanel "Setup Node.js App" (Passenger) — Docker gerekmez. Giriş dosyası `app.js`.

## Klasör yapısı

```
kalemlik/
├── app.js                 # Passenger / cPanel giriş dosyası
├── server/                # Express API (auth, sync, dosyalar, plan, OCR, e-posta)
├── sql/schema.sql         # Veritabanı şeması
├── shared/constants.json  # Ön yüz ile sunucunun ortak sabitleri
├── src/
│   ├── app/               # Uygulama kabuğu, yönlendirme, oturum
│   ├── components/        # Tasarım sistemi bileşenleri
│   ├── features/
│   │   ├── auth/  notebooks/  editor/  stickers/  fonts/  planner/  focus/  account/
│   ├── lib/               # API, IndexedDB, eşitleme deposu, dosyalar, ayarlar
│   └── styles/            # Tasarım belirteçleri ve stiller
├── public/                # Manifest, service worker, ikonlar
├── dist/                  # Hazır üretim derlemesi (sunucu bunu sunar)
├── scripts/               # migrate, check, plan:grant, password:reset, dev, test
├── tests/                 # unit (node:test), api (gerçek MySQL), e2e (Playwright)
└── docs/
```

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | API (3000) + Vite (5173) geliştirme sunucuları |
| `npm run build` | Tip denetimi + `dist/` üretim derlemesi |
| `npm start` | Üretim sunucusu (`dist/` + API) |
| `npm run db:migrate` | Veritabanı şemasını uygular (tekrar çalıştırılabilir) |
| `npm run check` | `.env`, derleme, depolama ve veritabanı kontrolü |
| `npm run plan:grant -- e-posta plus 30` | Kullanıcıya 30 günlük Plus planı tanımlar |
| `npm run password:reset -- e-posta` | Kullanıcının şifresini sıfırlar |
| `npm test` | Birim testleri (editör mantığı, güvenlik, şemalar) |
| `npm run test:api` | Gerçek MySQL/MariaDB'ye karşı API testleri (`TEST_DB_*`) |
| `npm run test:e2e` | Çalışan sunucuya karşı tarayıcı testi (önce `npm i -D playwright && npx playwright install chromium`) |

## Testler

- 24 birim testi (sticker/desen SVG geçerliliği ve OCR sağlayıcı mantığı dahil): otomatik düzeltmenin satıra/kareye oturtması, küçültmeme, üst üste bindirmeme, itme; silgi; seçim; şekiller; listeler; sticker arka plan temizleme; dosya imzası; parola; yapılandırma; şemalar.
- 9 API testi (MariaDB; yönetim paneli ve hazır sticker şeması dahil): kayıt/giriş, kullanıcı izolasyonu, CSRF, eşitleme ve çakışma, silme izi, defter sınırı ve plan, dosya yükleme/imza/kota/temizlik, doğrulama, şifre değiştirme/sıfırlama, OCR.
- 7 tarayıcı testi (`tests/e2e`): genel akış, PDF/sticker/yazı tipi/otomatik düzeltme, dokunmatik (yalnızca kalem, sıkıştırma, kilit, avuç içi), çevrimdışı PWA, 1.1 özellikleri (kaydırarak geçiş, hazır sticker, galeri görseli, sevimli kapak, cihazda tanıma), bloknotlar (üstüne yazma, kâğıt dışı çizginin hatasız kaydı), yönetim paneli.

## Bilinen sınırlar

- Çevrimiçi ödeme sağlayıcısı entegre değildir; altyapı hazırdır, planlar yönetici betiğiyle atanır (docs/ODEME.md).
- Cihazda tanıma düzgün, ayrık yazılmış el yazısında iyi çalışır; çok bitişik/dağınık yazıda emin olamaz ve el yazısını korur. Bu durumlar için yönetim panelinden bir API anahtarı eklemek isabeti artırır.
- Arka plan temizleme düz/sade arka planlarda iyi sonuç verir; karmaşık fotoğraflarda kırpma önerilir.
- Aynı sayfa iki cihazda aynı anda düzenlenirse iki sürüm de korunur (ikincisi ayrı sayfa olur); gerçek zamanlı ortak düzenleme yoktur.
