"use client";

// Activity daybook — client shell: filter chips, expandable entries, and
// the capture-streak grid. All data arrives pre-assembled from the server
// page; this component only renders + toggles.

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ActivityResult = {
  noteId: string | null;
  heading: string;
  domain: string | null;
  sub_category: string | null;
  confidence: number | null;
};

export type ActivityEvent = {
  id: string;
  time: string;            // "04:58 PM"
  mode: string;            // "ui" | "bulk" | ...
  status: "success" | "partial" | "failed" | "running";
  parsedCount: number;
  inputCount: number;      // headings detected in raw_input (≥ parsedCount)
  model: string;
  rawInput: string | null;
  errorLines: string[];
  results: ActivityResult[]; // resolved notes (linked when noteId present)
};

export type ActivityDay = {
  key: string;
  dayNum: string;          // "11"
  monthLabel: string;      // "THU · JUN 2026"
  captured: number;
  regenerated: number;
  errorCount: number;
  failedRuns: number;
  events: ActivityEvent[];
};

export type StreakData = {
  // column-major Sun..Sat cells, 0..4 intensity, -1 = future
  cells: number[];
  weeks: number;
  months: Array<{ week: number; label: string }>;
  activeDays: number;
  longestStreak: number;
};

const FILTERS = ["ALL", "UI", "BULK", "CC-SESSION", "REGENERATE"] as const;

