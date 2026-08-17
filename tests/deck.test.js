const { test } = require("node:test");
const assert = require("node:assert/strict");
const deckApi = require("../dj/js/deck.js");

test("cold start: play/pause/cue/tempo from empty then loaded deck", () => {
  const d = deckApi.createDeck("a");
  assert.equal(d.playing, false);
  assert.equal(d.tempo, 1);
  deckApi.play(d);
  assert.equal(d.playing, false, "cannot play until loaded");
  deckApi.loadTrack(d, { trackName: "kick.wav", duration: 32, bpm: 150 });
  deckApi.setCuePoint(d, 4);
  deckApi.play(d);
  assert.equal(d.playing, true);
  deckApi.setTempo(d, 1.08);
  assert.equal(d.tempo, 1.08);
  d.position = 11;
  deckApi.cue(d);
  assert.equal(d.playing, false);
  assert.equal(d.position, 4);
});

test("sync copies tempo from master to slave", () => {
  const master = deckApi.createDeck("a");
  const slave = deckApi.createDeck("b");
  deckApi.setTempo(master, 1.12);
  deckApi.setTempo(slave, 0.97);
  deckApi.syncTo(slave, master);
  assert.equal(slave.tempo, 1.12);
  assert.equal(master.tempo, 1.12);
});

test("hot-cue set and jump change deck state from cold start", () => {
  const d = deckApi.createDeck("a");
  deckApi.loadTrack(d, { trackName: "peak.mp3", duration: 60 });
  d.position = 8.25;
  deckApi.setHotCue(d, 0, d.position);
  deckApi.setHotCue(d, 1, 16);
  deckApi.setHotCue(d, 2, 24);
  deckApi.setHotCue(d, 3, 32);
  assert.deepEqual(d.hotCues, [8.25, 16, 24, 32]);
  d.position = 50;
  deckApi.jumpHotCue(d, 2);
  assert.equal(d.position, 24);
  deckApi.clearHotCue(d, 2);
  assert.equal(d.hotCues[2], null);
  const before = d.position;
  deckApi.jumpHotCue(d, 2);
  assert.equal(d.position, before);
});

test("loop in/out enable loop state", () => {
  const d = deckApi.createDeck("b");
  deckApi.loadTrack(d, { trackName: "loop.wav", duration: 40 });
  d.position = 8;
  deckApi.setLoopIn(d);
  assert.equal(d.loop.in, 8);
  assert.equal(d.loop.enabled, false);
  d.position = 16;
  deckApi.setLoopOut(d);
  assert.equal(d.loop.out, 16);
  assert.equal(d.loop.enabled, true);
  deckApi.toggleLoop(d);
  assert.equal(d.loop.enabled, false);
  deckApi.enableLoop(d, true);
  assert.equal(d.loop.enabled, true);
});
