import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types.ts";
import { chargeMe, chargeUser, QUOTA_REFUSED, quotaLeft } from "./llm-quota.ts";

// supabase-js goes through global fetch, so stubbing it runs the real client
// and shows exactly which RPC is called with which arguments.

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
let calls: { path: string; body: unknown }[] = [];
const realFetch = globalThis.fetch;
const realError = console.error;

function client() {
  return createClient<Database>("http://supabase.test", "anon-key", { auth: { persistSession: false } });
}

beforeEach(() => {
  replies = [];
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    const reply = replies.shift();
    if (!reply) throw new Error(`no reply queued for ${url.pathname}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

describe("chargeUser", () => {
  it("posts p_user_id, p_calls, p_worker to consume_llm_quota and returns true on true", async () => {
    replies.push({ status: 200, body: true });
    assert.equal(await chargeUser(client(), "user-1", 1, true), true);
    assert.deepEqual(calls, [
      { path: "/rest/v1/rpc/consume_llm_quota", body: { p_user_id: "user-1", p_calls: 1, p_worker: true } },
    ]);
  });

  it("returns false when the RPC returns false", async () => {
    replies.push({ status: 200, body: false });
    assert.equal(await chargeUser(client(), "user-1", 1, false), false);
  });

  it("fails closed when the RPC errors", async () => {
    replies.push({ status: 500, body: { code: "XX000", message: "boom" } });
    assert.equal(await chargeUser(client(), "user-1", 1, true), false);
  });
});

describe("chargeMe", () => {
  it("posts p_calls to consume_my_llm_quota", async () => {
    replies.push({ status: 200, body: true });
    assert.equal(await chargeMe(client(), 1), true);
    assert.deepEqual(calls, [{ path: "/rest/v1/rpc/consume_my_llm_quota", body: { p_calls: 1 } }]);
  });

  it("fails closed on a 500", async () => {
    replies.push({ status: 500, body: { code: "XX000", message: "boom" } });
    assert.equal(await chargeMe(client(), 1), false);
  });

  it("fails closed on a 404 (migration not applied)", async () => {
    replies.push({ status: 404, body: { code: "PGRST202", message: "Could not find the function" } });
    assert.equal(await chargeMe(client(), 1), false);
  });
});

describe("quotaLeft", () => {
  it("returns the number from my_llm_quota_left", async () => {
    replies.push({ status: 200, body: 6 });
    assert.equal(await quotaLeft(client()), 6);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/my_llm_quota_left");
  });

  it("returns 0 on error", async () => {
    replies.push({ status: 500, body: { code: "XX000", message: "boom" } });
    assert.equal(await quotaLeft(client()), 0);
  });
});

describe("QUOTA_REFUSED", () => {
  it("is the exact copy from the spec", () => {
    assert.equal(QUOTA_REFUSED, "Daily AI limit reached. It resets at midnight (PH time).");
  });
});
