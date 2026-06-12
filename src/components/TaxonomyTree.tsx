import Link from "next/link";
import { cn } from "@/lib/utils";

export type TaxonomyTreeData = Record<string, Record<string, number>>;

type Props = {
  tree: TaxonomyTreeData;
  activeDomain?: string;
  activeSub?: string;
  needsReview?: number;
};

// Flat typographic index — mono counts, red-bar active state, domain rows
// bold, sub rows indented. The needs-review chip surfaces Uncategorized
// notes for cleanup.
export function TaxonomyTree({ tree, activeDomain, activeSub, needsReview }: Props) {
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
      <div className="mb-3.5 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-soft">
        Index
      </div>
      <Link
        href="/notes"
        className={cn(
          "flex items-baseline justify-between py-[5px] text-[13.5px]",
          !activeDomain
            ? "font-semibold text-ink"
            : "text-ink-mid hover:text-ink",
        )}
      >
        <span>All notes</span>
        <span className="font-mono text-[11px] text-ink-soft">{total}</span>
      </Link>

      {domains.map(([domain, subs]) => {
        const subTotal = sumCounts(subs);
        const isDomainActive = activeDomain === domain && !activeSub;
        const subEntries: Array<[string, number]> = [];
        for (const sub of Object.keys(subs)) {
          const c = subs[sub];
          if (typeof c === "number") subEntries.push([sub, c]);
        }
        subEntries.sort(([, a], [, b]) => b - a);
        return (
          <div key={domain}>
            <Link
              href={{ pathname: "/notes", query: { domain } }}
              className={cn(
                "mt-4 flex items-baseline justify-between py-[5px] text-[13.5px] font-semibold",
                isDomainActive ? "text-red" : "text-ink hover:text-red",
              )}
            >
              <span>{domain}</span>
              <span className="font-mono text-[11px] font-normal text-ink-soft">
                {subTotal}
              </span>
            </Link>
            <ul>
              {subEntries.map(([sub, count]) => {
                const isSubActive = activeDomain === domain && activeSub === sub;
                return (
                  <li key={sub}>
                    <Link
                      href={{
                        pathname: "/notes",
                        query: { domain, sub_category: sub },
                      }}
                      className={cn(
                        "flex items-baseline justify-between py-[5px] pl-[13px] text-[13.5px]",
                        isSubActive
                          ? "-ml-[2px] border-l-2 border-red pl-[11px] font-semibold text-red"
                          : "text-ink-mid hover:text-ink",
                      )}
                    >
                      <span className="truncate pr-2">{sub}</span>
                      <span
                        className={cn(
                          "font-mono text-[11px]",
                          isSubActive ? "text-red" : "text-ink-soft",
                        )}
                      >
                        {count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {needsReview != null && needsReview > 0 && (
        <Link
          href={{ pathname: "/notes", query: { domain: "Uncategorized" } }}
          className="mt-6 inline-flex items-center gap-1.5 rounded-[7px] bg-warn-bg px-[11px] py-1.5 font-mono text-[10.5px] font-semibold tracking-[.06em] text-warn-ink"
        >
          ⚠ NEEDS REVIEW · {needsReview}
        </Link>
      )}
    </nav>
  );
}
