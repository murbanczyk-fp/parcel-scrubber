#!/bin/sh
set -e

cd /app/apps/api

npx prisma migrate deploy

exec node dist/main.js
