-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (9/11)
-- INDEXES còn lại — không đổi so với schema_v1_mvp.sql gốc
-- (uq_quote_active_per_supplier, idx_domain_events_*, idx_products_search
--  đã tạo cùng bảng/trigger liên quan ở các migration trước)
-- ============================================================

-- Users & Auth
CREATE INDEX idx_buyer_profiles_user    ON buyer_profiles (user_id);
CREATE INDEX idx_supplier_profiles_user ON supplier_profiles (user_id);
CREATE INDEX idx_verifications_entity   ON verifications (entity_id, entity_type);
CREATE INDEX idx_verifications_status   ON verifications (status);

-- Products
CREATE INDEX idx_products_supplier      ON products (supplier_id);
CREATE INDEX idx_products_category      ON products (category_id);
CREATE INDEX idx_products_status        ON products (status);
CREATE INDEX idx_price_tiers_product    ON price_tiers (product_id);
CREATE INDEX idx_media_product          ON product_media (product_id);
CREATE INDEX idx_media_status           ON product_media (status);

-- RFQ
CREATE INDEX idx_rfq_buyer              ON rfq_requests (buyer_id);
CREATE INDEX idx_rfq_category           ON rfq_requests (category_id);
CREATE INDEX idx_rfq_status             ON rfq_requests (status);
CREATE INDEX idx_rfq_expires            ON rfq_requests (expires_at);
CREATE INDEX idx_quotes_rfq             ON rfq_quotes (rfq_id);
CREATE INDEX idx_quotes_supplier        ON rfq_quotes (supplier_id);

-- Orders
CREATE INDEX idx_orders_buyer           ON orders (buyer_id);
CREATE INDEX idx_orders_supplier        ON orders (supplier_id);
CREATE INDEX idx_orders_quote           ON orders (rfq_quote_id);
CREATE INDEX idx_orders_status          ON orders (status);

-- Notifications
CREATE INDEX idx_notifs_user_unread     ON notifications (user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifs_user_created    ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifs_status_pending  ON notifications (status) WHERE status = 'pending'; -- BullMQ retry

-- Interaction Events (index sẵn dù chưa ghi data)
CREATE INDEX idx_interaction_actor      ON interaction_events (actor_id, created_at DESC);
CREATE INDEX idx_interaction_target     ON interaction_events (target_type, target_id);
