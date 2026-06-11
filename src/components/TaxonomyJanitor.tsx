"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Sub = { sub_category: string; count: number };
type Group = { domain: string; total: number; subs: Sub[] };

type EditTarget =
  | { kind: "sub"; domain: string; sub_category: string }
  | { kind: "domain"; domain: string };

export function TaxonomyJanitor({
  workspaceId,
  isOwner,
  groups,
}: {
  workspaceId: string;
  isOwner: boolean;
  groups: Group[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function openSubEdit(domain: string, sub_category: string) {
    setErr(null);
    setMsg(null);
    setEditing({ kind: "sub", domain, sub_category });
    setDraft(sub_category);
  }

  function openDomainEdit(domain: string) {
    setErr(null);
    setMsg(null);
    setEditing({ kind: "domain", domain });
    setDraft(domain);
  }

  function cancel() {
    setEditing(null);
    setDraft("");
    setErr(null);
  }

  function save() {
    if (!editing) return;
    const next = draft.trim();
    if (!next) {
      setErr("name cannot be empty");
      return;
    }

    setErr(null);
    startTransition(async () => {
      const body =
        editing.kind === "sub"
          ? {
              from: { domain: editing.domain, sub_category: editing.sub_category },
              to: { domain: editing.domain, sub_category: next },
            }
          : { from_domain: editing.domain, to_domain: next };

      const res = await fetch(`/api/workspaces/${workspaceId}/taxonomy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "rename failed");
        return;
      }
      setMsg(`Updated ${data.updated_count} note${data.updated_count === 1 ? "" : "s"}.`);
      setEditing(null);
      setDraft("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded border border-hairline bg-bg-soft p-3 text-[12px] text-ink">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded border border-red bg-red-bg p-3 text-[12px] text-red-deep">
          {err}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.domain} className="rounded border border-hairline">
          <header className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
            {editing?.kind === "domain" && editing.domain === g.domain ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={pending}
                  className="flex-1 rounded border border-hairline-strong bg-bg-input px-2 py-1 text-[13px] text-ink outline-none focus:border-ink disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="rounded bg-red px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="rounded border border-hairline-strong px-2.5 py-1 text-[11px] text-ink-mid hover:bg-bg-soft hover:text-ink disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold text-ink">{g.domain}</span>
                  <span className="text-[11px] text-ink-soft">
                    {g.total} note{g.total === 1 ? "" : "s"} ·{" "}
                    {g.subs.length} sub-categor{g.subs.length === 1 ? "y" : "ies"}
                  </span>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => openDomainEdit(g.domain)}
                    className="text-[11px] text-ink-mid hover:text-red"
                  >
                    Rename domain
                  </button>
                )}
              </>
            )}
          </header>

          <ul>
            {g.subs.map((s) => {
              const isEditingThis =
                editing?.kind === "sub" &&
                editing.domain === g.domain &&
                editing.sub_category === s.sub_category;

              return (
                <li
                  key={s.sub_category}
                  className="flex items-center gap-3 border-b border-hairline px-4 py-2 last:border-b-0"
                >
                  {isEditingThis ? (
                    <>
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={pending}
                        className="flex-1 rounded border border-hairline-strong bg-bg-input px-2 py-1 text-[13px] text-ink outline-none focus:border-ink disabled:opacity-50"
                        autoFocus
                      />
                      <span className="text-[11px] text-ink-soft">
                        {s.count} note{s.count === 1 ? "" : "s"}
                      </span>
                      <button
                        type="button"
                        onClick={save}
                        disabled={pending}
                        className="rounded bg-red px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
                      >
                        {pending ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancel}
                        disabled={pending}
                        className="rounded border border-hairline-strong px-2.5 py-1 text-[11px] text-ink-mid hover:bg-bg-soft hover:text-ink disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-[13px] text-ink">{s.sub_category}</span>
                      <span className="text-[11px] text-ink-soft">
                        {s.count} note{s.count === 1 ? "" : "s"}
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => openSubEdit(g.domain, s.sub_category)}
                          className="text-[11px] text-ink-mid hover:text-red"
                        >
                          Rename
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {isOwner && (
        <p className="text-[11px] text-ink-soft">
          Tip: typing an existing sub-category name when renaming will merge
          the notes into it. The empty taxonomy entry disappears automatically.
        </p>
      )}
    </div>
  );
}
