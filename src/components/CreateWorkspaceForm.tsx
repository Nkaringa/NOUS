"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CreateWorkspaceForm() {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setErr(null);
    startTransition(async () => {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "create failed");
        return;
      }
      setName("");
      // Switch active to the new workspace immediately
      await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: data.workspace.id }),
      });
      router.push(`/workspaces/${data.workspace.id}/settings`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        placeholder="e.g., Tech Bros, Anime Club, Reading Group"
        maxLength={80}
        className="w-full rounded border border-hairline-strong bg-bg-input px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-soft focus:border-ink disabled:opacity-50"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="rounded bg-red px-4 py-2 text-[13px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create workspace"}
        </button>
        {err && <span className="text-[12px] text-red-deep">{err}</span>}
      </div>
    </form>
  );
}
