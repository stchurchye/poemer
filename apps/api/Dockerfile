# 构建上下文：仓库根目录（docker compose build）
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm ci && npm run build -w @shiren/shared && npm run build -w @shiren/api

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3921

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm ci --omit=dev --workspace=@shiren/shared --workspace=@shiren/api

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist

EXPOSE 3921

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3921/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
