# Script quay lui migration

Mỗi migration rủi ro có một file ở đây, **cùng tên** với file trong `supabase/migrations/`.
File này đưa database về trạng thái ngay trước migration đó.

Supabase CLI không chạy thư mục này. Chạy tay khi cần:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/rollback/<tên-migration>.sql
```

Sau khi quay lui, xoá dòng của migration đó khỏi `supabase_migrations.schema_migrations`.
Nếu không, `npx supabase db push` sẽ coi nó là đã chạy:

```sql
delete from supabase_migrations.schema_migrations where version = '<timestamp>';
```

Quy tắc:

- Viết script quay lui cùng lúc với migration và chạy thử trên staging: migration → quay lui → migration lại.
- Chỉ quay lui thay đổi cấu trúc và quyền (trigger, policy, hàm, view). Dữ liệu đã ghi sau migration thì không khôi phục bằng script này; dùng bản `pg_dump` (`scripts/backup-db.sh`).
- Bọc trong `begin; … commit;`.
