// Matches .related from the prototype: clicking a tag re-fills the search
// keyword (handled by the parent, which owns the shared query state).
export function RelatedSearches({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (term: string) => void;
}) {
  return (
    <div className="border-brand-border flex flex-wrap items-center gap-1.5 rounded border bg-white px-3.5 py-2.5">
      <span className="text-brand-sub text-xs">Tìm kiếm liên quan:</span>
      {items.map((term) => (
        <button
          key={term}
          type="button"
          onClick={() => onSelect(term)}
          className="border-brand-border text-brand-blue rounded border bg-white px-2.5 py-1 text-xs transition-colors hover:border-[#1677FF] hover:bg-[#E6F1FB]"
        >
          {term}
        </button>
      ))}
    </div>
  );
}
