import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoomMetadata,
  canAdoptRoom,
  parseRoomMetadata,
} from "./room-metadata.js";

describe("buildRoomMetadata", () => {
  it("keeps reserved fields even if caller tries to overwrite", () => {
    const raw = buildRoomMetadata({
      sessionId: "sess_real",
      tenantId: "tenant-a",
      externalId: "ext-1",
      callerMetadata: {
        sessionId: "sess_spoof",
        tenantId: "tenant-b",
        externalId: "evil",
        softqraft: false,
        hostUserId: "user_9",
      },
    });
    const meta = JSON.parse(raw);
    assert.equal(meta.sessionId, "sess_real");
    assert.equal(meta.tenantId, "tenant-a");
    assert.equal(meta.externalId, "ext-1");
    assert.equal(meta.softqraft, true);
    assert.equal(meta.hostUserId, "user_9");
  });
});

describe("canAdoptRoom", () => {
  it("denies cross-tenant adopt when isolation is on", () => {
    const r = canAdoptRoom({
      callerTenantId: "tenant-b",
      roomMetadata: { softqraft: true, tenantId: "tenant-a", sessionId: "s1" },
      tenantIsolationActive: true,
    });
    assert.equal(r.ok, false);
  });

  it("allows same-tenant adopt", () => {
    const r = canAdoptRoom({
      callerTenantId: "tenant-a",
      roomMetadata: { softqraft: true, tenantId: "tenant-a", sessionId: "s1" },
      tenantIsolationActive: true,
    });
    assert.equal(r.ok, true);
  });

  it("denies adopt of unowned room when caller is tenant-scoped", () => {
    const r = canAdoptRoom({
      callerTenantId: "tenant-a",
      roomMetadata: {},
      tenantIsolationActive: true,
    });
    assert.equal(r.ok, false);
  });

  it("allows legacy adopt without isolation when room has no tenant", () => {
    const r = canAdoptRoom({
      callerTenantId: null,
      roomMetadata: {},
      tenantIsolationActive: false,
    });
    assert.equal(r.ok, true);
  });
});

describe("parseRoomMetadata", () => {
  it("returns empty object on invalid JSON", () => {
    assert.deepEqual(parseRoomMetadata("not-json"), {});
  });
});
