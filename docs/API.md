
# 📡 API Reference

Базовый URL (через Caddy): `http://localhost`
Прямой backend (внутри docker network): `http://backend:3000`

Все ответы JSON в формате `{ ok: boolean, ...data | error }`.

---

## Авторизация

```

Authorization: Bearer <jwt_token>

```

JWT (HS256) выдаётся при login / register, TTL 7 дней.

- **`requireAuth`** — 401 без токена
- **`optionalAuth`** — токен опционален; если есть и валиден — `req.user` заполняется
- **`requireAdmin`** — 403 не-ADMIN
- Роли: `USER`, `EDITOR`, `ADMIN`

---

## Доступ к защищённым профилям

Профили с `visibility=PASSWORD` требуют access token:

```

X-Profile-Access: <token>

```

или query param:

```

?accessToken=<token>

```

Токен получают через `POST /api/profiles/:idOrSlug/verify-access-code`.

---

## Health & Stats

### GET /api/health

```

{

"ok": true,

"service": "memorial-site-server",

"version": "2.0.0",

"node": "v24.13.0",

"env": "development",

"uptime": 12345,

"startedAt": "2026-05-26T10:00:00.000Z",

"time": "2026-05-26T10:42:00.000Z",

"db": { "ok": true, "latencyMs": 16 }

}

```

### GET /api/stats

```

{

"ok": true,

"data": { "people": 19, "reviews": 12, "candles": 237, "cities": 9 }

}

```

---

## Auth

| Метод | URL                  | Auth | Rate limit           |
| ----- | -------------------- | ---- | -------------------- |
| POST  | `/api/auth/register` | —    | `registerLimiter`    |
| POST  | `/api/auth/login`    | —    | `loginLimiter`       |
| GET   | `/api/auth/me`       | ✅   | `authGeneralLimiter` |

### POST /api/auth/register

```

// Request

{ "email": "[ivan@mail.ru](mailto:ivan@mail.ru)", "password": "123456", "displayName": "Иван" }

// Response 201

{ "ok": true, "token": "eyJ...", "user": { "id", "email", "displayName", "role" } }

```

### POST /api/auth/login

```

// Request

{ "email": "[ivan@mail.ru](mailto:ivan@mail.ru)", "password": "123456" }

// Response 200

{ "ok": true, "token": "eyJ...", "user": { ... } }

```

### GET /api/auth/me

```

{ "ok": true, "user": { "id", "email", "displayName", "role" } }

```

---

## Profiles (alias: `/people`)

Все маршруты доступны и по `/api/profiles/...`, и по `/api/people/...`.

| Метод   | URL                                | Auth         | Описание                          |
| ------- | ---------------------------------- | ------------ | --------------------------------- |
| GET     | `/api/profiles`                    | optionalAuth | Список + фильтры + пагинация      |
| POST    | `/api/profiles`                    | requireAuth  | Создать                           |
| GET     | `/api/profiles/trash`              | requireAuth  | Soft-deleted (см. ниже)           |
| GET     | `/api/profiles/:idOrSlug`          | optionalAuth | Детальная страница                |
| PUT     | `/api/profiles/:idOrSlug`          | requireAuth  | Обновить                          |
| DELETE  | `/api/profiles/:idOrSlug`          | requireAuth  | Soft delete (`?hard=true` ADMIN)  |
| POST    | `/api/profiles/:idOrSlug/restore`  | requireAuth  | Восстановить                      |
| POST    | `/api/profiles/:idOrSlug/photo`    | requireAuth  | Главное фото (multipart)          |

### GET /api/profiles

Query параметры:

