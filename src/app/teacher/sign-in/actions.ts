"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력하세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
});

const emailSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력하세요."),
});

function withError(message: string): never {
  redirect(`/teacher/sign-in?error=${encodeURIComponent(message)}`);
}

async function confirmationCallbackUrl() {
  const origin = (await headers()).get("origin");
  if (!origin) return undefined;
  try {
    return new URL("/auth/callback", origin).toString();
  } catch {
    return undefined;
  }
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
      options: {
        data: { display_name: parsed.data.email.split("@")[0] },
        emailRedirectTo: await confirmationCallbackUrl(),
      },
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
      if (error.code === "email_not_confirmed") {
        withError("이메일 인증이 아직 완료되지 않았습니다. 인증 이메일을 다시 받은 뒤 링크를 열어주세요.");
      }
      withError("이메일 또는 비밀번호를 확인하세요.");
    }
  }

  redirect("/teacher");
}

export async function resendTeacherConfirmation(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) withError(parsed.error.issues[0].message);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: await confirmationCallbackUrl() },
  });
  if (error) withError("인증 이메일을 다시 보내지 못했습니다. 잠시 후 다시 시도하세요.");
  redirect(`/teacher/sign-in?notice=${encodeURIComponent("가입한 이메일이 인증 대기 상태라면 새 인증 링크를 보냈습니다.")}`);
}

export async function teacherSignOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/teacher/sign-in");
}
