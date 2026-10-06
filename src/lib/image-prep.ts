// Chuẩn bị ảnh trước khi tải lên (kế hoạch 4.5), chạy hoàn toàn trên trình
// duyệt: đổi HEIC/HEIF (ảnh iPhone) sang JPEG, thu nhỏ cạnh dài về tối đa
// 1600px và nén JPEG. Ảnh chụp điện thoại 4–8MB còn khoảng 200–400KB — tải
// nhanh trên 4G và nhẹ kho lưu trữ.

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

function isHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function isSupportedImage(file: File) {
  return /^image\/(jpeg|png|webp)$/i.test(file.type) || isHeic(file);
}

async function decode(
  blob: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation: xoay đúng theo EXIF (ảnh chụp dọc trên điện thoại).
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // rơi xuống cách dùng <img> bên dưới
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Trả về file JPEG đã thu nhỏ + nén. Ảnh JPEG/WEBP vốn đã nhỏ (không cần thu
 * nhỏ và nén xong không nhẹ hơn) thì giữ nguyên file gốc.
 * Ném lỗi (thông báo tiếng Việt) khi không đọc được ảnh.
 */
export async function prepareImage(file: File): Promise<File> {
  let input: Blob = file;

  if (isHeic(file)) {
    try {
      // Thư viện ~1MB: chỉ tải khi thật sự gặp ảnh HEIC.
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      input = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      throw new Error(`Không đọc được ảnh HEIC "${file.name}". Hãy thử chụp/đổi sang JPG.`);
    }
  }

  let decoded;
  try {
    decoded = await decode(input);
  } catch {
    throw new Error(`Không đọc được ảnh "${file.name}".`);
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`Không xử lý được ảnh "${file.name}".`);
  // PNG nền trong suốt → nền trắng (JPEG không có trong suốt).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded.source, 0, 0, width, height);
  if ('close' in decoded.source) (decoded.source as ImageBitmap).close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error(`Không xử lý được ảnh "${file.name}".`);

  const keepOriginal =
    input === file &&
    scale === 1 &&
    /^image\/(jpeg|webp)$/i.test(file.type) &&
    blob.size >= file.size;
  if (keepOriginal) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'anh';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}
