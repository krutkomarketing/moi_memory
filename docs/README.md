
# 🕯️ Память — Мемориальный сайт-летопись

Веб-платформа для создания мемориальных страниц: биографии, фотографии, воспоминания близких, родословное древо и хроника рода.

---

## Стек

**Бэкенд**
- Node.js 24+, Express 4
- PostgreSQL 16 + Prisma ORM 6.19
- JWT (HS256), PBKDF2-SHA512
- Multer 2 (memory storage), Sharp (resize / WebP)
- Postgres FTS (`tsvector` + `to_tsquery('russian', ...)`)
- express-rate-limit
- node-cron (cleanup 03:00 Europe/Minsk)

**Бот**
- Telegraf 4 (Telegram Bot API)
- Тот же Prisma Client, та же БД (напрямую, не через backend API)

**Фронт**
- Vanilla JavaScript (ES6+), без сборки
- CSS без препроцессоров
- Canvas (частицы), SVG (древо, лиана памяти)

**Инфра**
- Docker Compose: 4 сервиса (`db` / `backend` / `bot` / `frontend`)
- Caddy 2 (frontend reverse-proxy на `/api/*`, `/uploads/*`)

---

## Архитектура (Docker Compose)

| Service     | Container         | Image            | Порт      |
|-------------|-------------------|------------------|-----------|
| `db`        | `memory-pg`       | postgres:16      | 5433→5432 |
| `backend`   | `memory-backend`  | site-backend     | 3000      |
| `bot`       | `memory-bot`      | site-bot         | —         |
| `frontend`  | `memory-frontend` | site-frontend    | 80        |

Структура репо:
```

backend/    — Express API + Prisma + cron

bot/        — Telegraf-бот

frontend/   — статика (HTML/JS/CSS), Caddyfile

docs/       — документация

docker-compose.yml

```

---

## Страницы сайта

| Страница       | Файл               | Описание                                                |
| -------------- | ------------------ | ------------------------------------------------------- |
| Главная        | `index.html`       | Статистика, последние добавленные                       |
| Каталог        | `memory.html`      | Поиск (FTS), фильтры (год/город/пол/видимость), пагинация |
| Персональная   | `person.html`      | Hero + 6 контент-блоков + воспоминания + карта          |
| Древо семьи    | `family-tree.html` | SVG-древо с кланами и поколениями _(заглушка)_          |
| Летопись       | `timeline.html`    | Хроника рода + исторические события _(заглушка)_        |
| Корзина        | `trash.html`       | Soft-deleted профили _(заглушка)_                       |

---

## Модель данных (ключевое)

**Profile** (мемориальная страница):
- `slug` (unique) — для URL `/person.html?id=ivanova-mariya-petrovna`
- `fullName`, `birthDate`, `deathDate`, `burialPlace`, `bio`, `gender`
- `visibility` — `PUBLIC | UNLISTED | PASSWORD | PRIVATE`
- `accessHash` — PBKDF2 пароль для PASSWORD-страниц
- `ownerId` — владелец
- `deletedAt` — soft delete (см. ниже)
- `searchVector` — Postgres `tsvector` GENERATED (FTS)
- `familyNodeId` — привязка к узлу в дереве (1:1)
- relations: `blocks`, `galleryItems`, `guestMemories`, `candleLights`, `accessGrants`, `accessCodes`, `timelineEvents`

**ProfileAccess** — индивидуальный доступ (`userId`, `canEdit: Boolean`, `grantedBy`).

**ProfileAccessCode** — ротируемые одноразовые коды (`codeHash`, `expiresAt`, `revokedAt`, `onDelete: CASCADE`).

**FamilyTree / FamilyClan / FamilyNode / FamilyConnection** — генеалогия (PARENT, SPOUSE, ADOPTIVE, STEP).

**TimelineEvent** — события (BIRTH, DEATH, MARRIAGE, EDUCATION, CAREER, RELOCATION, AWARD, HISTORICAL, CUSTOM).

**GuestMemory** — модерируемые воспоминания (`isApproved`).

**CandleLight** — счётчик «зажжённых свечей» (по profile / user / fingerprint).

**Media** — единое хранилище файлов (image / audio / video).

