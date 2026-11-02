import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

// Landing point for email confirmation, magic links and OAuth. Supabase sends
// the user here with ?code=..., which is exchanged for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Missing code, expired link, or a link opened in a different browser than
  // the one that requested it (the PKCE verifier lives in that browser's cookie).
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "That sign-in link is invalid or has expired. Please sign in again.");
  return NextResponse.redirect(loginUrl);
}
