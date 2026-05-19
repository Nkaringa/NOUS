import Link from "next/link";
import { cn } from "@/lib/utils";

export type TaxonomyTreeData = Record<string, Record<string, number>>;

type Props = {
  tree: TaxonomyTreeData;
  activeDomain?: string;
  activeSub?: string;
};

export function TaxonomyTree({ tree, activeDomain, activeSub }: Props) {
  const sumCounts = (subs: Record<string, number>): number => {
    let total = 0;
    for (const v of Object.values(subs)) total += v;
    return total;
  };

  const domains: Array<[string, Record<string, number>]> = [];
  for (const k of Object.keys(tree)) {
    const v = tree[k];
    if (v) domains.push([k, v]);
  }
  domains.sort(([, a], [, b]) => sumCounts(b) - sumCounts(a));
  const total = domains.reduce((sum, [, subs]) => sum + sumCounts(subs), 0);

  if (domains.length === 0) {
    return (
      <p className="text-[12px] text-ink-mid">
        No notes yet. Visit{" "}
        <Link href="/ingest" className="text-red hover:underline">
          Ingest
        </Link>{" "}
        to add the first one.
      </p>
    );
  }

  return (
    <nav>
      <div className="mb-4 text-[11px] font-medium uppercase tracking-wider text-ink-mid">
        Index
      </div>
      <Link
        href="/notes"
        className={cn(
          "-mx-2 mb-3 flex items-baseline justify-between rounded px-2 py-1.5 text-[13px]",
          !activeDomain
            ? "bg-bg-soft font-medium text-ink"
            : "text-ink-mid hover:bg-bg-soft hover:text-ink",
        )}
      >
        <span>All notes</span>
        <span className="text-[11px] text-ink-soft">{total}</span>
      </Link>

      {domains.map(([domain, subs]) => {
        const sub_total = sumCounts(subs);
        const isActive = activeDomain === domain;
        const subEntries: Array<[string, number]> = [];
        for (const sub of Object.keys(subs)) {
          const c = subs[sub];
          if (typeof c === "number") subEntries.push([sub, c]);
        }
        subEntries.sort(([, a], [, b]) => b - a);
        return (
          <div key={domain} className="mb-3">
            <div className="flex items-baseline justify-between py-1 text-[12px] font-semibold text-ink">
              <span>{domain}</span>
              <span className="text-[11px] font-normal text-ink-soft">{sub_total}</span>
            </div>
            <ul>
              {subEntries.map(([sub, count]) => {
                const isSubActive = isActive && activeSub === sub;
                return (
                  <li key={sub}>
                    <Link
                      href={{
                        pathname: "/notes",
                        query: { domain, sub_category: sub },
                      }}
                      className={cn(
                        "-mx-2 flex items-baseline justify-between rounded px-2 py-1 text-[12px]",
                        isSubActive
                          ? "bg-bg-soft font-medium text-ink"
                          : "text-ink-mid hover:bg-bg-soft hover:text-ink",
                      )}
                    >
                      <span>{sub}</span>
                      <span className="text-[11px] text-ink-soft">{count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
