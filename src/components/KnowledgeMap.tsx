import Link from "next/link";

export type KnowledgeDomain = {
  domain: string;
  total: number;
  subs: Array<{ sub_category: string; count: number }>;
};

// One unified soft panel: domains stacked with dividers, sub-categories in
// a 2-col grid inside each, density bar per row scaled to the workspace's
// global max count. Rows link into the filtered Notes view.
export function KnowledgeMap({ domains }: { domains: KnowledgeDomain[] }) {
  const globalMax = Math.max(
    1,
    ...domains.flatMap((d) => d.subs.map((s) => s.count)),
  );

  return (
    <div className="rounded-xl bg-panel p-2.5">
      {domains.map((d, i) => (
        <div
          key={d.domain}
          className={`px-3.5 pb-1.5 pt-3.5 ${i > 0 ? "border-t border-panel-deep" : ""}`}
        >
          <Link
            href={{ pathname: "/notes", query: { domain: d.domain } }}
            className="group mb-2.5 flex items-baseline gap-2.5"
          >
            <span className="text-[15px] font-semibold text-ink group-hover:text-red">
              {d.domain}
            </span>
            <span className="font-mono text-[12px] font-medium text-ink-soft">
              {d.total} note{d.total === 1 ? "" : "s"}
            </span>
          </Link>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 pb-2.5 sm:grid-cols-2">
            {d.subs.map((s) => (
              <Link
                key={s.sub_category}
                href={{
                  pathname: "/notes",
                  query: { domain: d.domain, sub_category: s.sub_category },
                }}
                className="group flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-panel-deep"
              >
                <span className="w-[215px] shrink-0 truncate text-[13px] text-ink-mid group-hover:text-ink">
                  {s.sub_category}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5e7ea]">
                  <span
                    className="block h-full rounded-full bg-red opacity-[.88]"
                    style={{ width: `${(s.count / globalMax) * 100}%` }}
                  />
                </span>
                <span className="w-[18px] shrink-0 text-right font-mono text-[12px] font-medium text-ink-mid">
                  {s.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
