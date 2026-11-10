// Only same-origin paths are allowed as a post-login destination. Without
// this, /login?next=https://evil.example would be an open redirect.
//
// Prefix checks are not enough: the URL parser drops tabs and newlines and
// reads "\" as "/", so "/\t/evil.example" and "/\evil.example" both become
// the protocol-relative "//evil.example". So the value is parsed the way the
// browser will parse it, against a placeholder origin, and kept only if it
// is still on that origin. The normalized path is returned, so callers never
// pass the raw string on.

const PLACEHOLDER_ORIGIN = "https://safe-next.invalid";

export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
