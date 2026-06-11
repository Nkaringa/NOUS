"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteButton({
  token,
  label,
  primary = true,
}: {
  token: string;
  label: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function accept() {
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "failed to accept invite");
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className={
          primary
            ? "rounded bg-red px-5 py-2.5 text-[14px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
            : "rounded border border-hairline-strong px-5 py-2.5 text-[14px] text-ink hover:bg-bg-soft disabled:opacity-50"
        }
      >
        {pending ? "Joining…" : label}
      </button>
      {err && <span className="text-[12px] text-red-deep">{err}</span>}
    </div>
  );
}
