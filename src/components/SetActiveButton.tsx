"use client";

// Inline "Set active" on workspace rows — same endpoint the nav switcher
// uses; refreshes so the row's ACTIVE chip + nav chip update together.

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function SetActiveButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setActive() {
    startTransition(async () => {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={setActive}
      disabled={pending}
      className="shrink-0 text-[12.5px] font-medium text-red hover:text-red-deep disabled:opacity-50"
    >
      {pending ? "Switching…" : "Set active"}
    </button>
  );
}
