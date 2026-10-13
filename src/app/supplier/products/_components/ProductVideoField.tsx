'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import {
  VIDEO_ACCEPT,
  VIDEO_BUCKET,
  VIDEO_EXTENSION,
  VIDEO_MAX_BYTES,
  productVideoUrl,
} from '@/lib/product-video';

// Video của một sản phẩm đã lưu (trang sửa sản phẩm). Tải lên và gỡ có hiệu
// lực ngay, độc lập với nút "Lưu" của form: file vào
// product-videos/<xưởng>/<sản phẩm>/video-<thời điểm>.<đuôi> rồi ghi
// products.video_path; thay video thì xoá file cũ sau khi ghi xong.
export function ProductVideoField({
  productId,
  supplierId,
  initialPath,
  blocked,
}: {
  productId: string;
  supplierId: string;
  initialPath: string | null;
  /** Sản phẩm bị sàn khoá: không sửa được. */
  blocked: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = productVideoUrl(path);

  async function upload(file: File | null) {
    if (!file) return;
    setError(null);
    const extension = VIDEO_EXTENSION[file.type];
    if (!extension) {
      setError('Chỉ nhận video MP4 hoặc WebM. Quay bằng điện thoại thì chọn định dạng MP4.');
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      setError(
        `Video nặng ${Math.round(file.size / 1024 / 1024)}MB — tối đa 50MB. Hãy cắt ngắn hoặc giảm độ phân giải.`,
      );
      return;
    }

    setBusy('upload');
    const newPath = `${supplierId}/${productId}/video-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(newPath, file, { contentType: file.type });
    if (uploadError) {
      setBusy(null);
      setError('Không tải được video lên. Kiểm tra kết nối mạng rồi thử lại.');
      return;
    }

    const { error: saveError } = await supabase
      .from('products')
      .update({ video_path: newPath })
      .eq('id', productId);
    if (saveError) {
      await supabase.storage.from(VIDEO_BUCKET).remove([newPath]);
      setBusy(null);
      setError('Không lưu được video cho sản phẩm. Vui lòng thử lại.');
      return;
    }

    if (path) await supabase.storage.from(VIDEO_BUCKET).remove([path]);
    setPath(newPath);
    setBusy(null);
    router.refresh();
  }

  async function remove() {
    if (!path || !confirm('Gỡ video khỏi sản phẩm?')) return;
    setBusy('remove');
    setError(null);
    const { error: saveError } = await supabase
      .from('products')
      .update({ video_path: null })
      .eq('id', productId);
    if (saveError) {
      setBusy(null);
      setError('Không gỡ được video. Vui lòng thử lại.');
      return;
    }
    await supabase.storage.from(VIDEO_BUCKET).remove([path]);
    setPath(null);
    setBusy(null);
    router.refresh();
  }

  return (
    <section className="border-brand-border mb-4 rounded-[10px] border bg-white p-4 sm:p-5">
      <h2 className="text-sm font-bold">🎬 Video sản phẩm</h2>
      <p className="text-brand-sub mt-1 mb-3 text-[13px] leading-relaxed">
        Một video ngắn quay hàng thật (xoay sản phẩm, cận chất liệu, cảnh xưởng) giúp người mua sỉ
        tin hơn. MP4 hoặc WebM, tối đa 50MB — khoảng 30–60 giây quay bằng điện thoại. Video lưu ngay
        khi tải xong, không cần bấm Lưu.
      </p>

      {url && (
        <video
          key={url}
          src={url}
          controls
          playsInline
          preload="metadata"
          className="mb-3 max-h-[320px] w-full max-w-[480px] rounded-lg bg-black"
        />
      )}

      {blocked ? (
        <div className="text-brand-sub text-xs">
          Sản phẩm đang bị sàn khoá nên không đổi video được.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={VIDEO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            {busy === 'upload' ? 'Đang tải lên...' : path ? 'Thay video khác' : '⬆ Tải video lên'}
          </Button>
          {path && (
            <Button variant="ghost" disabled={busy !== null} onClick={remove}>
              {busy === 'remove' ? 'Đang gỡ...' : 'Gỡ video'}
            </Button>
          )}
          {busy === 'upload' && (
            <span className="text-brand-sub text-xs">
              Đừng đóng trang cho tới khi tải xong — mạng 4G có thể mất một hai phút.
            </span>
          )}
        </div>
      )}
      {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}
    </section>
  );
}
