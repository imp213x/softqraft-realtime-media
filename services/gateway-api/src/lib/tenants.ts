import type { TenantRecord } from "../config.js";

/**
 * Parse GATEWAY_TENANTS env.
 * Format (comma-separated entries):
 *   tenantId:apiKey:maxSessions:maxEgress
 * Optional named quotas:
 *   tenantId:apiKey:sessions=50:egress=10
 */
export function parseTenantsEnv(raw: string): TenantRecord[] {
  if (!raw.trim()) return [];

  const tenants: TenantRecord[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;

    const pieces = entry.split(":").map((p) => p.trim());
    if (pieces.length < 2) {
      throw new Error(
        `Invalid GATEWAY_TENANTS entry "${entry}" — expected tenantId:apiKey[:maxSessions[:maxEgress]]`,
      );
    }

    const tenantId = pieces[0];
    const apiKey = pieces[1];
    if (!tenantId || !apiKey) {
      throw new Error(
        `Invalid GATEWAY_TENANTS entry "${entry}" — empty tenantId or apiKey`,
      );
    }

    let maxSessions = 100;
    let maxEgress = 20;

    if (pieces.length === 3) {
      const p2 = pieces[2];
      if (p2.startsWith("sessions=")) {
        maxSessions = Number(p2.slice("sessions=".length)) || maxSessions;
      } else if (p2.startsWith("egress=")) {
        maxEgress = Number(p2.slice("egress=".length)) || maxEgress;
      } else {
        maxSessions = Number(p2) || maxSessions;
      }
    } else if (pieces.length >= 4) {
      const p2 = pieces[2];
      const p3 = pieces[3];
      if (p2.startsWith("sessions=") || p3.startsWith("egress=")) {
        for (const p of pieces.slice(2)) {
          if (p.startsWith("sessions=")) {
            maxSessions = Number(p.slice("sessions=".length)) || maxSessions;
          } else if (p.startsWith("egress=")) {
            maxEgress = Number(p.slice("egress=".length)) || maxEgress;
          }
        }
      } else {
        maxSessions = Number(p2) || maxSessions;
        maxEgress = Number(p3) || maxEgress;
      }
    }

    tenants.push({
      tenantId,
      apiKey,
      maxSessions: Math.max(1, maxSessions),
      maxEgress: Math.max(1, maxEgress),
    });
  }

  return tenants;
}
