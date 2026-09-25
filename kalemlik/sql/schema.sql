-- Kalemlik veritabanı şeması — MySQL 8+ / MariaDB 10.6+
-- Tekrar çalıştırmak güvenlidir (IF NOT EXISTS). Mevcut veriler korunur.
-- Tüm zaman damgaları milisaniye cinsinden UNIX zamanıdır (BIGINT).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT UNSIGNED PRIMARY KEY,
  applied_at BIGINT NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- Hesaplar
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(12) CHARACTER SET ascii NOT NULL DEFAULT 'user',
  university VARCHAR(120) NOT NULL DEFAULT '',
  department VARCHAR(120) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  user_agent VARCHAR(200) NOT NULL DEFAULT '',
  INDEX sessions_user (user_id),
  INDEX sessions_expiry (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  INDEX password_resets_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- Dosyalar
-- Fiziksel dosya STORAGE_DIR/<user_id>/<id> yolunda durur; herkese açık klasörde değildir.
CREATE TABLE IF NOT EXISTS files (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(12) CHARACTER SET ascii NOT NULL,
  mime VARCHAR(40) CHARACTER SET ascii NOT NULL,
  name VARCHAR(180) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX files_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- Defterler
CREATE TABLE IF NOT EXISTS notebooks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  course VARCHAR(120) NOT NULL DEFAULT '',
  term VARCHAR(60) NOT NULL DEFAULT '',
  color CHAR(7) CHARACTER SET ascii NOT NULL,
  paper VARCHAR(24) CHARACTER SET ascii NOT NULL,
  cover MEDIUMTEXT NOT NULL,               -- JSON: desen, metinler, stickerlar
  favorite TINYINT(1) NOT NULL DEFAULT 0,
  trashed_at BIGINT NULL,
  last_opened_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX notebooks_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Her sayfa ayrı satır ve ayrı revizyondur: büyük defterde yalnızca değişen sayfa eşitlenir.
-- content JSON: şablon, renkler, arka plan (PDF/fotoğraf), çizgiler (strokes), metin kutuları, stickerlar.
CREATE TABLE IF NOT EXISTS notebook_pages (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  notebook_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  position DOUBLE NOT NULL,
  content LONGTEXT NOT NULL,
  content_bytes INT UNSIGNED NOT NULL,
  stroke_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX pages_notebook (notebook_id, position),
  INDEX pages_user_updated (user_id, updated_at),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- Sticker & yazı tipi arşivi
CREATE TABLE IF NOT EXISTS user_stickers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(80) NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX stickers_user (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fonts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(80) NOT NULL,
  missing_chars VARCHAR(40) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX fonts_user (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- Planlayıcı
CREATE TABLE IF NOT EXISTS lessons (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(120) NOT NULL,
  day TINYINT UNSIGNED NOT NULL,           -- 0 = Pazartesi … 6 = Pazar
  start_time CHAR(5) CHARACTER SET ascii NOT NULL,
  end_time CHAR(5) CHARACTER SET ascii NOT NULL,
  room VARCHAR(80) NOT NULL DEFAULT '',
  instructor VARCHAR(100) NOT NULL DEFAULT '',
  color CHAR(7) CHARACTER SET ascii NOT NULL,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX lessons_user (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  course VARCHAR(120) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  due_date CHAR(10) CHARACTER SET ascii NOT NULL,
  due_time CHAR(5) CHARACTER SET ascii NOT NULL DEFAULT '',
  category VARCHAR(12) CHARACTER SET ascii NOT NULL,   -- homework | exam | todo
  color CHAR(7) CHARACTER SET ascii NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  completed_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX tasks_user_due (user_id, due_date),
  INDEX tasks_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS focus_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  topic VARCHAR(160) NOT NULL DEFAULT '',
  course VARCHAR(120) NOT NULL DEFAULT '',
  planned_minutes SMALLINT UNSIGNED NOT NULL,
  focused_seconds INT UNSIGNED NOT NULL,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX focus_user_started (user_id, started_at),
  INDEX focus_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Silinen kayıtların izi: diğer cihazlar "şu kayıt silindi" bilgisini eşitlemede alır.
CREATE TABLE IF NOT EXISTS deletions (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entity VARCHAR(12) CHARACTER SET ascii NOT NULL,
  entity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  deleted_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, entity, entity_id),
  INDEX deletions_user_time (user_id, deleted_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- Plan & depolama
CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(16) CHARACTER SET ascii PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  storage_mb INT UNSIGNED NOT NULL,
  notebook_limit INT UNSIGNED NOT NULL DEFAULT 0,   -- 0 = sınırsız
  ocr_daily_limit INT UNSIGNED NOT NULL DEFAULT 0,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency CHAR(3) CHARACTER SET ascii NOT NULL DEFAULT 'TRY',
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO plans (id,name,storage_mb,notebook_limit,ocr_daily_limit,price_monthly,sort_order) VALUES
  ('free','Ücretsiz',500,5,30,0,0),
  ('plus','Plus',5120,0,300,0,1),
  ('pro','Pro',25600,0,1000,0,2);

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan_id VARCHAR(16) CHARACTER SET ascii NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii NOT NULL,     -- active | canceled | expired
  provider VARCHAR(24) CHARACTER SET ascii NOT NULL,   -- manual | <ödeme sağlayıcısı>
  provider_ref VARCHAR(120) CHARACTER SET ascii NULL,
  current_period_end BIGINT NOT NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX subscriptions_user (user_id, status, current_period_end),
  UNIQUE KEY subscriptions_provider_ref (provider, provider_ref),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB;

-- Kullanıcı başına anlık depolama kullanımı (dosya tablosundan hesaplanır, ayrıca tutulmaz).
CREATE OR REPLACE VIEW storage_usage AS
  SELECT user_id, COUNT(*) AS file_count, COALESCE(SUM(size),0) AS used_bytes FROM files GROUP BY user_id;

-- ---------------------------------------------------------------- Kötüye kullanım koruması
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  hits INT UNSIGNED NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX rate_limits_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ocr_usage (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  day CHAR(10) CHARACTER SET ascii NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations (version, applied_at) VALUES (1, UNIX_TIMESTAMP()*1000);
