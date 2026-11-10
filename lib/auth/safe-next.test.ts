import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next.ts";

describe("safeNext", () => {
  it("keeps same-origin paths with their query and hash", () => {
    assert.equal(safeNext("/tracker"), "/tracker");
    assert.equal(safeNext("/discover?tab=scored#top"), "/discover?tab=scored#top");
  });

  it("falls back when there is no value", () => {
    assert.equal(safeNext(null), "/dashboard");
    assert.equal(safeNext(undefined), "/dashboard");
    assert.equal(safeNext(""), "/dashboard");
    assert.equal(safeNext(null, "/settings"), "/settings");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example"]) {
      assert.equal(safeNext(next), "/dashboard", next);
    }
  });

  it("rejects tab and newline bypasses, which the URL parser strips", () => {
    for (const next of ["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "/\t\\evil.example"]) {
      assert.equal(safeNext(next), "/dashboard", JSON.stringify(next));
    }
  });

  it("returns the normalized path, not the raw input", () => {
    assert.equal(safeNext("/track\ter"), "/tracker");
    assert.equal(safeNext("/a/../settings"), "/settings");
  });
});
