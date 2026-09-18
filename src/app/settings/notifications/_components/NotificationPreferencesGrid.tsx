'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Channel = 'in_app' | 'email';

interface NotifItem {
  // Thường 1 type, nhưng "Hồ sơ xác minh được duyệt/từ chối" gộp 2 giá trị
  // enum thật (verification_approved + verification_rejected) vào 1 hàng
  // UI — bật/tắt đồng thời cả 2 khi người dùng chỉ thấy 1 công tắc.
  types: string[];
  name: string;
  desc: string;
  lockedInApp?: boolean;
}

interface NotifGroup {
  title: string;
  items: NotifItem[];
}

// Chỉ những notification_type THẬT SỰ tồn tại trong enum notification_type
// (20260905120000_extensions_and_enums.sql + quote_rejected thêm ở
// 20260919090000 + dispute_opened/dispute_resolved thêm ở 20260930090100).
// Prototype còn có nhóm "Escrow đã giải ngân" (escrow_released), "Nhắc
// đánh giá xưởng" (không có notification_type cho review) và "Khuyến mãi
// & tin tức" (không có type marketing) — thuộc Sprint 4/chưa có type
// tương ứng, bỏ khỏi trang này thay vì tạo hàng bật/tắt cho thứ chưa tồn
// tại trong DB.
const GROUPS: NotifGroup[] = [
  {
    title: '📋 RFQ & báo giá',
    items: [
      {
        types: ['quote_received'],
        name: 'Có báo giá mới',
        desc: 'Khi xưởng gửi báo giá cho RFQ của bạn',
      },
      {
        types: ['rfq_expired'],
        name: 'RFQ sắp hết hạn',
        desc: 'Khi RFQ chưa nhận đủ báo giá và sắp hết hạn',
      },
    ],
  },
  {
    title: '📦 Đơn hàng',
    items: [
      {
        types: ['order_confirmed'],
        name: 'Đơn hàng được xác nhận',
        desc: 'Khi thanh toán được xác nhận và xưởng bắt đầu sản xuất',
      },
      {
        types: ['order_shipped'],
        name: 'Đơn hàng đã giao vận chuyển',
        desc: 'Khi đơn được bàn giao cho đơn vị vận chuyển',
      },
      {
        types: ['order_delivered'],
        name: 'Đơn hàng đã giao thành công',
        desc: 'Khi đơn vị vận chuyển xác nhận giao hàng',
      },
      {
        types: ['dispute_opened', 'dispute_resolved'],
        name: 'Tranh chấp đơn hàng mở / được giải quyết',
        desc: 'Khi admin ghi nhận hoặc giải quyết tranh chấp trên đơn hàng của bạn',
      },
    ],
  },
  {
    title: '🏢 Tài khoản',
    items: [
      {
        types: ['verification_approved', 'verification_rejected'],
        name: 'Hồ sơ xác minh được duyệt / từ chối',
        desc: 'Kết quả xét duyệt GPKD hoặc giấy tờ xác minh',
        lockedInApp: true,
      },
      {
        types: ['quota_low'],
        name: 'Sắp hết hạn mức RFQ',
        desc: 'Khi bạn dùng gần hết số RFQ miễn phí trong tháng',
      },
      {
        types: ['credit_low'],
        name: 'Credit RFQ sắp hết',
        desc: 'Khi số credit RFQ trong tài khoản còn dưới 2',
      },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="relative inline-block h-[22px] w-[38px] shrink-0">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute h-0 w-0 opacity-0"
      />
      <span
        className={`absolute inset-0 rounded-full transition-colors ${
          disabled ? 'bg-[#E8E6E1]' : 'bg-brand-border peer-checked:bg-brand-green'
        } ${!disabled ? 'cursor-pointer' : 'cursor-not-allowed'} after:absolute after:top-[3px] after:left-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4`}
      />
    </label>
  );
}

// Mỗi công tắc tự lưu ngay khi đổi (upsert vào notification_preferences,
// RLS notif_prefs_own đã cho phép user tự quản lý dòng của mình) — khớp
// ghi chú "Thay đổi được lưu tự động ngay khi bạn bật/tắt" của prototype.
// Thiếu dòng cho 1 (type, channel) = coi như đang bật (mặc định opt-out).
export function NotificationPreferencesGrid({
  userId,
  initialPrefs,
  email,
  phone,
}: {
  userId: string;
  initialPrefs: Record<string, boolean>;
  email: string;
  phone: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastError, setToastError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(isError: boolean) {
    setToastError(isError);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 1800);
  }

  function valueFor(item: NotifItem, channel: Channel) {
    return prefs[`${item.types[0]}:${channel}`] ?? true;
  }

  async function persist(types: string[], channel: Channel, enabled: boolean) {
    const rows = types.map((t) => ({
      user_id: userId,
      notification_type: t,
      channel,
      enabled,
    }));
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(rows, { onConflict: 'user_id,notification_type,channel' });
    return !error;
  }

  async function toggle(item: NotifItem, channel: Channel, next: boolean) {
    const prevPrefs = prefs;
    setPrefs((p) => {
      const copy = { ...p };
      item.types.forEach((t) => {
        copy[`${t}:${channel}`] = next;
      });
      return copy;
    });

    const ok = await persist(item.types, channel, next);
    if (!ok) {
      setPrefs(prevPrefs);
      flash(true);
    } else {
      flash(false);
    }
  }

  async function setAll(channel: Channel, next: boolean) {
    const targets = ALL_ITEMS.filter((item) => !(channel === 'in_app' && item.lockedInApp));
    const prevPrefs = prefs;
    setPrefs((p) => {
      const copy = { ...p };
      targets.forEach((item) => item.types.forEach((t) => (copy[`${t}:${channel}`] = next)));
      return copy;
    });

    const ok = await persist(
      targets.flatMap((item) => item.types),
      channel,
      next,
    );
    if (!ok) {
      setPrefs(prevPrefs);
      flash(true);
    } else {
      flash(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_280px]">
      {/* LEFT */}
      <div>
        <div className="border-brand-border mb-4 overflow-hidden rounded-[10px] border bg-white">
          <div className="bg-brand-bg border-brand-border flex flex-wrap items-center gap-2.5 border-b px-[18px] py-3">
            <span className="text-brand-sub text-[11.5px]">Thao tác nhanh:</span>
            <button
              type="button"
              onClick={() => setAll('in_app', true)}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold"
            >
              Bật tất cả trong ứng dụng
            </button>
            <button
              type="button"
              onClick={() => setAll('email', true)}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold"
            >
              Bật tất cả email
            </button>
            <button
              type="button"
              onClick={() => setAll('email', false)}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold"
            >
              Tắt tất cả email
            </button>
          </div>

          <div className="border-brand-border text-brand-light flex items-center border-b px-[18px] py-2.5 text-[10.5px] font-bold tracking-[.05em] uppercase">
            <div className="flex-1">Loại thông báo</div>
            <div className="w-[74px] shrink-0 text-center">🔔 Ứng dụng</div>
            <div className="w-[74px] shrink-0 text-center">✉️ Email</div>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-brand-clay px-[18px] pt-3 pb-1.5 text-[11.5px] font-bold tracking-[.04em] uppercase">
                {group.title}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center border-b border-[#F2F0EC] px-[18px] py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-brand-ink text-[12.5px] font-semibold">{item.name}</div>
                    <div className="text-brand-light mt-0.5 text-[11px]">{item.desc}</div>
                  </div>
                  <div className="flex w-[74px] shrink-0 justify-center">
                    <Switch
                      checked={item.lockedInApp ? true : valueFor(item, 'in_app')}
                      disabled={item.lockedInApp}
                      onChange={(next) => toggle(item, 'in_app', next)}
                    />
                  </div>
                  <div className="flex w-[74px] shrink-0 justify-center">
                    <Switch
                      checked={valueFor(item, 'email')}
                      onChange={(next) => toggle(item, 'email', next)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div>
        <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
          <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
            Nhận thông báo qua
          </div>
          <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0">
            <span className="text-brand-sub">Email</span>
            <span className="text-brand-ink text-right font-semibold">{email}</span>
          </div>
          {phone && (
            <div className="flex justify-between py-[7px] text-xs">
              <span className="text-brand-sub">Số điện thoại</span>
              <span className="text-brand-ink text-right font-semibold">{phone}</span>
            </div>
          )}
        </div>

        <div className="border-brand-border rounded-[10px] border bg-white p-4">
          <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
            💡 Ghi chú
          </div>
          {[
            [
              '🔒',
              'Thông báo về xác minh tài khoản luôn bật trong ứng dụng để đảm bảo bạn không bỏ lỡ.',
            ],
            [
              '✉️',
              'Bạn có thể tắt email nhưng vẫn nhận đầy đủ thông báo trong ứng dụng và chuông 🔔 ở góc trên.',
            ],
            ['⏱️', 'Thay đổi được lưu tự động ngay khi bạn bật/tắt.'],
          ].map(([icon, text]) => (
            <div
              key={text}
              className="text-brand-sub mb-2.5 flex gap-2 text-xs leading-relaxed last:mb-0"
            >
              <span className="shrink-0">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`bg-brand-forest fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg transition-transform duration-300 ${
          toastVisible ? 'translate-y-0' : 'translate-y-[120px]'
        } ${toastError ? '!bg-brand-red' : ''}`}
      >
        {toastError ? '✕ Không thể lưu thay đổi' : '✓ Đã lưu thay đổi'}
      </div>
    </div>
  );
}
