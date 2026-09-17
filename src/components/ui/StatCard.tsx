import type { ReactNode } from 'react';
import type { PillTone } from './Pill';

// Literal class maps (Tailwind JIT needs static strings) — the icon chip
// background in the prototypes is always one of the status "soft" colors
// (e.g. #E8F1FF, #FFF0E0, #F1EEFF, #FDECEC), so we reuse the same tokens.
const ICON_BG_CLASSNAMES: Record<PillTone, string> = {
  blue: 'bg-status-blue-soft',
  amber: 'bg-status-amber-soft',
  green: 'bg-status-green-soft',
  gray: 'bg-status-gray-soft',
  red: 'bg-status-red-soft',
  purple: 'bg-status-purple-soft',
};

const DELTA_CLASSNAMES: Record<'up' | 'new', string> = {
  up: 'bg-status-green-soft text-status-green',
  new: 'bg-status-amber-soft text-status-amber',
};

export function StatCard({
  icon,
  iconTone,
  delta,
  deltaTone = 'up',
  value,
  label,
  onClick,
}: {
  icon: ReactNode;
  iconTone: PillTone;
  delta?: ReactNode;
  deltaTone?: 'up' | 'new';
  value: ReactNode;
  label: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-brand-border cursor-pointer rounded-[10px] border bg-white p-4 text-left transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div
          className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg text-base ${ICON_BG_CLASSNAMES[iconTone]}`}
        >
          {icon}
        </div>
        {delta && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${DELTA_CLASSNAMES[deltaTone]}`}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="font-tight mb-1 text-2xl leading-none font-bold">{value}</div>
      <div className="text-brand-sub text-xs">{label}</div>
    </button>
  );
}
