"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const full_name = String(formData.get("full_name") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}
