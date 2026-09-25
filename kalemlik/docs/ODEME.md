# Ödeme ve plan altyapısı

Kalemlik'te plan sınırları **sunucuda** uygulanır; ön yüz yalnızca bilgilendirir.

- `plans` tablosu: `id`, `name`, `storage_mb`, `notebook_limit` (0 = sınırsız), `ocr_daily_limit`, `price_monthly`, `currency`, `active`.
- `subscriptions` tablosu: kullanıcının planı, durumu (`active` / `canceled` / `expired`), sağlayıcı (`manual` veya ödeme sağlayıcısı adı), sağlayıcı referansı ve dönem sonu (`current_period_end`).
- Geçerli plan: dönemi bitmemiş `active` veya `canceled` (iptal edilmiş ama ödenmiş süresi süren) abonelik; yoksa `free`.
- Dönemi biten abonelikler saatlik temizlikte `expired` olur. Kullanıcının dosyaları silinmez; kota aşılmışsa yalnızca yeni yükleme durur.

## Şimdilik: yönetici ataması

```bash
npm run plan:grant -- ogrenci@ornek.com pro 365   # 1 yıllık Pro
npm run plan:grant -- ogrenci@ornek.com free      # ücretsize döndür
```

## Ödeme sağlayıcısı bağlamak

`server/files.mjs` içindeki `/api/billing/checkout` uç noktası sağlayıcı yokken `503 BILLING_DISABLED` döner. Bir sağlayıcı (ör. iyzico, Stripe, PayTR) eklemek için:

1. `.env`: `BILLING_PROVIDER=<ad>` ve sağlayıcının gizli anahtarları (yalnızca sunucuda).
2. `checkout`: sağlayıcıda abonelik/ödeme oturumu oluşturun, fiyatı **sağlayıcıdaki plan tanımından** okuyun (tarayıcıdan gelen fiyata güvenmeyin), kullanıcıyı ödeme sayfasına yönlendirecek adresi döndürün.
3. Webhook uç noktası (ör. `/api/billing/webhook`): imzayı doğrulayın, aynı olayın iki kez işlenmesini engelleyin, başarılı ödemede `subscriptions` satırını `active` ve yeni `current_period_end` ile güncelleyin.
4. `cancel`: sağlayıcıda yenilemeyi kapatın; satırı `canceled` yapın (ödenmiş süre sonuna kadar plan sürer).

Kullanıcıya gösterilecek fiyatları `plans.price_monthly` alanına yazabilirsiniz; bu alan yalnızca bilgi amaçlıdır.
