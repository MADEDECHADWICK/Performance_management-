#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

set -a
# shellcheck disable=SC1091
source .env
set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BSC_BACKUP_DIR:-/srv/bsc-backups}"
mkdir -p "$BACKUP_DIR"

docker compose exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$BACKUP_DIR/bsc_${STAMP}.dump"

find "$BACKUP_DIR" -name 'bsc_*.dump' -mtime +14 -delete

echo "Backup written to $BACKUP_DIR/bsc_${STAMP}.dump"
