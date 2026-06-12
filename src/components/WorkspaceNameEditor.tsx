"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceNameEditor({
  workspaceId,
  initialName,
  canEdit,
}: {
  workspaceId: string;
  initialName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="text-[11px] leading-relaxed text-ink-soft">
        Only the owner can rename this workspace.
      </div>
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName || pending) return;
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "rename failed");
        return;
      }
      setMsg("Renamed.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        maxLength={80}
        className="w-full rounded-[9px] bg-panel px-3.5 py-2.5 text-[13.5px] font-medium text-ink outline-none focus:ring-2 focus:ring-ink disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending || !name.trim() || name.trim() === initialName}
        className="mt-2 text-[12.5px] font-medium text-ink-mid hover:text-ink disabled:opacity-40"
      >
        {pending ? "Saving…" : "Rename →"}
      </button>
      {msg && <span className="ml-2 text-[11px] text-ok-ink">{msg}</span>}
      {err && <span className="ml-2 text-[11px] text-red-deep">{err}</span>}
    </form>
  );
}
