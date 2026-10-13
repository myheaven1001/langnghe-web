// Mô tả có định dạng (bước 6). Mô tả vẫn lưu là VĂN BẢN THƯỜNG kèm vài ký
// hiệu đơn giản, không lưu HTML:
//   ## Tiêu đề          dòng tiêu đề
//   - mục / • mục       gạch đầu dòng
//   1. mục              danh sách đánh số
//   **đậm**  _nghiêng_  trong một dòng
// Khi hiển thị, văn bản được tách thành các khối dưới đây rồi dựng bằng thẻ
// React (components/ui/RichText) — không có chỗ nào chèn HTML thô nên không
// cần bộ lọc mã độc. Mô tả cũ (không có ký hiệu) hiển thị như trước.

export type RichInline = { text: string; bold?: boolean; italic?: boolean };

export type RichBlock =
  | { type: 'heading'; inline: RichInline[] }
  | { type: 'paragraph'; lines: RichInline[][] }
  | { type: 'list'; ordered: boolean; items: RichInline[][] };

const BULLET_RE = /^\s*[-•*]\s+(.*)$/;
const NUMBER_RE = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING_RE = /^\s*#{1,3}\s+(.*)$/;

/** Tách **đậm** và _nghiêng_ trong một dòng; ký hiệu không khép thì giữ nguyên chữ. */
export function parseInline(line: string): RichInline[] {
  const parts: RichInline[] = [];
  const re = /\*\*([^*\n]+)\*\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu;
  let last = 0;
  for (const match of line.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: line.slice(last, index) });
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true });
    else parts.push({ text: match[2], italic: true });
    last = index + match[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts.length > 0 ? parts : [{ text: line }];
}

export function parseRichText(source: string | null | undefined): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: RichInline[][] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  };

  for (const raw of (source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', inline: parseInline(heading[1]) });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const numbered = bullet ? null : NUMBER_RE.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const item = parseInline((bullet ?? numbered)![1]);
      const previous = blocks[blocks.length - 1];
      if (previous?.type === 'list' && previous.ordered === ordered) previous.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
      continue;
    }
    paragraph.push(parseInline(line));
  }
  flush();
  return blocks;
}

/** Bỏ ký hiệu định dạng — dùng cho thẻ meta description, xem trước một dòng. */
export function stripRichText(source: string | null | undefined): string {
  return (source ?? '')
    .replace(/^\s*#{1,3}\s+/gm, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
