import type { SpecItem } from './data';

// Matches .specs from the prototype: a static 2-column label/value grid.
export function SpecsGrid({ specs }: { specs: SpecItem[] }) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-2">
      {specs.map((spec) => (
        <div key={spec.label} className="flex gap-1.5">
          <div className="text-brand-sub w-[90px] shrink-0 text-xs">{spec.label}</div>
          <div className={`text-xs font-medium ${spec.highlight ? 'text-brand-green' : 'text-brand-ink'}`}>
            {spec.value}
          </div>
        </div>
      ))}
    </div>
  );
}
