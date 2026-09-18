import { SectionTitle } from './SectionTitle';
import { TIMELINE } from './data';

// Matches .timeline from the prototype: a vertical line with dots per item,
// the last (planned) milestone dimmed.
export function Timeline() {
  return (
    <div className="mb-8">
      <SectionTitle>Hành trình của chúng tôi</SectionTitle>
      <div className="relative border-l-[1.5px] border-[#E8E8E8] pl-7">
        {TIMELINE.map((item) => (
          <div key={item.year} className="relative mb-5 last:mb-0">
            <span
              className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${
                item.planned ? 'bg-[#999]' : 'bg-[#C4622D]'
              }`}
            />
            <div className="mb-0.5 text-[11px] font-bold text-[#C4622D]">{item.year}</div>
            <div className="mb-0.5 text-sm font-semibold">{item.title}</div>
            <div className="text-brand-sub text-xs leading-[1.5]">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
