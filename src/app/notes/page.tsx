import { createClient } from "@/lib/supabase/server";
import { NoteCard } from "@/components/NoteCard";
import { TaxonomyTree } from "@/components/TaxonomyTree";
import { fetchTaxonomyTree } from "@/lib/ingest/taxonomy";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; sub_category?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) return null;

  let query = supabase
    .from("notes")
    .select("id, user_id, workspace_id, heading, body_md, definition_md, example_md, domain, sub_category, source, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (sp.domain) query = query.eq("domain", sp.domain);
  if (sp.sub_category) query = query.eq("sub_category", sp.sub_category);
  if (sp.q) query = query.textSearch("fts", sp.q, { type: "websearch" });

  const [{ data: notes }, tree] = await Promise.all([
    query,
    fetchTaxonomyTree(supabase, workspaceId),
  ]);

  const title = sp.sub_category ?? sp.domain ?? "All notes";
  const crumb = sp.sub_category && sp.domain ? ` in ${sp.domain}` : "";

  return (
    <main className="mx-auto max-w-[1100px] px-8 py-10">
      <div className="grid gap-10 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <TaxonomyTree
            tree={tree}
            activeDomain={sp.domain}
            activeSub={sp.sub_category}
          />
        </aside>

        <div>
          <div className="mb-5 flex items-baseline justify-between">
            <h1>
              {title}
              {crumb && (
                <span className="ml-2 text-[14px] font-normal text-ink-mid">
                  {crumb}
                </span>
              )}
            </h1>
            <span className="text-[12px] text-ink-soft">
              {notes?.length ?? 0} note{notes?.length === 1 ? "" : "s"}
            </span>
          </div>

          <form className="mb-6" action="/notes" method="get">
            {sp.domain && <input type="hidden" name="domain" value={sp.domain} />}
            {sp.sub_category && (
              <input type="hidden" name="sub_category" value={sp.sub_category} />
            )}
            <div className="relative">
              <SearchIcon />
              <input
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search within this category…"
                className="w-full rounded border border-hairline-strong bg-bg-input py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-soft focus:border-ink"
              />
            </div>
          </form>

          <div>
            {(notes ?? []).map((n) => (
              <NoteCard key={n.id} note={n as Note} />
            ))}
            {notes && notes.length === 0 && (
              <p className="text-[13px] text-ink-mid">
                No notes match this filter.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mid"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
