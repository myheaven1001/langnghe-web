import { UserMenu } from '@/components/ui';

// Matches .topbar + header + .search-box from the prototype. The search box
// submits to /search (which logs the query to search_logs); "trở thành nhà
// cung cấp", "Mua sỉ ngay" stay placeholders until those flows exist.
// Login/register vs. logged-in state is handled by <UserMenu> (self-fetches
// the session client-side) — this header never knew about auth before, so a
// logged-in user always saw "Đăng nhập/Đăng ký" here even right after
// registering.
const SEARCH_CATEGORIES = [
  'Tất cả',
  'Gốm sứ',
  'Mây tre đan',
  'Đồ gỗ mỹ nghệ',
  'Lụa & thêu ren',
  'Sơn mài & khảm trai',
  'Đúc đồng & kim loại',
  'Đá mỹ nghệ',
  'Tranh & giấy dân gian',
  'Thêu & may mặc',
  'Đồ da thủ công',
];

export function SiteHeader() {
  return (
    <>
      <div className="bg-[#333] py-1 text-[11px] text-[#ccc]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-1 px-4 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:py-0">
          <span>Chào mừng đến LàngNghề.vn — Chợ sỉ thủ công mỹ nghệ Việt Nam</span>
          <div>
            <a href="#" className="ml-3 first:ml-0 hover:text-white">
              Trở thành nhà cung cấp
            </a>
            <a href="#" className="ml-3 hover:text-white">
              Hỗ trợ
            </a>
            <a href="#" className="ml-3 hover:text-white">
              Tiếng Việt
            </a>
          </div>
        </div>
      </div>

      <header className="bg-[#B5482E] py-2.5">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-4 sm:flex-nowrap">
          <div className="font-tight order-1 shrink-0 text-[22px] font-bold whitespace-nowrap text-white">
            LàngNghề<span className="ml-1 text-sm font-normal opacity-70">.vn</span>
          </div>

          <form
            action="/search"
            method="get"
            className="order-3 flex min-w-0 flex-1 basis-full sm:order-2 sm:max-w-[680px] sm:basis-auto"
          >
            <select
              aria-label="Chọn ngành hàng để tìm kiếm"
              className="h-[38px] w-[72px] shrink-0 truncate rounded-l border-none bg-black/15 px-2 text-xs text-white outline-none sm:w-auto sm:px-2.5"
            >
              {SEARCH_CATEGORIES.map((c) => (
                <option key={c} className="bg-white text-[#333]">
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="q"
              placeholder="Tìm sản phẩm, nhà cung cấp, làng nghề..."
              className="h-[38px] min-w-0 flex-1 border-none px-3.5 text-sm outline-none"
            />
            <button
              type="submit"
              aria-label="Tìm kiếm"
              className="h-[38px] shrink-0 rounded-r bg-[#C97A3D] px-3 text-sm font-semibold whitespace-nowrap text-white sm:px-5"
            >
              <span aria-hidden="true">🔍</span>
              <span className="hidden sm:inline"> Tìm kiếm</span>
            </button>
          </form>

          <div className="order-2 ml-auto flex shrink-0 items-center gap-3 sm:order-3 sm:ml-0">
            <UserMenu variant="muted" />
            <button
              type="button"
              className="rounded bg-white px-3 py-[5px] text-xs font-semibold whitespace-nowrap text-[#B5482E]"
            >
              Mua sỉ ngay
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
