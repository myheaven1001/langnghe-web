-- ============================================================
-- Row Level Security (RLS) — Sàn B2B Bán Buôn Làng Nghề (11/11)
-- Viết lại từ rls_policies.sql gốc theo convention Supabase (auth.uid())
--
-- Giữ nguyên 100% LOGIC PHÂN QUYỀN gốc — chỉ đổi CƠ CHẾ lấy danh tính:
--   current_app_user_id()   → auth.uid()          (built-in Supabase)
--   is_admin()               → public.is_admin()   (tra public.users.role)
--   current_app_user_role() = 'system'  → bỏ (xem giải thích ở
--                                          20260905120900_rls_helpers.sql)
--
-- Nguyên tắc thiết kế (không đổi):
--   Buyer    — chỉ thấy data của mình + data public (sản phẩm, supplier public info)
--   Supplier — chỉ thấy gian hàng của mình + RFQ gửi đến mình + đơn của mình
--   Admin    — thấy tất cả (qua public.is_admin(), không còn BYPASSRLS role riêng)
--   System   — job nền dùng service_role key, bypass RLS ở tầng Supabase
--   Unauthenticated (anon key) — chỉ thấy products/categories (public catalog),
--                                 vì auth.uid() = NULL nên mọi điều kiện
--                                 "= auth.uid()" tự động false, không cần
--                                 case riêng cho anonymous.
-- ============================================================

-- ============================================================
-- BẢNG: public.users
-- Buyer/Supplier: chỉ thấy record của chính mình. Admin: thấy tất cả.
-- KHÔNG có policy INSERT: dòng duy nhất được tạo qua trigger
-- handle_new_user() (SECURITY DEFINER, xem migration 2/11) — không có
-- đường nào khác để client tự INSERT vào bảng này.
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON public.users
    FOR SELECT USING (
        id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY users_update_own ON public.users
    FOR UPDATE USING (
        id = auth.uid()
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: buyer_profiles
-- ============================================================
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyer_profiles_select ON buyer_profiles
    FOR SELECT USING (
        user_id = auth.uid()
        OR public.is_admin()
        -- Supplier được xem basic info của buyer khi có giao dịch chung
        OR EXISTS (
            SELECT 1 FROM orders o
            JOIN supplier_profiles sp ON sp.id = o.supplier_id
            WHERE o.buyer_id = buyer_profiles.id
              AND sp.user_id = auth.uid()
        )
    );

CREATE POLICY buyer_profiles_modify_own ON buyer_profiles
    FOR ALL USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: supplier_profiles
-- Public: tất cả authenticated user đều xem được (marketplace)
-- Modify: chỉ chủ sở hữu + admin
-- ============================================================
ALTER TABLE supplier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_profiles_select_all ON supplier_profiles
    FOR SELECT USING (TRUE);  -- Public catalog

CREATE POLICY supplier_profiles_modify_own ON supplier_profiles
    FOR ALL USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: verifications
-- ============================================================
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY verifications_select ON verifications
    FOR SELECT USING (
        (entity_type = 'buyer' AND EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = verifications.entity_id
              AND bp.user_id = auth.uid()
        ))
        OR (entity_type = 'supplier' AND EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = verifications.entity_id
              AND sp.user_id = auth.uid()
        ))
        OR public.is_admin()
    );

CREATE POLICY verifications_insert_own ON verifications
    FOR INSERT WITH CHECK (
        (entity_type = 'buyer' AND EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = entity_id AND bp.user_id = auth.uid()
        ))
        OR (entity_type = 'supplier' AND EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = entity_id AND sp.user_id = auth.uid()
        ))
        OR public.is_admin()
    );

-- Chỉ admin được UPDATE (duyệt/từ chối)
CREATE POLICY verifications_update_admin ON verifications
    FOR UPDATE USING (public.is_admin());

-- ============================================================
-- BẢNG: categories
-- Public read-only
-- ============================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_select_all ON categories
    FOR SELECT USING (TRUE);

