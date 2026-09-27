# Kalemlik

Üniversite öğrencileri için **dijital defter, planlayıcı ve odaklanma** platformu. Tablet ve kalemle not almak için tasarlandı; telefonda ve masaüstünde de çalışır, uygulama olarak yüklenebilir (PWA) ve internet yokken de kullanılabilir.

> Kalemlik bağımsız, sıfırdan yazılmış bir projedir. CampusNote 1.5.0 yalnızca **özellik referansı** olarak incelendi (bkz. [docs/REFERANS-ANALIZI.md](docs/REFERANS-ANALIZI.md)); ondan kod, stil, bileşen ya da şema alınmadı ve Kalemlik'in çalışmak için CampusNote'a ihtiyacı yoktur.

**Kurulum:** [KURULUM.md](KURULUM.md) · **Güncelleme:** [GUNCELLEME.md](GUNCELLEME.md) · **Mimari:** [docs/MIMARI.md](docs/MIMARI.md) · **Ödeme altyapısı:** [docs/ODEME.md](docs/ODEME.md)

## 1.2.1'de düzeltmeler

- **Akıllı Yazı Güzelleştirme artık tutarlı çalışıyor.**
  - Kalem bir sonraki kelimeyi yazarken önceki kelimenin dönüşümü gelirse, kalem kalkınca sayfa eski hâliyle kaydedilip dönüşüm siliniyordu ("bazen dönüştürmüyor"un asıl nedeni). Artık kalem kâğıttayken gelen değişiklik kalemin yaptığıyla birleştirilir.
  - Yavaş yazılan kelime parça parça dönüşmez: bir parça ("B") dönüştükten ya da tanımaya gittikten sonra hemen yanına devam edilirse kelime yeniden açılır ve bütün hâlde tanınır ("Ben"). Sonradan eklenen nokta/şapka da kelimeye katılır. Bekleme süresi kullanıcının yazma ritmine göre uzar.
  - Çok yakınlaştırılmış ekranda yazılan (kâğıtta küçük kalan) kelime tanımaya okunaklı boyutta gönderilir; iri yazıda harfler satırlara bölünmez.
  - Sunucuda tanıma kuruluysa ve kullanılamazsa (anahtar sorunu, kota, internet yok) cihazdaki daha zayıf motorla **tahmin yürütülmez** — yanlış kelime yazılmaz, el yazısı korunur ve nedeni söylenir. Başarısız tanıma günlük haktan düşülmez.
- **"This API key is not scoped to a workspace" hatası çözüldü.** Bu tür anahtarlar için Anthropic isteklerde çalışma alanı kimliği ister: Yönetim → Sistem'e **Çalışma alanı kimliği (Workspace ID)** alanı eklendi (`.env`: `ANTHROPIC_WORKSPACE_ID`). Anahtarın yetkisi yetiyorsa kimlik kendiliğinden bulunup kaydedilir. Hata artık "anahtar geçersiz" yerine gerçek nedeni ve çözümü söyler. Kalemlik AI, el yazısı tanıma ve anahtar kullanan her özellik bu ayarı kullanır.

## 1.2.0'da yenilikler