| Параметр       | Тип    | Default | Описание                                              |
| -------------- | ------ | ------- | ----------------------------------------------------- |
| `page`         | int    | `1`     |                                                       |
| `limit`        | int    | `9`     | max `50`                                              |
| `q`            | string | —       | FTS-поиск (russian) по `fullName` / `bio` / `burialPlace` |
| `city`         | string | —       | `ILIKE %city%`                                        |
| `bornYearFrom` | int    | —       | 1..2999                                               |
| `bornYearTo`   | int    | —       |                                                       |
| `diedYearFrom` | int    | —       |                                                       |
| `diedYearTo`   | int    | —       |                                                       |
| `gender`       | string | —       | `MALE` / `FEMALE` / `UNKNOWN`                         |
| `visibility`   | string | —       | `PUBLIC` / `UNLISTED` / `PASSWORD` / `PRIVATE`        |
| `mine`         | bool   | `false` | `=1` → только профили, где `ownerId = req.user.id`    |

**Visibility-логика для списка:**
- Если `visibility` не задана: ADMIN → всё; USER → PUBLIC + свои; ANON → только PUBLIC
- Если задана и юзер — обычный USER: `PUBLIC` от всех; остальные visibility — только свои
- ANON может запросить только `PUBLIC`, иначе пустой результат
- Soft-deleted всегда исключены
- Заглушки `fullName = 'Новая страница'` исключены из публичного списка (но видны owner-у при `mine=1`)

```

// Response 200

{

"ok": true,

"data": [

{

"id": "cmpl...",

"slug": "ivanova-mariya-petrovna",

"name": "Иванова Мария Петровна",

"born": "12.03.1918",

"died": "05.11.1987",

"years": "1918 — 1987",

"city": "Минск",

"photo": "/uploads/...",

"bio": "...",

"gender": "female",

"visibility": "PUBLIC",

"deletedAt": null

}

],

"total": 19, "page": 1, "limit": 9, "pages": 3

}

```

### POST /api/profiles

```

// Request

{

"name": "Иванов Иван",

"born": "01.01.1950",

"died": "01.01.2020",

"city": "Москва",

"bio": "Краткая эпитафия...",

"gender": "MALE",

"visibility": "PUBLIC"

}

// Response 201

{ "ok": true, "data": { "id", "slug", ... } }

```

### GET /api/profiles/:idOrSlug

Принимает `id` (cuid) или `slug`. Для `visibility=PASSWORD` без owner/ADMIN возвращает teaser, пока не передан валидный `X-Profile-Access`.

```

{

"ok": true,

"data": {

"id", "slug", "name", "born", "died", "years", "city", "bio", "photo",

"gender", "visibility", "deletedAt",

"burial", "burial_query",

"sections": {

"childhood": { "title", "text", "image" },

"education": { ... },

"career":    { ... },

"family":    { ... },

"hobbies":   { ... },

"legacy":    { ... }

},

"media":   [{ "src", "caption" }],

"reviews": [{ "id", "author", "text", "photo" }],

"quotes":  []

}

}

```

**Teaser** (PASSWORD без доступа):

```

{

"ok": true,

"data": {

"id", "slug", "name", "born", "died", "years", "photo", "visibility",

"requiresAccessCode": true, "isProtected": true,

"sections": {}, "media": [], "reviews": [], "quotes": []

}

}

```

### PUT /api/profiles/:idOrSlug

Любое подмножество полей profile (см. POST). Пустая строка → `null` для optional полей.

### DELETE /api/profiles/:idOrSlug

- По умолчанию — **soft delete** (`deletedAt = now()`). Идемпотентно.
- `?hard=true` — **только ADMIN**, физическое удаление с CASCADE.

```

{ "ok": true }

```

### POST /api/profiles/:idOrSlug/photo

`multipart/form-data`, поле `photo` (jpg, png, webp). Max **200 MB**, проходит через Sharp resize → WebP.

```

{ "ok": true, "photo": "/uploads/abc.webp", "url": "/uploads/abc.webp" }

```

---

## Soft Delete / Trash

### GET /api/profiles/trash

ADMIN видит все soft-deleted. USER — только свои.

Query: `page`, `limit`.

```

{

"ok": true,

"items": [

{ "id", "slug", "name", "visibility", "deletedAt": "2026-05-26T10:42:48.464Z" }

],

"total": 1

}

```

