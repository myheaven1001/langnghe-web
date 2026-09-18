import { SectionTitle } from './SectionTitle';
import { WHY_CARDS } from './data';

// Matches .why-grid from the prototype.
export function WhySection() {
  return (
    <div className="mb-8">
      <SectionTitle>Tại sao chọn LàngNghề.vn?</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WHY_CARDS.map((card) => (
          <div
            key={card.title}
            className="border-brand-border rounded-lg border bg-white p-4.5 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)]"
          >
            <div className="mb-2.5 text-[30px]">{card.icon}</div>
            <div className="mb-1.5 text-sm font-bold">{card.title}</div>
            <div className="text-brand-sub text-xs leading-[1.6]">{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
