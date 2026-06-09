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

  // Use getSession() (reads/refreshes via cookies) instead of getUser() (a
  // network round-trip to the Auth server on EVERY request). Over a high-latency
  // link to Supabase that round-trip was ~770ms per page. Data stays protected:
  // Postgres verifies the JWT signature on every query (RLS), so a forged cookie
  // can pass this redirect check but cannot read any data.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/health") ||
    // Cron routes authenticate themselves with CRON_SECRET (Bearer token from
    // Vercel Cron); they have no Supabase session, so skip the redirect.
    pathname.startsWith("/api/cron");

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
