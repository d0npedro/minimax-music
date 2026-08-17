const { test } = require("node:test");
const assert = require("node:assert/strict");
const mixer = require("../dj/js/mixer.js");

test("eqBandGain: kill / unity / boost", () => {
  assert.equal(mixer.eqBandGain(0), 0);
  assert.equal(mixer.eqBandGain(0.5), 1);
  assert.equal(mixer.eqBandGain(1), 2);
  assert.equal(mixer.eqBandGain(0.25), 0.5);
});

test("filterGains: flat at 0.5, HPF at 0, LPF at 1", () => {
  const flat = mixer.filterGains(0.5);
  assert.deepEqual(flat, { low: 1, mid: 1, high: 1 });
  const hpf = mixer.filterGains(0);
  assert.equal(hpf.low, 0);
  assert.equal(hpf.high, 1);
  const lpf = mixer.filterGains(1);
  assert.equal(lpf.low, 1);
  assert.equal(lpf.high, 0);
});

test("crossfaderGains: A-only, center, B-only", () => {
  const a = mixer.crossfaderGains(0);
  assert.ok(Math.abs(a.a - 1) < 1e-12);
  assert.ok(Math.abs(a.b - 0) < 1e-12);
  const mid = mixer.crossfaderGains(0.5);
  const half = Math.SQRT1_2;
  assert.ok(Math.abs(mid.a - half) < 1e-12);
  assert.ok(Math.abs(mid.b - half) < 1e-12);
  const b = mixer.crossfaderGains(1);
  assert.ok(Math.abs(b.a - 0) < 1e-12);
  assert.ok(Math.abs(b.b - 1) < 1e-12);
});

test("channelGains: xfader 0 is A only, xfader 1 is B only", () => {
  const deckA = {
    id: "a",
    volume: 1,
    eq: { low: 0.5, mid: 0.5, high: 0.5 },
    filter: 0.5,
  };
  const deckB = {
    id: "b",
    volume: 1,
    eq: { low: 0.5, mid: 0.5, high: 0.5 },
    filter: 0.5,
  };
  const aLeft = mixer.channelGains(deckA, 0);
  const bLeft = mixer.channelGains(deckB, 0);
  assert.equal(aLeft.low, 1);
  assert.equal(aLeft.mid, 1);
  assert.equal(aLeft.high, 1);
  assert.ok(Math.abs(bLeft.low) < 1e-12);
  assert.ok(Math.abs(bLeft.mid) < 1e-12);
  assert.ok(Math.abs(bLeft.high) < 1e-12);

  const aRight = mixer.channelGains(deckA, 1);
  const bRight = mixer.channelGains(deckB, 1);
  assert.ok(Math.abs(aRight.low) < 1e-12);
  assert.equal(bRight.low, 1);

  const aMid = mixer.channelGains(deckA, 0.5);
  assert.ok(Math.abs(aMid.low - Math.SQRT1_2) < 1e-12);
});

test("channelGains: EQ kill and filter HPF cut lows", () => {
  const deck = {
    id: "a",
    volume: 1,
    eq: { low: 0, mid: 0.5, high: 0.5 },
    filter: 0,
  };
  const g = mixer.channelGains(deck, 0);
  assert.equal(g.low, 0);
  assert.equal(g.high, 1);
});
