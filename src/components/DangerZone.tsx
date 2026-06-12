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
    <div className="rounded-[14px] bg-fail-bg p-5">
      <div className="text-[10.5px] font-bold uppercase tracking-[.15em] text-red-deep">
        Danger zone
      </div>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-mid">
        Deleting this workspace permanently removes all its notes, chats,
        activity, and members. This cannot be undone. Type{" "}
        <code className="rounded-[5px] bg-white px-1.5 py-0.5 font-mono text-[11.5px]">
          {workspaceName}
        </code>{" "}
        to confirm:
      </p>
      <div className="mt-3.5 flex gap-2">
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
          placeholder={workspaceName}
          className="min-w-0 flex-1 rounded-[9px] bg-white px-3.5 py-2.5 text-[13px] text-ink outline-none focus:ring-2 focus:ring-red disabled:opacity-50"
        />
        <button
          type="button"
          onClick={del}
          disabled={pending || confirm !== workspaceName}
          className="shrink-0 whitespace-nowrap rounded-[9px] bg-red px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-red-deep disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {err && <p className="mt-2 text-[11px] text-red-deep">{err}</p>}
    </div>
  );
}