CREATE POLICY categories_modify_admin ON categories
    FOR ALL USING (public.is_admin());

-- ============================================================
-- BẢNG: products
-- SELECT: public (tất cả xem sản phẩm active)
-- INSERT/UPDATE/DELETE: chỉ supplier chủ sở hữu + admin
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON products
    FOR SELECT USING (
        status = 'active'                     -- Public: chỉ thấy sản phẩm active
        OR public.is_admin()
        OR EXISTS (                           -- Supplier xem cả draft/paused của mình
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = products.supplier_id
              AND sp.user_id = auth.uid()
        )
    );

CREATE POLICY products_modify_supplier ON products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = products.supplier_id
              AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: price_tiers
-- Theo products (inherit visibility)
-- ============================================================
ALTER TABLE price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_tiers_select ON price_tiers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = price_tiers.product_id
              AND (p.status = 'active' OR public.is_admin()
                   OR EXISTS (SELECT 1 FROM supplier_profiles sp
                              WHERE sp.id = p.supplier_id
                                AND sp.user_id = auth.uid()))
        )
    );

CREATE POLICY price_tiers_modify_supplier ON price_tiers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM products p
            JOIN supplier_profiles sp ON sp.id = p.supplier_id
            WHERE p.id = price_tiers.product_id
              AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: product_media
-- Theo products
-- ============================================================
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_media_select ON product_media
    FOR SELECT USING (
        status = 'ready'                       -- Public: chỉ thấy media đã xử lý xong
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM products p
            JOIN supplier_profiles sp ON sp.id = p.supplier_id
            WHERE p.id = product_media.product_id
              AND sp.user_id = auth.uid()
        )
    );

CREATE POLICY product_media_modify_supplier ON product_media
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM products p
            JOIN supplier_profiles sp ON sp.id = p.supplier_id
            WHERE p.id = product_media.product_id
              AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: rfq_requests
-- Buyer: CRUD own RFQ
-- Supplier: SELECT rfq gửi đến mình (qua rfq_quotes) + multi-RFQ theo ngành
-- ============================================================
ALTER TABLE rfq_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY rfq_requests_buyer_own ON rfq_requests
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = rfq_requests.buyer_id
              AND bp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY rfq_requests_supplier_view ON rfq_requests
    FOR SELECT USING (
        -- Supplier thấy RFQ mình đã được mời (có quote)
        EXISTS (
            SELECT 1 FROM rfq_quotes rq
            JOIN supplier_profiles sp ON sp.id = rq.supplier_id
            WHERE rq.rfq_id = rfq_requests.id
              AND sp.user_id = auth.uid()
        )
        -- Supplier thấy multi-RFQ theo ngành hàng của mình
        OR (rfq_type = 'multi' AND status = 'published' AND EXISTS (
            SELECT 1 FROM supplier_profiles sp
            JOIN products p ON p.supplier_id = sp.id
            WHERE sp.user_id = auth.uid()
              AND p.category_id = rfq_requests.category_id
              AND p.status = 'active'
        ))
    );

-- ============================================================
-- BẢNG: rfq_quotes
-- Supplier: CRUD own quotes
-- Buyer: SELECT quotes của RFQ mình tạo (nhưng ẩn supplier_id khi multi)
-- ============================================================
ALTER TABLE rfq_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY rfq_quotes_supplier_own ON rfq_quotes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = rfq_quotes.supplier_id
              AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY rfq_quotes_buyer_view ON rfq_quotes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rfq_requests r
            JOIN buyer_profiles bp ON bp.id = r.buyer_id
            WHERE r.id = rfq_quotes.rfq_id
              AND bp.user_id = auth.uid()
        )
    );

