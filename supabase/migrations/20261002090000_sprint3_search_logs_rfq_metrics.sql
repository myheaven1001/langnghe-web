-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Sprint 3 (Giai đoạn 8): search_logs + rfq_metrics + trigger, và 2 RPC
-- phục vụ /search (ghi log) và /supplier/analytics (đọc số liệu).
--
-- Port từ migration_sprint3.sql BƯỚC 1 + 2. KHÔNG port ở file này:
--   BƯỚC 3 (index interaction_events), BƯỚC 4 (supplier_profiles.rank_score,
--   is_paid_member + trigger). Đó là ranking signals, không liên quan tới
--   "ghi log + analytics", để riêng khi làm tới tính năng xếp hạng.
--
-- KHÁC file gốc:
--   1. Bỏ `SET ROLE langnghe_migrate` / RESET ROLE (Supabase chạy bằng role
--      postgres) và guard "membership_plans phải có" (không còn liên quan).
--   2. RLS bật NGAY khi tạo bảng (bài học 20260922090000). search_logs và
--      rfq_metrics không có policy ghi nào: chỉ ghi qua RPC/trigger
--      SECURITY DEFINER dưới đây, không ai INSERT thẳng qua REST được.
--   3. search_logs.user_id ON DELETE SET NULL (gốc: không có). public.users
--      xoá theo auth.users (CASCADE) — không SET NULL thì xoá 1 tài khoản sẽ
--      bị chặn vì còn log tìm kiếm của họ. Log còn lại thành "ẩn danh".
--   4. rfq_metrics.rfq_id ON DELETE CASCADE (bảng dẫn xuất, không nên chặn
--      việc xoá RFQ).
--   5. Trigger gốc chỉ cập nhật khi có quote mới (quotes_received,
--      time_to_first_quote). Cột suppliers_notified, time_to_award,
--      converted_to_order trong gốc KHÔNG có gì ghi → luôn 0/NULL/FALSE.
--      File này thêm trigger cho 4 sự kiện: RFQ tạo, supplier được mời
--      (rfq_targets), quote mới, RFQ chuyển 'awarded', đơn hàng được tạo.
--   6. Trigger là SECURITY DEFINER (gốc: không) — supplier gửi quote qua
--      REST không có quyền ghi rfq_metrics (RLS), nếu không DEFINER thì
--      INSERT quote sẽ lỗi.
--
-- log_search(): RPC tự đếm result_count phía DB thay vì tin số client gửi
-- lên, để số liệu không bị giả mạo. Không tính "lượt bấm vào sản phẩm"
-- (clicked_product_id) hay "chuyển thành RFQ" (converted_to_rfq): trang
-- /search và /products/[id] hiện vẫn hardcode nên chưa có id sản phẩm thật
-- để ghi — 2 cột đó được tạo sẵn, chưa có code ghi.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.rfq_quotes') IS NULL
       OR to_regclass('public.rfq_targets') IS NULL
       OR to_regclass('public.orders') IS NULL
       OR to_regclass('public.products') IS NULL THEN
        RAISE EXCEPTION 'Thiếu rfq_quotes/rfq_targets/orders/products. Chạy các migration trước (đặc biệt 20260918090000).';
    END IF;
    IF to_regprocedure('public.is_admin()') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy public.is_admin(). 20260905120900_rls_helpers.sql chưa chạy.';
    END IF;
    IF to_regclass('public.search_logs') IS NOT NULL OR to_regclass('public.rfq_metrics') IS NOT NULL THEN
        RAISE EXCEPTION 'search_logs/rfq_metrics đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ============================================================
-- BƯỚC 1 · SEARCH LOGS
-- ============================================================

