'use client';

import { useRef, useState } from 'react';
import { RichText } from './RichText';

type Tool = 'bold' | 'italic' | 'heading' | 'bullet' | 'number';

const TOOLS: { tool: Tool; label: string; title: string }[] = [
  { tool: 'bold', label: 'B', title: 'In đậm' },
  { tool: 'italic', label: 'I', title: 'In nghiêng' },
  { tool: 'heading', label: 'Tiêu đề', title: 'Dòng tiêu đề' },
  { tool: 'bullet', label: '• Danh sách', title: 'Gạch đầu dòng' },
  { tool: 'number', label: '1. Đánh số', title: 'Danh sách đánh số' },
];

// Ô soạn mô tả có định dạng nhẹ (lib/rich-text): thanh nút chèn ký hiệu vào
// vùng đang chọn và tab "Xem trước" hiện đúng như người mua sẽ thấy. Giá trị
// vẫn là văn bản thường nên gõ tay ký hiệu cũng được, và dùng tốt trên điện thoại.
export function RichTextEditor({
  value,
  onChange,
  maxLength,
  rows = 7,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function apply(tool: Tool) {
    const el = textarea.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    let next: string;
    let caretStart: number;
    let caretEnd: number;

    if (tool === 'bold' || tool === 'italic') {
      const mark = tool === 'bold' ? '**' : '_';
      const selected = value.slice(start, end) || (tool === 'bold' ? 'chữ đậm' : 'chữ nghiêng');
      next = value.slice(0, start) + mark + selected + mark + value.slice(end);
      caretStart = start + mark.length;
      caretEnd = caretStart + selected.length;
    } else {
      // Thao tác theo dòng: thêm (hoặc bỏ nếu đã có) ký hiệu ở đầu mỗi dòng đang chọn.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndIndex = value.indexOf('\n', end);
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
      const lines = value.slice(lineStart, lineEnd).split('\n');
      const strip = (line: string) => line.replace(/^\s*(#{1,3}|[-•*]|\d{1,3}[.)])\s+/, '');
      const prefixOf = (i: number) =>
        tool === 'heading' ? '## ' : tool === 'bullet' ? '- ' : `${i + 1}. `;
      const already = lines.every((line, i) => line.startsWith(prefixOf(i)));
      const changed = lines
        .map((line, i) => (already ? strip(line) : prefixOf(i) + strip(line)))
        .join('\n');
      next = value.slice(0, lineStart) + changed + value.slice(lineEnd);
      caretStart = lineStart;
      caretEnd = lineStart + changed.length;
    }

    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caretStart, caretEnd);
    });
  }

  return (
    <div className="border-brand-border focus-within:border-brand-red overflow-hidden rounded-lg border-[1.5px] bg-white">
      <div className="border-brand-border bg-brand-bg flex flex-wrap items-center gap-1 border-b px-1.5 py-1">
        {!preview &&
          TOOLS.map(({ tool, label, title }) => (
            <button
              key={tool}
              type="button"
              title={title}
              aria-label={title}
              onClick={() => apply(tool)}
              className={`text-brand-ink min-h-9 rounded px-2.5 text-xs hover:bg-white ${
                tool === 'bold' ? 'font-extrabold' : tool === 'italic' ? 'italic' : 'font-semibold'
              }`}
            >
              {label}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          className="text-brand-blue ml-auto min-h-9 rounded px-2.5 text-xs font-semibold hover:bg-white"
        >
          {preview ? '✎ Sửa tiếp' : '👁 Xem trước'}
        </button>
      </div>

      {preview ? (
        <div className="min-h-[140px] px-3 py-2.5">
          {value.trim() ? (
            <RichText text={value} />
          ) : (
            <span className="text-brand-light text-[13px]">Chưa có nội dung.</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textarea}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          className="text-brand-ink placeholder:text-brand-light block w-full resize-y px-3 py-2 text-base outline-none lg:text-sm"
        />
      )}
    </div>
  );
}
