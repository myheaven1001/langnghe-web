'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { daysUntil, formatVnDate, formatVnd, hoursUntil } from '@/lib/format';
import { effectiveDeadline } from '@/lib/rfq';
import { QuoteModal } from './QuoteModal';

export interface InboxRfqRow {
  id: string;
  title: string;
  quantity: number;
  unit: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  rfqType: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  deadlineDays: number | null;
  buyerName: string;
  buyerVerified: boolean;
}

export interface MyQuoteRow {
  id: string;
  rfq_id: string;
  unit_price: number;
  min_qty: number | null;
  lead_time_days: number | null;
  valid_until: string | null;
  status: string;
  created_at: string;
}

type Bucket = 'new' | 'quoted' | 'won' | 'lost';
type TabKey = 'all' | Bucket;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'new', label: 'Chưa báo giá' },
  { key: 'quoted', label: 'Đã báo giá' },
  { key: 'won', label: 'Đã thắng' },
  { key: 'lost', label: 'Đã đóng' },
];

const PAGE_SIZE = 10;

function bucketFor(rfq: InboxRfqRow, quote: MyQuoteRow | undefined): Bucket {
  if (quote) {
    if (quote.status === 'accepted') return 'won';
    if (quote.status === 'rejected') return 'lost';
    return 'quoted';
  }
  return rfq.status === 'published' ? 'new' : 'lost';
}

function budgetLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${formatVnd(min)}–${formatVnd(max)}`;
  if (min != null) return `Từ ${formatVnd(min)}`;
  if (max != null) return `Đến ${formatVnd(max)}`;
  return 'Ngân sách chưa nêu';
}

// Danh sách đã tải hết 1 lần ở server component cha (quy mô nhỏ, xem giải
// thích trong page.tsx) — mọi filter/tab/sort/phân trang ở đây đều chạy
// trên dữ liệu client, không round-trip DB lại.
export function RfqInboxClient({ rfqs, myQuotes }: { rfqs: InboxRfqRow[]; myQuotes: MyQuoteRow[] }) {
  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'newest' | 'deadline'>('newest');
  const [page, setPage] = useState(1);
  const [quoteTarget, setQuoteTarget] = useState<InboxRfqRow | null>(null);

  const quoteByRfqId = useMemo(() => new Map(myQuotes.map((q) => [q.rfq_id, q])), [myQuotes]);

  const rows = useMemo(
    () => rfqs.map((rfq) => ({ rfq, quote: quoteByRfqId.get(rfq.id), bucket: bucketFor(rfq, quoteByRfqId.get(rfq.id)) })),
    [rfqs, quoteByRfqId],
  );

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: rows.length, new: 0, quoted: 0, won: 0, lost: 0 };
    rows.forEach((r) => c[r.bucket]++);
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = tab === 'all' ? rows : rows.filter((r) => r.bucket === tab);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (r) => r.rfq.title.toLowerCase().includes(needle) || r.rfq.buyerName.toLowerCase().includes(needle),
      );
    }
    list = [...list].sort((a, b) => {
      if (sort === 'deadline') {
        const da = effectiveDeadline({ created_at: a.rfq.createdAt, expires_at: a.rfq.expiresAt, deadline_days: a.rfq.deadlineDays });
        const db = effectiveDeadline({ created_at: b.rfq.createdAt, expires_at: b.rfq.expiresAt, deadline_days: b.rfq.deadlineDays });
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return new Date(da).getTime() - new Date(db).getTime();
      }
      return new Date(b.rfq.createdAt).getTime() - new Date(a.rfq.createdAt).getTime();
    });
    return list;
  }, [rows, tab, q, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const responseRate = rows.length > 0 ? Math.round(((rows.length - counts.new) / rows.length) * 100) : null;

  return (
    <div>
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>RFQ nhận được</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">RFQ nhận được</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          {rows.length} yêu cầu báo giá · {counts.new} cần phản hồi
          {responseRate !== null ? ` · tỷ lệ phản hồi ${responseRate}%` : ''}
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-red text-brand-red'
                  : 'text-brand-sub hover:text-brand-red border-transparent'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-red-soft text-brand-red' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <span className="text-brand-light pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên buyer, tiêu đề RFQ..."
            className="border-brand-border focus:border-brand-red w-full rounded-lg border py-2 pr-3 pl-8 text-[12.5px] outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'newest' | 'deadline')}
          className="border-brand-border focus:border-brand-red rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
        >
          <option value="newest">Mới nhất</option>
          <option value="deadline">Sắp hết hạn</option>
        </select>
        <span className="text-brand-sub ml-auto text-xs">{filtered.length} kết quả</span>
      </div>

      {pageRows.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">📭</div>
          <div className="mb-1.5 text-sm font-bold">Không có RFQ nào ở mục này</div>
          <div className="text-brand-sub text-xs">Thử chọn bộ lọc khác.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pageRows.map(({ rfq, quote, bucket }) => {
            const deadline = effectiveDeadline({
              created_at: rfq.createdAt,
              expires_at: rfq.expiresAt,
              deadline_days: rfq.deadlineDays,
            });
            const dlSource = bucket === 'quoted' ? quote?.valid_until ?? null : deadline;
            const hrs = dlSource ? hoursUntil(dlSource) : null;
            const urgent = bucket === 'new' && hrs !== null && hrs <= 24 && hrs > 0;

            return (
              <div
                key={rfq.id}
                className={`border-brand-border flex items-center gap-3.5 rounded-[10px] border bg-white p-3.5 px-4 ${
                  urgent ? 'border-l-brand-red border-l-[3px]' : ''
                }`}
              >
                <div className="bg-brand-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-lg">
                  🏭
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-brand-light mb-0.5 text-[11px]">
                    {rfq.buyerName}
                    {rfq.buyerVerified && <span className="text-status-green"> · ✓ Đã xác minh</span>}
                  </div>
                  <div className="text-brand-ink truncate text-[13px] font-bold">{rfq.title}</div>
                  <div className="text-brand-light mt-0.5 flex flex-wrap gap-2.5 text-[11px]">
                    <span>
                      <b className="text-brand-sub font-semibold">{rfq.quantity.toLocaleString('vi-VN')}</b>{' '}
                      {rfq.unit ?? ''}
                    </span>
                    {bucket === 'quoted' && quote ? (
                      <span>
                        Đã báo giá: <b className="text-brand-sub font-semibold">{formatVnd(quote.unit_price)}</b>
                      </span>
                    ) : bucket === 'won' && quote ? (
                      <span>
                        Giá thắng: <b className="text-brand-sub font-semibold">{formatVnd(quote.unit_price)}</b>
                      </span>
                    ) : bucket === 'lost' && quote ? (
                      <span>Báo giá: {formatVnd(quote.unit_price)}</span>
                    ) : (
                      <span>{budgetLabel(rfq.budgetMin, rfq.budgetMax)}</span>
                    )}
                    <span>
                      {bucket === 'won'
                        ? 'Đã chốt xưởng'
                        : bucket === 'lost' && quote
                          ? 'Buyer chọn xưởng khác'
                          : bucket === 'lost'
                            ? 'RFQ đã đóng'
                            : `Gửi ${formatVnDate(rfq.createdAt)}`}
                    </span>
                  </div>
                </div>

                <div className="min-w-[96px] shrink-0 text-center">
                  {bucket === 'won' || bucket === 'lost' ? (
                    <>
                      <div className="text-brand-light text-xs font-bold">
                        {bucket === 'won' ? 'Đã chốt' : 'Đã đóng'}
                      </div>
                      <div className="text-brand-light mt-0.5 text-[10px]">{formatVnDate(rfq.createdAt)}</div>
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-xs font-bold ${
                          hrs !== null && hrs <= 24 ? 'text-brand-red' : 'text-brand-sub'
                        }`}
                      >
                        {hrs === null
                          ? '—'
                          : hrs <= 0
                            ? 'Hết hạn'
                            : hrs <= 24
                              ? `Còn ${hrs} giờ`
                              : `Còn ${daysUntil(dlSource!)} ngày`}
                      </div>
                      <div className="text-brand-light mt-0.5 text-[10px]">
                        {bucket === 'quoted' ? 'hiệu lực báo giá' : 'hạn báo giá'}
                      </div>
                    </>
                  )}
                </div>

                <div className="shrink-0">
                  {bucket === 'new' && (
                    <button
                      type="button"
                      onClick={() => setQuoteTarget(rfq)}
                      className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white"
                    >
                      Báo giá ngay
                    </button>
                  )}
                  {bucket === 'quoted' && (
                    <span className="bg-status-amber-soft text-status-amber rounded-full px-2.5 py-1 text-[10.5px] font-semibold">
                      Đã báo giá
                    </span>
                  )}
                  {bucket === 'won' && (
                    <Link
                      href="/supplier/orders"
                      className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
                    >
                      Xem đơn hàng
                    </Link>
                  )}
                  {bucket === 'lost' && (
                    <span className="bg-status-gray-soft text-brand-sub rounded-full px-2.5 py-1 text-[10.5px] font-semibold">
                      {quote ? 'Không thắng' : 'Đã đóng'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-[22px] flex items-center justify-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border-brand-border text-brand-sub hover:border-brand-clay hover:text-brand-ink flex h-8 w-8 items-center justify-center rounded-md border bg-white text-[13px] disabled:pointer-events-none disabled:opacity-40"
          >
            ‹
          </button>
          <span className="text-brand-sub px-2 text-xs">
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border-brand-border text-brand-sub hover:border-brand-clay hover:text-brand-ink flex h-8 w-8 items-center justify-center rounded-md border bg-white text-[13px] disabled:pointer-events-none disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}

      {quoteTarget && (
        <QuoteModal
          rfqId={quoteTarget.id}
          buyerName={quoteTarget.buyerName}
          rfqTitle={quoteTarget.title}
          onClose={() => setQuoteTarget(null)}
        />
      )}
    </div>
  );
}
