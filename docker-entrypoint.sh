#!/bin/sh
set -e

echo "[Entrypoint] Aplicando migraciones de base de datos..."
npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "[Entrypoint] SEED_ON_START=true detectado. Poblando base de datos inicial..."
  npm run db:seed
fi

echo "[Entrypoint] Iniciando servidor NestJS..."
exec "$@"
