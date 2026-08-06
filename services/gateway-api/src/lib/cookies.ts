/** Minimal cookie helpers (no @fastify/cookie dependency). */

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: {
    maxAgeSec?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    clear?: boolean;
  },
): string {
  const parts = [
    `${name}=${opts.clear ? "" : encodeURIComponent(value)}`,
    `Path=${opts.path ?? "/"}`,
  ];
  if (opts.clear) {
    parts.push("Max-Age=0");
  } else if (opts.maxAgeSec != null) {
    parts.push(`Max-Age=${opts.maxAgeSec}`);
  }
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}
