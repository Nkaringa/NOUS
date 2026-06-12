"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher, type WorkspaceListItem } from "./WorkspaceSwitcher";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/ingest", label: "Ingest" },
  { href: "/notes", label: "Notes" },
  { href: "/chat", label: "Chat" },
  { href: "/activity", label: "Activity" },
] as const;

export function NavChrome({
  signedIn,
  workspaces,
  activeId,
}: {
  signedIn: boolean;
  workspaces: WorkspaceListItem[];
  activeId: string | null;
}) {
  const pathname = usePathname();

  // The login page stands alone — no chrome at all.
  if (pathname === "/login") return null;

  return (
    <header className="bg-bg">
      <div className="mx-auto flex max-w-[1680px] items-center gap-5 px-9 py-4">
        <Link
          href="/"
          className="text-[15.5px] font-bold tracking-[.05em] text-ink outline-none rounded focus-visible:ring-2 focus-visible:ring-red/40"
        >
          NOUS
        </Link>
        {signedIn && (
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeId} />
        )}
        <nav className="ml-auto flex gap-0.5 rounded-[10px] bg-panel p-[3px]">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3.5 py-[7px] text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-red/40",
                  active
                    ? "bg-tile text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                    : "text-ink-mid hover:text-ink",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        {signedIn && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded px-1 text-[12px] text-ink-mid outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-red/40"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
