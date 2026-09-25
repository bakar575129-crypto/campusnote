# CampusNote 1.5.0 — Özellik Analizi (yalnızca referans)

Bu belge, `CampusNote_1.5.0_guncelleme (2).zip` paketinin **yalnızca özellik ve davranış referansı** olarak
incelenmesiyle hazırlandı. Kalemlik bu paketten kod, CSS, bileşen, klasör yapısı veya veritabanı şeması
kopyalamaz; aşağıdaki liste yeni projenin "eksik özellik bırakmama" kontrol listesidir.

## 1. Sayfalar / bölümler
| CampusNote | Kalemlik karşılığı |
|---|---|
| Giriş, ilk kurulum (SETUP_TOKEN), kayıt (REGISTRATION_OPEN) | Giriş, kayıt, şifremi unuttum, şifre sıfırlama; `REGISTRATION_OPEN` ve ilk hesabı yönetici yapma |
| Defterlerim (kart/liste görünümü, arama, dönem filtresi) | Defterlerim (kart/liste, arama, ders & dönem filtresi, sıralama) |
| Favoriler, Çöp kutusu | Favoriler, Çöp Kutusu (geri getir / kalıcı sil / çöpü boşalt) |
| Ders programı (gün, başlangıç-bitiş, sınıf, renk) | Ders Programı (+ öğretim görevlisi, not, çakışma uyarısı, haftalık ızgara) |
| Görevler (ödev / sınav / yapılacak, tarih, renk) | Ödevler & Sınavlar (+ açıklama, saat, ders, filtre, gecikmiş/bugün/yaklaşan) |
| Takvim (ay görünümü) | Takvim (ay görünümü, görev + haftalık ders tekrarları, gün detayı) |
| Odaklanma sayacı | Odakla (Pomodoro, ayarlanabilir süreler, konu kaydı, geçmiş ve istatistik) |
| Ayarlar (görünüm renkleri, sürüm) | Ayarlar (tema, vurgu rengi, editör varsayılanları, yazı tipleri, sürüm) |
| Hesap / şifre | Hesabım (profil, şifre, oturumları kapat, hesap silme) |
| Planım ve depolama (iyzico) | Plan & Depolama (kota, kullanım, dosya listesi, plan altyapısı) |

## 2. Defter sistemi
- Alanlar: başlık, ders, dönem, renk, şablon (varsayılan kâğıt), kapak stili, kapak stickerları,
  sayfalar, favori, silinmiş (çöp), güncellenme zamanı, revizyon.
- Ücretsiz planda aynı anda en fazla N defter (çöptekiler sayılmaz), sunucuda uygulanır; reddedilirse
  defter silinmez, çöp kutusuna alınır.
- Örnek (demo) defterler — Kalemlik'te **yok** (gerçek kullanıcı verisi).

## 3. Kapak sistemi
- Kapak defterin ilk sayfasıdır; ana ekrandaki kart, kapak düzenleyici ve editördeki kapak aynı bileşen.
- Desenler: düz, temaya uygun, çizgili, kareli, noktalı, çapraz, dama, dalga, üçgen; renk, yoğunluk, boyut.
- Kapakta en fazla 20 sticker: taşı, boyut, açı, kopyala, sil. Kapak yazısı rengi zemine göre otomatik.

## 4. Sayfa şablonları (24)
Temel: boş, çizgili, dar, geniş, kenar boşluklu, kareli, ince kareli, geniş kareli, noktalı.
Ders & araştırma: Cornell (çizgili/kareli/noktalı), laboratuvar raporu, kelime tablosu, haftalık plan, zihin haritası.
Matematik & mühendislik: mühendislik kareleri, koordinat, polar, yarı-log, çift-log.
Tasarım & bilim: izometrik, altıgen/kimya, porte.
Sayfa bazında: zemin, çizgi, yazı rengi, aralık; "tüm sayfalara uygula". Fotoğraf/PDF sayfası.

## 5. Kalem ve çizim
- 7 kalem (tükenmez, dolma, kurşun, ince uç, fırça, keçeli, fosforlu); her birinin rengi, kalınlığı;
  opaklık; kurşun kalemde doku, dolma kalemde yöne duyarlı genişlik, fırçada basınç, fosforluda multiply.
- Ayarlar defterle birlikte kalıcı; silgiye geçip dönmek ayarları bozmaz.
- Silgi (boyut), alan seçimi, geri al / yinele, 10 şekil (çizgi, ok, kare, dikdörtgen, daire, elips,
  üçgen, eşkenar dörtgen, altıgen, yıldız).
