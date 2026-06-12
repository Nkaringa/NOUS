"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type WorkspaceListItem = {
  id: string;
  name: string;
  role: "owner" | "member";
  member_count: number;
};

export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: WorkspaceListItem[];
  activeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  async function switchTo(workspaceId: string) {
    if (workspaceId === activeId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        // best-effort — fail silently
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!active) {
    return (
      <Link
        href="/workspaces"
        className="rounded px-3 py-1.5 text-[13px] text-ink-mid hover:bg-bg-soft hover:text-ink"
      >
        + Create workspace
      </Link>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-mid",
          "bg-panel hover:bg-panel-deep hover:text-ink",
        )}
      >
        <span className="max-w-[180px] truncate">{active.name}</span>
        {active.member_count > 1 && (
          <span className="text-[10px] text-ink-soft">· {active.member_count}</span>
        )}
        <Chevron />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-hairline bg-tile shadow-lg">
          <div className="border-b border-hairline px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-ink-mid">
            Switch workspace
          </div>
          <ul>
            {workspaces.map((w) => {
              const isActive = w.id === activeId;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => switchTo(w.id)}
                    disabled={pending}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-bg-soft",
                      isActive ? "bg-bg-soft font-medium" : "",
                    )}
                  >
                    <span className="flex items-baseline gap-1.5 truncate">
                      <span
                        className={cn(
                          "inline-block size-1.5 rounded-full",
                          isActive ? "bg-red" : "bg-transparent",
                        )}
                      />
                      <span className="truncate">{w.name}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-soft">
                      {w.role === "owner" ? "owner" : `${w.member_count}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-hairline">
            <Link
              href="/workspaces"
              className="block px-3 py-2 text-[13px] text-ink-mid hover:bg-bg-soft hover:text-ink"
              onClick={() => setOpen(false)}
            >
              + Create or manage workspaces
            </Link>
            {active && (
              <Link
                href={`/workspaces/${active.id}/settings`}
                className="block border-t border-hairline px-3 py-2 text-[13px] text-ink-mid hover:bg-bg-soft hover:text-ink"
                onClick={() => setOpen(false)}
              >
                Settings · members · invites
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-ink-soft"
    >
      <path d="M2.5 4 L5 6.5 L7.5 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
