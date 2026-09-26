# Kalemlik'i güncelleme (cPanel)

Bu rehber, sitesi zaten kurulu olan Kalemlik'i yeni sürüme geçirmek içindir. Verileriniz (veritabanı, `.env`,
`storage/` klasöründeki yüklenen dosyalar) **silinmez**. Toplam süre ~5 dakika.

İki paket vardır:

| Paket | Ne zaman |
|---|---|
| `kalemlik-guncelleme-X.zip` | **Güncelleme için bunu kullanın.** Yalnızca değişen dosyalar: `dist/`, `server/`, `shared/`, `sql/`, `scripts/`, `app.js`, `package.json`, `package-lock.json`. |
| `kalemlik-X.zip` | İlk kurulum (tam proje, kaynak kod ve belgeler dahil). |

## 1. Uygulama klasörünü bulun

cPanel → **Setup Node.js App** (Node.js Uygulaması Kur). Listedeki Kalemlik satırında **Application root**
yazan klasör uygulamanın klasörüdür (ör. `kalemlik`). Bu sayfayı açık bırakın.

## 2. Uygulamayı durdurun

Aynı satırda **Stop App** düğmesine basın.

## 3. Paketi yükleyip açın

1. cPanel → **File Manager** (Dosya Yöneticisi) → uygulama klasörüne girin (içinde `app.js`, `server`, `dist` görmelisiniz).
2. Üstteki **Upload** ile `kalemlik-guncelleme-X.zip` dosyasını bu klasöre yükleyin.
3. Klasöre geri dönün, zip dosyasına sağ tıklayın → **Extract** → açılacak yer olarak **bu klasörü** bırakın → **Extract File(s)**.
   - "Dosya zaten var" sorulursa **üzerine yazın** (Overwrite).
   - Paket `.env`, `storage/` ve `node_modules/` içermez; bunlar olduğu gibi kalır.
4. Zip dosyasını silebilirsiniz.

> Paketin içi `kalemlik-guncelleme/` diye bir klasör olarak açıldıysa: o klasöre girin, içindekilerin hepsini seçin
> → **Move** → hedef olarak uygulama klasörünü yazın, üzerine yazmayı onaylayın.

## 4. Yeniden başlatın

**Setup Node.js App** → Kalemlik → **Start App** (çalışıyorsa **Restart**).

`package.json` bağımlılıkları değiştiyse sürüm notlarında belirtilir; o durumda başlatmadan önce aynı sayfada
**Run NPM Install** düğmesine basın. (1.1.0 → 1.1.2 arasında bağımlılık değişmedi.)

Veritabanı güncellemeleri uygulama açılırken otomatik yapılır.

> Güncelleme paketi `tmp/restart.txt` dosyasını da içerir; cPanel'in Node.js altyapısı (Passenger) bu dosya
> değişince uygulamayı bir sonraki istekte kendiliğinden yeniden başlatır. Yine de Restart'a basmanız en garantisidir.

## 5. Doğrulayın

Tarayıcıda şu adresi açın:

```
https://alan-adiniz/api/health
```

`{"ok":true,"version":"1.1.2"}` gibi **yeni sürüm numarası** görmelisiniz.

- Eski numara görünüyorsa uygulama yeniden başlamamıştır: 4. adımı tekrarlayın. Olmazsa cPanel'de
  **Stop App** → birkaç saniye bekleyin → **Start App**.
- Hata sayfası görünüyorsa: **Setup Node.js App** sayfasında uygulamanın **Application startup file** değerinin
  `app.js` olduğunu kontrol edin; hata ayrıntısı uygulama klasöründeki `stderr.log` dosyasındadır.

## 6. Cihazlarda

Tablette / telefonda / bilgisayarda Kalemlik'i açıp **sayfayı bir kez yenileyin** (uygulama olarak yüklüyse kapatıp
açın). 1.1.2 ve sonrası, sunucu güncellendiğinde kendini otomatik yeniler.

Sürümü **Ayarlar** sayfasının en altında görebilirsiniz ("Sürüm 1.1.2").
Cihazda kaydedilemeyip bekleyen değişiklikler güncellemeden sonra kendiliğinden gönderilir; hiçbir şey kaybolmaz.
