import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryQuotaTracker } from "./quotas.js";
import { HttpError } from "./auth.js";

describe("MemoryQuotaTracker", () => {
  it("reserves and releases sessions atomically relative to max", async () => {
    const q = new MemoryQuotaTracker();
    const tenant = {
      tenantId: "t1",
      apiKey: "k",
      maxSessions: 2,
      maxEgress: 1,
    };
    await q.tryReserveSession(tenant);
    await q.tryReserveSession(tenant);
    await assert.rejects(
      () => q.tryReserveSession(tenant),
      (e: unknown) => e instanceof HttpError && e.statusCode === 429,
    );
    await q.releaseSession("t1");
    await q.tryReserveSession(tenant);
    assert.equal(await q.countSessions("t1"), 2);
  });

  it("releases egress on terminal", async () => {
    const q = new MemoryQuotaTracker();
    const tenant = {
      tenantId: "t1",
      apiKey: "k",
      maxSessions: 10,
      maxEgress: 1,
    };
    await q.tryReserveEgress(tenant);
    await assert.rejects(() => q.tryReserveEgress(tenant));
    await q.onEgressTerminal("t1");
    await q.tryReserveEgress(tenant);
  });
});