- **Akıllı Yazı Güzelleştirme** (eski "otomatik el yazısı düzeltme" tamamen kaldırıldı; kapalıyken yalnızca kendi el yazınla yazarsın). Açıksa kelimen **bittikten sonra** (kalemi kaldırıp beklediğinde — Hızlı 0,3 / Normal 0,6 / Yavaş 1 sn —, sonraki kelimeye geçtiğinde ya da başka araç seçtiğinde) el yazın tanınır ve **seçtiğin yazı tipinde, aynı yerde** gösterilir. Metin yeniden yazılmaz, yazım düzeltilmez, kelime değiştirilmez (mitoz → motor olmaz); Türkçe harfler, rakamlar, matematik işaretleri, noktalama, parantez, %, para birimleri korunur. Tanıma emin değilse el yazın olduğu gibi kalır. Türkçe ve İngilizce; yeni dil eklenebilir.
- **✨ Kalemlik AI** — derslerini, notlarını, görevlerini ve sınavlarını bilen asistan: sohbet geçmişi, yeni sohbet, not/defter seçerek soru sorma, hazır komutlar, cevabı deftere kaydetme. Anahtar yalnızca sunucuda; dakika başı hız sınırı ve plana göre günlük kullanım hakkı.
- **🧠 Çalışma** — notlardan/PDF'ten **flashcard** (5/10/20/50; çevir, bildim/bilemedim, kolay/orta/zor, aralıklı tekrar), **AI Quiz** (çoktan seçmeli, doğru/yanlış, boşluk doldurma; Kolay/Orta/Zor/Karışık; puan, yanlış konular, geçmiş), **sınav çalışma planı** (günlere bölünmüş, görevlere ve takvime eklenir, düzenlenebilir). AI kapalıysa kural tabanlı üretim çalışır.
- **🔎 Gelişmiş arama** (Ctrl/⌘ K) — defter, sayfa metni, tanınan el yazısı, görev, ders, flashcard, quiz, kayıt, günlük; ders/tür/tarih/favori süzgeçleri.
- **🎓 Notlarım** — dönem, ders, kredi/AKTS, vize/final/ödev/quiz/diğer ve özel ağırlıklar; ders ortalaması, harf notu, dönem ortalaması, GANO; "Finalden kaç almalıyım?".
- **🔔 Akıllı bildirimler** — sınav (7/3/1 gün kala), ödev, günlük çalışma hedefi, flashcard tekrarı, çalışma serisi, AI önerisi; tür tür açılıp kapanır, saat ayarlanır.
- **🎙️ Ders Kaydı** — kaydet/duraklat/devam/bitir, işaretler ("12:32 → Önemli formül"), canlı transkript (tarayıcı destekliyse) ya da sunucuda metne çevirme (OpenAI anahtarı gerekir), AI özet/önemli noktalar, transkriptten flashcard ve quiz, deftere ekleme.
- **📱 Widget** (`/widget`, ana ekrana eklenebilir) — Bugün, dersler, sınav, görevler, çalışma süresi (45/90 dk), Hızlı Ekle.
- **👥 Ortak defter** — e-postayla davet, Görüntüleyebilir/Düzenleyebilir, üye listesi, değişiklik geçmişi, son düzenleyen, birkaç saniyede canlı eşitleme; aynı sayfada aynı anda yazılsa bile çizgiler birleşir (üç yönlü birleştirme).
- **🔗 Not paylaşımı** — Gizli / Bağlantıya sahip olan / Herkese açık; `/share/note/…` sayfası (başlık, önizleme, ders, tarih, oluşturan, PDF indirme), istenince kapatılır; Keşfet'te herkese açık notlar.
- **🛍️ Şablon Mağazası** — 13 kategoride hazır defter şablonları (ders notu, planner, Cornell, matematik, mühendislik, tıp, hukuk, günlük, haftalık/aylık plan, sınav planı, minimal, renkli); önizleme, kullanım sayısı, ücretsiz/premium; "Şablonu Kullan" yeni defter açar. Yönetim panelinden şablon eklenir/düzenlenir/kapatılır.
- **🏆 XP ve rozetler** — yeni not +5, görev +10, 30 dk odak +20, quiz +15, flashcard +10, sınav planını bitirme +50, günlük +5; seviyeler ve 8 rozet. XP'yi **yalnızca sunucu** hesaplar (her iş bir kez, günlük sınırlı).
- **🏠 Ana Sayfa** — "Günaydın 👋", Bugün (ders, görev, sınav, çalışma süresi, seri), bugünkü plan, çalışma hedefi, yaklaşan sınav, Kalemlik AI, hızlı ekle, kaldığın defterler. **📚 Dersler** sayfası her dersin programını, defterlerini, görevlerini, kartlarını, kayıtlarını ve notunu bir arada gösterir. **👤 Profil**: seviye, rozetler, istatistikler.
- **Yeni menü**: Ana Sayfa, Dersler, Defterler, Takvim, Görevler, Çalışma, Notlarım, Kayıtlar, Kalemlik AI, Paylaşımlar, Şablonlar, Profil; eski bölümler (Favoriler, Ders Programı, Odaklan, Günlük, Çöp Kutusu) "Diğer" altında.
- **Planlar**: AI günlük hakkı, AI flashcard/quiz/plan, sunucuda metne çevirme, premium şablonlar ve ortak defter (kişi sayısı) plan başına yönetim panelinden açılıp kapatılır; kodda sabit değildir.
- Güvenlik: tüm yeni uç noktalar oturum, sahiplik/üyelik yetkisi, girdi doğrulama (zod) ve hız sınırıyla korunur; ses dosyaları imzayla doğrulanır, büyük dosyalar belleğe alınmadan diske akıtılır. Mevcut veriler korunur; veritabanı geçişleri açılışta otomatik ve geriye uyumludur.

