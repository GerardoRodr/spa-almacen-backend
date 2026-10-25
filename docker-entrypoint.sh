#!/bin/sh
set -e

echo "[Entrypoint] Aplicando migraciones de base de datos..."
npx prisma migrate deploy

echo "[Entrypoint] Iniciando servidor NestJS..."
exec "$@"
