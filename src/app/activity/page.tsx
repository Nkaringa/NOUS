import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/AutoRefresh";
import type { IngestLog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RECENT_PARTIAL_WINDOW_MS = 10 * 60 * 1000;

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingest_log")
    .select("id, user_id, mode, model, raw_input, parsed_count, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const hasActive = rows.some((r) => {
    if (r.status !== "partial") return false;
    const age = Date.now() - new Date(r.created_at).getTime();
    return age < RECENT_PARTIAL_WINDOW_MS;
  });

  // Group by day for tidier scanning
  const byDay = new Map<string, IngestLog[]>();
  for (const r of rows as IngestLog[]) {
    const day = new Date(r.created_at).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const arr = byDay.get(day) ?? [];
    arr.push(r);
    byDay.set(day, arr);
  }

  return (
    <main className="mx-auto max-w-[900px] px-8 py-10">
      <AutoRefresh active={hasActive} />

      <div className="mb-1 flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            Every ingest, recategorize, and CC-session call writes one row here.
          </p>
        </div>
        <div className="flex items-baseline gap-4 text-[12px]">
          {hasActive && (
            <span className="flex items-center gap-1.5 text-warn-ink">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-warn-ink" />
              Live · auto-refreshing
            </span>
          )}
          <Link href="/ingest" className="text-red hover:underline">
            ← Back to ingest
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red bg-red-bg p-3 text-[12px] text-red-deep">
          {error.message}
        </div>
      )}

      {rows.length === 0 && (
        <p className="mt-12 text-[14px] text-ink-mid">No activity yet.</p>
      )}

      <div className="mt-8 space-y-10">
        {Array.from(byDay.entries()).map(([day, dayRows]) => (
          <section key={day}>
            <div className="mb-2 flex items-baseline justify-between border-b border-hairline pb-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink">
                {day}
              </h2>
              <span className="text-[11px] text-ink-soft">
                {dayRows.length} event{dayRows.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul>
              {dayRows.map((row) => (
                <ActivityRow key={row.id} row={row} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function ActivityRow({ row }: { row: IngestLog }) {
  const isInProgress =
    row.status === "partial" &&
    Date.now() - new Date(row.created_at).getTime() < RECENT_PARTIAL_WINDOW_MS &&
    row.model === "pending";

  const errors = row.error
    ? row.error
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const time = new Date(row.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="border-b border-hairline last:border-b-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-4 py-3 hover:bg-bg-soft hover:-mx-3 hover:px-3 transition-[margin,padding]">
          <span className="font-mono text-[11px] text-ink-soft w-12">{time}</span>
          <StatusBadge status={isInProgress ? "running" : row.status} />
          <span className="flex-1 text-[13px] text-ink">
            <span className="text-ink-mid">{row.mode}</span>
            <span className="px-1.5 text-ink-soft">·</span>
            {row.parsed_count} {row.parsed_count === 1 ? "item" : "items"}
            {errors.length > 0 && (
              <>
                <span className="px-1.5 text-ink-soft">·</span>
                <span className="text-red-deep">
                  {errors.length} error{errors.length === 1 ? "" : "s"}
                </span>
              </>
            )}
          </span>
          <span className="font-mono text-[11px] text-ink-soft">
            {isInProgress ? "pending" : row.model}
          </span>
          <span className="text-ink-soft transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="px-3 pb-4 pt-2 space-y-3">
          {row.raw_input && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-ink-mid">
                Input
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-hairline bg-bg-soft p-3 font-mono text-[11px] text-ink">
                {row.raw_input}
              </pre>
            </div>
          )}
          {errors.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-red-deep">
                Errors
              </div>
              <ul className="space-y-1">
                {errors.map((err, i) => (
                  <li
                    key={i}
                    className="rounded border border-red-bg bg-red-bg/60 px-2.5 py-1.5 text-[11px] text-red-deep"
                  >
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function StatusBadge({
  status,
}: {
  status: "success" | "partial" | "failed" | "running";
}) {
  const styles = {
    success: "bg-ok-bg text-ok-ink",
    partial: "bg-warn-bg text-warn-ink",
    failed: "bg-red-bg text-red-deep",
    running: "bg-bg-soft text-ink-mid",
  } as const;
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}
