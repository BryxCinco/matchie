import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DemoButton } from "../login/DemoButton";
import { SiteLinks, MobileMenu } from "./SiteLinks";

// Shared pieces of the public site: Home (/), About and Privacy.
// Matchie is single-user, so the calls to action open the public demo
// account (lib/demo.ts) instead of a sign-up form.

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Logo({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="" width={128} height={128} className={`${className} shrink-0`} />;
}

export function SiteNav() {
  return (
    <header className="glass pt-safe sticky top-0 z-30 border-b">
      <Container className="flex h-16 items-center gap-3">
        <Link href="/" className="pressable flex items-center gap-2.5 rounded-lg">
          <Logo className="size-8" />
          <span className="font-display text-lg font-semibold tracking-tight">Matchie</span>
        </Link>
        <SiteLinks />
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Suspense fallback={<SignedOutActions />}>
            <NavActions />
          </Suspense>
          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}

// The page is static; only this corner reads the session, so it streams in
// behind Suspense and the signed-out buttons show until it does.
async function isSignedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}

async function NavActions() {
  if (!(await isSignedIn())) return <SignedOutActions />;
  return (
    <Link href="/dashboard" className="btn-primary min-h-10 px-4">
      Open dashboard
    </Link>
  );
}

function SignedOutActions() {
  return (
    <>
      <Link href="/login" className="btn-secondary min-h-10 px-4">
        Sign in
      </Link>
      <DemoButton className="btn-primary hidden min-h-10 px-4 sm:inline-flex">Live demo</DemoButton>
    </>
  );
}

/** The main call to action: the live demo, or back to work for a signed-in user. */
export function PrimaryCta({ className = "" }: { className?: string }) {
  const signedOut = (
    <DemoButton className={`btn-primary min-h-12 px-7 text-base ${className}`}>
      View live demo
      <ArrowIcon />
    </DemoButton>
  );
  return (
    <Suspense fallback={signedOut}>
      <PrimaryCtaInner signedOut={signedOut} className={className} />
    </Suspense>
  );
}

async function PrimaryCtaInner({ signedOut, className }: { signedOut: ReactNode; className: string }) {
  if (!(await isSignedIn())) return signedOut;
  return (
    <Link href="/dashboard" className={`btn-primary min-h-12 px-7 text-base ${className}`}>
      Open your dashboard
      <ArrowIcon />
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="pb-safe relative border-t border-zinc-200 dark:border-zinc-800">
      <Container className="flex flex-col items-center justify-between gap-4 py-8 text-sm text-zinc-500 sm:flex-row dark:text-zinc-400">
        <span className="flex items-center gap-2">
          <Logo className="size-6" />
          <span>Matchie · Built for the Philippine job market</span>
        </span>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/" className="hover:text-zinc-950 dark:hover:text-zinc-50">
            Home
          </Link>
          <Link href="/about" className="hover:text-zinc-950 dark:hover:text-zinc-50">
            About
          </Link>
          <Link href="/privacy" className="hover:text-zinc-950 dark:hover:text-zinc-50">
            Privacy
          </Link>
          <a href="https://github.com/BryxCinco/matchie" target="_blank" rel="noreferrer" className="hover:text-zinc-950 dark:hover:text-zinc-50">
            GitHub
          </a>
        </nav>
      </Container>
    </footer>
  );
}

export function SectionTitle({ eyebrow, title, center = false }: { eyebrow: string; title: ReactNode; center?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 ${center ? "items-center text-center" : ""}`}>
      <p className="eyebrow">
        <span>{eyebrow}</span>
      </p>
      <h2 className="max-w-2xl font-display text-4xl leading-[1.02] font-medium tracking-tight sm:text-5xl">{title}</h2>
    </div>
  );
}

/** Warm light from above and a faint dot grid that fades out. Decoration only. */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
      <div className="absolute -top-48 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-orange-500/25 blur-[120px] dark:bg-orange-600/20" />
      <div className="absolute top-40 -right-40 h-80 w-80 rounded-full bg-orange-400/20 blur-[100px]" />
      <div className="absolute inset-0 [background-image:radial-gradient(rgb(128_120_150/0.25)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </div>
  );
}

// --- Icons (24px, 1.8 stroke, like the tab bar) -----------------------------------

export function Svg({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <Svg className="size-4">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}

export function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
