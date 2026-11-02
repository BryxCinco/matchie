import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Welcome to Matchie
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Signed in as <span className="font-medium text-zinc-950 dark:text-zinc-50">{user.email}</span>
      </p>
    </section>
  );
}
