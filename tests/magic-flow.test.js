const { test } = require("node:test");
const assert = require("node:assert/strict");
const magic = require("../dj/js/magic-flow.js");

test("ingest of existing tracks arms play only when the queue can mix", () => {
  assert.equal(magic.phaseAfterIngest(0), "warming");
  assert.equal(magic.phaseAfterIngest(1), "warming");
  assert.equal(magic.phaseAfterIngest(2), "armed");
  assert.equal(magic.canStartPlayback("warming", 1), false);
  assert.equal(magic.canStartPlayback("warming", 2), true);
  assert.equal(magic.canStartPlayback("armed", 4), true);
  assert.equal(magic.canStartPlayback("idle", 8), false);
  assert.equal(magic.playButtonVisible("armed", 3), true);
  assert.equal(magic.playButtonVisible("playing", 3), false);
  assert.equal(magic.playButtonVisible("loading", 0), false);
  assert.equal(magic.playButtonVisible("loading", 2), true);
  assert.equal(magic.magicButtonBusy("loading"), true);
  assert.equal(magic.magicButtonBusy("armed"), false);
  assert.equal(magic.shouldKeepFilling("armed", 2, false), true);
  assert.equal(magic.shouldKeepFilling("playing", 5, false), true);
  assert.equal(magic.shouldKeepFilling("playing", 28, false), true);
  assert.equal(magic.shouldKeepFilling("armed", 20, false), true);
  assert.equal(magic.shouldKeepFilling("playing", 3, true), false);
  assert.equal(magic.shouldKeepFilling("loading", 0, false), false);
  assert.equal(magic.shouldKeepFilling("warming", 0, false), true);
  assert.equal(magic.shouldKeepFilling("idle", 0, false), false);
  assert.equal(magic.shouldLoadNext(false, 1), true);
  assert.equal(magic.shouldLoadNext(true, 3), false);
  assert.equal(magic.shouldLoadNext(false, 0), false);
  const policy = magic.cratePolicy();
  assert.equal(policy.warmupSize, 2);
  assert.equal(policy.targetSize, 32);
  assert.equal(policy.maxSize, 32);
});

test("START THE MAGIC is only enabled when ComfyUI is ready and the booth is idle", () => {
  assert.equal(magic.magicButtonEnabled(false, "idle"), false);
  assert.equal(magic.magicButtonEnabled(true, "idle"), true);
  assert.equal(magic.magicButtonEnabled(false, "idle", true), true);
  assert.equal(magic.magicButtonEnabled(true, "loading"), false);
  assert.equal(magic.magicButtonEnabled(true, "warming"), false);
  assert.equal(magic.magicButtonEnabled(true, "playing"), false);
  assert.equal(magic.magicButtonEnabled(false, "armed"), false);
  assert.match(magic.comfyReadyLabel(false), /Pedda vom Mond Automixer/i);
  assert.match(magic.comfyReadyLabel(true), /Pedda vom Mond Automixer/i);
});

test("queue notices name the track being generated and the track just added", () => {
  assert.equal(magic.generatingMessage("Warehouse Drive", 3), "Generiert gerade: Warehouse Drive");
  assert.equal(magic.addedMessage("Iron Halo", 4), "Hinzugefügt: Iron Halo");
  assert.equal(magic.generatingMessage("", 0), "Generiert gerade: Track");
  assert.equal(magic.queueCountLabel(1), "Queue 1 Track");
  assert.equal(magic.queueCountLabel(23), "Queue 23 Tracks");
});

test("offline generate is not a failed generate when the crate can already play", () => {
  assert.equal(magic.generateFailKind("offline"), "offline");
  assert.doesNotMatch(magic.generateFailMessage("offline", 23), /fehlgeschlagen/i);
  assert.match(magic.generateFailMessage("error", 0), /fehlgeschlagen/i);
  assert.equal(magic.shouldAnnounceGenerateFail("offline", 23), false);
  assert.equal(magic.shouldAnnounceGenerateFail("offline", 0), true);
  assert.equal(magic.shouldAnnounceGenerateFail("error", 23), true);
});
