
Контекст для агента, продолжающего разработку проекта «Память» (мемориальный сайт-летопись).

---

## 0. Тон общения и стиль работы

- Ответы по-русски, **без воды**, прямо.
- Формат: краткая мысль → код блоком → следующий шаг.
- При патче: **node/python heredoc с уникальным маркером + `node -c`/syntax check ДО деплоя**.
- Антипаттерны: `multi-replace()` без `/g`; `f-string` с `{}` для JS-объектов в Python (placeholder-конфликт); `&` background для тяжёлых команд (стирает stdout у `git status`); комбинировать `curl -w` с `| jq`.
- При `git add` — **всегда `git status` перед коммитом** и явно перечислять ВСЕ модифицированные файлы.

---

## 1. Окружение

- **Root**: `/Users/borisserzhanovich/projects/site`
- **Стек**: Node 24 + Express 4 + PostgreSQL 16 + Prisma 6.19 + Telegraf 4.16 + Caddy 2 + vanilla JS
- **Docker Compose** (всё крутится в контейнерах, не локально):
  | Service     | Container         | Image            | Порт      | Bind-mount?              |
  |-------------|-------------------|------------------|-----------|--------------------------|
  | `db`        | `memory-pg`       | postgres:16      | 5433→5432 | volume                   |
  | `backend`   | `memory-backend`  | site-backend     | 3000      | NO (rebuild для деплоя)  |
  | `bot`       | `memory-bot`      | site-bot         | —         | **NO** (rebuild!)        |
  | `frontend`  | `memory-frontend` | site-frontend    | 80        | NO (rebuild для деплоя)  |

- **Git**: github.com:moggerrescure/site, branch `main`, HEAD ≈ `28faf97` (на момент handoff).

---

## 2. Команды деплоя — ВАЖНО

```

# Backend: rebuild ~30-60s

docker compose up -d --build backend && sleep 6

# Bot: rebuild ~33-54s. RESTART НЕ работает — нет bind-mount!

docker compose up -d --build bot

# Frontend: Caddyfile + HTML/JS/CSS запекаются в образ → ТОЖЕ rebuild

docker compose up -d --build frontend && sleep 4

# Любой кратковременный copy для frontend (живёт до перезапуска):

docker compose cp frontend/js/memory.js frontend:/srv/js/memory.js

```

⚠️ **Bot session in-memory**: каждый rebuild = wipe всех активных wizards у юзеров.

⚠️ Frontend root в Caddy = **`/srv`** (НЕ `/srv/site`).

⚠️ НЕ запускай `docker compose up -d --build bot &` в background — `&` сожрёт stdout последующих команд.

---

## 3. Секреты (.env)

```

DATABASE_URL=postgresql://postgres:password@db:5432/memorial_site?schema=public

JWT_SECRET=sgjY8bbgaPz1Z/fl4VtMxge3CbW8H53V2IVVL0WADllQtzYjJGmOqGW6y2IRoA3A

BOT_TOKEN=8689960790:AAF4Jfcf0nfrPcegBbuIBpY0T9XCa49_PTg

SITE_URL=http://localhost

```

`bot/.env` отдельный с `BOT_TOKEN` и `DATABASE_URL`.

⚠️ Secrets в git — ротировать перед прод-деплоем.

---

## 4. Архитектура

### Backend (`backend/`)
- `index.js` — Express entry
- `router.js` (~500 строк, см. §8)
- `services/` — `profileService`, `accessService`, `accessCodeService`, `familyService`, `timelineService`, `mediaService`, `reviewService`, `candleService`, `codeService`
- `middleware/` — `auth.js` (optionalAuth, requireAuth, requireAdmin), `rateLimit.js`
- `lib/` — `slug.js` (транслит), `sitemap.js`, `prisma.js`
- `cron/cleanup.js` — `0 3 * * *` Europe/Minsk, retention: profiles=30d (hard-delete soft-deleted старше), audit=90d

### Frontend (`frontend/`)
- `*.html`: `index`, `memory`, `person`, `family-tree`, `timeline`, `audit`, `trash`
- `js/`: `api.js` (`API.get/post/put/patch/del/upload` — REQUIRES explicit `/api/` prefix), `memory.js` (фильтры+пагинация), `auth-ui.js`, `data.js` (offline fallback на 18 хардкод-людей), `nav.js`, `particles.js`, `reveal.js`, `favicon.js`
- `styles/`: `main.css`, `responsive.css`, `memory.css`, `memory-filters.css`
- Caddyfile: `/srv` root, `/api/*` + `/uploads/*` + `/sitemap.xml` + `/robots.txt` + `/health` → `backend:3000`

