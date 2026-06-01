# 🕯️ «Память» — Developer Guide (онбординг)

> Полное руководство для разработчика, который продолжает проект.
> Описывает **реальное** состояние кода на 2026-06-01, структуру репозитория
> пофайлово, запуск, рабочий процесс и известные проблемы.
>
> Дополняет (а где расходится — уточняет) `docs/README.md`. Исчерпывающий
> справочник API и моделей — в `docs/README.md` и `backend/prisma/schema.prisma`.

## Оглавление
1. [Что это за проект](#1-что-это-за-проект)
2. [Стек и версии](#2-стек-и-версии)
3. [Структура репозитория](#3-структура-репозитория)
4. [Быстрый старт (проверенный)](#4-быстрый-старт-проверенный)
5. [Переменные окружения](#5-переменные-окружения)
6. [Backend пофайлово](#6-backend-пофайлово)
7. [Frontend пофайлово](#7-frontend-пофайлово)
8. [Telegram-бот (реальность vs ТЗ)](#8-telegram-бот-реальность-vs-тз)
9. [Модель данных](#9-модель-данных)
10. [Аутентификация и доступ](#10-аутентификация-и-доступ)
11. [Рабочий процесс разработки](#11-рабочий-процесс-разработки)
12. [Деплой](#12-деплой)
13. [Бэкапы и восстановление](#13-бэкапы-и-восстановление)
14. [Известные проблемы и баги](#14-известные-проблемы-и-баги)
15. [Расхождения кода с документацией](#15-расхождения-кода-с-документацией)

---

## 1. Что это за проект

Мемориальная веб-платформа «Память»: страницы памяти усопших (биография, фото,
галерея, воспоминания гостей), семейные генеалогические древа, таймлайны-летописи,
а также сложные процессы модерации — споры о профилях, объединение дубликатов и
передача аккаунта наследнику при бездействии владельца.

Фронт — статика (vanilla JS), бэк — Express+Prisma+Postgres, плюс Telegram-бот.
Всё под Docker Compose, перед Express стоит Caddy (reverse-proxy + раздача статики).

**Репозитории (git remotes):**
- `origin` → `github.com/moggerrescure/site.git` ← **рабочий, сюда пушим в `main`**
- `moi` → `github.com/krutkomarketing/moi_memory.git` (зеркало/старое)

---

## 2. Стек и версии

| Слой | Технологии |
|---|---|
| Backend | Node.js ≥22 (в контейнере 24), Express 4.21, Prisma 6.19.3 |
| БД | PostgreSQL 16 (FTS на словаре `russian`, `tsvector`) |
| Auth | JWT HS256 (самописный, не jsonwebtoken-роуты), PBKDF2-SHA512 |
| Файлы | Multer 2 (**disk** staging), Sharp (resize→WebP), опц. S3/R2 (AWS SDK v3) |
| Прочее | helmet, cors, morgan, express-rate-limit, node-cron, qrcode, pdfkit, nodemailer |
| Бот | Telegraf 4 (тот же Prisma Client, прямой доступ к БД) |
| Frontend | Vanilla ES6+, CSS без препроцессоров, Canvas (частицы), SVG (древо) |
| Инфра | Docker Compose, Caddy 2, контейнер pg-backup (pg_dump → Telegram) |

> Точные версии — `backend/package.json`, `bot/package.json`.

---

## 3. Структура репозитория

```
site-full_test1/
├── docker-compose.yml            # 5 сервисов: db, backend, bot, frontend, pg-backup
├── docker-compose.override.yml   # DEV: порты наружу, bind-mounts, hot-reload, NODE_ENV=development
├── deploy.sh / rollback.sh       # прод-деплой и откат
├── .env                          # секреты (НЕ в git)
├── backend/
│   ├── index.js                  # точка входа Express (middleware, статика, cron, OG /p/:slug)
│   ├── router.js                 # ВСЕ /api/* роуты (один большой файл)
│   ├── auth.js                   # JWT + PBKDF2 + middleware (requireAuth/optionalAuth) + register/login
│   ├── lib/                      # prisma, dates, slug, s3, mailer, sitemap, ogRenderer, security-headers
│   ├── middleware/               # errors(ApiError), rateLimit, upload, lastSeen, auth, requireProfileAccess
│   ├── services/                 # бизнес-логика (см. §6)
│   ├── jobs/                     # cron: cleanup, legacy, index(scheduler)
│   ├── routes/                   # password-reset.js (отдельный sub-router)
│   ├── scripts/                  # одноразовые скрипты (миграции, сиды, чистка)
│   ├── prisma/
│   │   ├── schema.prisma         # единая схема
│   │   ├── migrations/           # 20+ SQL-миграций
│   │   └── seed-historical.js    # сид исторических timeline-событий
│   └── uploads/                  # локальные файлы (44 webp-фото в git как seed-ассеты)
├── bot/
│   ├── index.js                  # Telegraf: login-подтверждение + relay поддержки (МИНИМАЛЬНЫЙ)
│   └── lib/                      # auth, prisma, relay, tg-login
├── frontend/
│   ├── *.html                    # страницы (index, person, memory, family-tree, timeline, admin, ...)
│   ├── js/                       # вся клиентская логика (см. §7)
│   ├── styles/                   # CSS по модулям
│   ├── images/                   # статика (фичи на главной)
│   └── Caddyfile                 # reverse-proxy + статика + fallback на .html
├── backup/                       # Dockerfile + backup.sh для pg-backup
├── db/init/                      # init-скрипты Postgres (пусто)
└── docs/                         # README.md, API.md, HANDOFF.md, MIGRATION.md, этот файл
```

---

## 4. Быстрый старт (проверенный)

> Это реально работающая последовательность (выверена на Windows + Docker Desktop/WSL2).

```bash
# 0. Требования: Docker Desktop с WSL2-бэкендом (Windows) / Docker Engine (Linux).
#    Если на Windows движок не стартует ("dockerDesktopLinuxEngine pipe not found"):
#    проверь `wsl --list --verbose` — должен быть дистрибутив docker-desktop.
#    Лечится переустановкой Docker Desktop (галка "Use WSL 2") + перезагрузка.

# 1. .env уже должен лежать в корне (см. §5). Если нет — cp .env.example .env и заполнить.

# 2. Поднять всё (dev-режим, override подхватывается автоматически)
docker compose up -d --build

# 3. Проверить
docker compose ps                         # db/backend/frontend — Up; bot/pg-backup могут рестартиться без токенов
curl http://localhost:3000/api/health     # {"ok":true,"db":"up",...}
#   фронт:   http://localhost
#   API:     http://localhost:3000  (и через Caddy: http://localhost/api)
#   Postgres: localhost:5433 (DBeaver/psql)

# 4. Миграции применяются автоматически (override: `prisma migrate deploy` в command бэкенда).
#    Вручную при необходимости:
docker compose exec backend npx prisma migrate deploy

# 5. (dev) Засеять тестовые данные — admin + 43 страницы + древо:
docker compose exec backend node scripts/seed-recreate.js
docker compose exec backend node scripts/seed-tree.js
```

**Тестовый админ после сидов:** `admin@admin.local` / `qwer2609` (роль ADMIN).

> ⚠️ `bot` и `pg-backup` падают в рестарт без валидных `BOT_TOKEN` / настроек —
> для работы сайта они не нужны. Бот заводится только с реальным токеном от @BotFather.

---

## 5. Переменные окружения

Корневой `.env` (используется compose и backend):

| Переменная | Назначение |
|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | креды Postgres |
| `DATABASE_URL` | строка подключения Prisma (в compose собирается из POSTGRES_*) |
| `JWT_SECRET` | секрет подписи JWT (**обязателен в проде**, 256+ бит) |
| `JWT_EXPIRY_SEC` | TTL токена (по умолчанию 7 дней) |
| `SITE_URL` | базовый URL (sitemap, OG, ссылки бота) |
| `BOT_TOKEN` | токен Telegram-бота |
| `BOT_USERNAME` | username бота без @ (deep-link login) |
| `ADMIN_CHAT_ID` | chat id админа (relay поддержки) |
| `S3_*` | R2/S3 (BUCKET, ENDPOINT, REGION, PUBLIC_URL_BASE, ACCESS_KEY_ID, SECRET_ACCESS_KEY) — опц., иначе local `/uploads` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | AI-ассистент (иначе mock-ответы) |
| `ENABLE_CRON` | `false` отключает cron |
| `CLEANUP_CRON` / `LEGACY_CRON` / `CRON_TZ` | расписания (дефолт 03:00 / 03:15 Europe/Minsk) |
| `PROFILE_HARD_DELETE_DAYS` / `AUDIT_RETENTION_DAYS` | retention (30 / 90 дней) |
| `BACKUP_*` | настройки pg-backup (час, retention, Telegram-алерты) |

> `.env` в `.gitignore`. Перед прод-деплоем — ротировать все секреты.

---

## 6. Backend пофайлово

**Входная точка**
- `index.js` — middleware (helmet, cors-allowlist, morgan, json/urlencoded 2mb), `/health`,
  `/sitemap.xml`, `/robots.txt`, монтаж `/api`, статика `/uploads`, SSR OG-страниц `/p/:slug`,
  cron-старт, graceful shutdown. ⚠️ `trust proxy` задаётся дважды (баг, безвреден).
- `router.js` — **все** `/api/*` (один файл ~1500 строк): auth, profiles/people, stats, audit,
  reviews, candles, ai, uploads, family-trees/nodes/clans/connections, timeline, access grants,
  access codes, disputes, merge-requests, legacy-contact, telegram deep-link login.
- `auth.js` — самописный JWT HS256 (без чтения `alg` → нет algorithm-confusion), PBKDF2 для
  паролей/PIN, `requireAuth`/`optionalAuth`/`requireRole`/`requireProfileAccess`, `registerUser`,
  `loginUser`, `loginByTelegram`. JWT-инвалидация через `User.jwtVersion`.

**lib/**
- `prisma.js` — singleton PrismaClient.
- `dates.js` — `parseDate/parseRange/formatDate/getYear` (гибкий разбор «1940», «1940-03-12»).
- `slug.js` — `generateUniqueSlug(fullName, tx)` — транслитерация + уникальность.
- `s3.js` — обёртка R2/S3 (isEnabled, uploadBuffer/Stream, presign, headObject, deleteByUrl).
- `mailer.js` — nodemailer (password reset).
- `sitemap.js` — `buildSitemap/buildRobotsTxt`.
- `ogRenderer.js` — `renderPersonHtml` (мета-теги для шеринга).
- `security-headers.js` — helmet-конфиг.

**middleware/**
- `errors.js` — класс `ApiError(message, status, code)` + `errorHandler` (ApiError/Prisma/Multer/
  CORS) + `notFoundHandler`. **Важно: порядок аргументов — message первый!**
- `rateLimit.js` — `loginLimiter` (5/15м на ip+email), `registerLimiter` (3/час), `authGeneralLimiter` (30/15м).
- `upload.js` — tmp-staging dir + `tmpCleanupMiddleware`.
- `lastSeen.js` — троттлящее обновление `User.lastSeenAt` (для legacy-проверки).
- `requireProfileAccess.js` — проверка прав на профиль.

**services/** (бизнес-логика, кидают `ApiError`)
| Файл | Отвечает за |
|---|---|
| `profileService.js` | CRUD профилей, FTS-поиск (fast/FTS path), soft-delete/restore/trash, сериализация |
| `mergeService.js` | merge-заявки: create→ownerApprove→adminApprove→execute (relink 9 таблиц в транзакции) |
| `disputeService.js` | споры: create/resolve; авто-создание merge для DUPLICATE+accept |
| `legacyContactService.js` | наследование: invite/accept/trigger(cron)/claim/approve(перенос профилей) |
| `accessService.js` | гранты ProfileAccess (view/edit) |
| `accessCodeService.js` | ротируемые PIN-коды профиля (generate/revoke/verify→создаёт грант) |
| `codeService.js` | пароль PASSWORD-профиля + HMAC access-token (`profileId.exp.sig`) |
| `candleService.js` | свечи + антифрод по fingerprint (5/мин) |
| `reviewService.js` | воспоминания гостей: list/create(авто-аппрув owner/admin)/approve/reject |
| `familyService.js` | деревья/кланы/узлы/связи; проверки циклов и лимита 2 родителей; SPOUSE-зеркало |
| `timelineService.js` | события таймлайна + исторические (ADMIN) |
| `mediaService.js` | сохранение файлов (buffer/path), Sharp→WebP, presign R2, purge orphan media |
| `auditService.js` | запись и выборка AuditLog |
| `tgLoginService.js` | deep-link login токены (create/poll/confirm) |
| `aiService.js` | AI-чат: Gemini→OpenAI→mock fallback (биографии) |

**jobs/**
- `index.js` — планировщик node-cron (cleanup 03:00, legacy 03:15).
- `cleanup.js` — hard-delete профилей >30д, purge AuditLog >90д, purge tg-токенов.
- `legacy.js` — `runLegacyTasks` (trigger inactive + expire claims).

**scripts/** (одноразовые, dev/ops — **не для прода автоматически**)
- `seed-recreate.js` ⭐ — создаёт admin + 43 публичные страницы, привязка фото 1:1 (наш recovery).
- `seed-tree.js` ⭐ — строит древо из этих профилей (5 поколений, 3 рода).
- `link-cover-photos.js` — фаззи-привязка фото из `uploads/` к профилям/узлам.
- `fill-remaining-photos.js`, `cleanup-photos.js`, `restore-clans.js`,
  `migrate-from-sqlite.js`, `migrate-uploads-to-r2.js`, `cleanup-audit-metadata.js`.

---

## 7. Frontend пофайлово

Без сборщика: каждый `*.html` подключает нужные `js/*.js` тегами `<script>`.
Точка интеграции с API — `js/api.js` (глобальный `API`).

| Файл | Роль |
|---|---|
| `api.js` | fetch-обёртка: BASE-детект (dev :3000), JWT из `localStorage('memory_jwt')`, авто-сжатие картинок, таймауты, `login/register/logout`, telegram-login |
| `home.js` | главная: статистика, последние профили |
| `memory.js` | каталог: FTS-поиск, фильтры (год/город/пол/видимость/mine), пагинация |
| `person.js` | страница человека: hero, био-блоки, галерея, воспоминания, свечи ⚠️ **XSS (см. §14)** |
| `person-edit.js` | редактор профиля + AI-ассистент (чат генерации/улучшения текста) |
| `person-blocks.js` | рендер/редактирование 6 био-блоков (зебра) |
| `person-access.js` | UI выдачи/отзыва грантов ProfileAccess |
| `person-codes.js` | UI создания/отзыва PIN-кодов доступа |
| `tree.js` | просмотр семейного древа (SVG: узлы, связи, кланы) |
| `tree-edit.js` | редактор древа (drag узлов, создание связей) ⚠️ *активная зона работы* |
| `timeline.js` | летопись: личные + исторические события |
| `admin.js` | админ-панель: вкладки Споры / Объединения / Наследование |
| `audit.js` | просмотр AuditLog (ADMIN) |
| `disputes.js` | модал «Оспорить страницу» на person.html |
| `legacy-contact.js` | страница наследования (owner + heir flow, auto-accept по `?invite=`) |
| `review-moderation.js` | модерация воспоминаний (approve/reject) |
| `trash.js` | корзина soft-deleted профилей |
| `auth-ui.js` | формы логина/регистрации |
| `nav.js` | авто-инжект навигации (Настройки для auth, Админ для ADMIN) |
| `hero-3d.js`, `constructor-3d.js` | 3D-эффекты (главная / конструктор таблички) |
| `particles.js`, `ambient.js`, `reveal.js`, `transitions.js` | анимации фона/появления/переходов |
| `favicon.js`, `data.js` | динамический favicon / статические константы |

> Почти все файлы (кроме `person.js`) имеют локальную `escapeHtml`/`esc` — см. §14.

---

## 8. Telegram-бот (реальность vs ТЗ)

⚠️ **Важно для онбординга:** реальный `bot/index.js` **минимальный** и НЕ совпадает с
описанием в ТЗ/`docs/README.md`.

**Что бот реально умеет (по коду):**
- `/start` с payload `login_<token>` → подтверждает deep-link вход на сайт (`confirmLoginToken`).
- `/start` без payload и `/help` → приветствие.
- Любое сообщение от пользователя → relay в чат админа (`ADMIN_CHAT_ID`); сообщение от админа → ответ пользователю.
- `setMyCommands`: только `start` и `help`.

**Чего в коде НЕТ (хотя описано в ТЗ/README):**
- ❌ Визард создания страницы (12 шагов)
- ❌ Команды `/menu`, `/setpassword`, `/trash`, `/access`, `/my_profiles`
- ❌ Главное меню с кнопками

> Вывод: документация бота в `docs/README.md` — **аспирационная/устаревшая**. При
> продолжении работы либо реализовать визард, либо привести доку в соответствие.
> Имя в логах «SecureShip Bot» — артефакт копипаста, к проекту отношения не имеет.

`bot/lib/`: `tg-login.js` (подтверждение токенов), `relay.js` (пересылка+антифлуд),
`auth.js`, `prisma.js`.

---

## 9. Модель данных

Полная схема — `backend/prisma/schema.prisma`. Ключевые сущности:

- **User** — email+PBKDF2, `role` (USER/EDITOR/ADMIN), `telegramId`, `jwtVersion`
  (для отзыва токенов), `lastSeenAt`/`legacyInactivityDays` (legacy), GDPR `acceptedTermsAt`.
- **Profile** — `slug`(unique), ФИО/даты/место, `visibility`, `accessHash`, `coverPhotoId`,
  `familyNodeId`(1:1 с деревом), `deletedAt`(soft), `searchVector`(FTS).
- **ProfileAccess** — грант (`userId`, `canEdit`, `grantedBy`), unique [profile,user].
- **ProfileAccessCode** — ротируемые PIN (`codeHash`, `expiresAt`, `revokedAt`).
- **ContentBlock** — 6 типизированных блоков биографии (+CUSTOM), unique [profile,order].
- **GalleryItem** — фото-карусель. **GuestMemory** — воспоминания (`isApproved`).
- **CandleLight** — свечи (profile|null, fingerprint).
- **FamilyTree / FamilyClan / FamilyNode / FamilyConnection** — генеалогия.
  Связи: `PARENT`(from=родитель→to=ребёнок), `SPOUSE`(зеркальная), `ADOPTIVE`, `STEP`.
  Узел может ссылаться на Profile (зеркало `Profile.familyNodeId`).
- **TimelineEvent** — события (профиль | узел | HISTORICAL), `category`, soft-delete.
- **Media** — единое хранилище (IMAGE/AUDIO/VIDEO/DOCUMENT), обратные связи для purge.
- **QrPlaque** — заказы QR-табличек.
- **AuditLog** — журнал (70+ `AuditAction`), retention 90д.
- **ProfileDispute / ProfileMergeRequest** — споры и объединения (статусы см. enums).
- **LegacyContact / LegacyClaim** — наследование аккаунта.
- **TgLoginToken / PasswordResetToken** — одноразовые токены.

Исчерпывающие таблицы статусов/переходов и API — в `docs/README.md`.

---

## 10. Аутентификация и доступ

- JWT HS256 в `Authorization: Bearer ...` (фронт хранит в `localStorage`).
- Пароли/PIN: PBKDF2-SHA512, формат `iterations:saltHex:hashHex`, сравнение `timingSafeEqual`.
- Отзыв токенов: `User.jwtVersion` инкрементится при logout → старые токены 401.
- Visibility: `PUBLIC` (везде), `UNLISTED` (по ссылке), `PASSWORD` (PIN→HMAC access-token,
  заголовок `X-Profile-Access`), `PRIVATE` (owner+ADMIN+грант).
- RBAC сущности: `ProfileAccess.canEdit` даёт view/edit поверх visibility.

---

## 11. Рабочий процесс разработки

**Hot-reload (dev, через override):**
- `backend` — `node --watch index.js`: правки `.js` перезапускают процесс. Bind-mount `./backend:/app`.
- `frontend` — HTML/JS/CSS/images примонтированы в Caddy → правки видны **без пересборки** (F5).
- ⚠️ `bot` — НЕ bind-mount: после правок `docker compose up -d --build bot`.

**Полезное:**
```bash
docker compose logs -f backend          # логи
docker compose exec backend sh          # шелл в контейнере
docker compose exec backend npx prisma studio --port 5557   # GUI БД
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"  # SQL
```

**Миграции схемы:** правишь `schema.prisma` → `docker compose exec backend npx prisma migrate dev --name <имя>`.

**Git:** работаем в `origin/main` (moggerrescure/site). Перед параллельной работой
с другим агентом/человеком — коммить текущее состояние (точка отката).

---

## 12. Деплой

`deploy.sh` (на сервере) делает: git pull (с проверкой чистоты дерева) → pre-deploy
backup БД → build изменённых образов → `prisma migrate deploy` в one-off контейнере →
`up -d` → healthcheck `/health` (60с) → prune → Telegram-отчёт.

Флаги: `SKIP_BACKUP=1`, `SKIP_PULL=1`, `SKIP_MIGRATE=1`, `NO_CACHE=1`.
Откат — `rollback.sh`. **Прод запускать без override:** `docker compose -f docker-compose.yml ...`.

Caddy (`frontend/Caddyfile`): `:80` → проксирует `/api/*`, `/uploads/*`, `/p/*`,
`/sitemap.xml`, `/robots.txt`, `/health` на `backend:3000`; остальное — статика с
fallback `try_files {path} {path}.html /index.html`. TLS включится при добавлении домена.

---

## 13. Бэкапы и восстановление

Сервис `pg-backup` (`backup/backup.sh`): ежедневный `pg_dump` → `./backups/` + Telegram.

```bash
# принудительный бэкап
docker compose exec pg-backup /usr/local/bin/backup.sh

# восстановление из дампа (ОПАСНО — перезапишет данные)
gunzip -c backups/memory_YYYYMMDD_HHMMSS.sql.gz > /tmp/restore.sql
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /tmp/restore.sql
```

⚠️ **Урок этой сессии:** при переустановке/ресете Docker Desktop **именованные тома
удаляются** → база теряется. Перед операциями с Docker всегда делай дамп.
Слабые места бэкапа: лежат на том же диске; не бэкапятся `uploads/`.

---

## 14. Известные проблемы и баги

> Полный аудит — `docs/SESSION-2026-06-01-recovery-and-audit.md`. Кратко по приоритету:

**🔴 Критично**
1. **Stored XSS** в `frontend/js/person.js` — `buildMemoryCard()` и рендер шапки
   вставляют `item.text/author`, `person.name/bio/city` в `innerHTML` без экранирования
   (в файле нет `escapeHtml`). Гость → `<img onerror=...>` → угон JWT из localStorage.
2. **`legacyContactService.js`** — перепутаны аргументы `ApiError(409, '...')` (надо
   `ApiError('...', 409)`) на строках 150/170/219/262/265/302 → 500 вместо нужного кода.

**🟠 Высокое**
3. `POST /api/ai/chat` — без auth и rate-limit → слив платного AI-бюджета.
4. Загрузка файлов (`/upload-*`) анонимами до 200 МБ.
5. Brute-force PIN — `verify-code` / `verify-access-code` без rate-limit.
6. JWT-отзыв не покрывает токены без `jwtVersion` в payload (`auth.js:200`).

**🟡 Среднее**
7. Дубль `trust proxy` (`index.js`). 8. CORS бросает `Error` вместо `cb(null,false)`.
9. `JWT_SECRET` fallback вне prod. 10. Дубль `/people|/profiles/:id/photo`.
11. `qr.*` передаёт весь `req.headers`. 12. Воспоминания на PASSWORD без кода + без rate-limit.
13. Запрет межпоколенческого брака (из ТЗ) не реализован. 14. `disputeService` —
    `VALID_STATUSES_FOR_LIST` используется выше объявления.

**✅ Сделано хорошо:** PBKDF2+timingSafeEqual с версионированием, JWT без alg-confusion,
транзакции в merge/legacy, soft-delete+cron, purge orphan media, аудит, FTS.

---

## 15. Расхождения кода с документацией

При продолжении работы держи в голове, что `docs/README.md` местами опережает/отстаёт от кода:

| Утверждение в README | Реальность в коде |
|---|---|
| Бот: визард 12 шагов, `/trash`, `/access`, `/setpassword`, меню | Бота этого нет — только login + relay (§8) |
| Multer «memory storage» | `multer.diskStorage` (tmp-staging, фикс OOM) |
| `node prisma/seed.js` | Файла нет. Есть `seed-historical.js` и наши `scripts/seed-*.js` |
| «JWT с коротким TTL» | TTL по умолчанию 7 дней |
| 4 сервиса compose | Реально 5 (+`pg-backup`) |

> Рекомендация: при доработке фич сначала свериться с `schema.prisma` и `router.js`
> (источник истины), затем — с README.

---

*Документ составлен 2026-06-01 в ходе сессии восстановления данных и аудита.
Точка входа для нового разработчика — этот файл + `docs/README.md` + `schema.prisma`.*
