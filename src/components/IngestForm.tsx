"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseHeadings, type ParsedHeading } from "@/lib/ingest/parse";
import type { Note } from "@/lib/types";

type Mode = "single" | "bulk";

type ItemState =
  | { status: "pending"; heading: string }
  | { status: "ok"; heading: string; note: Note }
  | { status: "failed"; heading: string; error: string };

type DuplicatePrompt = {
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

export function IngestForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("single");
  const [input, setInput] = useState("");
  const [body, setBody] = useState("");
  const [items, setItems] = useState<ItemState[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupePrompt, setDupePrompt] = useState<DuplicatePrompt | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    setItems([]);
    setSummary(null);
    setError(null);
  }

  async function submitSingle(opts?: { force?: boolean; heading?: string; body?: string }) {
    const headingValue = (opts?.heading ?? input).trim();
    const bodyValue = (opts?.body ?? body).trim();
    reset();
    setDupePrompt(null);
    setPhase("running");
    setItems([{ status: "pending", heading: headingValue }]);
    try {
      const res = await fetch("/api/ingest/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heading: headingValue,
          body: bodyValue || undefined,
          force: opts?.force ?? false,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicate) {
        setDupePrompt({
          heading: headingValue,
          body: bodyValue,
          duplicate: data.duplicate,
        });
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
      setItems([{ status: "failed", heading: headingValue, error: msg }]);
      setError(msg);
      setPhase("error");
    }
  }

  async function submitBulk() {
    reset();
    setPhase("running");
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const parsed = parseHeadings(input);
      if (parsed.length === 0) throw new Error("no headings to ingest");

      // Seed UI with all items pending
      const allItems: ItemState[] = parsed.map((p) => ({
        status: "pending",
        heading: p.heading,
      }));
      setItems(allItems);

      // Split into chunks
      const chunks: ParsedHeading[][] = [];
      for (let i = 0; i < parsed.length; i += CHUNK_SIZE) {
        chunks.push(parsed.slice(i, i + CHUNK_SIZE));
      }

      // For multi-chunk submissions, create one shared log row up front so
      // /activity shows a single "X ingested" row instead of one per chunk.
      let logId: string | null = null;
      if (chunks.length > 1) {
        const beginRes = await fetch("/api/ingest/begin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            all_headings: parsed.map((p) => p.heading),
            mode: "bulk",
          }),
          signal: abort.signal,
        });
        if (!beginRes.ok) {
          const data = await beginRes.json().catch(() => ({}));
          throw new Error(data.error ?? "failed to start submission");
        }
        const beginData = await beginRes.json();
        logId = beginData.log_id;
      }

      let totalSucceeded = 0;
      let totalFailed = 0;

      // Process chunks sequentially. Each chunk = fresh function invocation.
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
              const localIdx = event.index as number;
              const globalIdx = startGlobalIdx + localIdx;
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
            // ignore 'start' and 'done' from individual chunks — UI tracks own totals
          }
        }
      }

      const finalStatus =
        totalFailed === 0
          ? "success"
          : totalSucceeded > 0
            ? "partial"
            : "failed";
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

  function cancel() {
    abortRef.current?.abort();
  }

  const isRunning = phase === "running";

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1">
        {(["single", "bulk"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              reset();
              setPhase("idle");
            }}
            disabled={isRunning}
            className={cn(
              "rounded border px-3 py-1.5 text-[12px] disabled:opacity-50",
              mode === m
                ? "border-ink bg-ink text-white"
                : "border-hairline-strong text-ink-mid hover:bg-bg-soft hover:text-ink",
            )}
          >
            {m === "single" ? "Single" : "Bulk"}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="HA VPN with Cloud Router (BGP)"
            disabled={isRunning}
            className="w-full rounded border border-hairline-strong bg-bg-input px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-soft focus:border-ink disabled:opacity-50"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional body / context (markdown ok)"
            rows={4}
            disabled={isRunning}
            className="w-full rounded border border-hairline-strong bg-bg-input px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-soft focus:border-ink disabled:opacity-50"
          />
        </>
      ) : (
        <>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              "Paste any of:\n• One heading per line\n• Comma-separated list (HA Proxy, BGP, VPC peering)\n• Markdown with # headers\n• A single heading\n\nNote: ' and ' is NOT a separator — only newlines, commas, and semicolons. Commas inside (), [], {}, quotes are ignored."
            }
            rows={10}
            disabled={isRunning}
            className="w-full rounded border border-hairline-strong bg-bg-input px-3 py-2.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-soft focus:border-ink disabled:opacity-50"
          />
          <ParsePreview input={input} disabled={isRunning} />
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (mode === "single" ? submitSingle() : submitBulk())}
          disabled={isRunning || !input.trim()}
          className="rounded bg-red px-4 py-2 text-[13px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
        >
          {isRunning ? "Ingesting…" : "Ingest"}
        </button>
        {isRunning && mode === "bulk" && (
          <button
            type="button"
            onClick={cancel}
            className="rounded border border-hairline-strong px-3 py-2 text-[12px] text-ink-mid hover:bg-bg-soft hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red bg-red-bg p-3 text-[12px] text-red-deep">
          {error}
        </div>
      )}

      {dupePrompt && (
        <div className="rounded border border-hairline-strong bg-bg-soft p-4">
          <div className="text-[12px] font-medium uppercase tracking-wider text-ink-mid">
            Possible duplicate
          </div>
          <p className="mt-2 text-[13px] text-ink">
            You may already have a note about this — it&apos;s{" "}
            <span className="font-medium">
              {Math.round(dupePrompt.duplicate.similarity * 100)}%
            </span>{" "}
            similar to:
          </p>
          <div className="mt-2 rounded border border-hairline bg-bg p-3">
            <Link
              href={`/notes/${dupePrompt.duplicate.id}`}
              className="text-[14px] font-medium text-ink hover:text-red"
            >
              {dupePrompt.duplicate.heading}
            </Link>
            <div className="mt-1 text-[11px] text-ink-mid">
              {dupePrompt.duplicate.domain}{" "}
              <span className="text-ink-soft">/</span>{" "}
              <span className="text-red">{dupePrompt.duplicate.sub_category}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                submitSingle({
                  force: true,
                  heading: dupePrompt.heading,
                  body: dupePrompt.body,
                })
              }
              className="rounded border border-hairline-strong px-3 py-1.5 text-[12px] text-ink-mid hover:bg-bg hover:text-ink"
            >
              Insert anyway
            </button>
            <button
              type="button"
              onClick={() => setDupePrompt(null)}
              className="rounded border border-hairline-strong px-3 py-1.5 text-[12px] text-ink-mid hover:bg-bg hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(items.length > 0 || summary) && (
        <div className="space-y-2 pt-2">
          {summary && (
            <div className="text-[12px] text-ink-mid">{summary}</div>
          )}
          {!summary && isRunning && (
            <div className="text-[12px] text-ink-mid">
              {items.filter((i) => i.status !== "pending").length} / {items.length}{" "}
              done — ~15–30s per heading. Safe to leave this page; ingestion
              continues server-side.
            </div>
          )}
          <ul className="rounded border border-hairline">
            {items.map((it, i) => (
              <li
                key={i}
                className="flex items-center gap-3 border-b border-hairline px-3 py-2 last:border-b-0"
              >
                <StatusDot status={it.status} />
                <span className="flex-1 truncate text-[13px] text-ink">{it.heading}</span>
                {it.status === "ok" && (
                  <span className="text-[11px] text-ink-mid">
                    {it.note.domain} <span className="text-ink-soft">/</span>{" "}
                    <span className="text-red">{it.note.sub_category}</span>
                  </span>
                )}
                {it.status === "failed" && (
                  <span className="truncate text-[11px] text-red-deep" title={it.error}>
                    {it.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ParsePreview({ input, disabled }: { input: string; disabled: boolean }) {
  const parsed = useMemo(() => parseHeadings(input), [input]);
  if (disabled || !input.trim()) {
    return (
      <p className="text-[12px] text-ink-soft">
        Live preview will appear here as you type.
      </p>
    );
  }
  const chunkCount = Math.ceil(parsed.length / CHUNK_SIZE);
  return (
    <div className="space-y-1.5 rounded border border-hairline bg-bg-soft p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-ink-mid">
          Will ingest as {parsed.length} heading{parsed.length === 1 ? "" : "s"}
        </div>
        {chunkCount > 1 && (
          <div className="text-[10px] text-ink-soft">
            sent in {chunkCount} chunks of ≤{CHUNK_SIZE}
          </div>
        )}
      </div>
      <ol className="space-y-0.5 text-[12px]">
        {parsed.map((p, i) => (
          <li key={i} className="font-mono text-ink">
            <span className="text-ink-soft">{i + 1}.</span> {p.heading}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StatusDot({ status }: { status: ItemState["status"] }) {
  if (status === "pending") {
    return (
      <span className="inline-block size-2 animate-pulse rounded-full bg-ink-soft" />
    );
  }
  if (status === "ok") {
    return <span className="inline-block size-2 rounded-full bg-ok-ink" />;
  }
  return <span className="inline-block size-2 rounded-full bg-red" />;
}
