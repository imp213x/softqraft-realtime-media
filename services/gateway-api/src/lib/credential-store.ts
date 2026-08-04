import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TenantRecord } from "../config.js";

export interface StoredCredential extends TenantRecord {
  label: string;
  createdAt: string;
  /** true = created via admin UI / API (file-backed) */
  managed: boolean;
}

interface StoreFile {
  version: 1;
  credentials: StoredCredential[];
}

/**
 * Runtime credential registry: env bootstrap + file-backed admin-generated keys.
 */
export class CredentialStore {
  private byKey = new Map<string, StoredCredential>();
  private byTenant = new Map<string, StoredCredential>();
  private legacyKeys: Set<string>;
  private storePath: string;

  constructor(opts: {
    storePath: string;
    legacyKeys: Set<string>;
    envTenants: TenantRecord[];
  }) {
    this.storePath = opts.storePath;
    this.legacyKeys = new Set(opts.legacyKeys);
    for (const t of opts.envTenants) {
      this.put(
        {
          ...t,
          label: t.tenantId,
          createdAt: new Date(0).toISOString(),
          managed: false,
        },
        false,
      );
    }
  }

  async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const data = JSON.parse(raw) as StoreFile;
      if (!data?.credentials?.length) return;
      for (const c of data.credentials) {
        this.put({ ...c, managed: true }, false);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw err;
    }
  }

  private async persist(): Promise<void> {
    const credentials = [...this.byTenant.values()].filter((c) => c.managed);
    const body: StoreFile = { version: 1, credentials };
    await mkdir(path.dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(body, null, 2), "utf8");
  }

  private put(c: StoredCredential, save: boolean): void {
    const existing = this.byTenant.get(c.tenantId);
    if (existing && existing.apiKey !== c.apiKey) {
      this.byKey.delete(existing.apiKey);
    }
    this.byKey.set(c.apiKey, c);
    this.byTenant.set(c.tenantId, c);
    if (save) {
      void this.persist();
    }
  }

  resolve(
    apiKey: string,
  ): { tenant: TenantRecord | null; apiKey: string } | null {
    const managed = this.byKey.get(apiKey);
    if (managed) {
      return {
        tenant: {
          tenantId: managed.tenantId,
          apiKey: managed.apiKey,
          maxSessions: managed.maxSessions,
          maxEgress: managed.maxEgress,
        },
        apiKey,
      };
    }
    if (this.legacyKeys.has(apiKey)) {
      return { tenant: null, apiKey };
    }
    return null;
  }

  list(): Array<{
    tenantId: string;
    label: string;
    maxSessions: number;
    maxEgress: number;
    createdAt: string;
    managed: boolean;
    apiKeyPreview: string;
  }> {
    return [...this.byTenant.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({
        tenantId: c.tenantId,
        label: c.label,
        maxSessions: c.maxSessions,
        maxEgress: c.maxEgress,
        createdAt: c.createdAt,
        managed: c.managed,
        apiKeyPreview: maskKey(c.apiKey),
      }));
  }

  async create(input: {
    tenantId: string;
    label?: string;
    maxSessions?: number;
    maxEgress?: number;
  }): Promise<StoredCredential> {
    const tenantId = sanitizeTenantId(input.tenantId);
    if (!tenantId) {
      throw new Error("Invalid tenantId");
    }
    if (this.byTenant.has(tenantId)) {
      throw new Error(`Tenant '${tenantId}' already exists`);
    }
    const apiKey = `sq_${tenantId}_${randomBytes(18).toString("base64url")}`;
    const rec: StoredCredential = {
      tenantId,
      apiKey,
      label: (input.label || tenantId).trim().slice(0, 128),
      maxSessions: Math.max(1, input.maxSessions ?? 50),
      maxEgress: Math.max(1, input.maxEgress ?? 10),
      createdAt: new Date().toISOString(),
      managed: true,
    };
    this.put(rec, false);
    await this.persist();
    return rec;
  }

  async revoke(tenantId: string): Promise<boolean> {
    const existing = this.byTenant.get(tenantId);
    if (!existing) return false;
    if (!existing.managed) {
      throw new Error(
        "Cannot revoke env-bootstrap credentials from the admin UI; remove from GATEWAY_TENANTS / GATEWAY_SERVICE_API_KEYS",
      );
    }
    this.byTenant.delete(tenantId);
    this.byKey.delete(existing.apiKey);
    await this.persist();
    return true;
  }

  tenantCount(): number {
    return this.byTenant.size;
  }

  /** When any tenant-mapped keys exist, session lists are scoped. */
  hasTenantIsolation(): boolean {
    return this.byTenant.size > 0;
  }
}

function sanitizeTenantId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
}

function maskKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
