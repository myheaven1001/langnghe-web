-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (1/11)
-- Extensions + ENUM types
--
-- Không đổi so với schema_v1_mvp.sql gốc — Supabase hỗ trợ đầy đủ
-- pgcrypto và btree_gist như một Postgres bình thường.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- ENUM TYPES (13 loại — giữ đầy đủ để tránh migrate sau)
-- ============================================================

CREATE TYPE user_role           AS ENUM ('buyer', 'supplier', 'both', 'admin');
CREATE TYPE user_status         AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE membership_tier     AS ENUM ('free', 'basic', 'premium');
CREATE TYPE product_status      AS ENUM ('draft', 'active', 'paused', 'deleted');
CREATE TYPE rfq_type            AS ENUM ('single', 'multi');
-- RFQ lifecycle đầy đủ (dù MVP chưa dùng hết, tránh ALTER ENUM sau)
CREATE TYPE rfq_status          AS ENUM (
    'draft', 'published', 'quoted', 'negotiating',
    'awarded', 'closed', 'expired', 'cancelled'
);
CREATE TYPE quote_status        AS ENUM ('pending', 'counter_offered', 'accepted', 'rejected');
CREATE TYPE message_role        AS ENUM ('buyer', 'supplier');
CREATE TYPE order_status        AS ENUM (
    'pending_payment',      -- chờ buyer chuyển khoản
    'confirmed',            -- admin xác nhận đã nhận tiền
    'producing',
    'shipped',
    'delivered',
    'completed',
    'cancelled'
    -- 'disputed' bỏ khỏi MVP, xử lý thủ công
);
CREATE TYPE media_type          AS ENUM ('image', 'video', 'pdf');
CREATE TYPE media_status        AS ENUM ('uploading', 'processing', 'ready', 'failed', 'deleted');
CREATE TYPE notification_type   AS ENUM (
    'rfq_received', 'quote_received', 'quote_accepted',
    'order_confirmed', 'order_shipped', 'order_delivered',
    'rfq_expired', 'verification_approved', 'verification_rejected',
    'account_suspended',
    'quota_low', 'credit_low'   -- Sprint 2: khai báo sẵn, chưa emit trong MVP
);
CREATE TYPE notification_channel AS ENUM ('in_app', 'email');
