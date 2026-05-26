FROM node:24-alpine

# OpenSSL нужен Prisma engine на Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# 1. Манифесты — отдельным слоем для кэша npm ci
COPY bot/package*.json ./

# 2. Зависимости
RUN npm ci --omit=dev

# 3. Код бота (благодаря .dockerignore сюда не попадёт node_modules)
COPY bot/ .

# 4. Схема из backend (одна схема на всю монорепу)
COPY backend/prisma ./prisma

# 5. Генерация клиента — ПОСЛЕДНИМ шагом, чтобы никакой COPY не затёр .prisma/client
RUN npx -y prisma@6.19.3 generate

CMD ["node", "index.js"]
