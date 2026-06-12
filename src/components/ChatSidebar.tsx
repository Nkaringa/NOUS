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
    <aside className="md:sticky md:top-9 md:self-start">
      <Link
        href="/chat"
        className="mb-6 block rounded-[10px] border border-hairline py-[9px] text-center text-[13px] font-semibold text-ink transition-colors hover:border-red hover:text-red"
      >
        + New chat
      </Link>
      <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-soft">
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
                    "block py-2 pr-7 text-[13.5px] font-medium leading-[1.4] transition-colors",
                    isActive
                      ? "-ml-[13px] border-l-2 border-red pl-[11px] font-semibold text-red"
                      : "text-ink-mid hover:text-ink",
                  )}
                  title={s.title}
                >
                  <span className="block truncate">{s.title}</span>
                  <time className="mt-px block font-mono text-[10px] font-normal text-ink-soft">
                    {formatRelative(s.created_at)} ago
                  </time>
                </Link>
                <button
                  type="button"
                  onClick={() => del(s.id)}
                  disabled={deletingId === s.id}
                  className="absolute right-1 top-2 rounded px-1 text-[14px] leading-none text-ink-soft opacity-0 transition-opacity hover:text-red group-hover:opacity-100"
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

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
