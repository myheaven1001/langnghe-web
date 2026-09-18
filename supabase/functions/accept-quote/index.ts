// Edge Function: accept-quote
//
// Nhận request từ /rfq/[id] (AcceptQuoteButton.tsx), forward JWT của buyer
// đang đăng nhập tới Postgres RPC accept_quote() (xem migration
// 20260919090100_accept_quote.sql) — toàn bộ logic accept 1 quote + đóng
// các quote còn lại + tạo orders + chuyển rfq_requests.status chạy atomic
// trong 1 transaction Postgres duy nhất bên trong function đó. Function này
// chỉ làm 2 việc: validate input thô + dịch mã lỗi ngắn từ Postgres sang
// message tiếng Việt cho UI — cùng pattern với create-rfq.
//
// Deploy: supabase functions deploy accept-quote
// Invoke từ client: supabase.functions.invoke('accept-quote', { body: { quoteId } })

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  NOT_AUTHENTICATED: { status: 401, message: 'Vui lòng đăng nhập lại.' },
  NOT_A_BUYER: { status: 403, message: 'Chỉ tài khoản buyer mới có thể chấp nhận báo giá.' },
  QUOTE_NOT_FOUND: { status: 404, message: 'Không tìm thấy báo giá này.' },
  NOT_YOUR_RFQ: { status: 403, message: 'Báo giá này không thuộc yêu cầu báo giá của bạn.' },
  RFQ_ALREADY_SETTLED: {
    status: 409,
    message: 'Yêu cầu báo giá này đã được chốt hoặc đóng trước đó.',
  },
  QUOTE_NOT_ACCEPTABLE: {
    status: 409,
    message: 'Báo giá này không còn ở trạng thái có thể chấp nhận (đã được xử lý).',
  },
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

  const { quoteId } = body;
  if (typeof quoteId !== 'string' || quoteId.length === 0) {
    return jsonResponse({ error: 'Thiếu mã báo giá.' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await supabase.rpc('accept_quote', { p_quote_id: quoteId });

  if (error) {
    const known = ERROR_MESSAGES[error.message];
    return jsonResponse({ error: known?.message ?? error.message }, known?.status ?? 400);
  }

  return jsonResponse(data, 200);
});
