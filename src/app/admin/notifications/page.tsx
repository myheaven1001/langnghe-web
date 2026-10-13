import type { Metadata } from 'next';
import { AppShell, Card, CardBody } from '@/components/ui';
import { requireAdmin } from '../_lib/guard';
import { TemplateEditor, type TemplateRow } from './_components/TemplateEditor';

export const metadata: Metadata = {
  title: 'Mẫu thông báo — LàngNghề.vn',
};

// Các loại thông báo hệ thống đang thật sự gửi (enum notification_type).
// `locked` khớp trigger apply_notification_rules: ba loại về chính tài khoản
// luôn được gửi.
const TYPES: { type: string; label: string; audience: string; locked?: boolean }[] = [
  { type: 'rfq_received', label: 'Có yêu cầu báo giá mới', audience: 'xưởng' },
  { type: 'quote_received', label: 'Có báo giá mới cho RFQ', audience: 'buyer' },
  { type: 'quote_countered', label: 'Bên kia trả giá', audience: 'buyer, xưởng' },
  { type: 'quote_accepted', label: 'Báo giá được chấp nhận', audience: 'xưởng' },
  {
    type: 'quote_rejected',
    label: 'Báo giá bị từ chối / RFQ chốt cho xưởng khác',
    audience: 'xưởng',
  },
  { type: 'rfq_expired', label: 'RFQ hết hạn', audience: 'buyer' },
  {
    type: 'order_placed',
    label: 'Đơn đặt thẳng mới / xưởng đã nhận đơn',
    audience: 'xưởng, buyer',
  },
  {
    type: 'order_declined',
    label: 'Đơn bị từ chối / huỷ trước khi xác nhận',
    audience: 'buyer, xưởng',
  },
  { type: 'order_confirmed', label: 'Sàn xác nhận đã nhận thanh toán', audience: 'buyer, xưởng' },
  { type: 'order_shipped', label: 'Đơn đã gửi đi', audience: 'buyer' },
  { type: 'order_delivered', label: 'Đơn đã giao / hoàn tất', audience: 'buyer, xưởng' },
  { type: 'dispute_opened', label: 'Mở tranh chấp', audience: 'buyer, xưởng' },
  { type: 'dispute_reply', label: 'Trả lời trong tranh chấp', audience: 'buyer, xưởng' },
  {
    type: 'dispute_resolved',
    label: 'Tranh chấp được giải quyết / đã hoàn tiền',
    audience: 'buyer, xưởng',
  },
  { type: 'payout_paid', label: 'Sàn đã chuyển tiền đơn hàng', audience: 'xưởng' },
  { type: 'review_received', label: 'Có đánh giá mới', audience: 'xưởng' },
  { type: 'review_replied', label: 'Xưởng trả lời đánh giá', audience: 'buyer' },
  {
    type: 'verification_approved',
    label: 'Hồ sơ xác minh được duyệt',
    audience: 'buyer, xưởng',
    locked: true,
  },
  {
    type: 'verification_rejected',
    label: 'Hồ sơ xác minh bị từ chối',
    audience: 'buyer, xưởng',
    locked: true,
  },
  { type: 'account_suspended', label: 'Tài khoản bị khoá', audience: 'buyer, xưởng', locked: true },
];

// Mẫu thông báo (bước 6 — Vận hành): bật / tắt từng loại thông báo toàn sàn
// và chỉnh tiêu đề, nội dung. Không có dòng trong notification_overrides =
// đang dùng nội dung gốc.
export default async function AdminNotificationTemplatesPage() {
  const { supabase, shell } = await requireAdmin();
  const { data } = await supabase
    .from('notification_overrides')
    .select('type, title_template, body_template, is_enabled');
  const saved = new Map((data ?? []).map((t) => [t.type as string, t]));

  const rows: TemplateRow[] = TYPES.map((t) => {
    const row = saved.get(t.type);
    return {
      type: t.type,
      label: t.label,
      audience: t.audience,
      locked: !!t.locked,
      title: (row?.title_template as string | null) ?? '',
      body: (row?.body_template as string | null) ?? '',
      enabled: row ? (row.is_enabled as boolean) : true,
    };
  });

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Mẫu thông báo</h1>
        <div className="text-brand-sub mt-1 text-[13px] leading-relaxed">
          Bấm vào một loại để sửa tiêu đề, nội dung hoặc tắt hẳn loại đó trên toàn sàn. Người dùng
          vẫn tự tắt được từng loại ở trang Cài đặt thông báo của họ.
        </div>
      </div>
      <Card>
        <CardBody padded>
          <TemplateEditor rows={rows} />
        </CardBody>
      </Card>
    </AppShell>
  );
}
