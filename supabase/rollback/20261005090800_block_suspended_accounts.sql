-- Quay lui 20261005090800_block_suspended_accounts.sql (xem README.md).
-- Gỡ 51 quy tắc *_active_user_* , 2 trigger và 2 hàm.
BEGIN;

DO $$
DECLARE
    v_table TEXT;
    v_short TEXT;
    v_cmd   TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'public.users', 'public.buyer_profiles', 'public.supplier_profiles',
        'public.verifications', 'public.products', 'public.price_tiers',
        'public.product_media', 'public.product_variants', 'public.rfq_requests',
        'public.rfq_quotes', 'public.orders', 'public.notifications',
        'public.notification_preferences', 'public.interaction_events',
        'public.domain_events', 'public.rfq_messages', 'storage.objects'
    ] LOOP
        v_short := split_part(v_table, '.', 2);
        FOREACH v_cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %s',
                           v_short || '_active_user_' || v_cmd, v_table);
        END LOOP;
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_block_suspended_rfq ON public.rfq_requests;
DROP TRIGGER IF EXISTS trg_block_suspended_order ON public.orders;
DROP FUNCTION IF EXISTS public.block_suspended_account();
DROP FUNCTION IF EXISTS public.is_active_user();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090800';

COMMIT;
