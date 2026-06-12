"use client";

// One input, no tabs — the parser decides single vs bulk. Live chip
// preview (with × to drop a mis-parse), ledger-style progress rows, and
// the near-duplicate interrupt as an amber block.
//
// Submission paths (functionality unchanged from the tabbed version):
//   1 heading  → POST /api/ingest/single (optional body; force on dupe ok)
//   N headings → POST /api/ingest/begin + chunked POST /api/ingest stream

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseHeadings, type ParsedHeading } from "@/lib/ingest/parse";
import type { Note } from "@/lib/types";

type ItemState =
  | { status: "pending"; heading: string }
  | { status: "ok"; heading: string; note: Note }
  | { status: "failed"; heading: string; error: string };

type DupePrompt = {
  heading: string;
  body: string;
  duplicate: {
    id: string;
    heading: string;
    domain: string;
    sub_category: string;
    similarity: number;
  };
};

// Each chunk is a separate /api/ingest call → a fresh function invocation
// with its own 60s budget on Vercel Hobby. Chunks processed sequentially so
// taxonomy snapshots stay coherent across the submission.
const CHUNK_SIZE = 2;

export function IngestForm({ initialHeading }: { initialHeading?: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initialHeading ?? "");
  const [body, setBody] = useState("");
  const [showBody, setShowBody] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ItemState[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupe, setDupe] = useState<DupePrompt | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => parseHeadings(input), [input]);
  const effective = useMemo(
    () => parsed.filter((p) => !removed.has(p.heading)),
    [parsed, removed],
  );
  const isSingle = effective.length === 1;
  const chunkCount = Math.ceil(effective.length / CHUNK_SIZE);
  const isRunning = phase === "running";

  function reset() {
    setItems([]);
    setSummary(null);
    setError(null);
    setDupe(null);
  }

  function dropChip(heading: string) {
    setRemoved((prev) => new Set(prev).add(heading));
  }

  async function submit() {
    if (effective.length === 0) return;
    if (isSingle) {
      await submitSingle({
        heading: effective[0]!.heading,
        body: (effective[0]!.body ?? body).trim(),
        force: false,
      });
    } else {
      await submitBulk(effective);
    }
  }

  async function submitSingle(args: { heading: string; body: string; force: boolean }) {
    reset();
    setPhase("running");
    setItems([{ status: "pending", heading: args.heading }]);
    try {
      const res = await fetch("/api/ingest/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heading: args.heading,
          body: args.body || undefined,
          force: args.force,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicate) {
        setDupe({ heading: args.heading, body: args.body, duplicate: data.duplicate });
        setItems([]);
        setPhase("idle");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "ingest failed");
      setItems([{ status: "ok", heading: data.heading, note: data as Note }]);
      setSummary("1 ingested");
      setPhase("done");
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setItems([{ status: "failed", heading: args.heading, error: msg }]);
      setError(msg);
      setPhase("error");
    }
  }

  async function submitBulk(list: ParsedHeading[]) {
    reset();
    setPhase("running");
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const allItems: ItemState[] = list.map((p) => ({
        status: "pending",
        heading: p.heading,
      }));
      setItems(allItems);

      const chunks: ParsedHeading[][] = [];
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        chunks.push(list.slice(i, i + CHUNK_SIZE));
      }

      // Multi-chunk submissions share one log row so /activity shows a
      // single event instead of one per chunk.
      let logId: string | null = null;
      if (chunks.length > 1) {
        const beginRes = await fetch("/api/ingest/begin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            all_headings: list.map((p) => p.heading),
            mode: "bulk",
          }),
          signal: abort.signal,
        });
        if (!beginRes.ok) {
          const data = await beginRes.json().catch(() => ({}));
          throw new Error(data.error ?? "failed to start submission");
        }
        logId = (await beginRes.json()).log_id;
      }

      let totalSucceeded = 0;
      let totalFailed = 0;

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx]!;
        const isLast = chunkIdx === chunks.length - 1;
        const startGlobalIdx = chunkIdx * CHUNK_SIZE;

        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headings: chunk.map((c) => c.heading),
            bodies: chunk.map((c) => c.body ?? ""),
            mode: "bulk",
            log_id: logId ?? undefined,
            is_last_chunk: isLast,
          }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }

            if (event.type === "item") {
              const globalIdx = startGlobalIdx + (event.index as number);
              if (event.ok) {
                totalSucceeded++;
                allItems[globalIdx] = {
                  status: "ok",
                  heading: (event.note as Note).heading,
                  note: event.note as Note,
                };
              } else {
                totalFailed++;
                allItems[globalIdx] = {
                  status: "failed",
                  heading: event.heading as string,
                  error: event.error as string,
                };
              }
              setItems([...allItems]);
            } else if (event.type === "fatal") {
              throw new Error(event.error as string);
            }
          }
        }
      }

      const finalStatus =
        totalFailed === 0 ? "success" : totalSucceeded > 0 ? "partial" : "failed";
      setSummary(
        `${finalStatus} · ${totalSucceeded} ingested${totalFailed > 0 ? ` · ${totalFailed} failed` : ""}`,
      );
      setPhase("done");
      router.refresh();
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "cancelled" : (e as Error).message;
      setError(msg);
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }

  const doneCount = items.filter((i) => i.status !== "pending").length;
  const workingIdx = isRunning ? items.findIndex((i) => i.status === "pending") : -1;

  return (
    <div>
      {/* ── input panel ── */}
      <div className="mt-7 rounded-[14px] bg-panel p-4">
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setRemoved(new Set());
          }}
          rows={4}
          placeholder={"HA Proxy, BGP convergence\nArticle 21 of Indian Constitution\n# Frieren narrative pacing"}
          disabled={isRunning}
          className="min-h-[96px] w-full resize-none bg-transparent text-[15px] leading-[1.7] text-ink outline-none placeholder:text-ink-soft disabled:opacity-50"
        />
        <div className="mt-1.5 flex items-center gap-3 border-t border-panel-deep pt-3">
          <span className="font-mono text-[11px] font-medium text-ink-mid">
            {effective.length === 0 ? (
              "nothing to ingest yet"
            ) : (
              <>
                will become{" "}
                <b className="text-ink">
                  {effective.length} note{effective.length === 1 ? "" : "s"}
                </b>
                {chunkCount > 1 && <> · {chunkCount} chunks</>}
              </>
            )}
          </span>
          <span className="flex-1" />
          {isSingle && !showBody && !body.trim() && (
            <button
              type="button"
              onClick={() => setShowBody(true)}
              disabled={isRunning}
              className="text-[12px] text-ink-mid hover:text-ink disabled:opacity-50"
            >
              + add context
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isRunning || effective.length === 0}
            className="rounded-[9px] bg-red px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-red-deep disabled:opacity-40"
          >
            {isRunning
              ? "Ingesting…"
              : `Ingest${effective.length > 1 ? ` ${effective.length}` : ""}`}
          </button>
        </div>
      </div>

      {/* optional body — single heading only */}
      {isSingle && (showBody || body.trim()) && (
        <div className="mt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Context, source material, or your own draft. Markdown ok."
            rows={4}
            disabled={isRunning}
            className="w-full rounded-[12px] bg-panel px-4 py-3 text-[13px] text-ink outline-none placeholder:text-ink-soft disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => {
              setBody("");
              setShowBody(false);
            }}
            disabled={isRunning}
            className="mt-1 text-[11px] text-ink-soft hover:text-ink-mid disabled:opacity-50"
          >
            − Remove context
          </button>
        </div>
      )}

      {/* ── live parse chips ── */}
      {effective.length > 1 && phase === "idle" && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {effective.map((p, i) => (
            <span
              key={`${p.heading}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-panel px-3 py-[7px] text-[13px] font-medium text-ink"
            >
              {p.heading}
              <i className="font-mono text-[10px] font-medium not-italic text-ink-soft">
                {i + 1}
              </i>
              <button
                type="button"
                onClick={() => dropChip(p.heading)}
                aria-label={`Remove ${p.heading}`}
                className="-mr-1 px-0.5 text-[13px] leading-none text-ink-soft hover:text-red"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── duplicate interrupt ── */}
      {dupe && (
        <div className="mt-6 rounded-xl bg-warn-bg px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <i className="h-[7px] w-[7px] shrink-0 rounded-full border-2 border-warn-ink" />
            <b className="text-[14px] font-semibold">{dupe.heading}</b>
            <span className="text-[13px] font-medium text-warn-ink">
              · looks like a duplicate
            </span>
          </div>
          <div className="mb-3 ml-[17px] mt-2.5 text-[13px] text-ink-mid">
            {Math.round(dupe.duplicate.similarity * 100)}% similar to a note you
            already have:
            <Link
              href={`/notes/${dupe.duplicate.id}`}
              className="mt-2 flex items-center gap-2.5 rounded-lg bg-white px-3 py-[9px] hover:bg-tile"
            >
              <b className="text-[13px] font-semibold text-ink">
                {dupe.duplicate.heading}
              </b>
              <span className="text-[12px] text-ink-mid">
                → {dupe.duplicate.domain} ·{" "}
                <em className="not-italic text-red">{dupe.duplicate.sub_category}</em>
              </span>
              <span className="ml-auto font-mono text-[10.5px] text-ink-soft">
                sim {dupe.duplicate.similarity.toFixed(2)}
              </span>
            </Link>
          </div>
          <div className="ml-[17px] flex gap-2">
            <button
              type="button"
              onClick={() =>
                submitSingle({ heading: dupe.heading, body: dupe.body, force: true })
              }
              className="rounded-[7px] bg-ink px-3.5 py-[7px] text-[12px] font-semibold text-white hover:bg-black"
            >
              Ingest anyway
            </button>
            <button
              type="button"
              onClick={() => setDupe(null)}
              className="rounded-[7px] bg-white px-3.5 py-[7px] text-[12px] font-semibold text-ink-mid hover:text-ink"
            >
              Skip this one
            </button>
          </div>
        </div>
      )}

      {/* ── run ledger ── */}
      {(items.length > 0 || summary || error) && (
        <section className="mt-9">
          <div className="flex items-baseline justify-between border-b border-hairline pb-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[.15em] text-ink">
              {isRunning ? "Ingesting" : "Result"}
            </h2>
            <span className="flex items-center gap-3 font-mono text-[11px] font-medium text-ink-soft">
              {isRunning
                ? `${doneCount} of ${items.length} done · ~20s per note`
                : summary ?? ""}
              {isRunning && items.length > 1 && (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="font-sans text-[11px] text-ink-mid hover:text-red"
                >
                  cancel
                </button>
              )}
            </span>
          </div>

          {error && (
            <div className="mt-3 rounded-xl bg-fail-bg px-4 py-3 text-[12.5px] text-red-deep">
              {error}
            </div>
          )}

          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3.5 border-b border-hairline px-1 py-3.5"
            >
              {it.status === "ok" ? (
                <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-ok-ink" />
              ) : it.status === "failed" ? (
                <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-red" />
              ) : i === workingIdx ? (
                <i className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-red" />
              ) : (
                <i className="h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] border-ink-soft" />
              )}

              <span className="min-w-0 flex-1 truncate text-[14.5px]">
                <b
                  className={cn(
                    "font-semibold",
                    it.status === "pending" && i !== workingIdx
                      ? "font-medium text-ink-soft"
                      : "text-ink",
                  )}
                >
                  {it.heading}
                </b>
                {it.status === "ok" && (
                  <>
                    <span className="px-[3px] text-ink-soft">→</span>
                    <span className="text-[13px] text-ink-mid">
                      {it.note.domain} ·{" "}
                      <em className="not-italic text-red">{it.note.sub_category}</em>
                    </span>
                  </>
                )}
                {it.status === "pending" && i === workingIdx && (
                  <span className="pl-2 text-[13px] italic text-ink-soft">
                    categorizing…
                  </span>
                )}
                {it.status === "failed" && (
                  <span className="pl-2 text-[13px] text-red-deep" title={it.error}>
                    {it.error}
                  </span>
                )}
              </span>

              {it.status === "ok" && (
                <Link
                  href={`/notes/${it.note.id}`}
                  className="shrink-0 text-[12px] font-medium text-red hover:underline"
                >
                  view →
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── the other door ── */}
      <div className="mt-12 border-t border-hairline pt-5">
        <div className="text-[11px] font-bold uppercase tracking-[.15em] text-ink-soft">
          Also works from any Claude Code session
        </div>
        <p className="mt-2 text-[13px] text-ink-mid">
          Claude categorizes and defines in-session, then posts here — no API cost.
        </p>
        <code className="mt-2 inline-block rounded-[7px] bg-panel px-3 py-1.5 font-mono text-[12px] text-ink">
          /nous-ingest{" "}
          <em className="not-italic text-red">BGP convergence, ACID transactions</em>{" "}
          into personal
        </code>
      </div>
    </div>
  );
}
