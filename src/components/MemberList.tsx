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
        <div className="mb-3 rounded border border-red bg-red-bg p-2 text-[12px] text-red-deep">
          {err}
        </div>
      )}
      <ul>
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const isWsOwner = m.user_id === ownerId;
          const canRemove =
            !isWsOwner && // owner can never be removed (must delete workspace)
            (isSelf || isOwner); // self-leave OR owner removing someone else

          return (
            <li
              key={m.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-hairline py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] text-ink">
                  {m.email ?? `user ${m.user_id.slice(0, 8)}…`}
                  {isSelf && <span className="ml-1 text-[10px] text-ink-soft">(you)</span>}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-soft">
                  joined {new Date(m.joined_at).toLocaleDateString()}
                </div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  isWsOwner ? "bg-red-bg text-red-deep" : "bg-bg-soft text-ink-mid"
                }`}
              >
                {isWsOwner ? "owner" : m.role}
              </span>
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => remove(m.user_id, isSelf)}
                  disabled={busy === m.user_id}
                  className="text-[11px] text-ink-mid hover:text-red-deep disabled:opacity-50"
                >
                  {busy === m.user_id ? "…" : isSelf ? "Leave" : "Remove"}
                </button>
              ) : (
                <span className="w-12" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
