import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

/** Supabase 이메일 인증 링크의 code를 세션으로 교환한 뒤 교사 영역으로 보낸다. */
export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/teacher/sign-in", request.url);
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    redirectUrl.searchParams.set("error", "인증 링크가 올바르지 않거나 만료되었습니다. 인증 이메일을 다시 보내세요.");
    return NextResponse.redirect(redirectUrl);
  }

  const { url, anonKey } = getSupabasePublicEnv();
  const response = NextResponse.redirect(new URL("/teacher", request.url));
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return response;

  redirectUrl.searchParams.set("error", "이메일 인증 링크가 만료되었거나 이미 사용되었습니다. 새 인증 이메일을 보내세요.");
  return NextResponse.redirect(redirectUrl);
}
