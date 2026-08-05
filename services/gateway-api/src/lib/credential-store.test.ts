import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  CredentialStore,
  hashKey,
  parseManagedKey,
} from "./credential-store.js";

describe("parseManagedKey / hashKey", () => {
  it("parses sqk_keyId.secret", () => {
    const p = parseManagedKey("sqk_key_abc123.secrettoken");
    assert.deepEqual(p, { keyId: "key_abc123", secret: "secrettoken" });
  });

  it("hashes deterministically", () => {
    assert.equal(hashKey("a"), hashKey("a"));
    assert.notEqual(hashKey("a"), hashKey("b"));
  });
});

describe("CredentialStore", () => {
  it("creates hashed key, resolves plaintext, never stores plaintext", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-cred-"));
    const storePath = path.join(dir, "tenants.json");
    const store = new CredentialStore({
      storePath,
      legacyKeys: new Set(),
      envTenants: [],
    });
    await store.loadFromDisk();

    const created = await store.create({
      tenantId: "Acme-App!",
      label: "Acme",
      maxSessions: 5,
      maxEgress: 2,
    });
    assert.equal(created.tenantId, "acme-app");
    assert.match(created.apiKey, /^sqk_key_/);
    assert.ok(store.resolve(created.apiKey)?.tenant?.tenantId === "acme-app");

    const disk = JSON.parse(await readFile(storePath, "utf8")) as {
      version: number;
      keys: Array<{ keyHash: string; apiKey?: string }>;
    };
    assert.equal(disk.version, 2);
    assert.equal(disk.keys.length, 1);
    assert.equal(disk.keys[0]?.apiKey, undefined);
    assert.equal(disk.keys[0]?.keyHash, hashKey(created.apiKey));
    assert.ok(!JSON.stringify(disk).includes(created.apiKey));
  });

  it("rotates and revokes previous keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-cred-"));
    const store = new CredentialStore({
      storePath: path.join(dir, "tenants.json"),
      legacyKeys: new Set(),
      envTenants: [],
    });
    const a = await store.create({ tenantId: "t1" });
    const rot = await store.rotateKey("t1");
    assert.ok(store.resolve(rot.apiKey));
    assert.equal(store.resolve(a.apiKey), null);
    assert.ok(rot.revokedKeyIds.includes(a.keyId));
  });

  it("supports multi-key without revoke", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-cred-"));
    const store = new CredentialStore({
      storePath: path.join(dir, "tenants.json"),
      legacyKeys: new Set(),
      envTenants: [],
    });
    const a = await store.create({ tenantId: "t2" });
    const b = await store.createKey("t2", { label: "ci" });
    assert.ok(store.resolve(a.apiKey));
    assert.ok(store.resolve(b.apiKey));
  });

  it("migrates v1 plaintext file to v2 hashes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-cred-"));
    const storePath = path.join(dir, "tenants.json");
    const plain = "sq_oldtenant_oldsecretvalue123";
    await writeFile(
      storePath,
      JSON.stringify({
        version: 1,
        credentials: [
          {
            tenantId: "oldtenant",
            apiKey: plain,
            label: "legacy",
            maxSessions: 10,
            maxEgress: 3,
            createdAt: "2026-01-01T00:00:00.000Z",
            managed: true,
          },
        ],
      }),
      "utf8",
    );
    const store = new CredentialStore({
      storePath,
      legacyKeys: new Set(),
      envTenants: [],
    });
    await store.loadFromDisk();
    assert.ok(store.resolve(plain)?.tenant?.tenantId === "oldtenant");
    const disk = JSON.parse(await readFile(storePath, "utf8")) as {
      version: number;
      keys: Array<{ keyHash: string }>;
    };
    assert.equal(disk.version, 2);
    assert.equal(disk.keys[0]?.keyHash, hashKey(plain));
  });

  it("records audit events", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-cred-"));
    const store = new CredentialStore({
      storePath: path.join(dir, "tenants.json"),
      legacyKeys: new Set(),
      envTenants: [],
    });
    await store.create({ tenantId: "aud1" });
    const events = store.listAudit(10);
    assert.ok(events.some((e) => e.action === "tenant.created"));
    assert.ok(events.some((e) => e.action === "key.created"));
  });

  it("rejects expired keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-cred-"));
    const store = new CredentialStore({
      storePath: path.join(dir, "tenants.json"),
      legacyKeys: new Set(),
      envTenants: [],
    });
    const past = new Date(Date.now() - 60_000).toISOString();
    const created = await store.create({
      tenantId: "exp1",
      expiresAt: past,
    });
    assert.equal(store.resolve(created.apiKey), null);
  });
});
