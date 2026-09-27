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

-- ================================================================ 1.2: öğrenme merkezi

CREATE TABLE IF NOT EXISTS flashcard_decks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  course VARCHAR(120) NOT NULL DEFAULT '',
  color CHAR(7) CHARACTER SET ascii NOT NULL,
  source VARCHAR(300) NOT NULL DEFAULT '',        -- kartların üretildiği kaynak (defter, PDF, kayıt…)
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX flashcard_decks_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flashcards (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  deck_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  topic VARCHAR(120) NOT NULL DEFAULT '',
  ease DOUBLE NOT NULL DEFAULT 2.5,                -- aralıklı tekrar (SM-2) kolaylık katsayısı
  interval_days DOUBLE NOT NULL DEFAULT 0,
  due_at BIGINT NOT NULL DEFAULT 0,
  reps INT UNSIGNED NOT NULL DEFAULT 0,
  lapses INT UNSIGNED NOT NULL DEFAULT 0,
  last_review_at BIGINT NULL,
  last_grade TINYINT NOT NULL DEFAULT -1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX flashcards_user_updated (user_id, updated_at),
  INDEX flashcards_deck (deck_id),
  INDEX flashcards_user_due (user_id, due_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  , FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  card_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  grade TINYINT NOT NULL,                          -- 0 tekrar · 1 zor · 2 orta · 3 kolay
  reviewed_at BIGINT NOT NULL,
  INDEX flashcard_reviews_user (user_id, reviewed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quizzes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  course VARCHAR(120) NOT NULL DEFAULT '',
  source VARCHAR(300) NOT NULL DEFAULT '',
  difficulty VARCHAR(8) CHARACTER SET ascii NOT NULL DEFAULT 'mixed',
  questions MEDIUMTEXT NOT NULL,                   -- JSON: sorular (çoktan seçmeli, doğru/yanlış, boşluk doldurma)
  result MEDIUMTEXT NOT NULL,                      -- JSON: cevaplar, puan, yanlış konular (null: çözülmedi)
  completed_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX quizzes_user_updated (user_id, updated_at),
  INDEX quizzes_user_completed (user_id, completed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS study_plans (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  course VARCHAR(120) NOT NULL DEFAULT '',
  exam_task_id VARCHAR(36) CHARACTER SET ascii NOT NULL DEFAULT '',
  exam_date CHAR(10) CHARACTER SET ascii NOT NULL,
  items MEDIUMTEXT NOT NULL,                       -- JSON: gün gün çalışma görevleri
  completed_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX study_plans_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grade_courses (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  term VARCHAR(60) NOT NULL DEFAULT '',
  name VARCHAR(120) NOT NULL,
  credit DOUBLE NOT NULL DEFAULT 0,
  ects DOUBLE NOT NULL DEFAULT 0,
  components TEXT NOT NULL,                        -- JSON: [{ad, ağırlık %, not}] (vize, final, ödev, quiz…)
  letter VARCHAR(4) NOT NULL DEFAULT '',           -- elle girilen harf notu (boş: hesaplanır)
  included TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX grade_courses_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audio_recordings (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  course VARCHAR(120) NOT NULL DEFAULT '',
  file_id VARCHAR(36) CHARACTER SET ascii NOT NULL DEFAULT '',
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  bookmarks TEXT NOT NULL,                         -- JSON: [{zaman, not}]
  transcript MEDIUMTEXT NOT NULL,                  -- ses → metin (audio_transcriptions yerine kaydın içinde)
  summary MEDIUMTEXT NOT NULL,
  notebook_id VARCHAR(36) CHARACTER SET ascii NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX audio_recordings_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_entries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  day CHAR(10) CHARACTER SET ascii NOT NULL,
  title VARCHAR(160) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  mood VARCHAR(12) CHARACTER SET ascii NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  rev INT UNSIGNED NOT NULL,
  INDEX journal_entries_user_updated (user_id, updated_at),
  INDEX journal_user_day (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(160) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX ai_conversations_user (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  conversation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role VARCHAR(10) CHARACTER SET ascii NOT NULL,   -- user | assistant
  content MEDIUMTEXT NOT NULL,
  meta TEXT NOT NULL,                              -- JSON: seçilen kaynaklar vb.
  created_at BIGINT NOT NULL,
  INDEX ai_messages_conversation (conversation_id, created_at),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  day CHAR(10) CHARACTER SET ascii NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- ortak defter ve paylaşım
CREATE TABLE IF NOT EXISTS notebook_members (
  notebook_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role VARCHAR(8) CHARACTER SET ascii NOT NULL,    -- viewer | editor
  status VARCHAR(8) CHARACTER SET ascii NOT NULL,  -- pending | accepted
  invited_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (notebook_id, user_id),
  INDEX notebook_members_user (user_id, status),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notebook_activity (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notebook_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action VARCHAR(24) CHARACTER SET ascii NOT NULL,
  detail VARCHAR(200) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  INDEX notebook_activity_nb (notebook_id, created_at),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_links (
  id CHAR(22) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,   -- tahmin edilemez bağlantı kimliği
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  notebook_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  page_id VARCHAR(36) CHARACTER SET ascii NOT NULL DEFAULT '',     -- boş: bütün defter
  visibility VARCHAR(8) CHARACTER SET ascii NOT NULL,              -- private | link | public
  allow_download TINYINT(1) NOT NULL DEFAULT 1,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX share_links_user (user_id),
  INDEX share_links_public (visibility, updated_at),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- şablon mağazası
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(40) CHARACTER SET ascii PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  premium TINYINT(1) NOT NULL DEFAULT 0,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  uses INT UNSIGNED NOT NULL DEFAULT 0,
  content MEDIUMTEXT NOT NULL,                     -- JSON: kâğıt, renkler, kapak, sayfalar
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX templates_category (active, category, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS template_purchases (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  template_id VARCHAR(40) CHARACTER SET ascii NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, template_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- XP ve rozetler (kurallar sunucuda, bkz. server/xp.mjs)
CREATE TABLE IF NOT EXISTS xp_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(24) CHARACTER SET ascii NOT NULL,
  ref VARCHAR(64) CHARACTER SET ascii NOT NULL,
  day CHAR(10) CHARACTER SET ascii NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY xp_once (user_id, reason, ref),
  INDEX xp_user_day (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_badges (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  badge_id VARCHAR(24) CHARACTER SET ascii NOT NULL,
  earned_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, badge_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations (version, applied_at) VALUES (1, UNIX_TIMESTAMP()*1000);