export function ActivityDaybook({
  days,
  streak,
}: {
  days: ActivityDay[];
  streak: StreakData;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function visible(e: ActivityEvent): boolean {
    if (problemsOnly && e.status === "success") return false;
    if (filter !== "ALL" && e.mode.toUpperCase() !== filter) return false;
    return true;
  }

  const visibleDays = days
    .map((d) => ({ ...d, events: d.events.filter(visible) }))
    .filter((d) => d.events.length > 0);

  return (
    <div>
      {/* title row + filters */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1>Activity</h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            What you captured, day by day.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1 pt-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-[11px] py-1.5 font-mono text-[10px] font-semibold tracking-[.07em]",
                filter === f && !problemsOnly
                  ? "bg-ink text-white"
                  : "bg-panel text-ink-mid hover:text-ink",
              )}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setProblemsOnly((p) => !p)}
            className={cn(
              "rounded-md px-[11px] py-1.5 font-mono text-[10px] font-semibold tracking-[.07em]",
              problemsOnly
                ? "bg-red text-white"
                : "bg-panel text-red-deep hover:text-red",
            )}
          >
            PROBLEMS
          </button>
        </div>
      </div>

      {/* streak */}
      <Streak data={streak} />

      {/* daybook */}
      {visibleDays.length === 0 && (
        <p className="mt-14 text-[14px] text-ink-mid">
          Nothing here{filter !== "ALL" || problemsOnly ? " for this filter" : " yet"}.{" "}
          <Link href="/ingest" className="text-red hover:underline">
            Ingest something →
          </Link>
        </p>
      )}

      {visibleDays.map((d) => (
        <section
          key={d.key}
          className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-[150px_1fr] md:gap-12"
        >
          <aside className="md:sticky md:top-6 md:self-start">
            <div className="font-mono text-[44px] font-semibold leading-none tracking-[-.04em] text-ink">
              {d.dayNum}
            </div>
            <div className="mt-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-soft">
              {d.monthLabel}
            </div>
            <div className="mt-3.5 text-[12px] leading-[1.6] text-ink-mid">
              {d.captured > 0 && <div>{d.captured} captured</div>}
              {d.regenerated > 0 && <div>{d.regenerated} regenerated</div>}
              {(d.errorCount > 0 || d.failedRuns > 0) && (
                <div className="font-medium text-red-deep">
                  {[
                    d.errorCount > 0 ? `${d.errorCount} error${d.errorCount === 1 ? "" : "s"}` : null,
                    d.failedRuns > 0 ? `${d.failedRuns} failed run${d.failedRuns === 1 ? "" : "s"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
          </aside>

          <div className="border-t border-hairline">
            {d.events.map((e) =>
              e.status === "success" ? (
                <SuccessEntry
                  key={e.id}
                  e={e}
                  open={openIds.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
              ) : (
                <ProblemEntry
                  key={e.id}
                  e={e}
                  open={openIds.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── entries ─────────────────────────────────────────────── */

function Lead({ e }: { e: ActivityEvent }) {
  const shown = e.results.slice(0, 2);
  const rest = e.results.length - shown.length;
  const isRegen = e.mode === "regenerate" || e.mode === "recategorize";
  const single = e.results.length === 1 && !isRegen;

  if (e.status === "failed") {
    const firstErr = e.errorLines[0] ?? "run failed";
    return (
      <span className="min-w-0 flex-1 truncate text-[14.5px]">
        <span className="text-[13px] font-medium text-red-deep">
          {e.parsedCount === 0
            ? `${e.inputCount} item${e.inputCount === 1 ? "" : "s"} failed — ${firstErr}`
            : firstErr}
        </span>
      </span>
    );
  }

  if (e.status === "running") {
    return (
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-mid">
        {e.parsedCount} of {e.inputCount} items completed…
      </span>
    );
  }

  return (
    <span className="min-w-0 flex-1 truncate text-[14.5px]">
      {shown.map((r, i) => (
        <span key={i}>
          {i > 0 && <span className="text-ink-soft">, </span>}
          <b className="font-semibold text-ink">{r.heading}</b>
        </span>
      ))}
      {rest > 0 && <span className="text-[13px] text-ink-soft"> +{rest} more</span>}
      {single && shown[0]?.domain && (
        <>
          <span className="px-[3px] text-ink-soft">→</span>
          <span className="text-[13px] text-ink-mid">
            {shown[0].domain} ·{" "}
            <em className="not-italic text-red">{shown[0].sub_category}</em>
          </span>
        </>
      )}
      {e.status === "partial" && e.errorLines.length > 0 && (
        <span className="text-[13px] font-medium text-warn-ink">
          {" "}· {e.errorLines.length} of {e.inputCount} items errored
        </span>
      )}
    </span>
  );
}

function SuccessEntry({
  e,
  open,
  onToggle,
}: {
  e: ActivityEvent;
  open: boolean;
  onToggle: () => void;
}) {
  if (open) {
    return (
      <div className="my-2.5 rounded-xl bg-panel px-3.5 py-1">
        <EntryRow e={e} open onToggle={onToggle} flat />
        <Detail e={e} />
      </div>
    );
  }
  return (
    <div className="border-b border-hairline">
      <EntryRow e={e} open={false} onToggle={onToggle} />
    </div>
  );
}

function ProblemEntry({
  e,
  open,
  onToggle,
}: {
  e: ActivityEvent;
  open: boolean;
  onToggle: () => void;
}) {
  const warn = e.status === "partial" || e.status === "running";
  return (
    <div
      className={cn(
        "my-2.5 rounded-xl px-3.5 py-1",
        warn ? "bg-warn-bg" : "bg-fail-bg",
      )}
    >
      <EntryRow e={e} open={open} onToggle={onToggle} flat problem />
      {open && <Detail e={e} problem />}
    </div>
  );
}

function Glyph({ status }: { status: ActivityEvent["status"] }) {
  if (status === "success")
    return <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-ok-ink" />;
  if (status === "failed")
    return <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-red" />;
  return (
    <i className="h-[7px] w-[7px] shrink-0 rounded-full border-2 border-warn-ink bg-transparent" />
  );
}

function EntryRow({
  e,
  open,
  onToggle,
  flat,
  problem,
}: {
  e: ActivityEvent;
  open: boolean;
  onToggle: () => void;
  flat?: boolean;
  problem?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3.5 py-3.5 text-left",
        flat ? "px-0.5" : "px-1 hover:bg-panel hover:-mx-3 hover:px-4 hover:rounded-[10px]",
      )}
    >
      <Glyph status={e.status} />
      <Lead e={e} />
      <span
        className={cn(
          "shrink-0 rounded-[5px] px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[.07em]",
          problem ? "bg-white/60 text-ink-mid" : "bg-panel text-ink-mid",
          flat && !problem ? "bg-tile" : "",
        )}
      >
        {e.mode.toUpperCase()}
      </span>
      {e.status === "partial" && (
        <span className="shrink-0 rounded-[5px] bg-warn-bg px-2 py-[3px] text-[10px] font-bold uppercase tracking-[.08em] text-warn-ink">
          partial
        </span>
      )}
      {e.status === "failed" && (
        <span className="shrink-0 rounded-[5px] bg-fail-bg px-2 py-[3px] text-[10px] font-bold uppercase tracking-[.08em] text-red-deep">
          failed
        </span>
      )}
      {e.status === "running" && (
        <span className="shrink-0 rounded-[5px] bg-warn-bg px-2 py-[3px] text-[10px] font-bold uppercase tracking-[.08em] text-warn-ink">
          running
        </span>
      )}
      <time className="w-[60px] shrink-0 text-right font-mono text-[11.5px] text-ink-soft">
        {e.time}
      </time>
      <span
        className={cn(
          "shrink-0 text-[13px] text-ink-soft transition-transform",
          open ? "rotate-90" : "",
        )}
      >
        ›
      </span>
    </button>
  );
}

function Detail({ e, problem }: { e: ActivityEvent; problem?: boolean }) {
  const tileBg = problem ? "bg-white" : "bg-tile";
  return (
    <div className="space-y-3 pb-4 pl-[21px] pr-0.5 pt-1">
      {e.results.length > 0 && (
        <DetailRow k={e.results.length === 1 ? "Result" : "Results"}>
          <div className="flex-1 space-y-[5px]">
            {e.results.map((r, i) => (
              <div
                key={i}
                className={cn("flex items-center gap-2.5 rounded-lg px-3 py-[9px]", tileBg)}
              >
                <b className="text-[13px] font-semibold text-ink">{r.heading}</b>
                {r.domain && (
                  <span className="truncate text-[12px] text-ink-mid">
                    → {r.domain} ·{" "}
                    <em className="not-italic text-red">{r.sub_category}</em>
                  </span>
                )}
                {r.confidence != null && (
                  <span className="font-mono text-[10.5px] text-ink-soft">
                    {r.confidence.toFixed(2)}
                  </span>
                )}
                {r.noteId && (
                  <Link
                    href={`/notes/${r.noteId}`}
                    className="ml-auto shrink-0 text-[11.5px] font-medium text-red hover:underline"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    open note →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </DetailRow>
      )}
      {e.errorLines.length > 0 && (
        <DetailRow k="Errors">
          <div className="flex-1 space-y-1">
            {e.errorLines.map((err, i) => (
              <div
                key={i}
                className={cn("rounded-md px-2.5 py-1.5 text-[11.5px] text-red-deep", tileBg)}
              >
                {err}
              </div>
            ))}
          </div>
        </DetailRow>
      )}
      <DetailRow k="Model">
        <span className="font-mono text-[12px] text-ink-mid">{e.model}</span>
      </DetailRow>
      {e.rawInput && (
        <DetailRow k="Input">
          <pre
            className={cn(
              "max-h-48 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 font-mono text-[11.5px] text-ink",
              tileBg,
            )}
          >
            {e.rawInput}
          </pre>
        </DetailRow>
      )}
    </div>
  );
}

function DetailRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <span className="w-[58px] shrink-0 pt-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[.12em] text-ink-soft">
        {k}
      </span>
      {children}
    </div>
  );
}

/* ── streak ──────────────────────────────────────────────── */

const LEVEL_CLASSES = [
  "bg-panel-deep",
  "bg-[#f2c5c0]",
  "bg-[#e08a80]",
  "bg-[#cd4a3c]",
  "bg-red-deep",
];

function Streak({ data }: { data: StreakData }) {
  return (
    <div className="mt-[34px] flex items-start justify-between gap-8 overflow-x-auto">
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-1 pt-[18px]">
          {["", "MON", "", "WED", "", "FRI", ""].map((d, i) => (
            <span
              key={i}
              className="h-[15px] text-right font-mono text-[9px] font-medium leading-[15px] text-ink-soft"
            >
              {d}
            </span>
          ))}
        </div>
        <div>
          <div className="relative mb-1 h-[14px]">
            {data.months.map((m) => (
              <span
                key={`${m.week}-${m.label}`}
                className="absolute whitespace-nowrap font-mono text-[9.5px] font-medium tracking-[.08em] text-ink-soft"
                style={{ left: `${m.week * 19}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div
            className="grid grid-flow-col gap-1"
            style={{
              gridTemplateRows: "repeat(7, 15px)",
              gridAutoColumns: "15px",
            }}
          >
            {data.cells.map((l, i) => (
              <i
                key={i}
                className={cn(
                  "rounded-[3.5px]",
                  l < 0 ? "bg-transparent" : LEVEL_CLASSES[l],
                )}
              />
            ))}
          </div>
          <div className="mt-3.5 flex items-center justify-end gap-[3px]">
            <span className="mr-1 text-[10px] text-ink-soft">less</span>
            {LEVEL_CLASSES.map((c, i) => (
              <i key={i} className={cn("h-[11px] w-[11px] rounded-[3px]", c)} />
            ))}
            <span className="ml-1 text-[10px] text-ink-soft">more</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap pt-4 font-mono text-[10.5px] uppercase leading-[2.1] tracking-[.1em] text-ink-soft">
        <b className="mb-0.5 block font-mono text-[26px] font-semibold leading-[1.1] tracking-[-.02em] text-ink">
          {data.activeDays}
        </b>
        active days
        <br />
        longest streak {data.longestStreak}
        <br />
        last {Math.round(data.weeks / 4.33)} months
      </div>
    </div>
  );
}
