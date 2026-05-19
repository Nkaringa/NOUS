import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon
     * - public files (svg, png, jpg, jpeg, gif, webp)
     * - api/ingest/cc-session (bearer-token-guarded, not cookie-auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/ingest/cc-session|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
