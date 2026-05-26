

## ⏳ БЭК — осталось

### Средние фичи (продолжение списка)

- **I. HISTORICAL events** — `TimelineEvent` с `category=HISTORICAL` без `profileId/familyNodeId`
    - Расширить `listEvents` фильтром `scope=historical|personal|all`
    - Валидация в `createEvent`: HISTORICAL без profileId/nodeId; non-HISTORICAL — обязательна хотя бы одна привязка
    - ADMIN-only для CRUD HISTORICAL
    - Возможно поля: `description`, `sourceUrl`, `wikipediaUrl`, `endYear` (range)
- **K. Audit log**
    - Новая таблица `AuditLog` (actorId, action, entityType, entityId, before, after, ip, userAgent, createdAt)
    - Middleware-обёртка для всех мутирующих роутов
    - GET /audit-log (ADMIN-only, с фильтрами)
    - Retention policy (опционально)
- **L. Photo cleanup**
    - Orphan media ([Media.id](http://Media.id) не привязана ни к `Profile.coverPhotoId`, `ContentBlock.photoId`, `GalleryItem.mediaId`, `GuestMemory.mediaId`, `FamilyNode.photoId`)
    - CLI-скрипт `npm run cleanup:photos` + dry-run flag
    - Удаление файла из `uploads/` + Media row
    - Опционально: cron-задача раз в неделю

### Безопасность / финал

- **GitHub Secret Scanning + GitGuardian alerts** — разобрать, ротировать секреты если нужно
- **2FA / TOTP** для ADMIN (опционально)
- **CORS** настроить production-домен
- **HTTPS / nginx reverse proxy** конфиг
- **Backups** — pg_dump cron + ротация (S3?)

---

## 🎨 ФРОНТ — что подключить к существующему бэку

### Уже работает на фронте (надо проверить, что не сломалось):

- Login / Register
- Список профилей (`/api/profiles`)
- Детальная страница профиля
- Создание/редактирование профиля
- Загрузка фото
- Family tree (если есть UI)
- Reviews, Candles

### Надо подключить (новый функционал бэка):

**Поиск и фильтры (D):**

- [ ]  Поле поиска `q` — debounce, отправка в `/api/profiles?q=...`
- [ ]  Фильтр по городу `city`
- [ ]  Range picker для годов рождения/смерти (`bornYearFrom/To`, `diedYearFrom/To`)
- [ ]  Селект gender (мужской/женский/неизвестно)
- [ ]  Селект visibility (PUBLIC/UNLISTED/PASSWORD/PRIVATE — для авторизованных)
- [ ]  Highlight FTS-совпадений в результатах (опционально)

**ProfileAccess (G):**

- [ ]  Страница «Управление доступом» на профиле (owner/ADMIN)
- [ ]  Список пользователей с доступом (роль: VIEWER/EDITOR/OWNER)
- [ ]  Поиск пользователя по email + кнопка «Выдать доступ»
- [ ]  Изменить роль (PATCH)
- [ ]  Отозвать доступ (DELETE)

**ProfileAccessCode (H):**

- [ ]  Раздел «Одноразовые коды» в управлении доступом (owner/ADMIN)
- [ ]  Список активных кодов с истечением
- [ ]  Кнопка «Создать код» (с label, expiresAt)
- [ ]  Кнопка «Отозвать» / «Удалить»
- [ ]  **Форма ввода кода** на странице профиля с `visibility=PASSWORD` (если юзер не owner/ADMIN)
    - POST `/api/profiles/:slug/verify-access-code` → получить accessToken
    - Сохранить в localStorage / sessionStorage
    - Передавать в заголовке `X-Profile-Access` или query `?accessToken=`

**Soft delete (J):**

- [ ]  Кнопка «Удалить в корзину» в профиле (вместо hard delete)
- [ ]  Страница `/trash` (owner видит свои, ADMIN — все)
- [ ]  Кнопка «Восстановить» на trash-странице
- [ ]  ADMIN-only: кнопка «Удалить навсегда» (`DELETE ?hard=true`)
- [ ]  Бейдж «В корзине» на профиле если open его owner/ADMIN

**Visibility flow:**

- [ ]  Селект visibility при создании/редактировании
- [ ]  Если выбран PASSWORD → отдельное поле для кода
- [ ]  Если PRIVATE → объяснение «только вы и админ»
- [ ]  Если UNLISTED → «не индексируется, доступ по ссылке»

**Family tree (F) — если есть UI:**

- [ ]  При удалении узла — клиент-side warning «удалятся связанные SPOUSE-связи»
- [ ]  При создании SPOUSE-связи — UI auto-mirror (если бэк уже делает обе стороны, фронт пусть просто рисует одну связь)

**Будущее (I, K, L):**

- [ ]  Историческая лента событий рядом с personal timeline
- [ ]  ADMIN-страница audit log с фильтрами
- [ ]  ADMIN-кнопка «Запустить очистку фото» + результаты dry-run

---

## 🤖 ТГ-БОТ — что надо

### Сейчас (из `bot/handlers/`):

- 5-этапный wizard создания профиля (ФИО → даты → главное фото → текст → 6 блоков → визибилити PUBLIC/UNLISTED)
- Загрузка фото в Media через `downloadAndCreateMedia`
- `getOrCreateBotUser` (создаёт User с email `tg_<id>@bot.local`)

### Надо добавить:

**Визибилити PASSWORD:**

- [ ]  В wizard на шаге visibility — третья кнопка «🔐 По паролю»
- [ ]  Если выбрана — попросить ввести код (4-8 символов)
- [ ]  При сохранении: `visibility=PASSWORD` + вызвать `accessCodeService.createCode` для одного кода
- [ ]  Прислать пользователю готовую ссылку + код

**Управление профилями:**

- [ ]  `/my_profiles` — список созданных пользователем профилей
- [ ]  Inline-кнопки: «Редактировать», «В корзину», «Управление доступом»
- [ ]  `/trash` — список soft-deleted с кнопкой «Восстановить»

**Управление доступом:**

- [ ]  `/access <slug>` — показать список грантов
- [ ]  «Создать новый код» — генерация + отправка
- [ ]  «Отозвать код»

**Бот-флоу (опционально):**

- [ ]  Уведомления когда кто-то оставил `GuestMemory` (если бот привязан к owner)
- [ ]  Команда `/stats` — total profiles, candles lit, и т.д.

---
