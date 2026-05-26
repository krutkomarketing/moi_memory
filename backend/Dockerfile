FROM node:24-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
# Pin Prisma CLI на ту же версию, что @prisma/client в package.json (6.19.3)
RUN npx -y prisma@6.19.3 generate

COPY . .

RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx -y prisma@6.19.3 migrate deploy && node index.js"]