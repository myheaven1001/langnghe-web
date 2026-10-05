-- Quay lui 20261005092100_order_auto_complete_and_stats.sql (xem README.md).
-- Bỏ lịch tự hoàn tất, bỏ trigger thống kê/thông báo. total_orders và các
-- thông báo đã gửi giữ nguyên.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('auto-complete-delivered-orders');
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Không bỏ được lịch auto-complete-delivered-orders (%)', SQLERRM;
        END;
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.auto_complete_delivered_orders();
DROP TRIGGER IF EXISTS trg_handle_order_status_effects ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_status_effects();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092100';

COMMIT;
