// Matches .faq-hero from the prototype. The search box is decorative (the
// original never wires it to anything either — no results page for FAQ
// search exists), so it stays inert here too.
export function FaqHero() {
  return (
    <div className="bg-[#1A3A2A] py-9 text-center">
      <h1 className="font-[family-name:var(--font-playfair)] mb-2 text-[28px] font-bold text-white">
        Câu hỏi thường gặp
      </h1>
      <p className="mb-5 text-sm text-white/60">
        Tìm câu trả lời nhanh cho mọi thắc mắc về mua bán sỉ trên LàngNghề.vn
      </p>
      <div className="mx-auto flex max-w-[480px] overflow-hidden rounded-lg px-4">
        <input
          type="text"
          placeholder="Tìm câu hỏi..."
          className="min-w-0 flex-1 rounded-l-lg border-none px-4 py-2.5 text-[13px] outline-none"
        />
        <button type="button" className="rounded-r-lg bg-[#C4622D] px-5 text-[13px] font-semibold text-white">
          Tìm
        </button>
      </div>
    </div>
  );
}