CREATE TABLE search_logs (
    id                 UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID      REFERENCES users(id) ON DELETE SET NULL,  -- NULL = anonymous
    query              TEXT      NOT NULL CHECK (char_length(query) BETWEEN 1 AND 200),
    result_count       INT,
    clicked_product_id UUID      REFERENCES products(id) ON DELETE SET NULL,
    converted_to_rfq   BOOLEAN   NOT NULL DEFAULT FALSE,
    session_id         VARCHAR(100),
    created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_logs_created   ON search_logs (created_at DESC);
CREATE INDEX idx_search_logs_user      ON search_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_search_logs_no_result ON search_logs (query, created_at DESC) WHERE result_count = 0;

COMMENT ON INDEX idx_search_logs_no_result IS
    'Query không ra kết quả = cơ hội recruit supplier đang thiếu';

COMMENT ON TABLE search_logs IS
    'Ghi bởi public.log_search() (gọi từ /search). Chỉ admin đọc trực tiếp;
     supplier xem số liệu tổng hợp qua public.get_supplier_analytics().
     Job hàng ngày (chưa có): phân tích query result_count = 0 → alert
     team supplier acquisition.';

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY search_logs_select_admin ON search_logs
    FOR SELECT USING (public.is_admin());

-- ============================================================
-- BƯỚC 2 · RFQ METRICS
-- ============================================================

CREATE TABLE rfq_metrics (
    id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id              UUID      NOT NULL UNIQUE REFERENCES rfq_requests(id) ON DELETE CASCADE,
    quotes_received     INT       NOT NULL DEFAULT 0,
    suppliers_notified  INT       NOT NULL DEFAULT 0,
    time_to_first_quote INTERVAL,
    time_to_award       INTERVAL,
    converted_to_order  BOOLEAN   NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rfq_metrics IS
    'Dẫn xuất từ rfq_requests/rfq_targets/rfq_quotes/orders qua trigger — không sửa tay.
     Job hàng tuần (chưa có): tính conversion rate, alert nếu time_to_first_quote > 48h.';

ALTER TABLE rfq_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_metrics FORCE ROW LEVEL SECURITY;

-- Helper SECURITY DEFINER (giống is_admin()): policy gọi thẳng subquery lên
-- rfq_requests sẽ kéo theo policy của rfq_requests → rfq_quotes → ... và Postgres
-- báo "infinite recursion detected in policy" (xem kiểm thử ở PR/mô tả task).
CREATE OR REPLACE FUNCTION public.is_rfq_buyer(p_rfq_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.rfq_requests r
        JOIN public.buyer_profiles bp ON bp.id = r.buyer_id
        WHERE r.id = p_rfq_id AND bp.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_rfq_buyer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_rfq_buyer(UUID) TO authenticated;

-- Buyer chủ RFQ + admin đọc trực tiếp. Supplier không đọc thẳng (số quote
-- của đối thủ là thông tin cạnh tranh) — chỉ thấy số tổng hợp qua
-- get_supplier_analytics().
CREATE POLICY rfq_metrics_select ON rfq_metrics
    FOR SELECT USING (
        public.is_admin() OR public.is_rfq_buyer(rfq_metrics.rfq_id)
    );

-- Backfill từ dữ liệu hiện có. time_to_award: RFQ không lưu thời điểm chốt,
-- dùng updated_at của quote 'accepted' (accept_quote() set khi chốt) — xấp xỉ.
INSERT INTO rfq_metrics (
    rfq_id, quotes_received, suppliers_notified,
    time_to_first_quote, time_to_award, converted_to_order, updated_at
)
SELECT
    r.id,
    (SELECT COUNT(*) FROM rfq_quotes q WHERE q.rfq_id = r.id),
    (SELECT COUNT(*) FROM rfq_targets t WHERE t.rfq_id = r.id),
    (SELECT MIN(q.created_at) FROM rfq_quotes q WHERE q.rfq_id = r.id) - r.created_at,
    (SELECT MIN(q.updated_at) FROM rfq_quotes q
      WHERE q.rfq_id = r.id AND q.status = 'accepted') - r.created_at,
    EXISTS (SELECT 1 FROM orders o JOIN rfq_quotes q ON q.id = o.rfq_quote_id
             WHERE q.rfq_id = r.id),
    NOW()
FROM rfq_requests r;

-- ── Triggers ────────────────────────────────────────────────

-- RFQ mới → tạo dòng metrics (0 quote, 0 supplier).
CREATE OR REPLACE FUNCTION public.rfq_metrics_on_rfq_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO rfq_metrics (rfq_id) VALUES (NEW.id) ON CONFLICT (rfq_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rfq_metrics_on_rfq_created
    AFTER INSERT ON rfq_requests
    FOR EACH ROW EXECUTE FUNCTION public.rfq_metrics_on_rfq_created();

-- Xưởng được mời (create_rfq() ghi rfq_targets) → suppliers_notified + 1.
CREATE OR REPLACE FUNCTION public.rfq_metrics_on_target_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO rfq_metrics (rfq_id, suppliers_notified) VALUES (NEW.rfq_id, 1)
    ON CONFLICT (rfq_id) DO UPDATE
        SET suppliers_notified = rfq_metrics.suppliers_notified + 1,
            updated_at         = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rfq_metrics_on_target_added
    AFTER INSERT ON rfq_targets
    FOR EACH ROW EXECUTE FUNCTION public.rfq_metrics_on_target_added();

-- Quote mới → quotes_received + 1; time_to_first_quote chỉ ghi lần đầu.
CREATE OR REPLACE FUNCTION public.rfq_metrics_on_quote_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rfq_created_at TIMESTAMP;
BEGIN
    SELECT created_at INTO v_rfq_created_at FROM rfq_requests WHERE id = NEW.rfq_id;

    INSERT INTO rfq_metrics (rfq_id, quotes_received, time_to_first_quote)
    VALUES (NEW.rfq_id, 1, NEW.created_at - v_rfq_created_at)
    ON CONFLICT (rfq_id) DO UPDATE
        SET quotes_received     = rfq_metrics.quotes_received + 1,
            time_to_first_quote = COALESCE(rfq_metrics.time_to_first_quote, EXCLUDED.time_to_first_quote),
            updated_at          = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rfq_metrics_on_quote_created
    AFTER INSERT ON rfq_quotes
    FOR EACH ROW EXECUTE FUNCTION public.rfq_metrics_on_quote_created();

-- RFQ chuyển sang 'awarded' (accept_quote()) → time_to_award.
CREATE OR REPLACE FUNCTION public.rfq_metrics_on_rfq_awarded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO rfq_metrics (rfq_id, time_to_award)
    VALUES (NEW.id, NOW() - NEW.created_at)
    ON CONFLICT (rfq_id) DO UPDATE
        SET time_to_award = COALESCE(rfq_metrics.time_to_award, EXCLUDED.time_to_award),
            updated_at    = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rfq_metrics_on_rfq_awarded
    AFTER UPDATE OF status ON rfq_requests
    FOR EACH ROW
    WHEN (NEW.status = 'awarded' AND OLD.status IS DISTINCT FROM 'awarded')
    EXECUTE FUNCTION public.rfq_metrics_on_rfq_awarded();

-- Đơn hàng được tạo từ quote → converted_to_order.
CREATE OR REPLACE FUNCTION public.rfq_metrics_on_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rfq_id UUID;
BEGIN
    SELECT rfq_id INTO v_rfq_id FROM rfq_quotes WHERE id = NEW.rfq_quote_id;
    IF v_rfq_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO rfq_metrics (rfq_id, converted_to_order) VALUES (v_rfq_id, TRUE)
    ON CONFLICT (rfq_id) DO UPDATE
        SET converted_to_order = TRUE,
            updated_at         = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rfq_metrics_on_order_created
    AFTER INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION public.rfq_metrics_on_order_created();

-- ============================================================
-- BƯỚC 3 · log_search() — ghi 1 lượt tìm kiếm
-- Cho cả khách chưa đăng nhập (anon) — user_id = auth.uid() (NULL nếu anon).
-- result_count đếm tại đây bằng đúng full-text search của products
-- (search_vector, cấu hình 'simple' — xem 20260905120700_search.sql).
-- Trả về result_count, hoặc NULL nếu query rỗng (không ghi gì).
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_search(p_query TEXT, p_session_id TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_query TEXT := left(btrim(regexp_replace(COALESCE(p_query, ''), '\s+', ' ', 'g')), 200);
    v_tsq   tsquery;
    v_count INT;
BEGIN
    IF v_query = '' THEN
        RETURN NULL;
    END IF;

    v_tsq := plainto_tsquery('simple', v_query);

    SELECT COUNT(*) INTO v_count
    FROM products p
    WHERE p.status = 'active'
      AND p.search_vector @@ v_tsq;

    INSERT INTO search_logs (user_id, query, result_count, session_id)
    VALUES (auth.uid(), v_query, v_count, left(p_session_id, 100));

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.log_search IS
    'Gọi từ src/app/search/page.tsx mỗi lần có ?q=. Ai cũng gọi được (kể cả
     anon) nên có thể bị spam log — chặn ở mức độ dài query (200 ký tự) và
     CHECK trên bảng; rate-limit thật (nếu cần) làm ở tầng proxy/edge.';

REVOKE ALL ON FUNCTION public.log_search(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_search(TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- BƯỚC 4 · get_supplier_analytics() — số liệu cho /supplier/analytics
--
-- Chỉ trả số liệu của CHÍNH supplier đang đăng nhập (auth.uid() → supplier
-- profile). SECURITY DEFINER vì đọc search_logs/rfq_metrics (RLS không cho
-- supplier đọc thẳng), nhưng chỉ trả dữ liệu tổng hợp, không lộ dòng thô.
--
-- "Lượt xuất hiện trong tìm kiếm" = số lượt tìm kiếm mà ÍT NHẤT 1 sản phẩm
-- active của xưởng khớp (cùng full-text search với log_search()). Đây là
-- số ước tính "sản phẩm bạn nằm trong kết quả", KHÔNG phải lượt xem/bấm —
-- hệ thống chưa ghi lượt xem sản phẩm hay lượt bấm. Lượt tìm kiếm do chính
-- xưởng thực hiện được loại ra.
--
-- Mốc thời gian theo ngày lịch giờ Việt Nam (Asia/Ho_Chi_Minh), p_days ngày
-- gần nhất tính cả hôm nay. Cột created_at là TIMESTAMP không múi giờ, giả
-- định lưu UTC (Supabase mặc định).
--
-- Phễu RFQ tính theo nhóm (cohort): RFQ xưởng được mời trong kỳ → trong đó
-- xưởng đã báo giá → trong đó báo giá được chọn → trong đó thành đơn (chưa
-- huỷ). Mỗi bước là tập con của bước trước nên tỷ lệ luôn ≤ 100%.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_supplier_analytics(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_supplier_id   UUID;
    v_days          INT  := CASE WHEN p_days IN (7, 30, 90) THEN p_days ELSE 30 END;
    v_tz            CONSTANT TEXT := 'Asia/Ho_Chi_Minh';
    v_today         DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    v_from_day      DATE;
    v_prev_from_day DATE;
    v_since         TIMESTAMP;
    v_prev_since    TIMESTAMP;
    v_result        JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT id INTO v_supplier_id FROM supplier_profiles WHERE user_id = v_uid;
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;

    v_from_day      := v_today - (v_days - 1);
    v_prev_from_day := v_from_day - v_days;
    v_since         := (v_from_day::timestamp      AT TIME ZONE v_tz) AT TIME ZONE 'UTC';
    v_prev_since    := (v_prev_from_day::timestamp AT TIME ZONE v_tz) AT TIME ZONE 'UTC';

    WITH
    my_products AS (
        SELECT id, name, search_vector
        FROM products
        WHERE supplier_id = v_supplier_id AND status = 'active'
    ),
    -- tsquery tính 1 lần cho mỗi query phân biệt, không phải mỗi dòng log
    qmatch AS (
        SELECT dq.q, mp.id AS product_id
        FROM (SELECT DISTINCT lower(query) AS q
              FROM search_logs
              WHERE created_at >= v_prev_since
                AND user_id IS DISTINCT FROM v_uid) dq
        JOIN my_products mp ON mp.search_vector @@ plainto_tsquery('simple', dq.q)
    ),
    hits AS (   -- 1 dòng cho mỗi (lượt tìm kiếm, sản phẩm khớp)
        SELECT sl.id AS log_id, sl.created_at, qm.q, qm.product_id
        FROM search_logs sl
        JOIN qmatch qm ON qm.q = lower(sl.query)
        WHERE sl.created_at >= v_prev_since
          AND sl.user_id IS DISTINCT FROM v_uid
    ),
    days AS (
        -- ép ::timestamp: generate_series(date, date, interval) mặc định trả timestamptz,
        -- ::date ngược lại sẽ phụ thuộc múi giờ session
        SELECT d::date AS day
        FROM generate_series(v_from_day::timestamp, v_today::timestamp, INTERVAL '1 day') d
    ),
    daily AS (
        SELECT days.day, COUNT(DISTINCT h.log_id) AS n
        FROM days
        LEFT JOIN hits h
               ON h.created_at >= v_since
              AND ((h.created_at AT TIME ZONE 'UTC') AT TIME ZONE v_tz)::date = days.day
        GROUP BY days.day
    ),
    cohort AS (   -- RFQ xưởng được mời trong kỳ hiện tại
        SELECT t.rfq_id
        FROM rfq_targets t
        WHERE t.supplier_id = v_supplier_id AND t.created_at >= v_since
    ),
    cohort_detail AS (
        SELECT
            c.rfq_id,
            EXISTS (SELECT 1 FROM rfq_quotes q
                     WHERE q.rfq_id = c.rfq_id AND q.supplier_id = v_supplier_id) AS quoted,
            EXISTS (SELECT 1 FROM rfq_quotes q
                     WHERE q.rfq_id = c.rfq_id AND q.supplier_id = v_supplier_id
                       AND q.status = 'accepted') AS chosen,
            EXISTS (SELECT 1 FROM orders o JOIN rfq_quotes q ON q.id = o.rfq_quote_id
                     WHERE q.rfq_id = c.rfq_id AND o.supplier_id = v_supplier_id
                       AND o.status <> 'cancelled') AS ordered,
            (SELECT MIN(q.created_at) FROM rfq_quotes q
              WHERE q.rfq_id = c.rfq_id AND q.supplier_id = v_supplier_id)
              - r.created_at AS my_response,
            m.quotes_received, m.time_to_first_quote, m.time_to_award
        FROM cohort c
        JOIN rfq_requests r ON r.id = c.rfq_id
        LEFT JOIN rfq_metrics m ON m.rfq_id = c.rfq_id
    )
    SELECT jsonb_build_object(
        'days', v_days,
        'from', v_from_day,
        'to',   v_today,

        'search_appearances', jsonb_build_object(
            'current',  (SELECT COUNT(DISTINCT log_id) FROM hits WHERE created_at >= v_since),
            'previous', (SELECT COUNT(DISTINCT log_id) FROM hits WHERE created_at <  v_since)
        ),
        'rfq_received', jsonb_build_object(
            'current',  (SELECT COUNT(*) FROM rfq_targets
                          WHERE supplier_id = v_supplier_id AND created_at >= v_since),
            'previous', (SELECT COUNT(*) FROM rfq_targets
                          WHERE supplier_id = v_supplier_id
                            AND created_at >= v_prev_since AND created_at < v_since)
        ),
        'quotes_sent', jsonb_build_object(
            'current',  (SELECT COUNT(*) FROM rfq_quotes
                          WHERE supplier_id = v_supplier_id AND created_at >= v_since),
            'previous', (SELECT COUNT(*) FROM rfq_quotes
                          WHERE supplier_id = v_supplier_id
                            AND created_at >= v_prev_since AND created_at < v_since)
        ),
        'revenue', jsonb_build_object(
            'current',  (SELECT COALESCE(SUM(total_amount), 0) FROM orders
                          WHERE supplier_id = v_supplier_id AND status <> 'cancelled'
                            AND created_at >= v_since),
            'previous', (SELECT COALESCE(SUM(total_amount), 0) FROM orders
                          WHERE supplier_id = v_supplier_id AND status <> 'cancelled'
                            AND created_at >= v_prev_since AND created_at < v_since)
        ),

        'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', n) ORDER BY day), '[]'::jsonb)
                  FROM daily),

        'funnel', (SELECT jsonb_build_object(
                       'received', COUNT(*),
                       'quoted',   COUNT(*) FILTER (WHERE quoted),
                       'chosen',   COUNT(*) FILTER (WHERE chosen),
                       'ordered',  COUNT(*) FILTER (WHERE ordered))
                   FROM cohort_detail),

        -- Đọc từ rfq_metrics: bối cảnh cạnh tranh của các RFQ trong nhóm.
        'rfq_market', (SELECT jsonb_build_object(
                           'rfqs',                 COUNT(*),
                           'avg_quotes_received',  ROUND(AVG(quotes_received)::numeric, 1),
                           'avg_first_quote_hours',
                               ROUND((AVG(EXTRACT(EPOCH FROM time_to_first_quote)) / 3600)::numeric, 1),
                           'avg_award_hours',
                               ROUND((AVG(EXTRACT(EPOCH FROM time_to_award)) / 3600)::numeric, 1),
                           'awarded_count',        COUNT(*) FILTER (WHERE time_to_award IS NOT NULL),
                           'my_avg_response_hours',
                               ROUND((AVG(EXTRACT(EPOCH FROM my_response)) / 3600)::numeric, 1))
                       FROM cohort_detail),

        'keywords', (SELECT COALESCE(jsonb_agg(jsonb_build_object('query', q, 'count', n) ORDER BY n DESC, q), '[]'::jsonb)
                     FROM (SELECT q, COUNT(DISTINCT log_id) AS n
                           FROM hits WHERE created_at >= v_since
                           GROUP BY q ORDER BY n DESC, q LIMIT 8) k),

        'top_products', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n) ORDER BY n DESC, name), '[]'::jsonb)
                         FROM (SELECT mp.id, mp.name, COUNT(DISTINCT h.log_id) AS n
                               FROM hits h JOIN my_products mp ON mp.id = h.product_id
                               WHERE h.created_at >= v_since
                               GROUP BY mp.id, mp.name ORDER BY n DESC, mp.name LIMIT 5) p)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_supplier_analytics IS
    'Số liệu /supplier/analytics cho supplier đang đăng nhập. p_days ∈ {7,30,90}
     (giá trị khác → 30). Xem chú thích đầu mục BƯỚC 4 của migration.';

