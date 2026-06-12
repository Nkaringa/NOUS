"use client";

// Note actions — stacked quietly at the bottom of the note-detail meta
// rail. Logic unchanged: regenerate re-runs definer, recategorize re-runs
// categorizer, delete removes the note.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NoteActions({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function regenerate() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${noteId}/regenerate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "regenerate failed");
        return;
      }
      setMsg("Definition + example rewritten.");
      router.refresh();
    });
  }

  function recategorize() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${noteId}/recategorize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "recategorize failed");
        return;
      }
      setMsg(
        `${data.old.domain} / ${data.old.sub_category} → ${data.new.domain} / ${data.new.sub_category}`,
      );
      router.refresh();
    });
  }

  function del() {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "delete failed");
        return;
      }
      router.push("/notes");
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={regenerate}
        disabled={pending}
        className="py-1.5 text-left text-[12.5px] font-medium text-ink-mid hover:text-ink disabled:opacity-50"
      >
        ↻ {pending ? "Working…" : "Regenerate definition"}
      </button>
      <button
        type="button"
        onClick={recategorize}
        disabled={pending}
        className="py-1.5 text-left text-[12.5px] font-medium text-ink-mid hover:text-ink disabled:opacity-50"
      >
        ⌁ Re-categorize
      </button>
      <button
        type="button"
        onClick={del}
        disabled={pending}
        className="py-1.5 text-left text-[12.5px] font-medium text-red hover:text-red-deep disabled:opacity-50"
      >
        Delete note
      </button>
      {msg && (
        <div className="mt-1 rounded-lg bg-panel px-2.5 py-2 text-[11.5px] leading-snug text-ink">
          {msg}
        </div>
      )}
      {err && <div className="mt-1 text-[12px] text-red-deep">{err}</div>}
    </div>
  );
}
