import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GATEWAY_API_VERSION,
  SDK_VERSION,
  SoftQraftApiError,
  SoftQraftClient,
} from "./index.js";

describe("SoftQraftClient", () => {
  it("exports API contract version", () => {
    assert.equal(GATEWAY_API_VERSION, "v1");
    assert.ok(SDK_VERSION.length > 0);
  });

  it("rejects empty baseUrl / apiKey", () => {
    assert.throws(
      () => new SoftQraftClient({ baseUrl: "", apiKey: "k" }),
      /baseUrl/,
    );
    assert.throws(
      () => new SoftQraftClient({ baseUrl: "http://x", apiKey: "" }),
      /apiKey/,
    );
  });

  it("sends bearer auth and parses createSession", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          sessionId: "sess_1",
          tenantId: "t1",
          externalId: null,
          roomName: "sess_1",
          status: "ready",
          profile: "interactive",
          audienceMode: "realtime",
          realtime: { url: "wss://rt.example" },
          playback: { status: "pending", hlsUrl: null },
          metadata: {},
          createdAt: new Date().toISOString(),
          endedAt: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new SoftQraftClient({
      baseUrl: "https://media.example.com/",
      apiKey: "sq_test_key",
      fetch: fetchMock,
    });
    const session = await client.createSession({ profile: "interactive" });
    assert.equal(session.sessionId, "sess_1");
    assert.equal(client.gatewayUrl, "https://media.example.com");
    assert.equal(calls[0]?.url, "https://media.example.com/v1/sessions");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer sq_test_key");
  });

  it("mints token with iceServers", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          token: "jwt",
          identity: "host-1",
          role: "host",
          expiresAt: "2026-01-01T00:00:00.000Z",
          realtimeUrl: "wss://rt.example",
          iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const client = new SoftQraftClient({
      baseUrl: "https://media.example.com",
      apiKey: "k",
      fetch: fetchMock,
    });
    const minted = await client.mintToken("sess_1", {
      identity: "host-1",
      role: "host",
    });
    assert.equal(minted.token, "jwt");
    assert.equal(minted.realtimeUrl, "wss://rt.example");
    assert.ok(minted.iceServers.length >= 1);
  });

  it("starts HLS egress", async () => {
    let path = "";
    const fetchMock: typeof fetch = async (url, init) => {
      path = String(url);
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.type, "room_composite_hls");
      return new Response(
        JSON.stringify({
          egressId: "EG_1",
          sessionId: "sess_1",
          type: "room_composite_hls",
          status: "starting",
          playback: { hlsUrl: "https://cdn.example/live.m3u8" },
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new SoftQraftClient({
      baseUrl: "https://media.example.com",
      apiKey: "k",
      fetch: fetchMock,
    });
    const job = await client.startHlsEgress("sess_1", {
      segmentDurationSeconds: 2,
    });
    assert.equal(job.egressId, "EG_1");
    assert.ok(path.endsWith("/v1/sessions/sess_1/egress"));
  });

  it("throws SoftQraftApiError on 4xx", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { code: "unauthorized", message: "bad key", requestId: "r1" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );

    const client = new SoftQraftClient({
      baseUrl: "https://media.example.com",
      apiKey: "bad",
      fetch: fetchMock,
    });
    await assert.rejects(
      () => client.createSession(),
      (err: unknown) => {
        assert.ok(err instanceof SoftQraftApiError);
        assert.equal(err.status, 401);
        assert.equal(err.code, "unauthorized");
        return true;
      },
    );
  });
});
