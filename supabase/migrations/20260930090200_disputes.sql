-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- disputes — dùng bởi /admin/orders (Giai đoạn 6.3): "xác nhận thanh toán
-- thủ công + xử lý disputes".
--
-- QUAN TRỌNG — phạm vi CÓ CHỦ Ý hẹp hơn disputes ở schema_v6_target.sql /
-- migration_sprint4.sql:
--   - KHÔNG có escrow_transactions/escrow_events, KHÔNG động tới
--     order_status (order_status vẫn giữ đúng 7 giá trị đã migrate ở
--     20260905120000, không thêm 'disputed') — theo đúng ghi chú
--     "'disputed' bỏ khỏi MVP, xử lý thủ công" ở orders.sql VÀ lưu ý pháp
--     lý ở PROJECT_ROADMAP.md Giai đoạn 9.3 (escrow + disputes có ràng
--     buộc release/refund tự động cần giấy phép trung gian thanh toán,
--     chỉ nên chạy migration_sprint4.sql SAU KHI có đối tác được cấp phép).
--   - Bảng này chỉ GHI NHẬN tranh chấp + quyết định xử lý (giống 1 ticket).
--     Tiền hoàn/trả (nếu có) vẫn là chuyển khoản thủ công NGOÀI app, đúng
--     tinh thần "chuyển khoản + admin xác nhận tay" đã áp dụng cho thanh
--     toán — không có dòng tiền nào do hệ thống tự giữ/tự chuyển ở đây.
--   - Admin là người duy nhất tạo dòng dispute (raised_by ghi lại buyer là
--     người đã báo cáo, KHÔNG phải người insert) — chưa có UI cho buyer/
--     supplier tự report tranh chấp trong app, đó là báo cáo qua điện
--     thoại/email/support ngoài app mà admin nhập lại ở đây.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_status') THEN
        RAISE EXCEPTION 'dispute_status đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE TYPE dispute_status     AS ENUM ('open', 'investigating', 'resolved');
CREATE TYPE dispute_resolution AS ENUM ('release_supplier', 'refund_buyer', 'partial');

CREATE TABLE disputes (
    id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID               NOT NULL REFERENCES orders(id),
    -- Buyer đã báo cáo tranh chấp (qua điện thoại/email) — nullable vì dữ
    -- liệu cũ/trường hợp hiếm không xác định được người báo cáo.
    raised_by       UUID               REFERENCES users(id),
    reason          TEXT               NOT NULL,
    status          dispute_status     NOT NULL DEFAULT 'open',
    resolution      dispute_resolution,
    -- % hoàn cho buyer khi resolution = 'partial' (vd. 0.5 = hoàn 50%).
    refund_ratio    DECIMAL(5,4)       CHECK (refund_ratio BETWEEN 0 AND 1),
    resolution_note TEXT,
    resolved_by     UUID               REFERENCES users(id),
    created_at      TIMESTAMP          NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMP,
    CONSTRAINT chk_dispute_resolved CHECK (
        status <> 'resolved' OR (resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    ),
    CONSTRAINT chk_dispute_ratio CHECK (
        resolution IS DISTINCT FROM 'partial' OR refund_ratio IS NOT NULL
    )
);

CREATE INDEX idx_disputes_order  ON disputes (order_id);
CREATE INDEX idx_disputes_status ON disputes (status);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Đọc: admin thấy tất cả, buyer/supplier của đúng đơn hàng thấy tranh chấp
-- của mình (chưa có trang hiển thị ở buyer/supplier side, nhưng để RLS sẵn
-- đúng nguyên tắc "chủ sở hữu + admin" dùng chung toàn repo).
CREATE POLICY disputes_select ON disputes
    FOR SELECT USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM orders o
            JOIN buyer_profiles bp ON bp.id = o.buyer_id
            WHERE o.id = disputes.order_id AND bp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM orders o
            JOIN supplier_profiles sp ON sp.id = o.supplier_id
            WHERE o.id = disputes.order_id AND sp.user_id = auth.uid()
        )
    );

-- Ghi: chỉ admin (xem lý do "raised_by" ở comment đầu file).
CREATE POLICY disputes_insert_admin ON disputes
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY disputes_update_admin ON disputes
    FOR UPDATE USING (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- Trigger: notification cho buyer + supplier khi mở/giải quyết tranh chấp
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_dispute_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_user_id    UUID;
    v_supplier_user_id UUID;
    v_order_label      TEXT;
BEGIN
    SELECT bp.user_id, sp.user_id, '#' || UPPER(LEFT(o.id::text, 8))
      INTO v_buyer_user_id, v_supplier_user_id, v_order_label
    FROM orders o
    JOIN buyer_profiles bp ON bp.id = o.buyer_id
    JOIN supplier_profiles sp ON sp.id = o.supplier_id
    WHERE o.id = NEW.order_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES
            (v_buyer_user_id, 'dispute_opened',
             'Đơn hàng ' || v_order_label || ' đang được xử lý tranh chấp',
             NEW.reason,
             jsonb_build_object('order_id', NEW.order_id, 'dispute_id', NEW.id),
             'in_app', 'sent', NOW()),
            (v_supplier_user_id, 'dispute_opened',
             'Đơn hàng ' || v_order_label || ' đang được xử lý tranh chấp',
             NEW.reason,
             jsonb_build_object('order_id', NEW.order_id, 'dispute_id', NEW.id),
             'in_app', 'sent', NOW());
        RETURN NEW;
    END IF;

    IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES
            (v_buyer_user_id, 'dispute_resolved',
             'Tranh chấp đơn hàng ' || v_order_label || ' đã được giải quyết',
             COALESCE(NEW.resolution_note, 'Admin đã đưa ra quyết định xử lý.'),
             jsonb_build_object('order_id', NEW.order_id, 'dispute_id', NEW.id),
             'in_app', 'sent', NOW()),
            (v_supplier_user_id, 'dispute_resolved',
             'Tranh chấp đơn hàng ' || v_order_label || ' đã được giải quyết',
             COALESCE(NEW.resolution_note, 'Admin đã đưa ra quyết định xử lý.'),
             jsonb_build_object('order_id', NEW.order_id, 'dispute_id', NEW.id),
             'in_app', 'sent', NOW());
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_dispute_insert
    AFTER INSERT ON disputes
    FOR EACH ROW EXECUTE FUNCTION public.handle_dispute_change();

CREATE TRIGGER trg_handle_dispute_update
    AFTER UPDATE OF status ON disputes
    FOR EACH ROW EXECUTE FUNCTION public.handle_dispute_change();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — disputes (bảng + RLS + notification khi mở/giải quyết tranh chấp)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_handle_dispute_update ON disputes;
-- DROP TRIGGER IF EXISTS trg_handle_dispute_insert ON disputes;
-- DROP FUNCTION IF EXISTS public.handle_dispute_change();
-- DROP POLICY IF EXISTS disputes_update_admin ON disputes;
-- DROP POLICY IF EXISTS disputes_insert_admin ON disputes;
-- DROP POLICY IF EXISTS disputes_select ON disputes;
-- DROP TABLE IF EXISTS disputes;
-- DROP TYPE IF EXISTS dispute_resolution;
-- DROP TYPE IF EXISTS dispute_status;
-- COMMIT;
