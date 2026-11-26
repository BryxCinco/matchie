import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignUpSchema } from "./sign-up-schema.ts";

const valid = { email: "new.user@example.com", password: "long-enough-pw", inviteCode: " MATCHIE-2026 " };

describe("SignUpSchema", () => {
  it("parses a valid sign-up and trims the invite code", () => {
    const parsed = SignUpSchema.parse(valid);
    assert.equal(parsed.inviteCode, "MATCHIE-2026");
  });

  it("rejects a short password with the settings copy", () => {
    const result = SignUpSchema.safeParse({ ...valid, password: "short" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.message, "Use at least 8 characters.");
  });

  it("rejects an invite code with a space inside", () => {
    assert.equal(SignUpSchema.safeParse({ ...valid, inviteCode: "MATCHIE 2026" }).success, false);
  });

  it("rejects an empty invite code", () => {
    assert.equal(SignUpSchema.safeParse({ ...valid, inviteCode: "   " }).success, false);
  });

  it("rejects an invalid email", () => {
    assert.equal(SignUpSchema.safeParse({ ...valid, email: "not-an-email" }).success, false);
  });
});
