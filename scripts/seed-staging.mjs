#!/usr/bin/env node
// Tạo 5 tài khoản test + dữ liệu mẫu trên Supabase STAGING (bước 0.4).
//
// Cách dùng (xem docs/QUY_TRINH_DEPLOY.md, mục "Test trên staging"):
//   npm run seed:staging
// Biến môi trường đọc từ .env.staging.local (không commit):
//   SUPABASE_URL=https://<ref-staging>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key của staging>
//   SEED_TEST_PASSWORD=<mật khẩu chung cho 5 tài khoản test, ≥ 12 ký tự>
//
// Chạy lại bao nhiêu lần cũng được: tài khoản/hồ sơ/sản phẩm/RFQ đã có thì
// cập nhật lại, không tạo trùng; mật khẩu được đặt lại theo SEED_TEST_PASSWORD.
//
// Tài khoản tạo bằng auth.admin.createUser (email_confirm: true) nên không
// gửi email — không cần SMTP. Script dùng service_role (bỏ qua RLS và các
// trigger guard_* chỉ chặn role `authenticated`).

import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'vgoymfnwimgypvmpozvf';
const EMAIL_DOMAIN = 'langnghe.test';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_TEST_PASSWORD;

function fail(message) {
  console.error(`Dừng: ${message}`);
  process.exit(1);
}

if (!url || !serviceKey || !password) {
  fail('thiếu SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY hoặc SEED_TEST_PASSWORD (xem đầu file).');
}
if ([serviceKey, password].some((v) => v.endsWith('_VAO_DAY'))) {
  fail('còn giá trị mẫu *_VAO_DAY trong .env.staging.local — điền key và mật khẩu thật.');
}
if (password.length < 12) fail('SEED_TEST_PASSWORD phải có ít nhất 12 ký tự.');

const ref = new URL(url).hostname.split('.')[0];
if (ref === PRODUCTION_REF) fail(`${url} là PRODUCTION. Script này chỉ chạy trên staging.`);

// Key dạng JWT (legacy) mang `ref` của project: chặn trường hợp URL staging
// nhưng dán nhầm key production.
if (serviceKey.startsWith('eyJ')) {
  try {
    const claims = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64url').toString());
    if (claims.ref && claims.ref !== ref) {
      fail(`key thuộc project ${claims.ref}, không khớp URL (${ref}).`);
    }
    if (claims.role !== 'service_role')
      fail('SUPABASE_SERVICE_ROLE_KEY không phải key service_role.');
  } catch {
    fail('SUPABASE_SERVICE_ROLE_KEY không đọc được.');
  }
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

// ── Tài khoản ────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { key: 'buyerA', email: `buyer.a@${EMAIL_DOMAIN}`, role: 'buyer' },
  { key: 'buyerB', email: `buyer.b@${EMAIL_DOMAIN}`, role: 'buyer' },
  { key: 'supplierA', email: `xuong.a@${EMAIL_DOMAIN}`, role: 'supplier' },
  { key: 'supplierB', email: `xuong.b@${EMAIL_DOMAIN}`, role: 'supplier' },
  { key: 'admin', email: `admin@${EMAIL_DOMAIN}`, role: 'admin' },
];

async function findAuthUser(email) {
  for (let page = 1; ; page++) {
    const { users } = await must(
      db.auth.admin.listUsers({ page, perPage: 1000 }),
      'đọc danh sách tài khoản',
    );
    const found = users.find((u) => u.email === email);
    if (found || users.length < 1000) return found ?? null;
  }
}

async function ensureAccount({ email, role }) {
  // handle_new_user() chỉ nhận buyer/supplier từ metadata; admin tạo như
  // buyer rồi nâng role bên dưới (đúng cách admin thật được tạo).
  const signupRole = role === 'supplier' ? 'supplier' : 'buyer';
  let user = await findAuthUser(email);
  if (user) {
    await must(db.auth.admin.updateUserById(user.id, { password }), `đặt lại mật khẩu ${email}`);
  } else {
    ({ user } = await must(
      db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: signupRole },
      }),
      `tạo ${email}`,
    ));
  }
  await must(
    db.from('users').update({ role, status: 'active' }).eq('id', user.id),
    `kích hoạt ${email}`,
  );
  return user.id;
}