**User** — учётка (email + PBKDF2 password), роль `USER | EDITOR | ADMIN`. Telegram-юзеры регистрируются с email `tg_<telegram_id>@bot.local`.

**AuditLog** — _(планируется)_ журнал операций.

Полная схема: `backend/prisma/schema.prisma`.

---

## Аутентификация и роли

- **Регистрация / Login** — email + пароль (PBKDF2-SHA512, salt hex), JWT в `Authorization: Bearer ...`
- **Telegram-юзеры** — бот создаёт `User` с email `tg_<telegram_id>@bot.local`. Команда `/setpassword` (W1) задаёт пароль, после чего можно логиниться через веб.
- **Роли**: `USER` (дефолт), `EDITOR`, `ADMIN`
- **Middleware**: `requireAuth` (401 без токена), `optionalAuth` (читает токен если есть), `requireAdmin` (403 не-ADMIN)

---

## Visibility model

| visibility | Кто видит                                                              |
| ---------- | ---------------------------------------------------------------------- |
| `PUBLIC`   | все, в sitemap, в каталоге                                              |
| `UNLISTED` | только по прямой ссылке, не в каталоге, не в sitemap                    |
| `PASSWORD` | по ссылке + ввод кода → получает access token                          |
| `PRIVATE`  | только owner, гранты `ProfileAccess` и ADMIN                            |

Дополнительно: `ProfileAccess` грант (`canEdit: true|false`) даёт указанному юзеру view/edit-доступ независимо от visibility. `ProfileAccessCode` — одноразовые / по сроку коды, выпускаются owner-ом.

---

## Soft delete

- `Profile.deletedAt` — заполняется при `DELETE /api/profiles/:id` (по умолчанию soft)
- `?hard=true` (ADMIN-only) — физическое удаление через `prisma.profile.delete` → CASCADE на `ProfileAccessCode` и т.д.
- Soft-deleted профили **не видны** в:
  - публичном list / detail
  - sitemap.xml
  - access services (404 на access-codes / access endpoints)
- Owner / ADMIN видит `deletedAt` через `GET /api/profiles/:idOrSlug` (200)
- `GET /api/profiles/trash` — список (ADMIN видит все, owner — свои)
- `POST /api/profiles/:idOrSlug/restore` — сбрасывает `deletedAt`
- **Cron**: ежедневно в 03:00 Europe/Minsk soft-deleted >30 дней становятся hard-deleted; AuditLog >90 дней удаляются.

В TG-боте доступно как команда `/trash` (W2): просмотр корзины → restore → или confirm hard delete.

---

## Полнотекстовый поиск (FTS)

- `Profile.searchVector` — `tsvector GENERATED ALWAYS AS (to_tsvector('russian', fullName || ' ' || bio || ' ' || burialPlace))`
- Поиск: `to_tsquery('russian', 'иван:* & петров:*')` + `ts_rank_cd`
- Триггерится при `?q=...`. Без `q` — FAST PATH (Prisma findMany).
- Фильтры применяются на обеих путях: `city`, `bornYearFrom/To`, `diedYearFrom/To`, `gender`, `visibility`, `mine`.
- Заглушки `fullName = 'Новая страница'` исключаются из публичного листинга (но видны owner-у при `mine=1`).

---

## Запуск (dev)

```

# 1. Клон + env

git clone [git@github.com](mailto:git@github.com):moggerrescure/site.git

cd site

cp .env.example .env          # JWT_SECRET, DATABASE_URL, SITE_URL

cp bot/.env.example bot/.env  # BOT_TOKEN, DATABASE_URL

# 2. Поднять всё (db + backend + bot + frontend)

docker compose up -d --build

sleep 6

docker compose ps    # все 4 контейнера UP

# 3. Применить миграции (первый раз)

docker compose exec backend npx prisma migrate deploy

# 4. (опционально) Засеять demo-данные

docker compose exec backend node prisma/seed.js

```

Доступно: `http://localhost/` (frontend), `http://localhost/api/health` (backend healthcheck), Telegram-бот активен.

### Обновление сервисов

```

# Backend: rebuild ~30s

docker compose up -d --build backend && sleep 6

# Bot: rebuild ~30-50s. RESTART НЕ работает (нет bind-mount!)

docker compose up -d --build bot

# Frontend: Caddyfile + HTML/JS/CSS запекаются в образ

docker compose up -d --build frontend && sleep 4

```

