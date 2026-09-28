-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.7): tài khoản bị khoá không ghi được dữ liệu.
--
-- Lỗ hổng: admin khoá tài khoản (users.status = 'suspended') chỉ có tác
-- dụng ở app — loginWithPassword đăng xuất và proxy chặn route. Phiên đăng
-- nhập cũ (access token còn hạn, refresh token) vẫn gọi thẳng REST API
-- được: gửi báo giá, tạo sản phẩm, nhắn tin, gửi RFQ qua create_rfq, chốt
-- đơn qua accept_quote… Không quy tắc RLS nào xét users.status.
--
-- Sửa, 2 lớp:
--   1. Quy tắc RESTRICTIVE cho INSERT/UPDATE/DELETE của role authenticated
--      trên mọi bảng người dùng ghi được (+ storage.objects — upload ảnh,
--      giấy tờ). Postgres AND quy tắc restrictive với các quy tắc sẵn có,
--      nên không phải viết lại quy tắc nào. Lưu ý: UPDATE/DELETE bị chặn
--      bằng cách "không thấy dòng" (0 dòng bị đổi, không báo lỗi); INSERT
--      báo lỗi 42501. Đọc (SELECT) không đổi.
--   2. Trigger chặn theo người gọi (auth.uid()) khi INSERT rfq_requests /
--      orders — vì create_rfq() và accept_quote() là SECURITY DEFINER, bỏ
--      qua RLS nên lớp 1 không chặn được. Lỗi: ACCOUNT_SUSPENDED.
--
-- "Hoạt động" = users.status khác 'suspended'. Tài khoản 'pending' (đang
-- hoàn thiện hồ sơ sau OTP — confirmOtp/completeProfile ghi buyer_profiles,
-- supplier_profiles, users) vẫn ghi được như trước.
-- Không đổi: anon (không có users; interaction_events… chỉ áp dụng cho
-- authenticated), service_role, SQL Editor.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_active_user') THEN
        RAISE EXCEPTION 'is_active_user() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.rfq_messages') IS NULL OR to_regclass('public.product_variants') IS NULL THEN
        RAISE EXCEPTION 'Thiếu rfq_messages hoặc product_variants — chạy đủ migration trước.';
    END IF;
END $$;

CREATE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND status <> 'suspended'
    );
$$;

COMMENT ON FUNCTION public.is_active_user IS
    'TRUE khi người đang đăng nhập có dòng users và không bị khoá (active hoặc
     pending). Dùng trong các quy tắc RESTRICTIVE *_active_user (1.7).';

-- ── Lớp 1: quy tắc RESTRICTIVE ─────────────────────────────────────────
DO $$
DECLARE
    v_table TEXT;
    v_short TEXT;
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
        EXECUTE format(
            'CREATE POLICY %I ON %s AS RESTRICTIVE FOR INSERT TO authenticated
                 WITH CHECK (public.is_active_user())',
            v_short || '_active_user_insert', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON %s AS RESTRICTIVE FOR UPDATE TO authenticated
                 USING (public.is_active_user()) WITH CHECK (public.is_active_user())',
            v_short || '_active_user_update', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON %s AS RESTRICTIVE FOR DELETE TO authenticated
                 USING (public.is_active_user())',
            v_short || '_active_user_delete', v_table);
    END LOOP;
END $$;

-- ── Lớp 2: đường SECURITY DEFINER (create_rfq, accept_quote) ───────────
CREATE FUNCTION public.block_suspended_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- auth.uid() vẫn là người gọi kể cả bên trong hàm SECURITY DEFINER;
    -- NULL với service_role/SQL Editor → bỏ qua.
    IF auth.uid() IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'suspended') THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED'
            USING DETAIL = 'Tài khoản đang bị khoá, không tạo được RFQ/đơn hàng.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_suspended_rfq
    BEFORE INSERT ON public.rfq_requests
    FOR EACH ROW EXECUTE FUNCTION public.block_suspended_account();

CREATE TRIGGER trg_block_suspended_order
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.block_suspended_account();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — tài khoản suspended không ghi được (51 quy tắc restrictive + 2 trigger)';
END $$;

COMMIT;
