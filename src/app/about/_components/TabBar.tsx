// Matches .tab-bar from the prototype.
export function TabBar({
  active,
  onChange,
}: {
  active: 'about' | 'faq';
  onChange: (tab: 'about' | 'faq') => void;
}) {
  return (
    <div className="border-brand-border flex justify-center border-b-2 bg-white">
      <button
        type="button"
        onClick={() => onChange('about')}
        className={`-mb-0.5 border-b-2 px-7 py-2.5 text-[13px] font-medium transition-colors ${
          active === 'about' ? 'border-brand-red text-brand-red' : 'text-brand-sub border-transparent'
        }`}
      >
        Về chúng tôi
      </button>
      <button
        type="button"
        onClick={() => onChange('faq')}
        className={`-mb-0.5 border-b-2 px-7 py-2.5 text-[13px] font-medium transition-colors ${
          active === 'faq' ? 'border-brand-red text-brand-red' : 'text-brand-sub border-transparent'
        }`}
      >
        Câu hỏi thường gặp (FAQ)
      </button>
    </div>
  );
}
