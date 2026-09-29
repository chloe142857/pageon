import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "./env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component에서 세션 갱신 쿠키를 쓸 수 없는 경우가 있다.
          // 로그인/로그아웃 Server Action에서는 정상적으로 설정된다.
        }
      },
    },
  });
}

/** 서버 코드에서만 사용한다. service role key는 절대 클라이언트로 보내지 않는다. */
export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicEnv();

  return createClient(url, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