⚠️ Bot session in-memory — каждый rebuild **сбрасывает все активные wizards** у юзеров.

---

## Основные API эндпоинты

| Метод  | Путь                                              | Кто      | Описание                                                                       |
| ------ | ------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| GET    | `/api/health`                                     | все      | uptime + db latency                                                            |
| POST   | `/api/auth/register`                              | все      | rate-limited                                                                   |
| POST   | `/api/auth/login`                                 | все      | rate-limited                                                                   |
| GET    | `/api/auth/me`                                    | auth     |                                                                                |
| GET    | `/api/profiles`                                   | optional | `q, city, bornYearFrom/To, diedYearFrom/To, gender, visibility, mine, page, limit` |
| POST   | `/api/profiles`                                   | auth     | создать (черновик `fullName: 'Новая страница'` допустим)                       |
| GET    | `/api/profiles/:idOrSlug`                         | optional | header `X-Profile-Access` для PASSWORD                                         |
| PUT    | `/api/profiles/:id`                               | auth     |                                                                                |
| DELETE | `/api/profiles/:id?hard=true`                     | auth     | hard только для ADMIN                                                          |
| GET    | `/api/profiles/trash`                             | auth     | ADMIN: все, USER: свои                                                          |
| POST   | `/api/profiles/:idOrSlug/restore`                 | auth     |                                                                                |
| GET    | `/api/profiles/:idOrSlug/access`                  | auth     | список грантов                                                                 |
| POST   | `/api/profiles/:idOrSlug/access`                  | auth     | выдать доступ (`userId|userEmail`, `canEdit`)                                  |
| PATCH  | `/api/profiles/:idOrSlug/access/:userId`          | auth     | изменить уровень                                                               |
| DELETE | `/api/profiles/:idOrSlug/access/:userId`          | auth     |                                                                                |
| GET    | `/api/profiles/:idOrSlug/access-codes`            | auth     | список кодов                                                                   |
| POST   | `/api/profiles/:idOrSlug/access-codes`            | auth     | создать код                                                                    |
| POST   | `/api/profiles/:idOrSlug/access-codes/:id/revoke` | auth     |                                                                                |
| DELETE | `/api/profiles/:idOrSlug/access-codes/:id`        | auth     |                                                                                |
| POST   | `/api/profiles/:idOrSlug/verify-access-code`      | optional | → `{ accessToken }` для X-Profile-Access                                       |
| *      | `/api/family-trees`, `/family-nodes`, `/family-connections`, `/family-clans` | auth | CRUD генеалогии |
| GET    | `/api/timeline-events?treeId/nodeId/profileId`    | optional |                                                                                |
| GET    | `/api/reviews/:personId`                          | optional |                                                                                |
| POST   | `/api/reviews/:personId`                          | optional | требует модерации                                                              |
| GET    | `/api/candles?profileId=...`                      | все      |                                                                                |
| POST   | `/api/candles/light`                              | optional |                                                                                |
| GET    | `/sitemap.xml`                                    | все      | только `visibility=PUBLIC AND deletedAt IS NULL`                               |
| GET    | `/robots.txt`                                     | все      |                                                                                |
| GET    | `/uploads/*`                                      | все      | загруженные фото (проксируется Caddy → backend)                                |

Полный справочник: `docs/API.md` _(WIP)_.

---

## Telegram-бот

### Главное меню (3 строки кнопок)

```

[🕯 Создать страницу памяти]

[📋 Мои страницы]  [🔑 Пароль]

[🗑 Корзина]       [❓ Помощь]

```

### Slash-команды (через `/` в TG-меню)

| Команда         | Описание                                                                  |
|-----------------|---------------------------------------------------------------------------|
| `/start`        | Приветствие + главное меню                                                |
| `/menu`         | Показать главное меню                                                     |
| `/setpassword`  | **W1**: задать пароль PBKDF2 для веб-логина (`tg_<id>@bot.local`)         |
| `/trash`        | **W2**: корзина soft-deleted страниц → restore / hard delete с confirm    |
| `/access`       | **W3**: выдача view/edit-доступа другому юзеру по email                   |

### Wizard создания мемориальной страницы (10 шагов)

