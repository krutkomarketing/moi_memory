# 🗄️ База данных — Схема и Архитектура

## Текущая БД (v1) — SQLite

Файл: `server/data/memory.db`
Движок: `node:sqlite` (встроенный Node.js 24+)

### Таблицы v1

#### users
| Поле | Тип | Описание |
|------|-----|----------|
| id | TEXT PK | UUID |
| name | TEXT | Имя пользователя |
| email | TEXT UNIQUE | Email для входа |
| password | TEXT | PBKDF2 хеш |
| role | TEXT | member / admin |
| created_at | TEXT | Дата регистрации |

#### people
| Поле | Тип | Описание |
|------|-----|----------|
| id | TEXT PK | Slug (ivanova-maria) |
| name | TEXT | ФИО |
| born | TEXT | Дата рождения (12.03.1918) |
| died | TEXT | Дата смерти |
| city | TEXT | Город |
| bio | TEXT | Биография (одно поле) |
| photo | TEXT | URL фото (/uploads/...) |
| burial | TEXT | Место захоронения |
| burial_query | TEXT | Запрос для Google Maps |
| created_at | TEXT | Дата создания |
| updated_at | TEXT | Дата обновления |

#### reviews
| Поле | Тип | Описание |
|------|-----|----------|
| id | TEXT PK | UUID |
| person_id | TEXT FK | → people.id (CASCADE) |
| author | TEXT | Имя автора |
| text | TEXT | Текст воспоминания |
| created_at | TEXT | Дата создания |

#### person_codes
| Поле | Тип | Описание |
|------|-----|----------|
| person_id | TEXT PK FK | → people.id (CASCADE) |
| code | TEXT | 4-16 символов, код доступа |
| created_at | TEXT | Дата создания |

#### candles (будет удалена)
| Поле | Тип | Описание |
|------|-----|----------|
| id | INTEGER PK | Всегда 1 |
| count | INTEGER | Счётчик свечей |

---

## Целевая БД (v2) — PostgreSQL + Prisma

Файл схемы: `server/prisma/schema.prisma`

### Модели v2

#### User (Владелец профиля)
| Поле | Тип | Описание |
|------|-----|----------|
| id | Int PK | Автоинкремент |
| telegramId | String UNIQUE | ID из Telegram |
| createdAt | DateTime | Дата регистрации |

Связи: один ко многим → Profile

#### Profile (Мемориальная страница)
| Поле | Тип | Описание |
|------|-----|----------|
| id | String PK | UUID (для QR-кода) |
| ownerId | Int FK | → User.id |
| fullName | String | ФИО |
| dates | String | Даты жизни |
| mainText | Text | Эпитафия / основной текст Hero-блока |
| mainPhotoUrl | String? | URL главного фото (S3) |
| createdAt | DateTime | Дата создания |
| updatedAt | DateTime | Последнее обновление |

Связи:
- belongs to User (onDelete: Cascade)
- has many ContentBlock
- has many GuestMemory

Индексы: `[ownerId]`

#### ContentBlock (Зебра-блоки)
| Поле | Тип | Описание |
|------|-----|----------|
| id | Int PK | Автоинкремент |
| profileId | String FK | → Profile.id |
| text | Text | Текст блока |
| imageUrl | String? | URL фото к блоку |
| order | Int | Порядковый номер (1-6) |
| createdAt | DateTime | Дата создания |

Связи: belongs to Profile (onDelete: Cascade)
Индексы: `[profileId, order]`

**Важно**: `order` определяет шахматную раскладку на фронтенде:
- Нечётные (1, 3, 5) — текст слева, фото справа
- Чётные (2, 4, 6) — фото слева, текст справа

Стандартные 6 блоков:
1. Детство и юность
2. Образование
3. Профессиональный путь
4. Семья
5. Хобби и увлечения
6. Наследие

#### GuestMemory (Воспоминания посетителей)
| Поле | Тип | Описание |
|------|-----|----------|
| id | Int PK | Автоинкремент |
| profileId | String FK | → Profile.id |
| authorName | String | Имя автора |
| memoryText | Text | Текст воспоминания |
| isApproved | Boolean | Модерация (default: false) |
| createdAt | DateTime | Дата создания |

Связи: belongs to Profile (onDelete: Cascade)
Индексы: `[profileId, isApproved]`

---

## Каскадное удаление (v2)

- User удалён → все Profile удалены
- Profile удалён → все ContentBlock + GuestMemory удалены

---

## Команды Prisma

```bash
# Применить схему к БД (разработка)
npx prisma db push

# Сгенерировать клиент
npx prisma generate

# Открыть визуальный редактор
npx prisma studio

# Создать миграцию (продакшен)
npx prisma migrate dev --name init

# Применить миграции в проде
npx prisma migrate deploy
```

---

## Примеры запросов (Prisma Client)

### Создание профиля с блоками
```javascript
const profile = await prisma.profile.create({
  data: {
    ownerId: 1,
    fullName: "Иванова Мария Петровна",
    dates: "1918–1987",
    mainText: "Учительница русского языка...",
    contentBlocks: {
      create: [
        { text: "Родилась в Москве...", order: 1 },
        { text: "Окончила педагогический...", imageUrl: "https://...", order: 2 },
        { text: "40 лет в школе...", order: 3 },
      ]
    }
  }
});
```

### Получение профиля для фронтенда
```javascript
const profile = await prisma.profile.findUnique({
  where: { id: "uuid-from-qr-code" },
  include: {
    contentBlocks: { orderBy: { order: 'asc' } },
    guestMemories: {
      where: { isApproved: true },
      orderBy: { createdAt: 'desc' }
    }
  }
});
```

### Добавление воспоминания (неодобренное)
```javascript
await prisma.guestMemory.create({
  data: {
    profileId: "uuid",
    authorName: "Екатерина, внучка",
    memoryText: "Бабушка была лучшей...",
    isApproved: false  // ждёт модерации
  }
});
```