### POST /api/profiles/:idOrSlug/restore

Сбрасывает `deletedAt`. Owner / ADMIN.

```

{ "ok": true, "data": { ...profile, "deletedAt": null } }

```

> 🤖 В TG-боте: `/trash` (W2) — корзина с restore / hard delete с confirm.

> ⏰ Cron: ежедневно в 03:00 Europe/Minsk soft-deleted >30 дней становятся hard-deleted автоматически (см. `backend/cron/cleanup.js`).

---

## Profile Access (индивидуальные гранты)

| Метод  | URL                                       | Auth |
| ------ | ----------------------------------------- | ---- |
| GET    | `/api/profiles/:idOrSlug/access`          | ✅   |
| POST   | `/api/profiles/:idOrSlug/access`          | ✅   |
| PATCH  | `/api/profiles/:idOrSlug/access/:userId`  | ✅   |
| DELETE | `/api/profiles/:idOrSlug/access/:userId`  | ✅   |

Только owner / ADMIN.

### POST .../access

```

// Request — принимается userId ИЛИ userEmail

{ "userEmail": "[user@example.com](mailto:user@example.com)", "canEdit": true }

// Response 201

{

"ok": true,

"data": {

"id", "profileId", "userId", "userEmail",

"canEdit": true, "grantedBy", "createdAt"

}

}

```

Поле `canEdit: Boolean` (`true` → редактор, `false` → только просмотр).

> 🤖 В TG-боте: `/access` (W3) — wizard email → уровень (view/edit) → upsert ProfileAccess.

### PATCH .../access/:userId

```

{ "canEdit": false }

```

---

## Profile Access Codes (одноразовые / по сроку)

| Метод  | URL                                                   | Auth      |
| ------ | ----------------------------------------------------- | --------- |
| GET    | `/api/profiles/:idOrSlug/access-codes`                | ✅ owner  |
| POST   | `/api/profiles/:idOrSlug/access-codes`                | ✅ owner  |
| POST   | `/api/profiles/:idOrSlug/access-codes/:codeId/revoke` | ✅ owner  |
| DELETE | `/api/profiles/:idOrSlug/access-codes/:codeId`        | ✅ owner  |
| POST   | `/api/profiles/:idOrSlug/verify-access-code`          | optional  |

### POST .../access-codes

```

// Request

{ "label": "Племянник Олег", "expiresAt": "2026-12-31T23:59:59Z" }

// Response 201 — единственный момент когда возвращается plain код

{ "ok": true, "data": { "id", "code": "X7K-9PL-A2", "label", "expiresAt", "createdAt" } }

```

`code` хранится в БД только как `codeHash` (PBKDF2-SHA512). **Сохрани сразу — потом не покажет.**

### POST .../verify-access-code

```

// Request

{ "code": "X7K-9PL-A2" }

// Response 200

{ "ok": true, "data": { "accessToken": "eyJ...", "expiresIn": 604800 } }

```

Полученный `accessToken` шлёшь дальше в `X-Profile-Access` при запросах деталки.

---

## Reviews / GuestMemory

| Метод  | URL                              | Auth      | Описание                            |
| ------ | -------------------------------- | --------- | ----------------------------------- |
| GET    | `/api/reviews/:personId`         | optional  | Только `isApproved=true` для ANON   |
| POST   | `/api/reviews/:personId`         | optional  | Создаётся неподтверждённым          |
| GET    | `/api/reviews/:personId/pending` | ✅ owner  | Очередь модерации                   |
| PUT    | `/api/reviews/:id/approve`       | ✅ owner  |                                     |
| PUT    | `/api/reviews/:id/reject`        | ✅ owner  |                                     |
| DELETE | `/api/reviews/delete/:id`        | ✅        |                                     |

```

// POST request

{ "author": "Екатерина, внучка", "text": "Бабушка была лучшей...", "mediaId": "..." }

// author ≤ 120, text ≤ 2000

```

