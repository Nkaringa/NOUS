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
    <form onSubmit={submit}>
      <div className="flex items-center gap-3 rounded-xl bg-panel py-2 pl-[18px] pr-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          placeholder="e.g. Tech Bros, Anime Club, Reading Group"
          maxLength={80}
          className="flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-soft disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="shrink-0 rounded-lg bg-red px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-red-deep disabled:opacity-40"
        >
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      {err ? (
        <p className="mt-2.5 text-[12px] text-red-deep">{err}</p>
      ) : (
        <p className="mt-2.5 text-[12px] text-ink-soft">
          You become the owner. Invite others from the workspace&apos;s settings.
        </p>
      )}
    </form>
  );
}
