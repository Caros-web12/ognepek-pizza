#!/usr/bin/env bash
# Cron: 0 4 * * * cd /путь/к/проекту && ./backup.sh
# Копии лежат на том же сервере: раз в неделю скачивайте backups/ к себе.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
mkdir -p backups
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" \
  > "backups/db-$(date +%F).dump"
ls -1t backups/db-*.dump | tail -n +15 | xargs -r rm --
