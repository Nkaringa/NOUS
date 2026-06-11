import Link from "next/link";

export type KnowledgeDomain = {
  domain: string;
  total: number;
  subs: Array<{ sub_category: string; count: number }>;
};

// Domain cards with an inline density bar per sub-category row. Bars scale
// to the global max count across the whole workspace so a heavily-populated
// sub-category reads as visibly "bigger" even across domains — the
// at-a-glance "shape of what I'm learning". Rows link into the filtered
// Notes view.
export function KnowledgeMap({ domains }: { domains: KnowledgeDomain[] }) {
  const globalMax = Math.max(
    1,
    ...domains.flatMap((d) => d.subs.map((s) => s.count)),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {domains.map((d) => (
        <section
          key={d.domain}
          className="rounded-lg border border-hairline p-4"
        >
          <Link
            href={{ pathname: "/notes", query: { domain: d.domain } }}
            className="group flex items-baseline justify-between"
          >
            <span className="text-[14px] font-semibold text-ink group-hover:text-red">
              {d.domain}
            </span>
            <span className="font-mono text-[12px] text-ink-mid">{d.total}</span>
          </Link>
          <ul className="mt-3 space-y-2">
            {d.subs.map((s) => (
              <li key={s.sub_category}>
                <Link
                  href={{
                    pathname: "/notes",
                    query: { domain: d.domain, sub_category: s.sub_category },
                  }}
                  className="group grid grid-cols-[1fr_auto] items-center gap-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-ink-mid group-hover:text-ink">
                      {s.sub_category}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-soft">
                      <div
                        className="h-full rounded-full bg-red/70 group-hover:bg-red"
                        style={{ width: `${(s.count / globalMax) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {s.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
