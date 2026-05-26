# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY apps/api apps/api

RUN npm run prisma:generate -w @parcel-scrubber/api
RUN npm run build -w @parcel-scrubber/api

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/prisma apps/api/prisma

RUN npm run prisma:generate -w @parcel-scrubber/api

COPY apps/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 4201

ENTRYPOINT ["/entrypoint.sh"]
