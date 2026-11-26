"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { DEMO_DISABLED, isDemoAccount } from "@/lib/demo";

export type SettingsState = { error: string | null; message: string | null };

const PasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords do not match.", path: ["confirm"] });

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser("/settings");
  const parsed = PasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", message: null };

  const supabase = await createClient();
  // One visitor must not lock the others out of the shared demo login.
  if (await isDemoAccount(supabase, user.id)) return { error: `${DEMO_DISABLED}.`, message: null };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    // Supabase's messages here are user-facing ("New password should be
    // different from the old password", reauthentication required, ...).
    return { error: error.message, message: null };
  }
  return { error: null, message: "Password updated." };
}

// The link signs the user in through /auth/callback and lands back here,
// where the form above sets the new password. The callback URL must be in
// Supabase Auth > URL Configuration > Redirect URLs.
export async function sendPasswordReset(): Promise<SettingsState> {
  const user = await requireUser("/settings");
  if (!user.email) return { error: "Your account has no email address.", message: null };

  const supabase = await createClient();
  if (await isDemoAccount(supabase, user.id)) return { error: `${DEMO_DISABLED}.`, message: null };
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${await appOrigin()}/auth/callback?next=/settings`,
  });
  if (error) {
    console.error("[settings] reset email failed", error.message);
    return { error: "Could not send the email. Try again in a minute.", message: null };
  }
  return { error: null, message: `Reset link sent to ${user.email}.` };
}

// Self-service deletion (migration 017). delete_my_account() deletes the
// auth.users row as the caller, and every user table cascades from it. It
// refuses the demo and reserved accounts (the owner). Avatar files live in
// Storage, which does not cascade, so they go first; a failure there must
// not keep the user's data around.
export async function deleteAccount(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser("/settings");
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { error: 'Type "delete" to confirm.', message: null };
  }

  const supabase = await createClient();
  if (await isDemoAccount(supabase, user.id)) return { error: `${DEMO_DISABLED}.`, message: null };

  const { data: files, error: listError } = await supabase.storage.from("avatars").list(user.id);
  if (listError) console.error("[settings] avatar listing failed", listError.name);
  if (files && files.length > 0) {
    const { error: removeError } = await supabase.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
    if (removeError) console.error("[settings] avatar cleanup failed", removeError.name);
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("[settings] delete_my_account failed", error.code);
    return {
      error: error.code === "42501" ? "This account cannot be deleted here." : "Could not delete the account. Try again.",
      message: null,
    };
  }

  // The session belongs to a user that no longer exists; clear the cookies.
  await supabase.auth.signOut().catch(() => {});
  redirect("/");
}

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}