// ── Hồ sơ ────────────────────────────────────────────────────────────────

const BUYER_PROFILES = {
  buyerA: {
    company_name: 'Công ty TNHH Nội thất An Phát (test)',
    tax_code: '0100000001',
    address: '12 Trần Duy Hưng, Cầu Giấy',
    city: 'Hà Nội',
  },
  buyerB: {
    company_name: 'Cửa hàng Quà tặng Mộc (test)',
    city: 'TP. Hồ Chí Minh',
  },
};

const SUPPLIER_PROFILES = {
  supplierA: {
    shop_name: 'Gốm Bát Tràng Minh Phúc (test)',
    tax_code: '0100000003',
    village_origin: 'Bát Tràng, Gia Lâm, Hà Nội',
    craft_category: 'Gốm sứ',
    founding_year: 1998,
    monthly_capacity: 5000,
    contact_phone: '0900000003',
  },
  supplierB: {
    shop_name: 'Mây tre đan Phú Vinh (test)',
    village_origin: 'Phú Vinh, Chương Mỹ, Hà Nội',
    craft_category: 'Mây tre đan',
    founding_year: 2010,
    monthly_capacity: 2000,
  },
};

async function upsertProfile(table, userId, fields) {
  const row = await must(
    db
      .from(table)
      .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' })
      .select('id')
      .single(),
    `lưu ${table}`,
  );
  return row.id;
}

// Xác minh đã duyệt sẵn (thêm thẳng dòng 'approved' nên trigger thông báo
// AFTER UPDATE không chạy — không sinh thông báo giả).
async function ensureApprovedVerification(entityType, entityId, adminId, taxCode) {
  const existing = await must(
    db.from('verifications').select('id').eq('entity_type', entityType).eq('entity_id', entityId),
    'đọc verifications',
  );
  if (existing.length === 0) {
    await must(
      db.from('verifications').insert({
        entity_type: entityType,
        entity_id: entityId,
        status: 'approved',
        tax_code: taxCode,
        verified_by: adminId,
        verified_at: new Date().toISOString(),
      }),
      'tạo verification',
    );
  }
}

// ── Sản phẩm ─────────────────────────────────────────────────────────────

const PRODUCTS = {
  supplierA: [
    {
      name: 'Bình hoa gốm men rạn cao 30cm',
      category: 'gom-su',
      description: 'Bình gốm men rạn cổ, nung 1.250°C, vẽ tay.',
      min_order_qty: 50,
      lead_time_days: 20,
      accept_oem: true,
      tiers: [
        [50, 199, 120000],
        [200, 499, 105000],
        [500, null, 95000],
      ],
    },
    {
      name: 'Bộ ấm chén men lam 6 chén',
      category: 'gom-su',
      description: 'Men lam vẽ tay, hộp giấy kraft.',
      min_order_qty: 30,
      lead_time_days: 15,
      tiers: [
        [30, 99, 350000],
        [100, null, 310000],
      ],
    },
    {
      name: 'Đĩa trang trí gốm sơn mài 25cm',
      category: 'gom-su',
      min_order_qty: 100,
      lead_time_days: 25,
      accept_custom: true,
      tiers: [[100, null, 85000]],
    },
  ],
  supplierB: [
    {
      name: 'Giỏ mây đan quai da size M',
      category: 'may-tre-dan',
      description: 'Mây tự nhiên, quai da bò.',
      min_order_qty: 100,
      lead_time_days: 18,
      tiers: [
        [100, 499, 65000],
        [500, null, 55000],
      ],
    },
    {
      // Nháp: kiểm tra sản phẩm draft không hiện với khách.
      name: 'Khay tre đan hình chữ nhật (nháp)',
      category: 'may-tre-dan',
      min_order_qty: 200,
      status: 'draft',
      tiers: [[200, null, 40000]],
    },
  ],
};

