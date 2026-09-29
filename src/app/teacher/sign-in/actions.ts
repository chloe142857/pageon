"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력하세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
});

function withError(message: string): never {
  redirect(`/teacher/sign-in?error=${encodeURIComponent(message)}`);
}

export async function teacherAuthenticate(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    withError(parsed.error.issues[0].message);
  }

  const supabase = await createSupabaseServerClient();
  const intent = formData.get("intent");

  if (intent === "sign-up") {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { display_name: parsed.data.email.split("@")[0] } },
    });

    if (error) {
      withError(error.message);
    }

    if (!data.session) {
      redirect(`/teacher/sign-in?notice=${encodeURIComponent("가입 확인 이메일을 보냈습니다. 이메일 확인 후 로그인하세요.")}`);
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      withError("이메일 또는 비밀번호를 확인하세요.");
    }
  }

  redirect("/teacher");
}

export async function teacherSignOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/teacher/sign-in");
}
