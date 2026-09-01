import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";

const DEBUG = false; // set to true to log every proxy hit

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getSession() only decodes the cookie (no network round-trip), which keeps
  // every navigation fast. It is deliberately NOT an authorization decision: a
  // forged cookie can pass this check, so all it buys is "send anonymous
  // visitors to /login".
  //
  // The real gate is lib/auth/session.ts, which calls getUser() and therefore
  // VERIFIES the token before any requireAuth/requireRole decision. Do not move
  // authorization here, and do not "optimise" session.ts back to getSession() —
  // many server actions read/write with the service client, so RLS is not a
  // backstop for them.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset-password") ||
    // The offline fallback must answer 200 to everyone. Redirecting it made it
    // useless as a fallback: a redirected response cannot be replayed for a
    // navigation, which is what left the app showing ERR_FAILED with no signal.
    pathname.startsWith("/offline") ||
    pathname.startsWith("/api/health") ||
    // Cron routes authenticate themselves with CRON_SECRET (Bearer token from
    // Vercel Cron); they have no Supabase session, so skip the redirect.
    pathname.startsWith("/api/cron") ||
    // Shared accident reports are opened by the CEO / HR / committee, who have
    // no app account. The page authenticates them itself with the link password
    // (see actions/accident-share.ts) — this proxy is only a navigation gate, so
    // authorization for /report MUST stay inside the page.
    pathname.startsWith("/report");

  if (DEBUG && !pathname.startsWith("/_next") && !pathname.startsWith("/favicon")) {
    const sbCookies = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"))
      .map((c) => c.name);
    console.log(
      `[proxy] ${pathname} | user=${user?.id?.slice(0, 8) ?? "none"} | sb-cookies=[${sbCookies.join(",")}]`,
    );
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
