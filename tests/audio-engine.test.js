const { test } = require("node:test");
const assert = require("node:assert/strict");
const audioApi = require("../dj/js/audio-engine.js");
const mixer = require("../dj/js/mixer.js");
const deckApi = require("../dj/js/deck.js");

function FakeAudioContext() {
  this.currentTime = 0;
  this.state = "running";
  this.destination = { connect: function () {} };
  this._sources = [];
}

FakeAudioContext.prototype.createGain = function () {
  return { gain: { value: 1 }, connect: function () {}, disconnect: function () {} };
};

FakeAudioContext.prototype.createBiquadFilter = function () {
  return {
    type: "allpass",
    frequency: { value: 1000 },
    Q: { value: 0.7 },
    gain: { value: 0 },
    connect: function () {},
  };
};

FakeAudioContext.prototype.createBufferSource = function () {
  var ctx = this;
  var src = {
    buffer: null,
    playbackRate: { value: 1 },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    offset: null,
    stopped: false,
    start: function (when, offset) {
      src.offset = offset;
      src.startedAt = ctx.currentTime;
    },
    stop: function () {
      src.stopped = true;
    },
    connect: function () {},
    disconnect: function () {},
  };
  this._sources.push(src);
  return src;
};

FakeAudioContext.prototype.resume = function () {
  return Promise.resolve();
};

function fakeBuffer(duration) {
  return {
    duration: duration,
    getChannelData: function () {
      return new Float32Array(32);
    },
  };
}

function liveDeck() {
  if (typeof globalThis.AudioContext !== "function" || globalThis.AudioContext.name !== "FakeAudioContext") {
    globalThis.AudioContext = FakeAudioContext;
  }
  const engine = audioApi.createAudioEngine(mixer);
  const session = deckApi.createSession();
  deckApi.loadTrack(session.decks.a, { trackName: "kick.wav", duration: 60, bpm: 150 });
  engine.setBuffer("a", fakeBuffer(60));
  session.decks.a.position = 5;
  session.decks.a.playing = true;
  engine.syncPlayback(session);
  return { engine: engine, session: session, deck: session.decks.a };
}

test("computePlayhead: seek clock holds new position then advances", () => {
  const before = audioApi.computePlayhead(5, 10, 12, 1, null, 60);
  assert.equal(before, 7);
  const seek = audioApi.seekClock(12, 16);
  assert.equal(audioApi.computePlayhead(seek.originPos, seek.startedAt, 12, 1, null, 60), 16);
  assert.equal(audioApi.computePlayhead(seek.originPos, seek.startedAt, 13, 1, null, 60), 17);
});

test("tempoSnapshot does not jump; later time uses new rate only", () => {
  const snap = audioApi.tempoSnapshot(0, 0, 2, 1, null, 60);
  assert.equal(snap.position, 2);
  assert.equal(audioApi.computePlayhead(snap.originPos, snap.startedAt, 2, 1.2, null, 60), 2);
  assert.ok(Math.abs(audioApi.computePlayhead(snap.originPos, snap.startedAt, 3, 1.2, null, 60) - 3.2) < 1e-9);
});

test("playbackAction: seek and loop change restart; tempo does not", () => {
  assert.equal(
    audioApi.playbackAction({
      playing: true,
      hasSource: true,
      seeked: true,
      loopChanged: false,
      tempoChanged: false,
    }),
    "restart"
  );
  assert.equal(
    audioApi.playbackAction({
      playing: true,
      hasSource: true,
      seeked: false,
      loopChanged: true,
      tempoChanged: false,
    }),
    "restart"
  );
  assert.equal(
    audioApi.playbackAction({
      playing: true,
      hasSource: true,
      seeked: false,
      loopChanged: false,
      tempoChanged: true,
    }),
    "tempo"
  );
});

test("hot-cue jump while playing restarts source and tick playhead stays at cue", () => {
  const live = liveDeck();
  live.engine.context().currentTime = 2;
  const mid = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(mid - 7) < 1e-6, "expected ~7s playhead, got " + mid);

  deckApi.setHotCue(live.deck, 0, 16);
  deckApi.jumpHotCue(live.deck, 0);
  assert.equal(live.deck.position, 16);
  live.engine.seek("a", live.deck);
  live.engine.syncPlayback(live.session);

  const src = live.engine.sourceState("a");
  assert.ok(src);
  assert.equal(src.offset, 16);
  const atJump = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(atJump - 16) < 1e-6, "playhead after jump " + atJump);

  live.deck.position = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(live.deck.position - 16) < 1e-6);

  live.engine.context().currentTime = 3;
  const after = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(after - 17) < 1e-6, "playhead 1s after jump " + after);
});

test("loop in/out while playing restarts source with loop flags", () => {
  const live = liveDeck();
  live.engine.context().currentTime = 1;
  live.deck.position = live.engine.currentPosition("a", live.deck);
  deckApi.setLoopIn(live.deck, 8);
  deckApi.setLoopOut(live.deck, 16);
  assert.equal(live.deck.loop.enabled, true);
  live.engine.applyLoop("a", live.deck);
  live.engine.syncPlayback(live.session);
  const src = live.engine.sourceState("a");
  assert.ok(src);
  assert.equal(src.loop, true);
  assert.equal(src.loopStart, 8);
  assert.equal(src.loopEnd, 16);
  assert.equal(audioApi.loopFingerprint(live.deck.loop), src.lastLoop);
});

test("tempo change while playing snapshots playhead instead of jumping", () => {
  const live = liveDeck();
  live.engine.context().currentTime = 2;
  const before = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(before - 7) < 1e-6);
  live.deck.position = before;
  deckApi.setTempo(live.deck, 1.25);
  live.engine.syncPlayback(live.session);
  const atChange = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(atChange - 7) < 1e-6, "tempo change jumped from 7 to " + atChange);
  const src = live.engine.sourceState("a");
  assert.equal(src.playbackRate, 1.25);
  live.engine.context().currentTime = 3;
  const later = live.engine.currentPosition("a", live.deck);
  assert.ok(Math.abs(later - 8.25) < 1e-6, "expected 8.25 after 1s at 1.25x, got " + later);
});
