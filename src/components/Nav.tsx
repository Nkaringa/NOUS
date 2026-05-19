import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function Nav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-bg">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-8 py-3.5">
        <Link href="/" className="text-[15px] font-semibold tracking-wide">
          <span className="mr-1 text-red">●</span>NOUS
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/ingest">Ingest</NavLink>
          <NavLink href="/notes">Notes</NavLink>
          <NavLink href="/chat">Chat</NavLink>
          <NavLink href="/activity">Activity</NavLink>
        </nav>
        {user && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs text-ink-soft hover:text-ink"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-[13px] text-ink-mid hover:bg-bg-soft hover:text-ink"
    >
      {children}
    </Link>
  );
}
