// Matches .shop-banner from the prototype: an intro strip with tags and the
// online-status/follower-count block on the right.
export function ShopBanner({
  emoji,
  title,
  sub,
  tags,
  onlineStatus,
  followerCount,
}: {
  emoji: string;
  title: string;
  sub: string;
  tags: string[];
  onlineStatus: string;
  followerCount: string;
}) {
  return (
    <div className="border-brand-border flex items-center gap-4 rounded border bg-white px-4.5 py-3.5">
      <div className="text-3xl">{emoji}</div>
      <div className="flex-1">
        <div className="mb-1 text-sm font-bold">{title}</div>
        <div className="text-brand-sub text-xs leading-[1.5]">{sub}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="border-brand-border text-brand-sub rounded-full border px-2.5 py-[3px] text-[11px]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-brand-sub mb-1.5 text-[11px]">Lần online gần nhất</div>
        <div className="text-brand-green text-[13px] font-semibold">{onlineStatus}</div>
        <div className="text-brand-sub mt-2 text-[11px]">{followerCount}</div>
      </div>
    </div>
  );
}
