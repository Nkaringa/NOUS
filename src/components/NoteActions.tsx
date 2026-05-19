"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NoteActions({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        `Old: ${data.old.domain} / ${data.old.sub_category}\nNew: ${data.new.domain} / ${data.new.sub_category}`,
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
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={recategorize}
          disabled={pending}
          className="rounded border border-hairline-strong px-3 py-1.5 text-[12px] text-ink-mid hover:bg-bg-soft hover:text-ink disabled:opacity-50"
        >
          {pending ? "Working…" : "Re-categorize"}
        </button>
        <button
          type="button"
          onClick={del}
          disabled={pending}
          className="rounded border border-hairline-strong px-3 py-1.5 text-[12px] text-red hover:border-red hover:bg-red hover:text-white disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {msg && (
        <pre className="rounded border border-hairline bg-bg-soft p-2 text-[11px] text-ink whitespace-pre-wrap">
          {msg}
        </pre>
      )}
      {err && <div className="text-[12px] text-red-deep">{err}</div>}
    </div>
  );
}
