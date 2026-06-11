"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Smart-routed dashboard input:
//   plain text          → /ingest (prefilled, user reviews + submits)
//   text ending in "?"  → /chat (auto-sends the question)
// Keeps the dashboard action-first without committing an ingest on a
// single keystroke — the ingest path still lands on the form so the user
// confirms (and gets dupe detection).
export function DashboardCaptureBar() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text) return;
    if (text.endsWith("?")) {
      router.push(`/chat?q=${encodeURIComponent(text)}`);
    } else {
      router.push(`/ingest?heading=${encodeURIComponent(text)}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const isAsk = value.trim().endsWith("?");

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-bg-input px-4 py-3 focus-within:border-ink">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Capture a heading, or ask your notes…"
          className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="shrink-0 rounded bg-red px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-red-deep disabled:opacity-40"
        >
          {isAsk ? "Ask" : "Capture"}
        </button>
      </div>
      <div className="mt-1.5 px-1 text-[11px] text-ink-soft">
        Press{" "}
        <kbd className="rounded border border-hairline px-1 font-mono">↵</kbd>{" "}
        to {isAsk ? "ask in chat" : "capture"} · end with{" "}
        <span className="font-mono text-ink-mid">?</span> to ask your notes
        instead
      </div>
    </div>
  );
}
