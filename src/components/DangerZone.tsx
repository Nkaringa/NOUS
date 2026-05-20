"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DangerZone({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function del() {
    if (confirm !== workspaceName) {
      setErr(`Type the exact workspace name (${workspaceName}) to confirm.`);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "delete failed");
        return;
      }
      router.push("/workspaces");
      router.refresh();
    });
  }

  return (
    <div className="rounded border border-red bg-red-bg/40 p-4">
      <div className="text-[12px] font-medium uppercase tracking-wider text-red-deep">
        Danger zone
      </div>
      <p className="mt-2 text-[12px] text-ink-mid">
        Deleting a workspace permanently removes all its notes, chat history,
        activity log, and member list. This cannot be undone.
      </p>
      <p className="mt-2 text-[12px] text-ink-mid">
        Type <code className="rounded bg-bg-input px-1.5 py-0.5 font-mono text-[11px]">{workspaceName}</code> below to confirm:
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
          placeholder={workspaceName}
          className="flex-1 rounded border border-hairline-strong bg-bg-input px-3 py-2 text-[13px] text-ink outline-none focus:border-red disabled:opacity-50"
        />
        <button
          type="button"
          onClick={del}
          disabled={pending || confirm !== workspaceName}
          className="rounded bg-red px-3 py-2 text-[12px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete workspace"}
        </button>
      </div>
      {err && <p className="mt-2 text-[11px] text-red-deep">{err}</p>}
    </div>
  );
}
