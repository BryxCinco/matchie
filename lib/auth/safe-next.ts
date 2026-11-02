// Only same-origin paths are allowed as a post-login destination. Without
// this, /login?next=https://evil.example would be an open redirect.
// "//host" and "/\host" are rejected because browsers treat them as
// protocol-relative URLs to another origin.
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
