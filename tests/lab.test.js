const { test } = require("node:test");
const assert = require("node:assert/strict");
const lab = require("../dj/js/lab.js");
const generate = require("../dj/js/generate.js");

test("lab overlay is visible 8-15s after a generate or queue event, then hides", () => {
  const state = lab.createLab();
  const t0 = 1_000_000;
  lab.pushEvent(state, "generating", { label: "Warehouse Drive", bpm: 148 }, t0);
  const open = lab.activeOverlay(state, t0 + 1000);
  assert.ok(open);
  assert.equal(open.kind, "generating");
  const hold = open.until - t0;
  assert.ok(hold >= 8000 && hold <= 15000);
  assert.equal(lab.activeOverlay(state, open.until + 1), null);
});

test("overlay model names queue, changing params, and Comfy workflow nodes without secrets", () => {
  const req = generate.buildFromPreset("Peak Schranz", { seed: 99, arc: "schranz peak" });
  const prompt = generate.buildComfyPrompt(req);
  const view = lab.overlayView({
    kind: "workflow",
    payload: {
      label: "Peak Schranz",
      request: req,
      prompt: prompt,
      queue: 2,
      queuedNames: ["Warehouse Drive", "Peak Schranz"],
    },
    at: 0,
    until: 12000,
  });
  assert.match(view.kicker, /Pedda vom Mond Automixer/i);
  assert.match(view.title, /workflow|comfy|gener/i);
  assert.ok(view.params.some(function (row) { return row.label === "BPM" && String(row.value).indexOf("154") !== -1; }));
  assert.ok(view.params.some(function (row) { return /seed/i.test(row.label) && String(row.value) === "99"; }));
  assert.ok(view.workflow.some(function (node) { return /MiniMaxMusic3/i.test(node); }));
  assert.ok(view.workflow.some(function (node) { return /KSampler/i.test(node); }));
  const blob = JSON.stringify(view);
  assert.doesNotMatch(blob, /H:\\|C:\\|api[_-]?key|token|password/i);
});

test("generating overlay can pulse again after a cooldown while still cooking", () => {
  const state = lab.createLab();
  lab.pushEvent(state, "generating", { label: "Warehouse Drive" }, 0);
  const first = lab.activeOverlay(state, 100);
  assert.ok(first);
  assert.equal(lab.shouldPulseOverlay(state, first.until + 1000, true), false);
  assert.equal(lab.shouldPulseOverlay(state, first.until + 40000, true), true);
  assert.equal(lab.shouldPulseOverlay(state, first.until + 40000, false), false);
});
