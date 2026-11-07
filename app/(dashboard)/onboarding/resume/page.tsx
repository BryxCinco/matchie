import { redirect } from "next/navigation";

// The resume moved to the Profile page (upload, scan and review in one place).
// Kept as a redirect so old links and bookmarks still land there.
export default function ResumePage() {
  redirect("/profile#resume");
}