### Bot (`bot/`)
- Stack: Telegraf 4.16, in-memory `session()`
- `index.js` — entry + регистрация commands/handlers + setMyCommands
- `handlers/`:
  - `create-profile.js` — 10-step wizard (ФИО → даты → фото обязательно → эпитафия → 6 блоков → visibility)
  - `block-wizard.js` — 6 контент-блоков: childhood/education/career/family/hobbies/legacy
  - `my-pages.js` — список «📋 Мои страницы» + кнопка soft delete
  - `set-password.js` — `/setpassword` (W1)
  - `trash.js` — `/trash` (W2)
  - `access.js` — `/access` wizard (W3)
- `lib/`: `auth.js` (`getOrCreateBotUser` — email `tg_<id>@bot.local`), `dates.js`, `prisma.js` (бот ходит **напрямую в Prisma**, не через backend API!), `slug.js` (`generateUniqueSlug(fullName, prisma, excludeId?)` — **обязательно 2-й аргумент!**), `passwordHash.js` (PBKDF2-SHA512, salt как hex-string)
- `photo.js` — `downloadAndCreateMedia`
- MAIN_MENU 3 строки:
```

[🕯 Создать страницу памяти]

[📋 Мои страницы] [🔑 Пароль]

[🗑 Корзина] [❓ Помощь]

```
- TG `/` меню (setMyCommands): `/start`, `/menu`, `/access`, `/trash`
- Wizard steps: `setpw_input`, `access_email`, и др. от create-profile
- Callbacks: `setpw_cancel`, `trash_*`, `access_*`

---

## 5. Состояние БД (на момент handoff)

- profiles ≈ 21 (включая 2-3 актуальных + тестовые)
- Тестовый профиль W3-проверки: `ivanova-mariya-petro` (id `cmpn7trpe0003o401igdyucji`)
- ProfileAccess: `test@test.com` имеет canEdit=true к `ivanova-mariya-petro`
- FamilyTree=5, FamilyClan=11, FamilyNode=84, FamilyConnection=124

### Тестовые пользователи

| Email                          | Пароль       | Роль  | ID                                |
|--------------------------------|--------------|-------|-----------------------------------|
| `test@test.com`                | `12345678`   | ADMIN | `cmpliojj000029lmtcgif6rrs`       |
| `editor@test.com`              | `editor123`  | USER  | `cmpmhausl00009lgpctiwo4ag`       |
| `qeqwwe@gmail.com`             | —            | USER  | `cmpmxczvn0000o51ysfc9gpd2`       |
| `tg_875561554@bot.local`       | `qwerty12345`| TG    | (W1 verified, PBKDF2 hash)        |

### Миграции (история)

```

20260525161315_init

20260525163944_add_family_clan

20260525222700_add_profile_search_vector       # GENERATED tsvector (источник drift!)

20260526103015_add_profile_access_code_cascade # resolved --applied

20260526103200_add_profile_soft_delete         # resolved --applied

```

Drift workaround: `psql ALTER` напрямую + `prisma migrate resolve --applied <name>`.

---

## 6. Что СДЕЛАНО

### Backend (этапы 1–J + текущая сессия)

| ID | Фича | Статус |
|----|------|--------|
| 1–3 | Prisma-схема, нормализация | ✅ |
| FTS | GENERATED `searchVector` (russian) | ✅ |
| A | Slug-транслит `lib/slug.js` | ✅ |
| B | `/health` | ✅ |
| C | Rate limiting `middleware/rateLimit.js` | ✅ |
| D | Расширенный фильтр `/profiles` (city, born/died years, gender, visibility, mine) | ✅ |
| E | `/sitemap.xml` + `/robots.txt` `lib/sitemap.js` | ✅ |
| F | Family tree валидация + SPOUSE auto-mirror + cleanup edges при deleteNode | ✅ |
| G | ProfileAccess grants API (12 smoke) — `GET/POST/PATCH/DELETE /profiles/:id/access[/:userId]` | ✅ |
| H | ProfileAccessCode ротируемые коды (14 smoke) + `verify-access-code` → accessToken → `X-Profile-Access` | ✅ |
| J | Soft delete Profile (13 smoke) — `deletedAt`, `?hard=true` (ADMIN), `/profiles/trash`, `/restore` | ✅ |
| **M** | **Cleanup cron (`cron/cleanup.js`)** | ✅ |

