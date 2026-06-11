import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import type { IngestLog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RECENT_PARTIAL_WINDOW_MS = 10 * 60 * 1000;

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) return null;

  const { data, error } = await supabase
    .from("ingest_log")
    .select("id, user_id, workspace_id, mode, model, raw_input, parsed_count, status, error, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const hasActive = rows.some((r) => {
    if (r.status !== "partial") return false;
    const age = Date.now() - new Date(r.created_at).getTime();
    return age < RECENT_PARTIAL_WINDOW_MS;
  });

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
    <main className="mx-auto max-w-[860px] px-8 py-10">
      <AutoRefresh active={hasActive} />

      <div className="mb-1 flex items-baseline justify-between">
        <div>
          <h1>Activity</h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            Every ingest, recategorize, and CC-session call writes one event here.
          </p>
        </div>
        {hasActive && (
          <span className="flex items-center gap-1.5 text-[12px] text-warn-ink">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-warn-ink" />
            Live
          </span>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded border border-red bg-red-bg p-3 text-[12px] text-red-deep">
          {error.message}
        </div>
      )}

      {rows.length === 0 && (
        <p className="mt-12 text-[14px] text-ink-mid">
          No activity yet.{" "}
          <Link href="/ingest" className="text-red hover:underline">
            Ingest something →
          </Link>
        </p>
      )}

      <div className="mt-10 space-y-12">
        {Array.from(byDay.entries()).map(([day, dayRows]) => (
          <section key={day}>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                {day}
              </h2>
              <span className="font-mono text-[11px] text-ink-soft">
                {dayRows.length} event{dayRows.length === 1 ? "" : "s"}
              </span>
            </div>
            {/* Timeline: continuous rail behind status dots */}
            <div className="relative">
              <div className="absolute bottom-3 left-[6px] top-3 w-px bg-hairline-strong" />
              <ul>
                {dayRows.map((row) => (
                  <ActivityEvent key={row.id} row={row} />
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function ActivityEvent({ row }: { row: IngestLog }) {
  const isInProgress =
    row.status === "partial" &&
    Date.now() - new Date(row.created_at).getTime() < RECENT_PARTIAL_WINDOW_MS &&
    row.model === "pending";
  const status = isInProgress ? "running" : row.status;

  const errors = row.error
    ? row.error.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const time = new Date(row.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const headings = parseLoggedHeadings(row.raw_input);
  const summary = summarize(row, headings);

  return (
    <li className="relative pl-7">
      <span className="absolute left-0 top-[7px]">
        <StatusDot status={status} />
      </span>
      <details className="group border-b border-hairline">
        <summary className="flex cursor-pointer list-none flex-col gap-1 py-3 pr-1 hover:bg-bg-soft hover:-mr-1 hover:pr-2">
          <div className="flex items-center gap-3">
            <span className="w-[60px] shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-mid">
              {time}
            </span>
            <span className="text-[13px] font-medium text-ink">{row.mode}</span>
            <StatusBadge status={status} />
            <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft">
              {isInProgress ? "pending" : row.model}
            </span>
            <span className="shrink-0 text-ink-soft transition-transform group-open:rotate-90">
              ›
            </span>
          </div>
          <div className="pl-[72px] text-[13px] text-ink-mid">{summary}</div>
        </summary>
        <div className="space-y-3 pb-4 pl-[72px] pt-1">
          {row.raw_input && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
                Input
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-hairline bg-bg-soft p-3 font-mono text-[11px] text-ink">
                {row.raw_input}
              </pre>
            </div>
          )}
          {errors.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-deep">
                Errors ({errors.length})
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

// Human one-liner for what the event did. Leads with the actual heading(s)
// ingested when we can recover them — the interesting datum is "shim", not
// "1 item".
function summarize(row: IngestLog, headings: string[]): React.ReactNode {
  const errorCount = row.error
    ? row.error.split("\n").map((l) => l.trim()).filter(Boolean).length
    : 0;

  if (headings.length > 0) {
    const shown = headings.slice(0, 2);
    const rest = headings.length - shown.length;
    return (
      <span>
        {shown.map((h, i) => (
          <span key={i}>
            {i > 0 && <span className="text-ink-soft">, </span>}
            <span className="text-ink">“{h}”</span>
          </span>
        ))}
        {rest > 0 && <span className="text-ink-soft"> +{rest} more</span>}
        {errorCount > 0 && (
          <span className="text-red-deep"> · {errorCount} error{errorCount === 1 ? "" : "s"}</span>
        )}
      </span>
    );
  }

  // Fallback: no recoverable headings (e.g. pending bulk with no input yet)
  const noun = row.parsed_count === 1 ? "item" : "items";
  return (
    <span>
      {row.parsed_count} {noun}
      {errorCount > 0 && (
        <span className="text-red-deep"> · {errorCount} error{errorCount === 1 ? "" : "s"}</span>
      )}
    </span>
  );
}

// raw_input is written in several shapes across the ingest routes:
//   single / recategorize / regenerate → the bare heading
//   bulk / begin                       → "1. heading" per line, or "# heading\nbody"
//   cc-session                         → JSON array of headings
// Recover a flat list of headings from any of them.
function parseLoggedHeadings(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // cc-session: JSON array
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
        return arr.map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  const lines = trimmed.split("\n");
  const numbered: string[] = [];
  const markdown: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    const numMatch = l.match(/^\d+\.\s+(.+)$/);
    if (numMatch) numbered.push(numMatch[1]!.trim());
    const mdMatch = l.match(/^#+\s+(.+)$/);
    if (mdMatch) markdown.push(mdMatch[1]!.trim());
  }
  if (numbered.length > 0) return numbered;
  if (markdown.length > 0) return markdown;

  // Single-line / unstructured → treat the whole thing as one heading,
  // but only if it's short enough to be a heading (guard against bodies).
  if (lines.length === 1 && trimmed.length <= 200) return [trimmed];
  return [];
}

function StatusDot({
  status,
}: {
  status: "success" | "partial" | "failed" | "running";
}) {
  // Filled for terminal states, hollow ring for in-flight. A bg-colored
  // ring keeps the rail from showing through the dot.
  const base = "block size-3 rounded-full ring-4 ring-bg";
  if (status === "success")
    return <span className={cn(base, "bg-ok-ink")} />;
  if (status === "failed") return <span className={cn(base, "bg-red")} />;
  // partial / running → hollow amber ring
  return (
    <span className={cn("block size-3 rounded-full border-2 border-warn-ink bg-bg ring-4 ring-bg")} />
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
    running: "bg-warn-bg text-warn-ink",
  } as const;
  const label = status === "running" ? "running" : status;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        styles[status],
      )}
    >
      {label}
    </span>
  );
}
