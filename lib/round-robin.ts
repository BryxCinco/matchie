// Fair ordering for per-user work: pass 1 takes the first item of every
// queue, pass 2 the second, and so on. Queue order is kept within a pass, so
// whoever is listed first (reserved users) is served first.
// Imported by workers: no @/ imports.

export function interleave<T>(queues: { key: string; items: T[] }[]): { key: string; item: T }[] {
  const out: { key: string; item: T }[] = [];
  const longest = Math.max(0, ...queues.map((q) => q.items.length));
  for (let pass = 0; pass < longest; pass++) {
    for (const queue of queues) {
      if (pass < queue.items.length) out.push({ key: queue.key, item: queue.items[pass] });
    }
  }
  return out;
}