-- Defense-in-depth: che supplier_id cho multi-RFQ chưa chốt ở tầng DB.
-- Không đổi so với gốc — view này không dùng session var nào cả.
CREATE OR REPLACE VIEW rfq_quotes_anonymous AS
    SELECT
        q.id,
        q.rfq_id,
        CASE
            WHEN r.rfq_type = 'multi' AND q.status != 'accepted'
            THEN NULL::UUID
            ELSE q.supplier_id
        END AS supplier_id,
        q.unit_price,
        q.min_qty,
        q.lead_time_days,
        q.note,
        q.valid_until,
        q.status,
        q.created_at,
        q.updated_at
    FROM rfq_quotes q
    JOIN rfq_requests r ON r.id = q.rfq_id;

COMMENT ON VIEW rfq_quotes_anonymous IS
    'View dùng cho multi-RFQ: ẩn supplier_id khi báo giá chưa được chấp nhận.
     Defense-in-depth — tầng DB bảo vệ, không phụ thuộc app layer.';

-- ============================================================
-- BẢNG: orders
-- Buyer và Supplier chỉ thấy đơn hàng của mình
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_buyer_view ON orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = orders.buyer_id
              AND bp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY orders_supplier_view ON orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = orders.supplier_id
              AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

-- Chỉ buyer được tạo đơn; update do app logic (admin xác nhận, supplier cập nhật)
CREATE POLICY orders_buyer_insert ON orders
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = buyer_id
              AND bp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY orders_update ON orders
    FOR UPDATE USING (
        -- Buyer cập nhật: xác nhận nhận hàng
        EXISTS (SELECT 1 FROM buyer_profiles bp
                WHERE bp.id = orders.buyer_id AND bp.user_id = auth.uid())
        -- Supplier cập nhật: cập nhật tracking
        OR EXISTS (SELECT 1 FROM supplier_profiles sp
                   WHERE sp.id = orders.supplier_id AND sp.user_id = auth.uid())
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: notifications
-- User chỉ thấy notification của mình
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_own ON notifications
    FOR ALL USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: notification_preferences
-- ============================================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_prefs_own ON notification_preferences
    FOR ALL USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- ============================================================
-- BẢNG: interaction_events
-- Append-only từ app; user không đọc trực tiếp (chỉ admin + analytics)
-- ============================================================
ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events FORCE  ROW LEVEL SECURITY;

-- Event actor_type = 'system' (job nền, webhook) giờ ghi bằng service_role
-- key — key này bypass RLS hoàn toàn ở tầng Supabase, nên không cần
-- nhánh "current_app_user_role() = 'system'" như bản gốc nữa.
CREATE POLICY interaction_events_insert ON interaction_events
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY interaction_events_select_admin ON interaction_events
    FOR SELECT USING (public.is_admin());

-- ============================================================
-- BẢNG: domain_events
-- Append-only từ app; chỉ admin đọc trực tiếp
-- ============================================================
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE  ROW LEVEL SECURITY;

-- Bản gốc cho phép actor_id IS NULL khi role IN ('system','admin').
-- 'system' (job nền) nay dùng service_role key → bypass RLS, không cần
-- khai báo ở đây. is_admin() OR ở dưới vẫn cho phép admin ghi actor_id
-- NULL (vì OR is_admin() không ràng buộc giá trị actor_id) — giữ đúng
-- nhánh "admin" của bản gốc.
CREATE POLICY domain_events_insert ON domain_events
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY domain_events_select_admin ON domain_events
    FOR SELECT USING (public.is_admin());

-- ============================================================
-- FORCE ROW LEVEL SECURITY — tất cả bảng đã bật RLS
-- ============================================================
-- FORCE buộc áp dụng policy ngay cả khi kết nối chạy dưới quyền owner bảng
-- (ví dụ Supabase SQL Editor chạy như `postgres`). Admin (public.is_admin())
-- vẫn xem được tất cả — đó là đường bypass có chủ ý qua policy, không phải
-- qua quyền Postgres role như bản gốc.
ALTER TABLE public.users             FORCE ROW LEVEL SECURITY;
ALTER TABLE buyer_profiles           FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_profiles        FORCE ROW LEVEL SECURITY;
ALTER TABLE verifications            FORCE ROW LEVEL SECURITY;
ALTER TABLE products                 FORCE ROW LEVEL SECURITY;
ALTER TABLE price_tiers              FORCE ROW LEVEL SECURITY;
ALTER TABLE product_media            FORCE ROW LEVEL SECURITY;
ALTER TABLE rfq_requests             FORCE ROW LEVEL SECURITY;
ALTER TABLE rfq_quotes               FORCE ROW LEVEL SECURITY;
ALTER TABLE orders                   FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications            FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
-- categories: public read-only, FORCE không bắt buộc nhưng thêm cho nhất quán
ALTER TABLE categories               FORCE ROW LEVEL SECURITY;

-- ============================================================
-- KIỂM TRA RLS + FORCE ĐÃ BẬT  (fail cứng nếu thiếu)
--
-- SỬA SO VỚI BẢN GỐC: join thêm pg_namespace và lọc nspname = 'public'.
-- Bản gốc chỉ lọc theo relname, vốn an toàn vì chỉ có 1 bảng "users".
-- Ở Supabase có CẢ auth.users lẫn public.users cùng tên "users" —
-- không lọc theo schema sẽ khiến subquery trả về nhiều dòng và
-- RAISE lỗi "more than one row returned by a subquery".
-- ============================================================
DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'users','buyer_profiles','supplier_profiles','verifications',
        'categories','products','price_tiers','product_media',
        'rfq_requests','rfq_quotes','orders',
        'notifications','notification_preferences',
        'interaction_events','domain_events'
    ];
    v_table      TEXT;
    v_rls        BOOLEAN;
    v_force      BOOLEAN;
    v_no_rls     TEXT := '';
    v_no_force   TEXT := '';
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        SELECT c.relrowsecurity, c.relforcerowsecurity
        INTO v_rls, v_force
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_table AND n.nspname = 'public';

        IF NOT v_rls   THEN v_no_rls   := v_no_rls   || v_table || ' '; END IF;
        IF NOT v_force THEN v_no_force := v_no_force || v_table || ' '; END IF;
    END LOOP;

    IF v_no_rls <> '' THEN
        RAISE EXCEPTION 'RLS chưa bật trên: % — DỪNG, không an toàn để tiếp tục', v_no_rls;
    END IF;
    IF v_no_force <> '' THEN
        RAISE EXCEPTION 'FORCE RLS chưa bật trên: % — owner có thể bypass RLS', v_no_force;
    END IF;

    RAISE NOTICE 'RLS + FORCE: OK — 15 bảng MVP được bảo vệ đầy đủ';
