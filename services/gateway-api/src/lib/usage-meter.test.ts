import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { UsageMeter } from "./usage-meter.js";

describe("UsageMeter", () => {
  it("persists and reloads counters", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sq-usage-"));
    const storePath = path.join(dir, "usage.json");
    const a = new UsageMeter({ storePath });
    a.recordSessionCreated();
    a.recordTokenMinted();
    a.recordSessionEnded({
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: "2026-08-08T10:30:00.000Z",
      assumedViewers: 10,
    });
    await a.persistNow();

    const raw = JSON.parse(await readFile(storePath, "utf8")) as {
      sessionsCreated: number;
      tokensMinted: number;
    };
    assert.equal(raw.sessionsCreated, 1);
    assert.equal(raw.tokensMinted, 1);

    const b = new UsageMeter({ storePath });
    assert.equal(await b.loadFromDisk(), true);
    const snap = b.snapshot();
    assert.equal(snap.sessionsCreated, 1);
    assert.equal(snap.tokensMinted, 1);
    assert.equal(snap.sessionsEnded, 1);
    assert.equal(snap.restored, true);
    assert.equal(snap.restoreSource, "file");
  });

  it("rebuilds from session rows", () => {
    const m = new UsageMeter();
    m.restoreFromSessions(
      [
        {
          createdAt: "2026-08-08T10:00:00.000Z",
          endedAt: "2026-08-08T10:10:00.000Z",
          status: "ended",
          maxParticipants: 50,
        },
        {
          createdAt: "2026-08-08T11:00:00.000Z",
          endedAt: null,
          status: "live",
          maxParticipants: 10,
        },
      ],
      { egressStarted: 3, egressCompleted: 1 },
    );
    const snap = m.snapshot();
    assert.equal(snap.sessionsCreated, 2);
    assert.equal(snap.sessionsEnded, 1);
    assert.equal(snap.sessionsActive, 1);
    assert.equal(snap.egressJobsStarted, 3);
    assert.equal(snap.restoreSource, "sessions");
    assert.ok(snap.sessionMinutes > 0);
  });
});
