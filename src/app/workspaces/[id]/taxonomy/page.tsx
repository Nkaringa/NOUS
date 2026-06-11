import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchTaxonomySnapshot } from "@/lib/ingest/taxonomy";
import { TaxonomyJanitor } from "@/components/TaxonomyJanitor";

export const dynamic = "force-dynamic";

export default async function TaxonomyJanitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!ws) notFound();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  const isOwner = ws.owner_id === user.id;
  const snapshot = await fetchTaxonomySnapshot(supabase, ws.id);

  // Group sub-categories under their domain, preserving the snapshot's
  // usage-count-descending order for both axes.
  const grouped = new Map<
    string,
    Array<{ sub_category: string; count: number }>
  >();
  for (const row of snapshot) {
    const list = grouped.get(row.domain) ?? [];
    list.push({ sub_category: row.sub_category, count: row.usage_count });
    grouped.set(row.domain, list);
  }
  const groups = Array.from(grouped.entries())
    .map(([domain, subs]) => ({
      domain,
      total: subs.reduce((acc, s) => acc + s.count, 0),
      subs,
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <main className="mx-auto max-w-[820px] px-8 py-10">
      <Link
        href={`/workspaces/${ws.id}/settings`}
        className="text-[12px] text-ink-mid hover:text-red"
      >
        ← {ws.name} settings
      </Link>

      <header className="mt-4 mb-8">
        <h1>Taxonomy</h1>
        <p className="mt-1 text-[13px] text-ink-mid">
          {isOwner
            ? "Rename a sub-category (or rename a whole domain) to clean up drift. Renaming to an existing pair merges the notes into it."
            : "Read-only view. Only the workspace owner can rename or merge taxonomy entries."}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-[13px] text-ink-mid">
          No notes in this workspace yet.{" "}
          <Link href="/ingest" className="text-red hover:underline">
            Ingest some →
          </Link>
        </p>
      ) : (
        <TaxonomyJanitor
          workspaceId={ws.id}
          isOwner={isOwner}
          groups={groups}
        />
      )}
    </main>
  );
}
