// Profile picture, or the first letter of the name on the accent gradient.
// No hooks, so it renders in Server and Client Components alike. Size comes
// from the caller's className (e.g. "size-8").
export function Avatar({ url, name, className = "size-8" }: { url: string | null; name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return url ? (
    // A plain <img>: the file is already a 256px image from our own bucket,
    // so next/image would add an optimization round trip for nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={256} height={256} className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} bg-accent inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-zinc-950`}
    >
      {initial}
    </span>
  );
}