-- Supabase cấp sẵn EXECUTE cho anon/authenticated qua default privileges,
-- nên REVOKE FROM PUBLIC một mình không đủ — phải revoke anon rõ ràng.
REVOKE ALL ON FUNCTION public.get_supplier_analytics(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_analytics(INT) TO authenticated;

-- ============================================================
-- KIỂM TRA SAU MIGRATION
-- ============================================================
DO $$
DECLARE v_count INT; v_rfqs INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM rfq_metrics;
    SELECT COUNT(*) INTO v_rfqs  FROM rfq_requests;
    IF v_count <> v_rfqs THEN
        RAISE EXCEPTION 'rfq_metrics backfill: % dòng nhưng có % RFQ', v_count, v_rfqs;
    END IF;

    SELECT COUNT(*) INTO v_count FROM pg_trigger
    WHERE tgname IN ('trg_rfq_metrics_on_rfq_created', 'trg_rfq_metrics_on_target_added',
                     'trg_rfq_metrics_on_quote_created', 'trg_rfq_metrics_on_rfq_awarded',
                     'trg_rfq_metrics_on_order_created')
      AND NOT tgisinternal;
    IF v_count <> 5 THEN RAISE EXCEPTION 'Kỳ vọng 5 trigger rfq_metrics, có %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('search_logs', 'rfq_metrics')
      AND c.relrowsecurity AND c.relforcerowsecurity;
    IF v_count <> 2 THEN RAISE EXCEPTION 'search_logs/rfq_metrics chưa bật RLS đầy đủ'; END IF;

    RAISE NOTICE 'Migration OK — search_logs, rfq_metrics (% dòng backfill), log_search(), get_supplier_analytics()', v_rfqs;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.get_supplier_analytics(INT);
-- DROP FUNCTION IF EXISTS public.log_search(TEXT, TEXT);
-- DROP TRIGGER  IF EXISTS trg_rfq_metrics_on_order_created  ON orders;
-- DROP TRIGGER  IF EXISTS trg_rfq_metrics_on_rfq_awarded    ON rfq_requests;
-- DROP TRIGGER  IF EXISTS trg_rfq_metrics_on_rfq_created    ON rfq_requests;
-- DROP TRIGGER  IF EXISTS trg_rfq_metrics_on_quote_created  ON rfq_quotes;
-- DROP TRIGGER  IF EXISTS trg_rfq_metrics_on_target_added   ON rfq_targets;
-- DROP FUNCTION IF EXISTS public.rfq_metrics_on_order_created();
-- DROP FUNCTION IF EXISTS public.rfq_metrics_on_rfq_awarded();
-- DROP FUNCTION IF EXISTS public.rfq_metrics_on_quote_created();
-- DROP FUNCTION IF EXISTS public.rfq_metrics_on_target_added();
-- DROP FUNCTION IF EXISTS public.rfq_metrics_on_rfq_created();
-- DROP TABLE IF EXISTS rfq_metrics CASCADE;
-- DROP TABLE IF EXISTS search_logs CASCADE;
-- DROP FUNCTION IF EXISTS public.is_rfq_buyer(UUID);   -- sau DROP TABLE rfq_metrics (policy dùng nó)
-- COMMIT;