async function ensureProducts(supplierId, products, categoryIds) {
  const ids = [];
  for (const { tiers, category, status = 'active', ...fields } of products) {
    const row = {
      ...fields,
      supplier_id: supplierId,
      category_id: categoryIds[category] ?? null,
      status,
    };
    const existing = await must(
      db.from('products').select('id').eq('supplier_id', supplierId).eq('name', fields.name),
      'đọc products',
    );
    let productId;
    if (existing.length > 0) {
      productId = existing[0].id;
      await must(db.from('products').update(row).eq('id', productId), `cập nhật ${fields.name}`);
    } else {
      productId = (
        await must(db.from('products').insert(row).select('id').single(), `tạo ${fields.name}`)
      ).id;
    }
    await must(db.from('price_tiers').delete().eq('product_id', productId), 'xoá bảng giá cũ');
    await must(
      db.from('price_tiers').insert(
        tiers.map(([min_qty, max_qty, unit_price]) => ({
          product_id: productId,
          min_qty,
          max_qty,
          unit_price,
        })),
      ),
      `bảng giá ${fields.name}`,
    );
    ids.push(productId);
  }
  return ids;
}

// ── RFQ ──────────────────────────────────────────────────────────────────

async function ensureRfq(buyerId, supplierId, productId, categoryId) {
  const title = 'Đặt 300 bình hoa men rạn cho chuỗi nhà hàng (test)';
  const existing = await must(
    db.from('rfq_requests').select('id').eq('buyer_id', buyerId).eq('title', title),
    'đọc rfq_requests',
  );
  if (existing.length > 0) return existing[0].id;

  // Giống create_rfq() (hàm đó cần auth.uid() nên không gọi được bằng
  // service_role), trừ quota: RFQ mẫu không tính vào hạn mức của buyer A.
  const rfq = await must(
    db
      .from('rfq_requests')
      .insert({
        buyer_id: buyerId,
        product_id: productId,
        category_id: categoryId,
        title,
        requirements: 'Men rạn màu ngà, in logo chìm đáy bình. Giao Hà Nội.',
        quantity: 300,
        unit: 'cái',
        budget_min: 90000,
        budget_max: 110000,
        deadline_days: 30,
        rfq_type: 'single',
        status: 'published',
      })
      .select('id')
      .single(),
    'tạo RFQ',
  );
  await must(
    db.from('rfq_targets').insert({ rfq_id: rfq.id, supplier_id: supplierId }),
    'gắn RFQ cho xưởng A',
  );
  return rfq.id;
}

// ── Chạy ─────────────────────────────────────────────────────────────────

console.log(`Seed staging: ${url}`);

const userIds = {};
for (const account of ACCOUNTS) {
  userIds[account.key] = await ensureAccount(account);
}

const buyerIds = {};
for (const [key, fields] of Object.entries(BUYER_PROFILES)) {
  buyerIds[key] = await upsertProfile('buyer_profiles', userIds[key], fields);
}
const supplierIds = {};
for (const [key, fields] of Object.entries(SUPPLIER_PROFILES)) {
  supplierIds[key] = await upsertProfile('supplier_profiles', userIds[key], fields);
}

// Buyer A và xưởng A đã xác minh; buyer B và xưởng B chưa (để test luồng
// gửi và duyệt xác minh).
await ensureApprovedVerification('buyer', buyerIds.buyerA, userIds.admin, '0100000001');
await must(
  db
    .from('buyer_profiles')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', buyerIds.buyerA)
    .is('verified_at', null),
  'đánh dấu buyer A đã xác minh',
);
await ensureApprovedVerification('supplier', supplierIds.supplierA, userIds.admin, '0100000003');

const categories = await must(db.from('categories').select('id, slug'), 'đọc categories');
const categoryIds = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
if (!categoryIds['gom-su']) fail('chưa có danh mục (migration 20260918090000 chưa chạy?).');

const productIds = {};
for (const [key, products] of Object.entries(PRODUCTS)) {
  productIds[key] = await ensureProducts(supplierIds[key], products, categoryIds);
}

await ensureRfq(
  buyerIds.buyerA,
  supplierIds.supplierA,
  productIds.supplierA[0],
  categoryIds['gom-su'],
);

console.log('\nXong. Tài khoản (mật khẩu = SEED_TEST_PASSWORD):');
console.table(
  ACCOUNTS.map(({ email, role, key }) => ({
    email,
    role,
    'xác minh': key === 'buyerA' || key === 'supplierA' ? 'đã duyệt' : '',
  })),
);
console.log('Dữ liệu: 5 sản phẩm (1 nháp), 1 RFQ từ buyer A gửi xưởng A.');