## 1.1.2'de yenilikler

- **"Kaydedilemedi" hatası kökten giderildi.** Onarım artık **sunucuda** da yapılır: sunucu her kaydı doğrulamadan önce ortak onarıcıdan (`shared/repair.mjs`) geçirir. Böylece hangi uygulama sürümünden, hangi cihazdan ya da ne kadar eski bir yerel kopyadan gelirse gelsin kayıt reddedilmez: sınır dışı konumlar sınıra çekilir, bozuk noktalar atlanır, geçersiz renk/yazı tipi/saat/tarih/kategori düzeltilir, eksik alanlar varsayılanla doldurulur, aynı kimlikli öğeler ayrılır. Önceki sürümde onarılmayan alanlar (ör. tarihi boş görev, bilinmeyen kategori, bozuk sayfa sırası, eksik revizyon) da artık kapsanıyor.
- Sunucu yine de bir sayfa öğesini reddederse yalnızca o öğe atlanır, sayfanın geri kalanı kaydedilir.
- Sunucu dosyaları güncellendi ama Node.js uygulaması yeniden başlatılmadıysa uyarı bunu açıkça söyler; açık kalmış eski uygulama, sunucu güncellenince kendini yeniler (yerel değişiklikler korunur).
- Testler: 8 kayıt türü × 400 rastgele bozuk kayıt → onarım sonrası hepsi sunucu şemasından geçer; cihazda takılı kalmış bozuk kayıtların açılışta onarılıp kaydedildiği tarayıcı testi; tüm tarayıcı testleri artık tek bir eşitleme reddinde başarısız olur.

## 1.1.1'de yenilikler