### Telegram бот (текущая сессия W1-W3)

| ID | Фича | Статус | Commit |
|----|------|--------|--------|
| W1 | `/setpassword` — PBKDF2-SHA512, salt hex | ✅ | `9cc580b` |
| W2 | `/trash` — soft delete + restore + hard delete с confirm | ✅ | `e18b784` |
| W3 | `/access` — wizard email → level (view/edit) → upsert ProfileAccess | ✅ | `e18b784` |
| — | `setMyCommands` (`/start /menu /access /trash`) | ✅ | `e18b784` |
| — | Hotfix `generateUniqueSlug(fullName, prisma)` 2-й аргумент | ✅ | post-`e18b784` |

### Фронт (текущая сессия)

| Фича | Статус | Commit |
|------|--------|--------|
| Фильтры пол/видимость/годы смерти в `memory.html` | ✅ | `28faf97` |
| Скрытие пустых заглушек «Новая страница» из public list | ✅ | `28faf97` |
| Caddy `/uploads/*` proxy (картинки работают) | ✅ | (часть `28faf97`) |

---

15. **Летопись** (`timeline.html` сейчас пустая) — хронология всех событий + фильтры по эпохам.
16. **QR-коды** для памятников: генерация + PDF-печать. ~1-2 дня.

### ⚙️ Прод/инфра (отдельная задача)

- GitHub Secret Scanning + GitGuardian, **ротация секретов** (JWT_SECRET, BOT_TOKEN, DB password)
- CORS whitelist, HTTPS/nginx, pm2/systemd (или Docker compose в prod-режиме)
- `pg_dump` cron бэкапы
- Health-checks для docker compose (сейчас только у db)

### 📚 Документация

- ✅ Этот `docs/HANDOFF.md`
- ⚠️ `README.md` корневой — обновить под Docker compose
- `docs/API.md` — endpoints (если не написан — добавить)
- `docs/MIGRATION.md` — с drift workaround
- `docs/DEPLOYMENT.md`
- `bot/README.md`, `backend/README.md`
- `CHANGELOG.md`

---

## 8. Структура `backend/router.js` (~500 строк)

```

// requires

const { profileService, reviewService, candleService, codeService,

mediaService, familyService, timelineService,

accessService, accessCodeService, prisma, auth, rateLimit } = ...

// Helpers

const ok  = (res, data, code=200) => res.status(code).json({ ok: true, ...data })

const err = (res, status, msg)    => res.status(status).json({ ok: false, error: msg })

function wrap(fn) {

return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

}

// Handler-функции: listHandler / detailHandler / createHandler / updateHandler / deleteHandler

// ВАЖНО: PROFILE TRASH/RESTORE блок идёт ПЕРЕД циклом регистрации

// (иначе /profiles/trash поглощается /profiles/:id)

// Цикл регистрирует CRUD на обоих базах

for (const base of ['/people', '/profiles']) {

router.get   (`${base}/:id`, optionalAuth, wrap(detailHandler))

[router.post](http://router.post)  (`${base}`,     requireAuth,  wrap(createHandler))

router.patch (`${base}/:id`, requireAuth,  wrap(updateHandler))

router.delete(`${base}/:id`, requireAuth,  wrap(deleteHandler))

// ...

}

// DELETE с hard:

// deleteProfile([req.params.id](http://req.params.id), req.user, { hard: req.query.hard === 'true' })

```

**`ok(res, data)` flattens to `{ok:true, ...data}`** — `listHandler` кладёт items в `data:` ключ интенционально (фронт парсит `r.data` как массив).

---

## 9. Enums (`schema.prisma`)

```

enum UserRole          { USER  EDITOR  ADMIN }

enum Gender            { MALE  FEMALE  UNKNOWN }

enum Visibility        { PUBLIC  UNLISTED  PASSWORD  PRIVATE }

enum RelationType      { PARENT  SPOUSE  ADOPTIVE  STEP }

enum TimelineCategory  { BIRTH DEATH MARRIAGE EDUCATION CAREER RELOCATION AWARD HISTORICAL CUSTOM }

enum BlockType         { ... }   // childhood/education/career/family/hobbies/legacy

enum MemoryType        { ... }

enum MediaKind         { ... }

```

