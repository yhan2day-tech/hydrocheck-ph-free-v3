import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrendSummary,
  normalizeHarvestSchedule,
  readingDueSetups,
  summarizeHarvestSchedule
} from "../src/core.js";

const today = new Date("2026-08-07T08:00:00+08:00");

test("builds an eight-week trend with target and delta context", () => {
  const result = buildTrendSummary([
    { date: "2026-06-01", ph: 5.8 },
    { date: "2026-07-24", ph: "" },
    { date: "2026-07-31", ph: 6.2 },
    { date: "2026-08-07", ph: 6.5 }
  ], "ph", 6, 7, 8, today);

  assert.equal(result.points.length, 2);
  assert.equal(result.latest, 6.5);
  assert.ok(Math.abs(result.delta - 0.3) < 0.000001);
  assert.equal(result.targetStatus, "good");
  assert.equal(result.inRangeRate, 1);
});

test("finds setups whose weekly readings are due", () => {
  const setups = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const logs = [
    { setupId: "a", date: "2026-08-01" },
    { setupId: "b", date: "2026-07-31" }
  ];

  assert.deepEqual(readingDueSetups(setups, logs, today).map((item) => item.setup.id), ["b", "c"]);
});

test("normalizes and groups the separate harvest schedule", () => {
  const entries = normalizeHarvestSchedule([
    { id: "past", greenhouseName: "Greenhouse 1", row: "NFT 1", harvestDate: "2026-08-06" },
    { id: "today", greenhouseKey: "GH2", row: "Tower 2", harvestDate: "2026-08-07" },
    { id: "soon", greenhouseName: "Greenhouse 3", row: "Channel 1", harvestDate: "2026-08-12" },
    { id: "later", greenhouseName: "Greenhouse 3", row: "Channel 2", harvestDate: "2026-08-20" }
  ]);
  const summary = summarizeHarvestSchedule(entries, today);

  assert.equal(summary.overdue.length, 1);
  assert.equal(summary.dueToday.length, 1);
  assert.equal(summary.nextSevenDays.length, 1);
  assert.equal(summary.nextSevenDays[0].id, "soon");
});
