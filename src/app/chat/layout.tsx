import { createClient } from "@/lib/supabase/server";
import { ChatSidebar, type ChatSessionListItem } from "@/components/ChatSidebar";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) return null;

  const { data } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  const sessions = (data ?? []) as ChatSessionListItem[];

  return (
    <div className="mx-auto max-w-[1240px] px-9 pt-9">
      <div className="grid gap-8 md:grid-cols-[240px_minmax(0,1fr)] md:gap-14">
        <ChatSidebar sessions={sessions} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
