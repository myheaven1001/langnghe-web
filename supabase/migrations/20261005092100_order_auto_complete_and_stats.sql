-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 3.7: tự hoàn tất đơn + thống kê + thông báo khi đơn đổi trạng thái.
--
--   handle_order_status_effects()   AFTER UPDATE OF status trên orders:
--       - đơn sang 'completed' → supplier_profiles.total_orders + 1;
--       - gửi thông báo trong app (loại đã có sẵn từ đầu nhưng chưa nơi nào
--         gửi): confirmed → buyer + xưởng (order_confirmed), shipped → buyer
--         (order_shipped), delivered → xưởng (order_delivered). payload có
--         order_id để thông báo dẫn tới đúng trang đơn (3.8).
--   total_orders được tính lại từ số đơn đã hoàn tất (trước đây không nơi
--       nào cộng, giá trị cũ là số nhập tay/0).
--   auto_complete_delivered_orders()   Chuyển đơn 'delivered' quá N ngày
--       sang 'completed' (N = platform_settings.order_auto_complete_days,
--       mặc định 7). Bỏ qua đơn đang có tranh chấp chưa giải quyết. Chạy bằng
--       pg_cron hằng ngày 19:00 UTC = 02:00 giờ Việt Nam; gọi tay được:
--         SELECT public.auto_complete_delivered_orders();
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_complete_delivered_orders') THEN
        RAISE EXCEPTION 'auto_complete_delivered_orders() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_setting') THEN
        RAISE EXCEPTION 'Thiếu get_setting(). Chạy 20261005091700 (3.1) trước.';
    END IF;
END $$;

-- ── Thống kê + thông báo khi đơn đổi trạng thái ────────────────────────
CREATE FUNCTION public.handle_order_status_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_user    UUID;
    v_supplier_user UUID;
    v_label         TEXT := '#' || UPPER(LEFT(NEW.id::TEXT, 8));
    v_payload       JSONB := jsonb_build_object('order_id', NEW.id);
BEGIN
    IF NEW.status = 'completed' THEN
        UPDATE supplier_profiles SET total_orders = total_orders + 1 WHERE id = NEW.supplier_id;
    END IF;

    IF NEW.status NOT IN ('confirmed', 'shipped', 'delivered') THEN
        RETURN NULL;
    END IF;

    SELECT user_id INTO v_buyer_user FROM buyer_profiles WHERE id = NEW.buyer_id;
    SELECT user_id INTO v_supplier_user FROM supplier_profiles WHERE id = NEW.supplier_id;

    IF NEW.status = 'confirmed' THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        -- INSERT … SELECT không tự ép chuỗi sang enum (lỗi đã gặp ở 1.2) → ép rõ.
        SELECT u, 'order_confirmed'::notification_type, t, b, v_payload,
               'in_app'::notification_channel, 'sent', NOW()
        FROM (VALUES
            (v_buyer_user, 'Đã xác nhận thanh toán đơn ' || v_label,
             'Sàn đã nhận được tiền. Xưởng sẽ bắt đầu sản xuất.'),
            (v_supplier_user, 'Đơn ' || v_label || ' đã được thanh toán',
             'Sàn đã xác nhận tiền của buyer. Bạn có thể bắt đầu sản xuất.')
        ) AS n(u, t, b)
        WHERE u IS NOT NULL;
    ELSIF NEW.status = 'shipped' AND v_buyer_user IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES (v_buyer_user, 'order_shipped', 'Đơn ' || v_label || ' đang được giao',
                concat_ws(' · ', NEW.logistics_provider,
                          CASE WHEN COALESCE(NEW.tracking_number, '') <> ''
                               THEN 'Mã vận đơn: ' || NEW.tracking_number END)
                    || '. Bấm "Đã nhận hàng" khi hàng tới nơi.',
                v_payload, 'in_app', 'sent', NOW());
    ELSIF NEW.status = 'delivered' AND v_supplier_user IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES (v_supplier_user, 'order_delivered', 'Buyer đã nhận hàng đơn ' || v_label,
                'Đơn sẽ được hoàn tất khi buyer xác nhận, hoặc tự hoàn tất sau vài ngày.',
                v_payload, 'in_app', 'sent', NOW());
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_handle_order_status_effects
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.handle_order_status_effects();

REVOKE ALL ON FUNCTION public.handle_order_status_effects() FROM PUBLIC, anon, authenticated;

-- Tính lại total_orders từ dữ liệu thật.
UPDATE public.supplier_profiles sp
SET total_orders = (SELECT count(*) FROM public.orders o
                    WHERE o.supplier_id = sp.id AND o.status = 'completed')
WHERE sp.total_orders IS DISTINCT FROM (SELECT count(*) FROM public.orders o
                                        WHERE o.supplier_id = sp.id AND o.status = 'completed');

-- ── Tự hoàn tất ─────────────────────────────────────────────────────────
CREATE FUNCTION public.auto_complete_delivered_orders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INT;
    v_ids  UUID[];
BEGIN
    BEGIN
        v_days := (public.get_setting('order_auto_complete_days') #>> '{}')::INT;
    EXCEPTION WHEN OTHERS THEN
        v_days := NULL;
    END;
    v_days := COALESCE(v_days, 7);

    WITH done AS (
        UPDATE orders o
        SET status = 'completed', updated_at = NOW()
        WHERE o.status = 'delivered'
          AND o.delivered_at IS NOT NULL
          AND o.delivered_at < NOW() - make_interval(days => v_days)
          AND NOT EXISTS (SELECT 1 FROM disputes d
                          WHERE d.order_id = o.id AND d.status <> 'resolved')
        RETURNING o.id
    )
    SELECT array_agg(id) INTO v_ids FROM done;

    IF v_ids IS NULL THEN
        RETURN 0;
    END IF;

    -- Event 'completed' vừa do trg_handle_order_status_change ghi: đánh dấu
    -- là hệ thống tự làm (không phải buyer bấm).
    UPDATE order_events
    SET actor_id = NULL,
        note     = format('Hệ thống tự hoàn tất sau %s ngày kể từ khi buyer nhận hàng.', v_days),
        metadata = jsonb_build_object('auto', TRUE, 'days', v_days)
    WHERE order_id = ANY (v_ids) AND event_type = 'completed' AND note IS NULL;

    RETURN array_length(v_ids, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_complete_delivered_orders() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.auto_complete_delivered_orders IS
    'Chuyển đơn delivered quá N ngày (platform_settings.order_auto_complete_days)
     sang completed. pg_cron chạy hằng ngày 19:00 UTC (02:00 giờ Việt Nam).';

-- Lên lịch (cùng khuôn 20261003090000): lỗi lên lịch chỉ là cảnh báo.
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Không bật được pg_cron (%): bỏ qua lịch tự động', SQLERRM;
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.schedule(
                'auto-complete-delivered-orders',
                '0 19 * * *',
                'SELECT public.auto_complete_delivered_orders()'
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Không lên lịch được auto-complete-delivered-orders (%)', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_cron chưa có: bật Database → Extensions → pg_cron rồi chạy lại phần cron.schedule.';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — auto_complete_delivered_orders() + total_orders + thông báo trạng thái đơn';
END $$;

COMMIT;
