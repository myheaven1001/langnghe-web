'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Textarea } from '@/components/ui';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  IMPORT_ROW_ERROR,
  checkImportRow,
  normalizeImportText,
  parseImport,
  templateCsv,
  type ImportRow,
} from '@/lib/product-import';

interface RowResult {
  row: number;
  ok: boolean;
  id: string | null;
  error: string | null;
}

// Nhập sản phẩm hàng loạt: dán từ Excel hoặc chọn file .csv → xem trước, tô đỏ
// dòng lỗi → gửi các dòng hợp lệ cho RPC bulk_save_products(). Sản phẩm tạo
// ra ở trạng thái nháp, xưởng thêm ảnh rồi bật bán.
export function ImportClient({ categories }: { categories: { slug: string; name: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    created: number;
    failed: { name: string; error: string | null }[];
  } | null>(null);

  // Tên / slug danh mục (đã bỏ dấu) → slug, để gõ "gom su" hay "Gốm sứ" đều nhận.
  const categorySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(normalizeImportText(c.name), c.slug);
      map.set(normalizeImportText(c.slug), c.slug);
    }
    return map;
  }, [categories]);
  const knownCategories = useMemo(() => [...categorySlug.keys()], [categorySlug]);

  const parsed = useMemo(() => parseImport(text), [text]);
  const checked = useMemo(
    () => parsed.rows.map((row) => ({ row, problem: checkImportRow(row, knownCategories) })),
    [parsed.rows, knownCategories],
  );
  const valid = checked.filter((c) => !c.problem);

  async function readFile(file: File | null) {
    if (!file) return;
    setError(null);
    setResults(null);
    if (file.size > 2 * 1024 * 1024) {
      setError('File tối đa 2MB.');
      return;
    }
    setText(await file.text());
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau-nhap-san-pham.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const payload: ImportRow[] = valid.map(({ row }) => ({
      ...row,
      category: categorySlug.get(normalizeImportText(row.category)) ?? row.category,
    }));
    const { data, error } = await supabase.rpc('bulk_save_products', { p_rows: payload });
    setBusy(false);
    if (error || !data) {
      const message = error?.message ?? '';
      setError(
        message.includes('BULK_LIMIT')
          ? `Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} dòng.`
          : message.includes('ACCOUNT_SUSPENDED')
            ? 'Tài khoản của bạn đang bị tạm khóa.'
            : 'Không nhập được. Vui lòng thử lại.',
      );
      return;
    }
    const result = data as { created: number; results: RowResult[] };
    setResults({
      created: result.created,
      failed: result.results
        .filter((r) => !r.ok)
        .map((r) => ({ name: payload[r.row - 1]?.name ?? `Dòng ${r.row}`, error: r.error })),
    });
    setText('');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="border-brand-border rounded-[10px] border bg-white p-4">
        <h2 className="mb-1 text-sm font-bold">1. Chuẩn bị bảng</h2>
        <p className="text-brand-sub mb-3 text-[13px] leading-relaxed">
          Dòng đầu là tên cột, mỗi dòng sau là một sản phẩm (tối đa {IMPORT_MAX_ROWS} dòng). Cột bắt
          buộc:{' '}
          {IMPORT_COLUMNS.filter((c) => c.required)
            .map((c) => c.label)
            .join(', ')}
          . Cột tuỳ chọn:{' '}
          {IMPORT_COLUMNS.filter((c) => !c.required)
            .map((c) => c.label)
            .join(', ')}
          . Ô &quot;Nhận OEM&quot; và &quot;Hàng có sẵn&quot; ghi <strong>có</strong> hoặc{' '}
          <strong>x</strong> để bật.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadTemplate}>
            ⬇ Tải file mẫu (.csv)
          </Button>
        </div>
        <details className="text-brand-sub mt-3 text-xs">
          <summary className="cursor-pointer font-semibold">
            Tên danh mục dùng được ({categories.length})
          </summary>
          <div className="mt-1.5 leading-relaxed">{categories.map((c) => c.name).join(' · ')}</div>
        </details>
      </section>

      <section className="border-brand-border rounded-[10px] border bg-white p-4">
        <h2 className="mb-1 text-sm font-bold">2. Dán bảng hoặc chọn file</h2>
        <p className="text-brand-sub mb-2 text-[13px]">
          Trong Excel / Google Sheets: chọn cả bảng (kể cả dòng tên cột), chép rồi dán vào ô dưới.
          Hoặc lưu file dạng &quot;CSV UTF-8&quot; rồi chọn file.
        </p>
        <Textarea
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResults(null);
            setError(null);
          }}
          placeholder={IMPORT_COLUMNS.map((c) => c.label).join('\t')}
          className="font-mono text-xs lg:text-xs"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              void readFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            📄 Chọn file .csv
          </Button>
          {text && (
            <Button variant="ghost" onClick={() => setText('')}>
              Xoá
            </Button>
          )}
        </div>
        {(parsed.error || error) && (
          <div className="text-brand-red mt-2 text-xs">{parsed.error ?? error}</div>
        )}
      </section>

      {results && (
        <section className="border-brand-green rounded-[10px] border bg-[#F2FBF6] p-4">
          <div className="text-sm font-bold">
            Đã tạo {results.created} sản phẩm nháp
            {results.failed.length > 0 ? `, ${results.failed.length} dòng không lưu được` : ''}.
          </div>
          {results.failed.length > 0 && (
            <ul className="text-status-red mt-1.5 list-disc pl-5 text-xs">
              {results.failed.map((r, i) => (
                <li key={i} className="break-words">
                  {r.name}: {IMPORT_ROW_ERROR[r.error ?? ''] ?? 'Không lưu được dòng này.'}
                </li>
              ))}
            </ul>
          )}
          <div className="text-brand-sub mt-2 text-[13px]">
            Sản phẩm mới chưa có ảnh nên đang ở mục Nháp. Thêm ảnh rồi bật bán.
          </div>
          <Link
            href="/supplier/products?status=draft"
            className="text-brand-blue mt-1 inline-flex min-h-10 items-center text-[13px] font-semibold"
          >
            Mở danh sách nháp →
          </Link>
        </section>
      )}

      {checked.length > 0 && (
        <section className="border-brand-border rounded-[10px] border bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold">
              3. Xem trước — {valid.length} dòng hợp lệ
              {checked.length > valid.length ? `, ${checked.length - valid.length} dòng lỗi` : ''}
            </h2>
            <Button variant="primary" disabled={busy || valid.length === 0} onClick={submit}>
              {busy ? 'Đang nhập...' : `Nhập ${valid.length} sản phẩm`}
            </Button>
          </div>
          {checked.length > valid.length && (
            <div className="text-brand-sub mb-2 text-xs">
              Dòng lỗi (nền đỏ) sẽ bị bỏ qua. Sửa trong bảng tính rồi dán lại nếu muốn nhập cả các
              dòng đó.
            </div>
          )}
          <div className="border-brand-border overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[820px] border-collapse text-xs">
              <thead>
                <tr className="bg-brand-bg border-brand-border border-b text-left">
                  <th className="px-2.5 py-2">#</th>
                  {IMPORT_COLUMNS.map((c) => (
                    <th key={c.field} className="px-2.5 py-2 font-semibold whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checked.map(({ row, problem }, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#F2F0EC] last:border-b-0 ${problem ? 'bg-status-red-soft' : ''}`}
                  >
                    <td className="text-brand-light px-2.5 py-2 align-top">{i + 1}</td>
                    {IMPORT_COLUMNS.map((c) => (
                      <td key={c.field} className="max-w-[220px] px-2.5 py-2 align-top break-words">
                        {c.field === 'name' && problem ? (
                          <>
                            <div>{row.name || '—'}</div>
                            <div className="text-status-red font-semibold">{problem}</div>
                          </>
                        ) : c.field === 'description' ? (
                          <span className="line-clamp-2">{row.description}</span>
                        ) : (
                          row[c.field]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
