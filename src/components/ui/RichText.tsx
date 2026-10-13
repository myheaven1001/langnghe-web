import { Fragment } from 'react';
import { parseRichText, type RichInline } from '@/lib/rich-text';

function Inline({ parts }: { parts: RichInline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i}>{part.text}</strong>
        ) : part.italic ? (
          <em key={i}>{part.text}</em>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

// Hiển thị văn bản có định dạng nhẹ (lib/rich-text): tiêu đề, gạch đầu dòng,
// danh sách đánh số, đậm, nghiêng. Chỉ dựng thẻ React từ chữ — không chèn HTML.
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={`flex flex-col gap-2.5 text-[13px] leading-[1.7] break-words ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h3 key={i} className="mt-1 text-sm font-bold first:mt-0">
              <Inline parts={block.inline} />
            </h3>
          );
        }
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className={`pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline parts={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
