-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- ORDER EVENTS — port RIÊNG bảng order_events từ migration_sprint4.sql,
-- KHÔNG kèm escrow_transactions/disputes/escrow_events/reviews trong file
-- đó — những bảng này gắn với luồng escrow, theo PROJECT_ROADMAP.md Giai
-- đoạn 9.3 cần giấy phép trung gian thanh toán trước khi chạy, chưa tới
-- lúc.
--
-- order_events không phụ thuộc gì vào escrow/disputes (chỉ FK tới orders +
-- users, CHECK constraint chỉ là danh sách chuỗi tĩnh — không FK tới bảng
-- disputes), nên tách port riêng, đủ dùng ngay cho /orders/[id] (3.6).
--
-- Ghi dữ liệu:
--   - Trigger trg_log_order_created (BƯỚC 3) tự ghi event 'order_created'
--     mỗi khi có đơn hàng mới — hiện tại chỉ có 1 đường tạo orders:
--     accept_quote() (20260919090100_accept_quote.sql).
--   - payment_confirmed/producing_started/shipped/delivered/completed/
--     cancelled/dispute_* CHƯA có trigger nào ghi — các luồng tương ứng
--     (Giai đoạn 4 supplier order management, Giai đoạn 6 admin) sẽ tự ghi
--     khi được xây. BƯỚC 4 backfill từ 4 cột timestamp đã có sẵn trên
--     orders (confirmed_at/shipped_at/delivered_at/completed_at) phòng khi
--     đã có dữ liệu test trước migration này.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        RAISE EXCEPTION 'Không tìm thấy bảng orders. Migration Sprint 1 chưa chạy.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_events') THEN
        RAISE EXCEPTION 'order_events đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ============================================================
-- BƯỚC 1 · BẢNG order_events
-- ============================================================

CREATE TABLE order_events (
    id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID      NOT NULL REFERENCES orders(id),
    actor_id   UUID      REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'order_created', 'payment_confirmed', 'producing_started',
        'shipped', 'delivered', 'dispute_opened', 'dispute_resolved',
        'completed', 'cancelled'
    )),
    note       TEXT,
    metadata   JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_events_order ON order_events (order_id, created_at DESC);

-- ============================================================
-- BƯỚC 2 · RLS — cùng logic sở hữu với orders_buyer_view/
-- orders_supplier_view (20260905121000_rls_policies.sql)
-- ============================================================

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events FORCE ROW LEVEL SECURITY;

CREATE POLICY order_events_select ON order_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders o
            JOIN buyer_profiles bp ON bp.id = o.buyer_id
            WHERE o.id = order_events.order_id AND bp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM orders o
            JOIN supplier_profiles sp ON sp.id = o.supplier_id
            WHERE o.id = order_events.order_id AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

-- Không có policy INSERT/UPDATE/DELETE cho 'authenticated' có chủ đích —
-- đây là audit log, chỉ được ghi qua trigger (SECURITY DEFINER) hoặc code
-- Giai đoạn 4/6 sau này (khi đó thêm policy INSERT đúng phạm vi actor).

-- ============================================================
-- BƯỚC 3 · TRIGGER: tự ghi 'order_created' khi có đơn hàng mới
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO order_events (order_id, actor_id, event_type, note)
    VALUES (NEW.id, auth.uid(), 'order_created', 'Đơn hàng được tạo từ báo giá đã chấp nhận.');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_order_created
    AFTER INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION public.log_order_created();

-- ============================================================
-- BƯỚC 4 · BACKFILL cho đơn hàng đã tồn tại trước migration này
-- ============================================================

INSERT INTO order_events (order_id, actor_id, event_type, note, created_at)
SELECT id, NULL, 'order_created', 'Backfill — đơn hàng tạo trước khi order_events tồn tại.', created_at
FROM orders;

INSERT INTO order_events (order_id, actor_id, event_type, note, created_at)
SELECT id, payment_confirmed_by, 'payment_confirmed', 'Backfill', confirmed_at
FROM orders WHERE confirmed_at IS NOT NULL;

INSERT INTO order_events (order_id, actor_id, event_type, note, created_at)
SELECT id, NULL, 'shipped', 'Backfill', shipped_at
FROM orders WHERE shipped_at IS NOT NULL;

INSERT INTO order_events (order_id, actor_id, event_type, note, created_at)
SELECT id, NULL, 'delivered', 'Backfill', delivered_at
FROM orders WHERE delivered_at IS NOT NULL;

INSERT INTO order_events (order_id, actor_id, event_type, note, created_at)
SELECT id, NULL, 'completed', 'Backfill', completed_at
FROM orders WHERE status = 'completed' AND completed_at IS NOT NULL;

COMMENT ON TABLE order_events IS
    'Port riêng từ migration_sprint4.sql (chỉ bảng này, không kèm escrow/
     disputes/reviews — xem đầu file migration này). order_created ghi tự
     động qua trigger trg_log_order_created; các event khác do luồng
     nghiệp vụ tương ứng ghi khi được xây (Giai đoạn 4/6).';

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — order_events (+ trigger trg_log_order_created, backfill)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_log_order_created ON orders;
-- DROP FUNCTION IF EXISTS public.log_order_created();
-- DROP TABLE IF EXISTS order_events CASCADE;
-- COMMIT;
