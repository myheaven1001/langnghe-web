// Video sản phẩm (bước 6): mỗi sản phẩm tối đa 1 video trong bucket công khai
// `product-videos`. Database chỉ lưu đường dẫn (products.video_path, ràng buộc
// đúng thư mục <xưởng>/<sản phẩm>/); URL công khai luôn được ghép ở đây từ
// địa chỉ Supabase của chính web, không bao giờ lấy URL do người dùng nhập.

export const VIDEO_BUCKET = 'product-videos';
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_ACCEPT = 'video/mp4,video/webm';
export const VIDEO_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}\.(mp4|webm)$/i;

/** URL phát video, hoặc null nếu đường dẫn không đúng dạng. */
export function productVideoUrl(path: string | null | undefined): string | null {
  if (!path || !PATH_RE.test(path)) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${path}`;
}
