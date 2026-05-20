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
    <div className="space-y-6">
      {err && (
        <div className="rounded border border-red bg-red-bg p-2 text-[12px] text-red-deep">
          {err}
        </div>
      )}

      <div className="rounded border border-hairline bg-bg-soft p-4">
        <div className="mb-3 text-[12px] font-medium text-ink">Generate new invite link</div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12px] text-ink-mid">
            Expires after
            <input
              type="number"
              min="1"
              max="365"
              value={expiresDays}
              onChange={(e) =>
                setExpiresDays(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-16 rounded border border-hairline-strong bg-bg-input px-2 py-1 text-[12px] outline-none focus:border-ink"
            />
            days
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-mid">
            Max uses
            <input
              type="number"
              min="1"
              max="100"
              value={maxUses}
              onChange={(e) =>
                setMaxUses(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="∞"
              className="w-16 rounded border border-hairline-strong bg-bg-input px-2 py-1 text-[12px] outline-none focus:border-ink placeholder:text-ink-soft"
            />
          </label>
          <button
            type="button"
            onClick={generate}
            disabled={creating}
            className="rounded bg-red px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
          >
            {creating ? "Generating…" : "Generate"}
          </button>
        </div>
        <p className="mt-3 text-[10px] text-ink-soft">
          Tip: leave expiry/uses blank to generate an invite that never expires.
          Share the link via any channel — anyone with the link who&apos;s
          signed in to NOUS can join.
        </p>
      </div>

      <div>
        <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-ink-mid">
          Active invites
        </div>
        {invites === null ? (
          <p className="text-[12px] text-ink-soft">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="text-[12px] text-ink-soft">No active invites.</p>
        ) : (
          <ul>
            {invites.map((i) => {
              const expired = i.expires_at && new Date(i.expires_at) < new Date();
              const exhausted = i.max_uses !== null && i.used_count >= i.max_uses;
              const dead = expired || exhausted;
              return (
                <li
                  key={i.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-hairline py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="truncate rounded bg-bg-soft px-2 py-0.5 font-mono text-[11px] text-ink">
                        /join/{i.token}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyLink(i.token)}
                        className="rounded border border-hairline-strong px-2 py-0.5 text-[10px] text-ink-mid hover:bg-bg-soft hover:text-ink"
                      >
                        {copied === i.token ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                    <div className="mt-1 text-[10px] text-ink-soft">
                      Created {new Date(i.created_at).toLocaleDateString()} ·{" "}
                      {i.expires_at
                        ? `expires ${new Date(i.expires_at).toLocaleDateString()}`
                        : "never expires"}{" "}
                      · used {i.used_count}
                      {i.max_uses !== null ? ` / ${i.max_uses}` : ""}
                      {dead && <span className="ml-2 text-red-deep">(dead)</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(i.id)}
                    disabled={busy === i.id}
                    className="text-[11px] text-ink-mid hover:text-red-deep disabled:opacity-50"
                  >
                    {busy === i.id ? "…" : "Revoke"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
