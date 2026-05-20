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
      <div>
        <div className="text-[15px] font-medium text-ink">{initialName}</div>
        <div className="mt-1 text-[11px] text-ink-soft">
          You&apos;re a member of this workspace (read-only on name).
        </div>
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
    <form onSubmit={save} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        maxLength={80}
        className="flex-1 rounded border border-hairline-strong bg-bg-input px-3 py-2 text-[14px] text-ink outline-none focus:border-ink disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending || !name.trim() || name.trim() === initialName}
        className="rounded border border-hairline-strong px-3 py-2 text-[12px] text-ink-mid hover:bg-bg-soft hover:text-ink disabled:opacity-50"
      >
        {pending ? "Saving…" : "Rename"}
      </button>
      {msg && <span className="text-[11px] text-ok-ink">{msg}</span>}
      {err && <span className="text-[11px] text-red-deep">{err}</span>}
    </form>
  );
}
