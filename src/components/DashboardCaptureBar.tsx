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
      <div className="flex items-center gap-3.5 rounded-xl bg-panel py-2 pl-5 pr-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Capture a heading, or ask your notes…"
          className="flex-1 bg-transparent text-[15.5px] text-ink outline-none placeholder:text-ink-soft"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="shrink-0 rounded-lg bg-red px-5 py-[11px] text-[13px] font-semibold text-white hover:bg-red-deep disabled:opacity-40"
        >
          {isAsk ? "Ask" : "Capture"}
        </button>
      </div>
      <div className="mx-1 mt-2.5 text-[11.5px] text-ink-soft">
        Press <b className="font-mono font-medium text-ink-mid">↵</b> to{" "}
        {isAsk ? "ask in chat" : "capture"} &nbsp;·&nbsp; end with{" "}
        <b className="font-mono font-medium text-ink-mid">?</b> to ask your
        notes instead
      </div>
    </div>
  );
}
