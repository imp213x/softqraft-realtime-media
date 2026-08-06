import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";
import {
  FileAdminAuthStore,
  LoginRateLimiter,
} from "./admin-auth.js";

describe("FileAdminAuthStore", () => {
  let dir = "";
  let store: FileAdminAuthStore;

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("bootstraps owner, login, session cookie token, logout", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sq-admin-"));
    store = new FileAdminAuthStore(path.join(dir, "admin-auth.json"));
    await store.load();

    assert.equal(await store.countOperators(), 0);

    const owner = await store.createOperator({
      email: "Owner@Example.COM",
      password: "long-enough-password",
      role: "owner",
    });
    assert.equal(owner.email, "owner@example.com");
    assert.equal(await store.countOperators(), 1);

    const bad = await store.verifyCredentials("owner@example.com", "wrong");
    assert.equal(bad, null);

    const ok = await store.verifyCredentials(
      "owner@example.com",
      "long-enough-password",
    );
    assert.ok(ok);
    assert.equal(ok!.role, "owner");

    const token = await store.createSession(ok!.id);
    assert.ok(token.length > 20);

    const session = await store.resolveSession(token);
    assert.ok(session);
    assert.equal(session!.operator.email, "owner@example.com");

    await store.deleteSession(token);
    const gone = await store.resolveSession(token);
    assert.equal(gone, null);
  });

  it("rejects short passwords", async () => {
    const d = await mkdtemp(path.join(tmpdir(), "sq-admin-"));
    const s = new FileAdminAuthStore(path.join(d, "a.json"));
    await s.load();
    await assert.rejects(
      () =>
        s.createOperator({
          email: "a@b.co",
          password: "short",
          role: "admin",
        }),
      /10 characters/,
    );
    await rm(d, { recursive: true, force: true });
  });
});

describe("LoginRateLimiter", () => {
  it("allows under limit and blocks after", () => {
    const lim = new LoginRateLimiter(3, 60_000);
    assert.equal(lim.check("1.1.1.1"), true);
    assert.equal(lim.check("1.1.1.1"), true);
    assert.equal(lim.check("1.1.1.1"), true);
    assert.equal(lim.check("1.1.1.1"), false);
    assert.equal(lim.check("2.2.2.2"), true);
  });
});
