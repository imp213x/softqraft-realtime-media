/**
 * M2 contract smoke: SDK method paths stay aligned with Gateway API v1.
 * Fails if someone renames routes without updating the client.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SoftQraftClient } from "./index.js";

describe("Gateway API v1 path contract", () => {
  it("uses documented REST paths", async () => {
    const paths: string[] = [];
    const methods: string[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      paths.push(String(url).replace(/^https?:\/\/[^/]+/, ""));
      methods.push(String(init?.method || "GET"));
      const p = paths[paths.length - 1];
      if (p === "/health") {
        return json({ status: "ok" });
      }
      if (p === "/ready") {
        return json({ status: "ready", checks: {} });
      }
      if (p === "/v1/sessions" && init?.method === "POST") {
        return json({
          sessionId: "sess_x",
          tenantId: null,
          externalId: null,
          roomName: "sess_x",
          status: "ready",
          profile: "interactive",
          audienceMode: "realtime",
          realtime: { url: "wss://x" },
          playback: { status: "pending", hlsUrl: null },
          metadata: {},
          createdAt: new Date().toISOString(),
          endedAt: null,
        }, 201);
      }
      if (p?.includes("/tokens")) {
        return json({
          token: "t",
          identity: "i",
          role: "host",
          expiresAt: new Date().toISOString(),
          realtimeUrl: "wss://x",
          iceServers: [],
        });
      }
      if (p?.includes("/egress") && init?.method === "POST" && !p.includes("/stop")) {
        return json({
          egressId: "EG_1",
          sessionId: "sess_x",
          type: "room_composite_hls",
          status: "starting",
          playback: { hlsUrl: null },
          error: null,
          createdAt: null,
          updatedAt: null,
        }, 202);
      }
      if (p?.includes("/playback")) {
        return json({
          sessionId: "sess_x",
          audienceMode: "realtime",
          status: "pending",
          hlsUrl: null,
          realtimeUrl: "wss://x",
        });
      }
      if (p?.endsWith("/end")) {
        return json({
          sessionId: "sess_x",
          tenantId: null,
          externalId: null,
          roomName: "sess_x",
          status: "ended",
          profile: "interactive",
          audienceMode: "realtime",
          realtime: { url: "wss://x" },
          playback: { status: "unavailable", hlsUrl: null },
          metadata: {},
          createdAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        });
      }
      return json({}, 404);
    };

    const c = new SoftQraftClient({
      baseUrl: "https://gw.test",
      apiKey: "k",
      fetch: fetchMock,
    });

    await c.health();
    await c.ready();
    const s = await c.createSession({});
    await c.mintToken(s.sessionId, { identity: "h", role: "host" });
    await c.startHlsEgress(s.sessionId);
    await c.getPlayback(s.sessionId);
    await c.endSession(s.sessionId);

    assert.deepEqual(paths, [
      "/health",
      "/ready",
      "/v1/sessions",
      "/v1/sessions/sess_x/tokens",
      "/v1/sessions/sess_x/egress",
      "/v1/sessions/sess_x/playback",
      "/v1/sessions/sess_x/end",
    ]);
    assert.equal(methods[0], "GET");
    assert.equal(methods[2], "POST");
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