### Profile schema (ключевые поля)
```

id, slug (unique), fullName, birthDate, deathDate,

birthPlace, deathPlace, burialPlace, burialLat, burialLng,

bio, coverPhotoId, gender, visibility, accessHash, ownerId,

familyNodeId,

deletedAt (DateTime?), @@index([deletedAt])

// поля deletedByUserId НЕТ

```

### ProfileAccess schema
```

id, profileId (Cascade), userId (Cascade), grantedBy (Restrict),

canEdit (Boolean default false), createdAt,

@@unique([profileId, userId])

```

### accessService функции
- `listGrants(slug, actor)`
- `addGrant(slug, {userId|userEmail, canEdit}, actor)`
- `updateGrant(...)`
- `removeGrant(...)`

### profileService функции (с line refs)
- L217 `listProfiles(opts)` — фильтрация + пагинация (FAST PATH + FTS PATH)
- L378 `listDeletedProfiles(...)`
- L441 `createProfile(...)`
- L492 `updateProfile(...)`
- L540 `deleteProfile(id, actor, {hard})`
- L568 `restoreProfile(...)`

---

## 10. Frontend fallback-цепочка (для person.html)

1. API `/api/people/:id`
2. Telegram-бот `/bot-data/pages/{uuid}.json` (опционально)
3. `js/data.js` — хардкод 18 людей (offline-фолбэк)

---

## 11. Ключевые инварианты и подводные камни

- **`API.get/post/put/patch/del/upload`** требует **явный `/api/` префикс** в пути.
- **`ok(res, data)`** flattens — `data` это спред, не вложение.
- **`listHandler`** возвращает items под ключом **`data`** (не `data.items`).
- **Python heredoc**: НИКОГДА `f-string` с `{}` для JS-объектов — placeholder-конфликт.
- **`node -c`** через docker для syntax check ДО деплоя.
- **Frontend hot-update**: `docker compose cp` (живёт до restart) ИЛИ `up -d --build frontend`.
- **Backend hot-update**: только `up -d --build backend` + `sleep 6-8`.
- **Bot hot-update**: ТОЛЬКО `up -d --build bot` (~33-54s). `restart` НЕ работает — НЕТ bind-mount.
- **Bot session in-memory**: каждый rebuild = wipe всех активных wizards.
- **W1**: salt в PBKDF2 как **hex-string** (совместимость с backend `passwordHash`).
- **W2**: только `deletedAt` (поля `deletedByUserId` НЕТ в схеме).
- **`generateUniqueSlug(fullName, prisma, excludeId?)`** — всегда передавать `prisma` 2-м аргументом!
- **`git status` перед каждым коммитом** — обязательно. Явно перечислять ВСЕ модифицированные файлы.
- **НЕ `&` background** для тяжёлых команд — сожрёт stdout у git status.
- **При drift schema↔БД**: `psql ALTER` + `prisma migrate resolve --applied <name>`.
- **Util-скрипты** класть в `backend/`, не в `/tmp`.
- **НЕ комбинировать** `curl -w` с `| jq`.

---

## 12. Следующий шаг (рекомендация)

**Самое маленькое и полезное на следующую сессию:**
1. **W4** (раздел «Где я редактор» в боте) — 30 мин
2. **Tech debt cleanup** (.bak, project_structure → .gitignore) — 30 мин
3. → коммит + push → tag `v0.3-mvp`

**Если есть час свободного:**
- + начать **I (HISTORICAL events)** на бэке

**Если планируется большой спринт:**
- декомпозировать **TG Mini App** (как просил юзер в этой сессии — отложил на потом)

---

_Last updated: 2026-05-27 02:00 (после коммита `28faf97` UX фронта)._
HANDOFF_EOF

git add docs/HANDOFF.md
git status -s
git commit -m "docs: HANDOFF.md — компактный handoff для следующих сессий

Покрывает: окружение (Docker compose, 4 сервиса), команды деплоя
(с предупреждениями про bot no-bind-mount + frontend root /srv),
секреты, архитектуру (backend/frontend/bot), миграции и drift workaround,
тестовых юзеров, что сделано (этапы 1-J + W1-W3 + фильтры + caddy uploads),
roadmap по приоритетам P0-P3, структуру router.js, enums, ключевые
инварианты и подводные камни всей сессии."

git push origin main
git log --oneline -3
echo ""
echo "=== Файл создан ==="
ls -la docs/HANDOFF.md
wc -l docs/HANDOFF.md
