import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { isDemoUser } from "@/lib/auth/is-demo-user";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";
import { Avatar } from "../Avatar";
import { DemoLockNote } from "../DemoLock";
import { FadeIn } from "../motion";
import { PasswordForm, ResetLinkButton } from "./AccountForms";
import { DeleteAccountButton } from "./DangerZone";
import { ThemeSetting } from "./ThemeSetting";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <FadeIn>
        <h1 className="font-display text-4xl leading-[0.95] font-medium sm:text-5xl lg:text-6xl">
          <em className="accent-word">Settings</em>
        </h1>
      </FadeIn>

      <FadeIn delay={0.05}>
        <Group title="Account">
          <Suspense fallback={<div aria-busy="true" className="h-14 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800" />}>
            <AccountSummary />
          </Suspense>
          <Divider />
          <Row title="Password" description="Change it here, or get a reset link by email if you are not sure of the current one.">
            <Suspense fallback={<PasswordControls demo={false} />}>
              <PasswordSection />
            </Suspense>
          </Row>
        </Group>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Group title="Appearance">
          <Row title="Theme" description="Saved on this device.">
            <ThemeSetting />
          </Row>
        </Group>
      </FadeIn>

      <FadeIn delay={0.15}>
        <Group title="About">
          <Row title="How Matchie handles your data" description="Your resume is read on your device, and your name and contact details never reach an AI model.">
            <Link href="/privacy" className="btn-secondary min-h-11 self-start px-5">
              Read the privacy notice
            </Link>
          </Row>
          <Divider />
          <Row title="About Matchie" description="Why it exists, the rules it never breaks, and how it is built.">
            <div className="flex flex-wrap gap-2">
              <Link href="/about" className="btn-secondary min-h-11 px-5">
                About
              </Link>
              <Link href="/" className="btn-secondary min-h-11 px-5">
                Home page
              </Link>
            </div>
          </Row>
        </Group>
      </FadeIn>

      <FadeIn delay={0.2}>
        <Group title="Danger zone" danger>
          <Row title="Delete account" description="Permanently removes your profile, resume, matches and applications. This cannot be undone.">
            <Suspense fallback={<DeleteAccountButton />}>
              <DeleteAccountSection />
            </Suspense>
          </Row>
        </Group>
      </FadeIn>
    </div>
  );
}

async function PasswordSection() {
  await requireUser("/settings");
  return <PasswordControls demo={await isDemoUser()} />;
}

function PasswordControls({ demo }: { demo: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {demo && <DemoLockNote />}
      <PasswordForm demo={demo} />
      <ResetLinkButton demo={demo} />
    </div>
  );
}

async function DeleteAccountSection() {
  await requireUser("/settings");
  return <DeleteAccountButton demo={await isDemoUser()} />;
}

async function AccountSummary() {
  const user = await requireUser("/settings");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle();
  const email = user.email ?? "";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar url={profile?.avatar_url ?? null} name={email} className="size-12 text-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Email</p>
        <p className="truncate font-medium">{email}</p>
      </div>
      <form action={signOut}>
        <button type="submit" className="btn-secondary min-h-11 px-5">
          Log out
        </button>
      </form>
    </div>
  );
}

// iOS Settings-style grouped section.
function Group({ title, danger = false, children }: { title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={`px-1 text-xs font-semibold tracking-wider uppercase ${danger ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
        {title}
      </h2>
      <div className={`card flex flex-col gap-5 p-5 sm:p-6 ${danger ? "border-red-500/30 dark:border-red-500/30" : ""}`}>{children}</div>
    </section>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <hr className="border-zinc-200 dark:border-zinc-800" />;
}
