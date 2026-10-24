#!/usr/bin/env bash
# Создаёт таблицы и меню в пустой базе (db/schema.sql + db/migrations по порядку).
# Нужен, если данные из Neon переносить не надо.
set -euo pipefail
set -a; . ./.env; set +a
docker compose up -d db
until docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do sleep 2; done
psql_run() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"; }
echo "==> db/schema.sql"; psql_run < db/schema.sql
for f in $(ls db/migrations/*.sql | sort); do echo "==> $f"; psql_run < "$f"; done
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt'
