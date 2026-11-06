import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeError } from "./describe-error.ts";

class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

describe("describeError", () => {
  it("names the class and status when .name is just 'Error'", () => {
    const line = describeError(new FetchError("[400 Bad Request] API key not valid", 400));
    assert.match(line, /^FetchError status=400 message="\[400 Bad Request\] API key not valid"/);
  });

  it("keeps the message of a plain Error", () => {
    assert.match(describeError(new Error("Missing GEMINI_API_KEY")), /^Error message="Missing GEMINI_API_KEY"/);
  });

  it("redacts email addresses and secrets", () => {
    const line = describeError(new Error("rejected maria.santos@acme.com via https://x.dev/?key=AIzaSecret123"));
    assert.ok(!line.includes("maria.santos"));
    assert.ok(!line.includes("AIzaSecret123"));
    assert.ok(line.includes("[email]"));
  });

  it("includes the cause of a failed fetch", () => {
    const cause = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    assert.match(describeError(new TypeError("fetch failed", { cause })), /cause=Error\(ECONNRESET\): "socket hang up"/);
  });

  it("includes stack frames", () => {
    assert.match(describeError(new Error("boom")), / at .+/);
  });

  it("handles non-errors", () => {
    assert.equal(describeError("nope"), 'non-error thrown: nope');
  });
});