- Kalem yan tuşu ve silgi ucu için eylem atama.
- Kalem rafı sol/sağ; telefonda altta.

## 6. Yakınlaştırma / giriş
- İki parmak ve Ctrl+tekerlek yalnızca kâğıdı yakınlaştırır; +/−, sayfaya/genişliğe sığdır, yüzde.
- Kilit: pinch, Ctrl+tekerlek ve düğmeler kapalı; iki parmakla kaydırma sürer.
- Yalnızca kalem: parmak/avuç çizmez; iki parmak hareketleri korunur; kaydırma okları.

## 7. Otomatik yazı düzeltme
- Kip: kapalı / kelime / cümle. Kalem kalkınca ayarlanabilir gecikmeyle (0,2–1,5 sn) çalışır;
  yazarken hiçbir şey kaymaz.
- Satır bazında; sağdaki yazıyı iter (üst üste binme yok); büyük yazıyı satıra sığdırır; tek adımda geri alınır.
- Çizgili sayfada satır üstüne, kareli sayfada kare içine. Çizim/şekil/altını çizme gibi gruplara dokunmaz.
- "Kendi el yazım" (cihazda, internetsiz) veya OCR ile seçilen yazı tipinde metin. OCR başarısızsa yazı korunur.
- Boyut, kalınlık, harf aralığı ayarı.

## 8. Yazı tipleri
- 7 hazır, Türkçe karakterli OFL yazı tipi; kullanıcı TTF/OTF/WOFF/WOFF2 (≤5 MB) yükler; hesapla eşitlenir;
  eksik Türkçe harf uyarısı; sunucu dosyayı imzasından doğrular.

## 9. Sticker
- Fotoğraftan oluşturma: kırpma (orijinal/kare/daire/yuvarlak), yakınlaştırma, düz renk arka plan temizleme
  (tıklanan noktadan flood-fill, tolerans), kişisel arşiv. Sayfada/kapakta taşı, boyut, döndür, kopyala, sil.

## 10. PDF
- PDF içe aktarma (en fazla 40 sayfa, sayfalar görüntüye çevrilip defter sayfası olur), fotoğrafı sayfa yapma,
  üzerine yazma; tüm defteri PDF olarak dışa aktarma.

## 11. Metin
- Sayfa metin katmanı, madde işaretli / numaralı listeler (Enter ile devam/bitir), yazı rengi.

## 12. Hesap, güvenlik, sunucu
- scrypt parola özeti, httpOnly + SameSite oturum çerezi (7 gün), sunucu tarafı oturum tablosu,
  Origin denetimi (CSRF), veritabanı tabanlı hız sınırı, helmet + CSP, dosya imzası doğrulama,
  yükleme sınırı (20 MB, yazı tipi 5 MB), kullanıcı bazında dosya erişimi, depolama kotası,
  OCR günlük sınırı, API anahtarı yalnızca sunucuda.
- Şifre değiştirince diğer oturumlar kapanır. Şifre sıfırlama: CLI betiği.

## 13. Senkronizasyon / çevrimdışı / PWA
- Tüm kayıtlar tek `items` tablosunda JSON; revizyon numarasıyla iyimser kilit; 409'da yerel düzenleme ayrı
  kopya olarak saklanır. IndexedDB'de taslak + bekleyen kuyruk. Çevrimiçi olunca eşitleme.
- Service worker: uygulama kabuğu ve varlıklar önbellekte; API önbelleğe alınmaz. Manifest, ikonlar.

## 14. Ödeme / depolama
- Ücretsiz 200 MB, Plus 5 GB, Pro 25 GB; iyzico abonelik altyapısı, webhook doğrulama, kullanılmayan
  dosyaları temizleme, iptal sonrası ödenen süre korunur.

## Kalemlik'te bilinçli farklar
- Tek `items` JSON tablosu yerine **normalize şema**: defter, sayfa (sayfa başına ayrı revizyon), ders,
  görev, odak oturumu, sticker, yazı tipi, dosya, ayar, plan, abonelik, depolama tabloları.
- Sayfa bazlı eşitleme: büyük defterde tek sayfa değişince yalnızca o sayfa gönderilir.
- Ödeme sağlayıcısı bağımsız plan altyapısı (sağlayıcı bağlanana kadar yönetici betiğiyle plan tanımlanır).
- E-posta ile şifre sıfırlama (SMTP tanımlıysa), aksi hâlde sunucu günlüğüne bağlantı + CLI.