---

## Candles

| Метод | URL                          | Auth     |
| ----- | ---------------------------- | -------- |
| GET   | `/api/candles?profileId=...` | —        |
| POST  | `/api/candles/light`         | optional |

```

// POST request

{ "profileId": "cmpl..." }

// Response

{ "ok": true, "count": 238, "lit": true }

```

Защита от спама: один CandleLight на профиль на (user OR fingerprint+IP) за сутки.

---

## Media uploads (универсальный)

| Метод | URL                  | Auth     | Поле формы | Допустимые типы |
| ----- | -------------------- | -------- | ---------- | --------------- |
| POST  | `/api/upload-photo`  | optional | `photo`    | image           |
| POST  | `/api/upload-audio`  | optional | `photo`    | audio           |
| POST  | `/api/upload-video`  | optional | `photo`    | video           |

```

{ "ok": true, "url": "/uploads/abc.webp", "id": "media-cuid" }

```

---

## Family Trees / Clans / Nodes / Connections

### Trees

| Метод   | URL                       | Auth         |
| ------- | ------------------------- | ------------ |
| GET     | `/api/family-trees`       | optionalAuth |
| POST    | `/api/family-trees`       | ✅           |
| GET     | `/api/family-trees/:id`   | optionalAuth |
| PUT     | `/api/family-trees/:id`   | ✅           |
| DELETE  | `/api/family-trees/:id`   | ✅           |

### Clans (требуют `treeId` query при list)

| Метод  | URL                            | Auth |
| ------ | ------------------------------ | ---- |
| GET    | `/api/family-clans?treeId=...` | ✅   |
| POST   | `/api/family-clans`            | ✅   |
| PUT    | `/api/family-clans/:id`        | ✅   |
| DELETE | `/api/family-clans/:id`        | ✅   |

### Nodes

| Метод  | URL                            | Auth | Примечание                                                |
| ------ | ------------------------------ | ---- | --------------------------------------------------------- |
| GET    | `/api/family-nodes?treeId=...` | ✅   |                                                           |
| POST   | `/api/family-nodes`            | ✅   |                                                           |
| PUT    | `/api/family-nodes/:id`        | ✅   |                                                           |
| DELETE | `/api/family-nodes/:id`        | ✅   | Автоматически удаляются связанные `FamilyConnection`      |

### Connections

| Метод  | URL                                  | Auth |
| ------ | ------------------------------------ | ---- |
| GET    | `/api/family-connections?treeId=...` | ✅   |
| POST   | `/api/family-connections`            | ✅   |
| DELETE | `/api/family-connections/:id`        | ✅   |

```

// POST family-connections request

{ "nodeAId": "...", "nodeBId": "...", "type": "PARENT", "color": "#c8a84b" }

// type ∈ PARENT | SPOUSE | ADOPTIVE | STEP

```

SPOUSE-связи зеркалируются автоматически (создание / удаление обеих сторон).

---

## Timeline Events

| Метод  | URL                                                  | Auth         |
| ------ | ---------------------------------------------------- | ------------ |
| GET    | `/api/timeline-events?treeId=&nodeId=&profileId=`    | optionalAuth |
| POST   | `/api/timeline-events`                               | ✅           |
| PUT    | `/api/timeline-events/:id`                           | ✅           |
| DELETE | `/api/timeline-events/:id`                           | ✅           |

```

// POST request

{

"treeId": "...", "nodeId": "...", "profileId": null,

"year": 1945, "month": 5, "day": 9,

"type": "AWARD",   // ∈ BIRTH|DEATH|MARRIAGE|EDUCATION|CAREER|RELOCATION|AWARD|HISTORICAL|CUSTOM

"title": "Орден Красной Звезды",

"subtitle": "За оборону Москвы",

"city": "Москва", "icon": "🎖"

}

```

> **HISTORICAL** события — без `nodeId`/`profileId`, ADMIN-only (в разработке, см. `docs/HANDOFF.md` → roadmap P1 backend / **I**).