1. ФИО
2. Даты жизни
3. Главное фото (обязательно)
4. Эпитафия (10–500 символов)
5–10. Шесть блоков: детство → образование → карьера → семья → хобби → наследие (текст + опционально фото + опционально цитата)
11. Превью + visibility (`PUBLIC` / `UNLISTED`)
12. Публикация

> _В планах:_ PASSWORD-шаг с генерацией access-кода; раздел «Где я редактор» в `/my_profiles`.

Бот сохраняет напрямую в ту же Postgres через Prisma. `User` создаётся автоматически.

---

## Frontend ↔ Backend integration

Фронт работает на vanilla JS, обращается к `/api/*` через `js/api.js` (`API.get/post/put/patch/del/upload` — требует явный `/api/` префикс).

**Подключено:**
- список / detail профилей, login / register, отзывы, свечи, базовый поиск, family tree (заглушка)
- **расширенные фильтры каталога** (`memory.html`): `q`, `bornYear`, `diedYear`, `gender`, `visibility`, `mine`, пагинация
- скрытие пустых заглушек «Новая страница» из public list
- soft delete через TG-бот (`/trash` W2)
- выдача доступа через TG-бот (`/access` W3)

**Готово на бэке, но ещё не интегрировано на веб-фронт:**
- управление доступом (`ProfileAccess`) — UI на странице профиля для выдачи / отзыва
- одноразовые коды (`ProfileAccessCode`) — UI создания / отзыва + форма ввода кода
- soft delete UI веб (корзина, восстановление, hard delete для ADMIN) — есть `trash.html` заглушка
- visibility=PASSWORD форма ввода → `X-Profile-Access` header

---

## Безопасность

- Все секреты в `.env` (не в репо), `.gitignore` исключает `.env`
- PBKDF2-SHA512 для паролей и для `accessHash` / `codeHash` (salt как hex-string)
- JWT с коротким TTL, `JWT_SECRET` 256+ бит
- Rate limiting на `/auth/login`, `/auth/register`, общий
- CASCADE FK для child-таблиц, чтобы не оставлять orphan-строки
- Soft delete по умолчанию (hard только для ADMIN с `?hard=true`)

⚠️ Перед прод-деплоем — **ротировать все секреты**, настроить HTTPS, включить CORS whitelist, GitGuardian / GitHub Secret Scanning.

---

## Roadmap

См. `docs/HANDOFF.md` — полный приоритизированный список того что осталось.

Короткая выжимка:
- **P0**: W4 (раздел «Где я редактор» в боте), tech debt cleanup, onboarding для Ivan
- **P1 backend**: I (HISTORICAL events), K (Audit log), L (Photo cleanup)
- **P1 frontend**: интеграция grants/codes UI, trash UI, PASSWORD-форма
- **P2**: TG Mini App (отдельный спринт ~неделя)
- **P3**: реальное древо семьи, летопись, QR-коды, SaaS-монетизация

---

## Документация

- `README.md` — этот файл, обзор
- `docs/HANDOFF.md` — детальный контекст для следующего агента/разработчика
- `docs/API.md` — справочник эндпоинтов _(WIP)_
- `docs/MIGRATION.md` — workaround для Prisma drift _(WIP)_
- `docs/DEPLOYMENT.md` — продовый чеклист _(WIP)_

---

## Лицензия / контрибьюторы

Внутренний проект. Контрибьюторы: владелец репо, Ivan _(подключается через sparse-checkout)_.
README_EOF

# Syntax-проверки нет (markdown), но размер
wc -l README.md

git add README.md
# Если есть незакоммиченый HANDOFF.md — берём и его
git add docs/HANDOFF.md 2>/dev/null || true
git status -s

git commit -m "docs: README v2 + HANDOFF.md под актуальное состояние

README обновлён под Docker compose с 4 сервисами (db/backend/bot/frontend),
структуру backend/ вместо server/, фичи сессии (W1 /setpassword, W2 /trash,
W3 /access), расширенные фильтры каталога (gender/visibility/diedYear),
скрытие заглушек, cron cleanup, команды деплоя с предупреждениями про
no-bind-mount у bot. Roadmap вынесен в docs/HANDOFF.md (приоритеты P0-P3)."

git push origin main
git log --oneline -5
