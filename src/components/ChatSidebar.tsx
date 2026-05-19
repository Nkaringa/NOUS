"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export type ChatSessionListItem = {
  id: string;
  title: string;
  created_at: string;
};

export function ChatSidebar({ sessions }: { sessions: ChatSessionListItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const activeId = pathname.startsWith("/chat/")
    ? pathname.slice("/chat/".length)
    : null;

  async function del(id: string) {
    if (!confirm("Delete this chat and all its messages?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      startTransition(() => {
        if (activeId === id) router.push("/chat");
        else router.refresh();
      });
    } catch {
      // best-effort
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <aside className="md:sticky md:top-20 md:self-start">
      <Link
        href="/chat"
        className={cn(
          "mb-5 block rounded px-3 py-2 text-center text-[13px] font-medium",
          !activeId
            ? "bg-ink text-white hover:bg-red"
            : "border border-hairline-strong text-ink-mid hover:bg-bg-soft hover:text-ink",
        )}
      >
        + New chat
      </Link>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-mid">
        Recent
      </div>
      {sessions.length === 0 ? (
        <p className="text-[12px] text-ink-soft">No chats yet.</p>
      ) : (
        <ul>
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            return (
              <li key={s.id} className="group relative">
                <Link
                  href={`/chat/${s.id}`}
                  className={cn(
                    "block rounded py-1.5 pr-7 text-[13px] leading-snug",
                    isActive
                      ? "border-l-2 border-red bg-bg-soft pl-3 font-medium text-ink -ml-px"
                      : "px-2 -mx-2 text-ink-mid hover:bg-bg-soft hover:text-ink",
                  )}
                  title={s.title}
                >
                  <span className="line-clamp-2">{s.title}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => del(s.id)}
                  disabled={deletingId === s.id}
                  className="absolute right-1 top-1.5 rounded px-1 text-[14px] leading-none text-ink-soft opacity-0 transition-opacity hover:text-red group-hover:opacity-100"
                  aria-label="Delete chat"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
