"use client";

import { useEffect, useState } from "react";

type Invite = {
  id: string;
  token: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_at: string;
};

export function InviteManager({ workspaceId }: { workspaceId: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [expiresDays, setExpiresDays] = useState<number | "">(7);
  const [maxUses, setMaxUses] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/invites`)
      .then((r) => r.json())
      .then((data) => setInvites(data.invites ?? []))
      .catch(() => setErr("failed to load invites"));
  }, [workspaceId]);

  async function generate() {
    setErr(null);
    setCreating(true);
    try {
      const body: Record<string, number> = {};
      if (expiresDays !== "") body.expires_in_days = expiresDays;
      if (maxUses !== "") body.max_uses = maxUses;
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generate failed");
      setInvites((cur) => [data.invite, ...(cur ?? [])]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(inviteId: string) {
    if (!confirm("Revoke this invite link? Anyone who hasn't joined yet won't be able to.")) return;
    setErr(null);
    setBusy(inviteId);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/invites/${inviteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "revoke failed");
      }
      setInvites((cur) => (cur ?? []).filter((i) => i.id !== inviteId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/join/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // best-effort
    }
  }

  return (
    <div>
      {err && (
        <div className="mb-3 rounded-lg bg-fail-bg p-2.5 text-[12px] text-red-deep">
          {err}
        </div>
      )}

      <div className="rounded-[14px] bg-panel p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-[12.5px] text-ink-mid">Expires after</label>
          <input
            type="number"
            min="1"
            max="365"
            value={expiresDays}
            onChange={(e) =>
              setExpiresDays(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-[70px] rounded-lg bg-tile px-3 py-2 font-mono text-[13px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.04)] outline-none"
          />
          <label className="text-[12.5px] text-ink-mid">days</label>
          <label className="ml-3.5 text-[12.5px] text-ink-mid">Max uses</label>
          <input
            type="number"
            min="1"
            max="100"
            value={maxUses}
            onChange={(e) =>
              setMaxUses(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="∞"
            className="w-[70px] rounded-lg bg-tile px-3 py-2 font-mono text-[13px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.04)] outline-none placeholder:text-ink-soft"
          />
          <button
            type="button"
            onClick={generate}
            disabled={creating}
            className="ml-auto rounded-lg bg-red px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-red-deep disabled:opacity-50"
          >
            {creating ? "Generating…" : "Generate link"}
          </button>
        </div>
        <p className="mt-3 text-[11.5px] text-ink-soft">
          Leave blank for a link that never expires. Anyone with the link who
          signs in to NOUS can join.
        </p>
      </div>

      {invites === null ? (
        <p className="mt-2.5 text-[12px] text-ink-soft">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="mt-2.5 text-[12px] text-ink-soft">No active invites.</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {invites.map((i) => {
            const expired = i.expires_at && new Date(i.expires_at) < new Date();
            const exhausted = i.max_uses !== null && i.used_count >= i.max_uses;
            const dead = expired || exhausted;
            const daysLeft = i.expires_at
              ? Math.max(
                  0,
                  Math.ceil(
                    (new Date(i.expires_at).getTime() - Date.now()) / 86_400_000,
                  ),
                )
              : null;
            return (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-[10px] bg-panel px-3.5 py-3"
              >
                <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-mid">
                  {typeof window !== "undefined" ? window.location.host : ""}
                  /join/{i.token}
                </code>
                <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] uppercase text-ink-soft">
                  {dead
                    ? "DEAD"
                    : daysLeft !== null
                      ? `EXPIRES IN ${daysLeft}D`
                      : "NEVER EXPIRES"}{" "}
                  · {i.used_count}/{i.max_uses ?? "∞"} USED
                </span>
                <button
                  type="button"
                  onClick={() => copyLink(i.token)}
                  className="shrink-0 rounded-[7px] bg-tile px-3 py-1.5 text-[11.5px] font-semibold text-ink-mid shadow-[0_1px_1px_rgba(0,0,0,.04)] hover:text-ink"
                >
                  {copied === i.token ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(i.id)}
                  disabled={busy === i.id}
                  className="shrink-0 rounded-[7px] bg-tile px-3 py-1.5 text-[11.5px] font-semibold text-red shadow-[0_1px_1px_rgba(0,0,0,.04)] hover:text-red-deep disabled:opacity-50"
                >
                  {busy === i.id ? "…" : "Revoke"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
