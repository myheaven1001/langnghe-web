'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Pill } from '@/components/ui';

export interface TemplateRow {
  type: string;
  label: string;
  audience: string;
  /** Thông báo về chính tài khoản: không tắt được. */
  locked: boolean;
  title: string;
  body: string;
  enabled: boolean;
}

const PLACEHOLDERS = [
  { token: '{tieu_de_goc}', hint: 'tiêu đề gốc của hệ thống' },
  { token: '{noi_dung_goc}', hint: 'nội dung gốc của hệ thống' },
  { token: '{ma_don}', hint: 'mã đơn, VD #A1B2C3D4 (nếu thông báo về đơn)' },
  { token: '{ma_rfq}', hint: 'mã RFQ (nếu thông báo về RFQ)' },
];

const INPUT =
  'border-brand-border focus:border-brand-forest w-full rounded-lg border-[1.5px] px-3 py-2 text-[13px] outline-none';

// Một loại thông báo: công tắc bật / tắt toàn sàn và mẫu tiêu đề / nội dung
// (để trống = dùng nội dung gốc). Lưu qua RPC admin_save_notification_template
// — có nhật ký; trigger database áp mẫu cho các thông báo ghi SAU khi lưu.
function TemplateItem({ row }: { row: TemplateRow }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [enabled, setEnabled] = useState(row.enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const customized = !!row.title || !!row.body;

  async function save(next: { title: string; body: string; enabled: boolean }) {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('admin_save_notification_template', {
      p_type: row.type,
      p_title: next.title,
      p_body: next.body,
      p_enabled: next.enabled,
    });
    setBusy(false);
    if (error) {
      setMessage({
        ok: false,
        text: error.message.includes('INVALID_TEMPLATE')
          ? (error.details ?? 'Mẫu không hợp lệ.')
          : error.message.includes('FORBIDDEN_NOT_ADMIN')
            ? 'Chỉ quản trị viên sửa được.'
            : 'Không lưu được. Vui lòng thử lại.',
      });
      return;
    }
    setTitle(next.title);
    setBody(next.body);
    setEnabled(next.enabled);
    setMessage({ ok: true, text: 'Đã lưu.' });
    router.refresh();
  }

  return (
    <div className="border-b border-[#F2F0EC] py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-h-10 min-w-0 flex-1 basis-[200px] text-left"
        >
          <span className="text-[13px] font-semibold break-words">{row.label}</span>
          <span className="text-brand-sub block text-xs">Gửi cho: {row.audience}</span>
        </button>
        {!row.enabled && <Pill tone="red">Đang tắt</Pill>}
        {customized && <Pill tone="blue">Đã sửa mẫu</Pill>}
        {row.locked && <Pill tone="gray">Luôn gửi</Pill>}
        <span className="text-brand-light text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              Tiêu đề (để trống = giữ bản gốc)
            </span>
            <input
              className={INPUT}
              value={title}
              maxLength={255}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="{tieu_de_goc}"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              Nội dung (để trống = giữ bản gốc)
            </span>
            <textarea
              className={`${INPUT} resize-y`}
              rows={3}
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'{noi_dung_goc}\nCần hỗ trợ gọi …'}
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={enabled}
              disabled={row.locked}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Gửi loại thông báo này
            {row.locked && <span className="text-brand-sub text-xs">(không tắt được)</span>}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="forest" disabled={busy} onClick={() => save({ title, body, enabled })}>
              {busy ? 'Đang lưu...' : 'Lưu'}
            </Button>
            {(customized || !row.enabled) && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => save({ title: '', body: '', enabled: true })}
              >
                Về mặc định
              </Button>
            )}
            {message && (
              <span className={`text-xs ${message.ok ? 'text-brand-green' : 'text-brand-red'}`}>
                {message.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TemplateEditor({ rows }: { rows: TemplateRow[] }) {
  return (
    <>
      <div className="bg-brand-bg mb-4 rounded-[10px] px-4 py-3 text-xs leading-relaxed">
        <div className="mb-1 font-bold">Ô thay thế dùng được trong tiêu đề và nội dung</div>
        {PLACEHOLDERS.map((p) => (
          <div key={p.token}>
            <code className="font-semibold">{p.token}</code> — {p.hint}
          </div>
        ))}
        <div className="text-brand-sub mt-1">
          Ví dụ nội dung: <code>{'{noi_dung_goc}'}</code> rồi xuống dòng thêm &quot;Cần hỗ trợ gọi
          1900 xxxx&quot;. Mẫu chỉ áp cho thông báo gửi sau khi lưu.
        </div>
      </div>
      {rows.map((row) => (
        <TemplateItem key={row.type} row={row} />
      ))}
    </>
  );
}
