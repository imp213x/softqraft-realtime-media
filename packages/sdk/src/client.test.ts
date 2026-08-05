import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SoftQraftApiError, SoftQraftClient } from "./index.js";

describe("SoftQraftClient", () => {
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
    assert.equal(calls[0]?.url, "https://media.example.com/v1/sessions");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer sq_test_key");
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
