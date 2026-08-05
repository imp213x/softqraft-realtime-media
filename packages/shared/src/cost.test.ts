import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateDownstreamGb, COST_PROFILE_NOTES } from "./index.js";

describe("estimateDownstreamGb", () => {
  it("matches documented 100 viewers × 1.5 Mbps × 1h ≈ 67.5 GB", () => {
    const gb = estimateDownstreamGb({
      viewers: 100,
      bitrateMbps: 1.5,
      hours: 1,
    });
    assert.ok(Math.abs(gb - 67.5) < 0.01);
  });
});

describe("COST_PROFILE_NOTES", () => {
  it("covers hybrid_live scale path", () => {
    const hybrid = COST_PROFILE_NOTES.find((p) => p.profile === "hybrid_live");
    assert.ok(hybrid);
    assert.match(hybrid!.costNote, /HLS|scale|growth/i);
  });
});
