import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interleave } from "./round-robin.ts";

describe("interleave", () => {
  it("takes one item from each queue per pass, in queue order", () => {
    const out = interleave([
      { key: "a", items: [1, 2, 3] },
      { key: "b", items: [9] },
    ]);
    assert.deepEqual(
      out.map((x) => x.key),
      ["a", "b", "a", "a"],
    );
    assert.deepEqual(
      out.map((x) => x.item),
      [1, 9, 2, 3],
    );
  });

  it("returns [] for no queues or only empty queues", () => {
    assert.deepEqual(interleave([]), []);
    assert.deepEqual(interleave([{ key: "a", items: [] }]), []);
  });
});
