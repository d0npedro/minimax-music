const { test } = require("node:test");
const assert = require("node:assert/strict");
const endless = require("../dj/js/endless.js");
const generate = require("../dj/js/generate.js");
const deckApi = require("../dj/js/deck.js");

test("xfader sits on the live deck until mix", () => {
  assert.equal(endless.xfaderForLive("a"), 0);
  assert.equal(endless.xfaderForLive("b"), 1);
});

test("shouldStartMix only when next is loaded and remaining <= mix window", () => {
  const e = endless.createEndless({ mixDuration: 16 });
  e.enabled = true;
  const live = { playing: true, loaded: true, duration: 60, position: 10 };
  const next = { loaded: false };
  assert.equal(endless.shouldStartMix(e, live, next), false);
  next.loaded = true;
  assert.equal(endless.shouldStartMix(e, live, next), false);
  live.position = 45;
  assert.equal(endless.shouldStartMix(e, live, next), true);
  e.mixing = true;
  assert.equal(endless.shouldStartMix(e, live, next), false);
});

test("shouldHoldLoop as soon as live plays and next is missing", () => {
  const e = endless.createEndless({ mixDuration: 16 });
  e.enabled = true;
  const live = { playing: true, loaded: true, duration: 60, position: 2 };
  assert.equal(endless.shouldHoldLoop(e, live, { loaded: false }), true);
  assert.equal(endless.shouldHoldLoop(e, live, { loaded: true }), false);
});

test("shouldKeepPlaying blocks killing the live deck", () => {
  const e = endless.createEndless();
  e.enabled = true;
  e.liveId = "a";
  assert.equal(endless.shouldKeepPlaying(e, "a"), true);
  assert.equal(endless.shouldKeepPlaying(e, "b"), false);
  e.enabled = false;
  assert.equal(endless.shouldKeepPlaying(e, "a"), false);
});

test("shouldPromoteNext recovers if live already stopped but next is ready", () => {
  const e = endless.createEndless();
  e.enabled = true;
  assert.equal(endless.shouldPromoteNext(e, { playing: false, loaded: true }, { loaded: true }), true);
  assert.equal(endless.shouldPromoteNext(e, { playing: true, loaded: true }, { loaded: true }), false);
  assert.equal(endless.shouldPromoteNext(e, { playing: false, loaded: true }, { loaded: false }), false);
});

test("crossfade xfader travels live→next and finishMix swaps decks", () => {
  const e = endless.createEndless({ mixDuration: 10 });
  e.enabled = true;
  e.liveId = "a";
  e.nextId = "b";
  endless.beginMix(e, 100);
  assert.equal(endless.xfaderDuringMix(e, 100), 0);
  const mid = endless.xfaderDuringMix(e, 105);
  assert.ok(mid > 0.3 && mid < 0.7, "mid xfader " + mid);
  assert.equal(endless.xfaderDuringMix(e, 110), 1);
  assert.equal(endless.mixDone(e, 110), true);
  const done = endless.finishMix(e);
  assert.equal(done.liveId, "b");
  assert.equal(done.emptyId, "a");
  assert.equal(done.xfader, 1);
  assert.equal(e.mixing, false);
});

test("warmup is not armed: no mix, hold, or promote", () => {
  const e = endless.createEndless({ mixDuration: 16 });
  e.enabled = true;
  e.warmingUp = true;
  e.liveId = "a";
  e.nextId = "b";
  const live = { playing: false, loaded: false, duration: 0, position: 0 };
  const next = { loaded: true };
  assert.equal(endless.isArmed(e), false);
  assert.equal(endless.shouldStartMix(e, { playing: true, loaded: true, duration: 60, position: 50 }, next), false);
  assert.equal(endless.shouldHoldLoop(e, { playing: true, loaded: true, duration: 60, position: 2 }, { loaded: false }), false);
  assert.equal(endless.shouldPromoteNext(e, live, next), false);
  assert.equal(endless.shouldKeepPlaying(e, "a"), false);
  e.warmingUp = false;
  assert.equal(endless.isArmed(e), true);
});

test("planNext matches playing BPM ±2 and names MiniMax models", () => {
  const e = endless.createEndless();
  e.arcIndex = 1;
  const live = deckApi.createDeck("a");
  live.bpm = 148;
  live.energy = "drive";
  live.loaded = true;
  const plan = endless.planNext(e, live, generate);
  assert.equal(plan.arcIndex, 2);
  assert.equal(plan.preset, "Peak Schranz");
  const payload = generate.buildComfyPrompt(plan.request);
  assert.equal(payload["6"].inputs.unet_name, "minimax_music3_dit_int8_convrot.safetensors");
  assert.match(plan.request.caption, /146-150 BPM/);
  assert.match(plan.request.caption, /Instrumental only/);
});
