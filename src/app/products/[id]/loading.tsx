// Khung chờ trong lúc trang sản phẩm đọc dữ liệu (kế hoạch 2.3) — hiện
// ngay khi bấm link thay vì đứng yên ở trang cũ.
export default function ProductLoading() {
  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <div className="bg-brand-red h-[52px]" />
      <div className="mx-auto max-w-[1200px] px-4 py-3">
        <div className="mb-3 h-3 w-48 animate-pulse rounded bg-[#E8E8E8]" />
        <div className="border-brand-border grid grid-cols-1 gap-4 rounded border bg-white p-4 lg:grid-cols-2 xl:grid-cols-[400px_1fr_280px]">
          <div className="aspect-square animate-pulse rounded-md bg-[#F0EDE5]" />
          <div className="flex flex-col gap-3">
            <div className="h-5 w-3/4 animate-pulse rounded bg-[#E8E8E8]" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-[#E8E8E8]" />
            <div className="h-32 animate-pulse rounded-md bg-[#FFF3F3]" />
            <div className="h-16 animate-pulse rounded bg-[#F5F5F5]" />
          </div>
          <div className="hidden flex-col gap-3 xl:flex">
            <div className="h-14 animate-pulse rounded bg-[#F5F5F5]" />
            <div className="h-10 w-2/3 animate-pulse rounded bg-[#FFF3F3]" />
            <div className="h-10 animate-pulse rounded bg-[#E8E8E8]" />
          </div>
        </div>
      </div>
    </div>
  );
}
