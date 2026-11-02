import { redirect } from "next/navigation";

// No landing page yet. Signed-out users are sent on to /login by the proxy.
export default function Home() {
  redirect("/dashboard");
}