---

## Person password (visibility=PASSWORD, упрощённый, единый код)

| Метод | URL                                  | Auth |
| ----- | ------------------------------------ | ---- |
| POST  | `/api/people/:id/set-code`           | ✅   |
| POST  | `/api/people/:id/unset-code`         | ✅   |
| POST  | `/api/people/:id/verify-code`        | —    |

Это «один пароль на страницу». Альтернатива — ротируемые **access codes** выше.

```

// set

{ "code": "BABUSHKA-2025" }

// verify

{ "code": "BABUSHKA-2025" }

// 200 { "ok": true, "accessToken": "..." }   ← для X-Profile-Access

// 403 { "ok": false, "error": "Неверный код" }

```

---

## SEO

| URL            | Описание                                                                |
| -------------- | ----------------------------------------------------------------------- |
| `/sitemap.xml` | `Cache-Control: 3600`, только `visibility=PUBLIC AND deletedAt IS NULL` |
| `/robots.txt`  | `Cache-Control: 86400`, отсылка к sitemap                               |

---

## Статика

| URL          | Источник             | Описание              |
| ------------ | -------------------- | --------------------- |
| `/uploads/*` | `backend/uploads/`   | Media-файлы (через Caddy → backend) |
| `/*`         | `frontend/` (`/srv` в контейнере) | Фронт (HTML/CSS/JS) — раздаёт Caddy |

---

## Коды ошибок

| Код | Значение                                  |
| --- | ----------------------------------------- |
| 400 | Невалидные данные                         |
| 401 | Не авторизован (нет/некорректный JWT)     |
| 403 | Доступ запрещён / неверный код            |
| 404 | Не найдено (или soft-deleted)             |
| 409 | Конфликт (email уже занят, дубликат slug) |
| 413 | Слишком большой файл                      |
| 429 | Rate limit                                |
| 500 | Внутренняя ошибка                         |

Формат ошибки:

```

{ "ok": false, "error": "profile_not_found" }

```

---

## Rate limits

| Эндпоинт              | Лимит                |
| --------------------- | -------------------- |
| `POST /auth/login`    | `loginLimiter`       |
| `POST /auth/register` | `registerLimiter`    |
| `GET /auth/me`        | `authGeneralLimiter` |

Конфиг в `backend/middleware/rateLimit.js`.

---

## CORS

`Access-Control-Allow-Origin: *`, методы `GET, POST, PUT, PATCH, DELETE, OPTIONS`.

⚠️ В проде заменить на whitelist домена.

---

## Telegram-бот (косвенно)

Бот не имеет HTTP-эндпоинтов — общается через Telegram Bot API и **напрямую с БД через Prisma**. См. `bot/index.js` и `docs/HANDOFF.md` § 4 для архитектуры.

Slash-команды (через `/` в TG):

| Команда         | Описание                                                                  |
|-----------------|---------------------------------------------------------------------------|
| `/start`        | Приветствие + главное меню                                                |
| `/menu`         | Показать главное меню                                                     |
| `/setpassword`  | W1: задать пароль PBKDF2 для веб-логина                                   |
| `/trash`        | W2: корзина soft-deleted страниц                                          |
| `/access`       | W3: выдача доступа другому юзеру                                          |
API_EOF

wc -l docs/API.md

git add docs/API.md
git status -s
git commit -m "docs: API.md v2 — справочник эндпоинтов под актуальную схему

Полное покрытие: health/stats, auth, profiles (с фильтрами q/city/year/
gender/visibility/mine + visibility-логика), soft delete + trash + restore,
ProfileAccess (canEdit:Boolean, не enum role), ProfileAccessCode с ротацией,
reviews, candles, media uploads, family trees/clans/nodes/connections,
timeline events, person password legacy, sitemap/robots, статика, коды
ошибок, rate limits, CORS. Упоминание W1/W2/W3 команд бота и ссылки на
HANDOFF.md."

git push origin main
git log --oneline -5
