import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types.ts";
import { loadEligibleUsers, mergePreferredPlaces } from "./worker-users.ts";

describe("mergePreferredPlaces", () => {
  it("trims, drops short entries, dedupes case-insensitively and sorts", () => {
    assert.deepEqual(mergePreferredPlaces([["Singapore", " singapore "], null, ["X", "Tokyo"]]), ["Singapore", "Tokyo"]);
  });

  it("returns [] for no input", () => {
    assert.deepEqual(mergePreferredPlaces([]), []);
  });
});

// supabase-js goes through global fetch; answer each table by path.
const realFetch = globalThis.fetch;
let tables: Record<string, unknown> = {};
let paths: string[] = [];

beforeEach(() => {
  tables = {};
  paths = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    paths.push(`${url.pathname}?${url.searchParams.toString()}`);
    const table = url.pathname.replace("/rest/v1/", "");
    if (!(table in tables)) throw new Error(`unexpected fetch to ${url.pathname}`);
    const body = tables[table];
    const status = body && typeof body === "object" && "code" in body ? 500 : 200;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function client() {
  return createClient<Database>("http://supabase.test", "service-key", { auth: { persistSession: false } });
}

describe("loadEligibleUsers", () => {
  it("keeps non-demo users with a seeker profile, reserved first", async () => {
    tables.profiles = [
      { user_id: "b-user", llm_reserved: false },
      { user_id: "a-user", llm_reserved: false },
      { user_id: "z-owner", llm_reserved: true },
      { user_id: "no-seeker", llm_reserved: false },
    ];
    tables.seeker_profiles = [{ user_id: "a-user" }, { user_id: "b-user" }, { user_id: "z-owner" }];

    assert.deepEqual(await loadEligibleUsers(client()), [
      { userId: "z-owner", reserved: true },
      { userId: "a-user", reserved: false },
      { userId: "b-user", reserved: false },
    ]);
    assert.ok(paths.some((p) => p.startsWith("/rest/v1/profiles?") && p.includes("is_demo=eq.false")), "demo users are filtered out");
  });

  it("throws with the error code when a query fails", async () => {
    tables.profiles = { code: "XX000", message: "boom" };
    tables.seeker_profiles = [];
    await assert.rejects(loadEligibleUsers(client()), /Could not load users \(XX000\)/);
  });
});
