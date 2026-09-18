// Edge Function: create-rfq
//
// Nhận request từ /rfq/new (RfqCreateForm.tsx), forward JWT của buyer đang
// đăng nhập tới Postgres RPC create_rfq() (xem migration
// 20260918090000_rfq_quota_and_targets.sql) — toàn bộ logic kiểm tra
// quota/credit + insert rfq_requests + rfq_targets + notifications chạy
// atomic trong 1 transaction Postgres duy nhất bên trong function đó, nên
// 2 request cùng lúc của cùng 1 buyer không thể làm quota_used_this_month
// lệch số. Function này chỉ làm 2 việc: validate input thô + dịch mã lỗi
// ngắn từ Postgres sang message tiếng Việt cho UI.
//
// Deploy: supabase functions deploy create-rfq
// Invoke từ client: supabase.functions.invoke('create-rfq', { body: {...} })
//   (JS client tự đính kèm Authorization: Bearer <access_token> của session
//   hiện tại, không cần forward tay).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  NOT_AUTHENTICATED: { status: 401, message: 'Vui lòng đăng nhập lại.' },
  NOT_A_BUYER: { status: 403, message: 'Chỉ tài khoản buyer mới có thể gửi RFQ.' },
  INVALID_RFQ_TYPE: { status: 400, message: 'Loại RFQ không hợp lệ.' },
  INVALID_INPUT: { status: 400, message: 'Vui lòng kiểm tra lại thông tin yêu cầu.' },
  NO_SUPPLIER_SELECTED: { status: 400, message: 'Vui lòng chọn ít nhất 1 xưởng để gửi yêu cầu báo giá.' },
  SINGLE_RFQ_ONE_SUPPLIER_ONLY: { status: 400, message: 'RFQ đơn chỉ gửi cho 1 xưởng.' },
  MULTI_RFQ_NOT_ALLOWED: {
    status: 403,
    message: 'Gói hiện tại không hỗ trợ Multi-RFQ. Vui lòng nâng cấp gói để gửi cho nhiều xưởng cùng lúc.',
  },
  TOO_MANY_SUPPLIERS: {
    status: 403,
    message: 'Bạn đã chọn nhiều xưởng hơn giới hạn của gói hiện tại. Vui lòng bớt xưởng hoặc nâng cấp gói.',
  },
  QUOTA_EXCEEDED_NO_CREDIT: {
    status: 402,
    message:
      'Bạn đã dùng hết hạn mức RFQ tháng này và không còn credit. Vui lòng mua thêm credit hoặc nâng cấp gói.',
  },
  QUOTA_CONFIG_MISSING: { status: 500, message: 'Lỗi cấu hình hạn mức. Vui lòng liên hệ hỗ trợ.' },
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: ERROR_MESSAGES.NOT_AUTHENTICATED.message }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Dữ liệu gửi lên không đúng định dạng JSON.' }, 400);
  }

  const {
    title,
    requirements,
    quantity,
    unit,
    budgetMin,
    budgetMax,
    deadlineDays,
    rfqType,
    categoryId,
    supplierIds,
  } = body;

  // Validate thô ở đây — không phải để thay thế create_rfq() (vẫn tự kiểm
  // tra lại mọi thứ, không tin Edge Function), mà để trả lỗi rõ ràng ngay
  // khi request rõ ràng sai hình dạng, không cần round-trip xuống DB.
  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    typeof quantity !== 'number' ||
    quantity < 1 ||
    (rfqType !== 'single' && rfqType !== 'multi') ||
    typeof categoryId !== 'string' ||
    categoryId.length === 0 ||
    !Array.isArray(supplierIds) ||
    supplierIds.length === 0 ||
    !supplierIds.every((s) => typeof s === 'string')
  ) {
    return jsonResponse({ error: ERROR_MESSAGES.INVALID_INPUT.message }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await supabase.rpc('create_rfq', {
    p_title: title.trim(),
    p_requirements: typeof requirements === 'string' && requirements.trim() ? requirements.trim() : null,
    p_quantity: quantity,
    p_unit: typeof unit === 'string' && unit ? unit : null,
    p_budget_min: typeof budgetMin === 'number' ? budgetMin : null,
    p_budget_max: typeof budgetMax === 'number' ? budgetMax : null,
    p_deadline_days: typeof deadlineDays === 'number' ? deadlineDays : null,
    p_rfq_type: rfqType,
    p_category_id: categoryId,
    p_supplier_ids: supplierIds,
  });

  if (error) {
    const known = ERROR_MESSAGES[error.message];
    return jsonResponse({ error: known?.message ?? error.message }, known?.status ?? 400);
  }

  return jsonResponse(data, 200);
});
