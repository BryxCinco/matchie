"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export type AvatarResult = { ok: true; url: string | null } | { ok: false; error: string };

const BUCKET = "avatars";
// The browser resizes to 256px before upload (AvatarUploader), so a real
// avatar is ~20-60 KB. The bucket also enforces 512 KB.
const MAX_BYTES = 512 * 1024;
const EXTENSIONS: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

// Runs as the user: Storage RLS (migration 008) only allows writes under
// avatars/{their id}/, and profiles RLS only their own row.
export async function uploadAvatar(formData: FormData): Promise<AvatarResult> {
  const user = await requireUser("/profile");
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
  const extension = EXTENSIONS[file.type];
  if (!extension) return { ok: false, error: "Use a JPEG, PNG or WebP image." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That image is too large. Try a smaller one." };

  const supabase = await createClient();
  // Random name: the bucket is public-read, so the URL must not be guessable.
  const path = `${user.id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000", // a new photo gets a new name, so cache forever
    upsert: false,
  });
  if (uploadError) {
    console.error("[profile] avatar upload failed", uploadError.message);
    return { ok: false, error: "Could not upload the photo. Please try again." };
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const previous = await setAvatarUrl(supabase, user.id, url);
  if (previous === false) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "Could not save the photo. Please try again." };
  }
  await removeStoredAvatar(supabase, user.id, previous);

  // The navbar shows the avatar on every page.
  revalidatePath("/", "layout");
  return { ok: true, url };
}

export async function removeAvatar(): Promise<AvatarResult> {
  const user = await requireUser("/profile");
  const supabase = await createClient();
  const previous = await setAvatarUrl(supabase, user.id, null);
  if (previous === false) return { ok: false, error: "Could not remove the photo. Please try again." };
  await removeStoredAvatar(supabase, user.id, previous);
  revalidatePath("/", "layout");
  return { ok: true, url: null };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Returns the previous URL (or null), or false if the update failed.
async function setAvatarUrl(supabase: Supabase, userId: string, url: string | null) {
  const { data: current } = await supabase.from("profiles").select("avatar_url").eq("user_id", userId).maybeSingle();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", userId);
  if (error) {
    console.error("[profile] saving avatar_url failed", error.code);
    return false;
  }
  return current?.avatar_url ?? null;
}

// Best effort: an orphaned file costs a few KB, not correctness.
async function removeStoredAvatar(supabase: Supabase, userId: string, url: string | null) {
  const marker = `/object/public/${BUCKET}/`;
  const path = url?.includes(marker) ? decodeURIComponent(url.split(marker)[1]) : null;
  if (!path || !path.startsWith(`${userId}/`)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn("[profile] old avatar not removed", error.message);
}

// --- Resume ---------------------------------------------------------------------

export type SaveResumeResult = { ok: true } | { ok: false; error: string };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const month = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(v), "Use YYYY-MM for dates, e.g. 2023-04.");

// What the review screen sends. Stricter than ResumeContentSchema (which is
// lenient on read): this is user input, so every field has a size limit.
const ReviewedResumeSchema = z
  .object({
    contact: z.object({ name: text(120), email: text(200), phone: text(40), location: text(120) }),
    summary: text(2_000),
    skills: z.array(z.string().trim().min(1).max(80)).max(100),
    experience: z
      .array(
        z.object({
          title: z.string().trim().min(1, "Every role needs a title.").max(150),
          company: text(150),
          start: month,
          end: month,
          highlights: z.array(z.string().trim().min(1).max(600)).max(20),
        }),
      )
      .max(30),
  })
  .refine((r) => r.skills.length > 0 || r.experience.length > 0, "Add at least one skill or role before saving.");

/**
 * Saves the resume the user reviewed on the Profile page. The file itself was
 * read in the browser (lib/resume-extract.ts) and never uploaded; this
 * receives only the structured result.
 */
export async function saveResumeContent(input: unknown): Promise<SaveResumeResult> {
  const user = await requireUser("/profile");
  const parsed = ReviewedResumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the resume and try again." };
  const content = parsed.data;

  const supabase = await createClient();
  // One master resume per user (partial unique index, which PostgREST cannot
  // target with upsert), so update-or-insert.
  const { data: master, error: readError } = await supabase
    .from("resumes")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_master", true)
    .maybeSingle();
  const { error } = readError
    ? { error: readError }
    : master
      ? await supabase.from("resumes").update({ content }).eq("id", master.id)
      : await supabase.from("resumes").insert({ user_id: user.id, content, is_master: true });

  if (error) {
    console.error("[profile] saving resume failed", error.code);
    return { ok: false, error: "Could not save your resume. Please try again." };
  }
  revalidatePath("/profile");
  return { ok: true };
}
