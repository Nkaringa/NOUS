"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Member = {
  id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  email: string | null;
};

export function MemberList({
  workspaceId,
  currentUserId,
  ownerId,
}: {
  workspaceId: string;
  currentUserId: string;
  ownerId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then((r) => r.json())
      .then((data) => setMembers(data.members ?? []))
      .catch(() => setErr("failed to load members"));
  }, [workspaceId]);

  async function remove(userId: string, isSelf: boolean) {
    const label = isSelf ? "leave this workspace" : "remove this member";
    if (!confirm(`Sure you want to ${label}? This is irreversible.`)) return;
    setErr(null);
    setBusy(userId);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/members/${userId}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "remove failed");
      if (isSelf) {
        startTransition(() => {
          router.push("/workspaces");
          router.refresh();
        });
      } else {
        setMembers((m) => (m ?? []).filter((x) => x.user_id !== userId));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (members === null) {
    return <p className="text-[12px] text-ink-soft">Loading members…</p>;
  }

  const isOwner = currentUserId === ownerId;

  return (
    <div>
      {err && (
        <div className="mb-3 rounded-lg bg-fail-bg p-2.5 text-[12px] text-red-deep">
          {err}
        </div>
      )}
      <ul className="border-t border-hairline">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const isWsOwner = m.user_id === ownerId;
          const canRemove =
            !isWsOwner && // owner can never be removed (must delete workspace)
            (isSelf || isOwner); // self-leave OR owner removing someone else
          const label = m.email ?? `user ${m.user_id.slice(0, 8)}…`;

          return (
            <li
              key={m.id}
              className="flex items-center gap-4 border-b border-hairline px-1 py-[15px]"
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-panel-deep text-[13px] font-semibold text-ink-mid">
                {label.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-ink">
                  {label}
                  {isSelf && (
                    <span className="ml-1.5 text-[12px] font-normal text-ink-soft">
                      (you)
                    </span>
                  )}
                </div>
                <div className="mt-[3px] font-mono text-[11px] uppercase text-ink-soft">
                  joined{" "}
                  {new Date(m.joined_at)
                    .toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-[5px] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[.08em] ${
                  isWsOwner ? "bg-red-bg text-red-deep" : "bg-panel text-ink-mid"
                }`}
              >
                {isWsOwner ? "owner" : m.role}
              </span>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => remove(m.user_id, isSelf)}
                  disabled={busy === m.user_id}
                  className="shrink-0 text-[12px] text-ink-soft hover:text-red disabled:opacity-50"
                >
                  {busy === m.user_id ? "…" : isSelf ? "leave" : "remove"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