END $$;

-- ============================================================
-- CÁCH DÙNG TRONG APP (thay thế phần "NestJS/Node.js" ở bản gốc)
-- ============================================================
-- KHÔNG cần tự SET LOCAL app.current_user_id / app.current_user_role nữa.
--
-- Client (anon key hoặc user JWT) query qua supabase-js/PostgREST:
--   auth.uid() tự động lấy từ JWT trong header Authorization — không cần
--   set gì thêm. Chưa đăng nhập → auth.uid() = NULL → chỉ thấy data public
--   (products active, categories, supplier_profiles) như policy ở trên.
--
-- Backend job / webhook cần ghi "system event" (domain_events,
-- interaction_events với actor NULL):
--   Dùng SUPABASE_SERVICE_ROLE_KEY (không phải anon key) — key này
--   bypass RLS hoàn toàn ở tầng Supabase, tương đương BYPASSRLS ở bản gốc.
--   ⚠️ Không bao giờ đưa service_role key vào code chạy trên trình duyệt.
--
-- Admin panel: đăng nhập bình thường như user khác (không có Postgres
-- role admin riêng) — public.is_admin() tự tra public.users.role = 'admin'
-- và các policy phía trên tự cho phép SELECT/UPDATE toàn bộ dữ liệu.
-- ============================================================
