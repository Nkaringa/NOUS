import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NoteCard } from "@/components/NoteCard";
import { TaxonomyTree } from "@/components/TaxonomyTree";
import { fetchTaxonomyTree } from "@/lib/ingest/taxonomy";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Sort = "newest" | "oldest" | "az";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    domain?: string;
    sub_category?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const sort: Sort =
    sp.sort === "oldest" ? "oldest" : sp.sort === "az" ? "az" : "newest";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) return null;

  let query = supabase
    .from("notes")
    .select("id, user_id, workspace_id, heading, body_md, definition_md, example_md, domain, sub_category, source, confidence, key_terms, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .limit(50);

  if (sort === "az") query = query.order("heading", { ascending: true });
  else query = query.order("created_at", { ascending: sort === "oldest" });

  if (sp.domain) query = query.eq("domain", sp.domain);
  if (sp.sub_category) query = query.eq("sub_category", sp.sub_category);
  if (sp.q) query = query.textSearch("fts", sp.q, { type: "websearch" });

  const [{ data: notes }, tree, reviewRes] = await Promise.all([
    query,
    fetchTaxonomyTree(supabase, workspaceId),
    supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("domain", "Uncategorized"),
  ]);

  const title = sp.sub_category ?? sp.domain ?? "All notes";
  const showPath = !sp.sub_category;

  const sortQuery = (s: Sort) => ({
    ...(sp.domain ? { domain: sp.domain } : {}),
    ...(sp.sub_category ? { sub_category: sp.sub_category } : {}),
    ...(sp.q ? { q: sp.q } : {}),
    ...(s !== "newest" ? { sort: s } : {}),
  });

  return (
    <main className="mx-auto max-w-[1280px] px-9 pb-[90px] pt-10">
      <div className="grid gap-8 md:grid-cols-[230px_minmax(0,1fr)] md:gap-14">
        <aside className="md:sticky md:top-6 md:self-start">
          <TaxonomyTree
            tree={tree}
            activeDomain={sp.domain}
            activeSub={sp.sub_category}
            needsReview={reviewRes.count ?? 0}
          />
        </aside>

        <div className="min-w-0">
          <div className="flex items-center gap-3.5">
            <h1>{title}</h1>
            {sp.sub_category && sp.domain && (
              <span className="text-[13px] text-ink-soft">
                in <em className="not-italic text-ink-mid">{sp.domain}</em>
              </span>
            )}
            <span className="ml-auto font-mono text-[12px] font-medium text-ink-soft">
              {notes?.length ?? 0} note{notes?.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-[18px] flex gap-2.5">
            <form className="flex-1" action="/notes" method="get">
              {sp.domain && <input type="hidden" name="domain" value={sp.domain} />}
              {sp.sub_category && (
                <input type="hidden" name="sub_category" value={sp.sub_category} />
              )}
              {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
              <div className="flex items-center gap-2.5 rounded-[10px] bg-panel px-3.5 py-2.5">
                <span className="text-[13px] text-ink-soft">⌕</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder={
                    sp.sub_category
                      ? `Search within ${sp.sub_category}…`
                      : "Search your notes…"
                  }
                  className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-soft"
                />
              </div>
            </form>
            <div className="flex gap-[3px] rounded-[10px] bg-panel p-[3px]">
              {(
                [
                  ["newest", "Newest"],
                  ["oldest", "Oldest"],
                  ["az", "A–Z"],
                ] as const
              ).map(([s, label]) => (
                <Link
                  key={s}
                  href={{ pathname: "/notes", query: sortQuery(s) }}
                  className={cn(
                    "rounded-lg px-[13px] py-[7px] text-[12px] font-medium",
                    sort === s
                      ? "bg-tile text-ink shadow-[0_1px_2px_rgba(0,0,0,.05)]"
                      : "text-ink-mid hover:text-ink",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-[22px] border-t border-hairline">
            {(notes ?? []).map((n) => (
              <NoteCard key={n.id} note={n as Note} showPath={showPath} />
            ))}
            {notes && notes.length === 0 && (
              <p className="pt-6 text-[13px] text-ink-mid">
                No notes match this filter.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
