/**
 * LiveKit room metadata helpers — reserved SoftQraft fields must not be
 * overwriteable by caller-supplied metadata (cross-tenant hardening).
 */

export interface SoftQraftRoomMeta {
  softqraft: true;
  sessionId: string;
  tenantId: string | null;
  externalId: string | null;
  /** Caller opaque fields (never reserved keys). */
  [key: string]: unknown;
}

const RESERVED_KEYS = new Set([
  "softqraft",
  "sessionId",
  "tenantId",
  "externalId",
]);

/**
 * Build room metadata JSON. Reserved keys are applied last so callers cannot
 * spoof session/tenant ownership via body.metadata.
 */
export function buildRoomMetadata(input: {
  sessionId: string;
  tenantId: string | null;
  externalId: string | null;
  callerMetadata?: Record<string, unknown>;
}): string {
  const caller = { ...(input.callerMetadata ?? {}) };
  for (const k of RESERVED_KEYS) {
    delete caller[k];
  }
  const meta: SoftQraftRoomMeta = {
    ...caller,
    softqraft: true,
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    externalId: input.externalId,
  };
  return JSON.stringify(meta);
}

export function parseRoomMetadata(
  raw: string | undefined | null,
): Partial<SoftQraftRoomMeta> {
  if (!raw || !String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<SoftQraftRoomMeta>;
  } catch {
    return {};
  }
}

/**
 * Whether an existing LiveKit room may be adopted by this tenant.
 * - No tenant isolation (callerTenant null and no room tenant): allow (legacy).
 * - Room has tenantId: must equal caller tenant.
 * - Caller has tenant, room has no SoftQraft tenant: deny (foreign room).
 */
export function canAdoptRoom(input: {
  callerTenantId: string | null;
  roomMetadata: Partial<SoftQraftRoomMeta>;
  /** When false, only legacy unscoped keys — adopt allowed if no conflicting tenant on room */
  tenantIsolationActive: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const roomTenant =
    input.roomMetadata.tenantId === undefined
      ? undefined
      : (input.roomMetadata.tenantId as string | null);

  if (!input.tenantIsolationActive) {
    if (
      roomTenant &&
      input.callerTenantId &&
      roomTenant !== input.callerTenantId
    ) {
      return {
        ok: false,
        reason: "Room belongs to another tenant",
      };
    }
    return { ok: true };
  }

  // Tenant isolation on: caller is mapped to a tenant
  if (input.callerTenantId) {
    if (roomTenant == null || roomTenant === "") {
      return {
        ok: false,
        reason:
          "Room exists without SoftQraft tenant ownership; refuse adopt",
      };
    }
    if (roomTenant !== input.callerTenantId) {
      return {
        ok: false,
        reason: "Room belongs to another tenant",
      };
    }
    return { ok: true };
  }

  // Unscoped key while isolation exists: only adopt rooms with null tenant
  if (roomTenant != null && roomTenant !== "") {
    return {
      ok: false,
      reason: "Room is tenant-scoped; unscoped key cannot adopt",
    };
  }
  return { ok: true };
}