- **"Kaydedilemedi: Gönderilen bilgileri kontrol et" hatası giderildi.** Neden: uzaklaştırılmış görünümde kâğıdın dışına taşan çizgiler ve seçimi sayfanın çok dışına taşımak, sunucunun koordinat sınırını aşıyordu; sayfa bu yüzden hiç kaydedilemiyordu. Sınırlar genişletildi ve uygulama artık her kaydı göndermeden önce sunucu kurallarına uydurur (geçersiz noktaları onarır, çok uzun çizgileri böler, saatleri düzeltir). Daha önce takılıp kalmış kayıtlar da kendiliğinden onarılıp gönderilir. Bir alan yine de reddedilirse sunucu hangi alan olduğunu bildirir ve uyarı bir kez gösterilir.
- **16 bloknot çeşidi** (Stickerlar → **Bloknotlar**): sarı/pembe/mavi/yeşil yapışkan notlar, spiralli (çizgili ve kareli) bloknot, yırtık defter kâğıdı, fiş kartı, yapılacaklar listesi, kalp, bulut, panolu not, kraft not, haftalık mini plan, sınav notu kartı, noktalı (ataşlı) not. Sayfanın her yerine konur, taşınır, boyutlandırılır, döndürülür ve **üstüne kalemle yazılır** (mürekkep bloknotun üstünde görünür; PDF'te de). 

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

**Akıllı Yazı Güzelleştirme** — kapalıyken yalnızca kendi el yazın. Açıkken kelime bitince (bekleme süresi Hızlı / Normal / Yavaş) el yazısı tanınır ve seçilen yazı tipinde aynı konumda, aynı renkte gösterilir; metin değiştirilmez, yazım düzeltilmez. Tanıma cihazda (internetsiz) ya da API anahtarı tanımlıysa sunucuda yapılır; emin olunamazsa el yazısı korunur. Tek adımda geri alınır.

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

- 40 birim testi (1.2.1: çalışma alanı başlığının gerçekten gönderilmesi, otomatik bulma, iri yazıda satır ayırma dahil): Akıllı Yazı Güzelleştirme (kelime bitmeden dönüştürmeme, aynı konum/taban çizgisi, üst üste bindirmeme, tanıma sonucunun mürekkeple tutarlılığı), rastgele bozuk kayıt onarımı (tüm kayıt türleri), aralıklı tekrar, flashcard/quiz/plan üretimi, not hesaplama ("finalden kaç"), güvenli Markdown, üç yönlü sayfa birleştirme, AI sağlayıcı mantığı, silgi, seçim, şekiller, dosya imzası, şemalar.
- 16 API testi (MariaDB): kayıt/giriş, kullanıcı izolasyonu, CSRF, eşitleme ve çakışma, defter sınırı ve plan, dosya yükleme, yönetim paneli, öğrenme kayıtları, Kalemlik AI (bağlam, izolasyon, kota), arama, ders kaydı ve ses doğrulama, ortak defter ve paylaşım bağlantıları, XP kuralları ve günlük sınır, şablon mağazası ve premium kilidi.
- 13 tarayıcı testi (`tests/e2e`; 1.2.1: güzelleştirme güvenilirliği — kalem yazarken gelen dönüşüm, parça kelimenin yeniden açılması, yüksek yakınlaştırma, sunucu hatasında el yazısının korunması): genel akış, medya, dokunmatik, çevrimdışı PWA, 1.1 özellikleri ve Akıllı Yazı Güzelleştirme, bloknotlar, yönetim paneli, Çalışma (flashcard/quiz/plan/AI), arama/notlarım/bildirimler, ders kaydı/günlük/widget, ortak defter (üç kullanıcı, canlı eşitleme, salt okunur) ve paylaşım bağlantısı, ana sayfa/şablonlar/XP/profil/dersler (telefon görünümü dahil). Her test tek bir eşitleme reddinde ya da konsol hatasında başarısız olur.

## Bilinen sınırlar

- Çevrimiçi ödeme sağlayıcısı entegre değildir; altyapı hazırdır, planlar yönetici betiğiyle atanır (docs/ODEME.md).
- Cihazda tanıma düzgün, ayrık yazılmış el yazısında iyi çalışır; çok bitişik/dağınık yazıda emin olamaz ve el yazısını korur. Bu durumlar için yönetim panelinden bir API anahtarı eklemek isabeti artırır.
- Arka plan temizleme düz/sade arka planlarda iyi sonuç verir; karmaşık fotoğraflarda kırpma önerilir.
- Ortak defterde değişiklikler birkaç saniyede bir (yoklamayla) gelir; aynı anda yazılanlar birleşir ama imleç düzeyinde anlık ortak yazma yoktur.
- Sunucuda ses → metin için OpenAI anahtarı gerekir (Whisper); yoksa tarayıcının canlı konuşma tanıması (Chrome/Edge) ya da elle transkript kullanılır. Kalemlik AI için Anthropic ya da OpenAI anahtarı gerekir; yoksa flashcard/quiz/plan kural tabanlı üretilir.
- Uygulama kapalıyken bildirim göstermek tarayıcıya bağlıdır (periyodik arka plan eşitlemesi yalnızca yüklü PWA'da, Chromium tabanlı tarayıcılarda çalışır); diğerlerinde bildirimler uygulama açıkken gelir.
