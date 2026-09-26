#!/usr/bin/env bash
# Sao lưu database production trước khi push migration (bước 0.5).
#
# Cách dùng:
#   BACKUP_DIR=~/langnghe-backups scripts/backup-db.sh "<connection string>"
#
# Connection string lấy ở Supabase Dashboard → Connect → Session pooler.
# Không để file dump trong repo: BACKUP_DIR mặc định ở ngoài repo.
set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "Thiếu connection string (tham số 1 hoặc DATABASE_URL)." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/langnghe-backups}"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
case "$BACKUP_DIR/" in
  "$REPO_ROOT"/*)
    echo "BACKUP_DIR nằm trong repo ($BACKUP_DIR); chọn thư mục khác." >&2
    exit 1
    ;;
esac

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/langnghe-$STAMP"

if command -v pg_dump >/dev/null 2>&1; then
  # pg_dump cài sẵn: phiên bản phải >= phiên bản Postgres của project (17).
  pg_dump "$DB_URL" -Fc --no-owner --no-privileges -f "$OUT.dump"
  ls -lh "$OUT.dump"
else
  # Supabase CLI chạy pg_dump trong Docker, khớp phiên bản của project.
  cd "$REPO_ROOT"
  npx supabase db dump --db-url "$DB_URL" -f "$OUT-roles.sql" --role-only
  npx supabase db dump --db-url "$DB_URL" -f "$OUT-schema.sql"
  npx supabase db dump --db-url "$DB_URL" -f "$OUT-data.sql" --use-copy --data-only
  ls -lh "$OUT"-*.sql
fi
echo "Đã sao lưu vào $BACKUP_DIR"
