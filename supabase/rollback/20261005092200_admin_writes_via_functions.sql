-- Quay lui 20261005092200_admin_writes_via_functions.sql (xem README.md).
-- Mở lại đường admin sửa thẳng orders / users / verifications / disputes
-- (không ghi nhật ký) và bỏ admin_cancel_order(), admin_resolve_dispute().
-- Quay lui web về bản trước đó TRƯỚC khi chạy file này (web mới gọi 2 hàm trên).
BEGIN;

CREATE POLICY verifications_update_admin ON public.verifications
    FOR UPDATE USING (public.is_admin());
CREATE POLICY disputes_insert_admin ON public.disputes
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY disputes_update_admin ON public.disputes
    FOR UPDATE USING (public.is_admin());

-- Bản 20261001090200.
CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_CHANGE';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'active') THEN
        RAISE EXCEPTION 'FORBIDDEN_STATUS_CHANGE';
    END IF;

    RETURN NEW;
END;
$$;

-- Bản 20261005092000.
CREATE OR REPLACE FUNCTION public.guard_order_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user = 'authenticated' AND (
           NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
        OR NEW.paid_at     IS DISTINCT FROM OLD.paid_at
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Số tiền/thời điểm đã nhận chỉ ghi qua admin_confirm_payment().';
    END IF;
    RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_resolve_dispute(UUID, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.admin_cancel_order(UUID, TEXT);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092200';

COMMIT;
