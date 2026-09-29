const { test } = require("node:test");
const assert = require("node:assert/strict");
const hex = require("../dj/js/hex-analysis.js");
const echo = require("../dj/js/echo-mapping.js");

const KEYS = [
  "energy",
  "punch",
  "flow",
  "tension",
  "brightness",
  "warmth",
  "transient",
  "bandWeights",
  "viscosity",
  "rippleForce",
  "chaos",
];

function evenBands() {
  return { sub: 0.4, bass: 0.4, lowMid: 0.4, mid: 0.4, highMid: 0.4, presence: 0.4, air: 0.4 };
}

function frame(extra) {
  return Object.assign(
    {
      t: 1,
      rms: 0.6,
      peak: 0.6,
      bands: evenBands(),
      spectralCentroid: 800,
      spectralFlux: 0.15,
      zcr: 0.1,
      onsetStrength: 0.08,
    },
    extra || {}
  );
}

test("mapFrameToVisual carries the VisualState bus", () => {
  const vs = echo.mapFrameToVisual(frame(), { tension: 0.4, sectionLabel: "verse", punch: 0 });
  KEYS.forEach(function (k) {
    assert.ok(vs[k] != null, "missing " + k);
  });
  assert.equal(vs.bandWeights.length, 7);
  assert.ok(vs.energy >= 0 && vs.energy <= 1);
});

test("punch on an onset frame is greater than punch on a matched-rms sustain frame", () => {
  const sustain = echo.mapFrameToVisual(frame({ rms: 0.62, onsetStrength: 0.06, spectralFlux: 0.08 }), {
    tension: 0.4,
    sectionLabel: "verse",
    punch: 0,
  });
  const onset = echo.mapFrameToVisual(frame({ rms: 0.62, onsetStrength: 0.95, spectralFlux: 0.8 }), {
    tension: 0.4,
    sectionLabel: "verse",
    punch: 0,
  });
  assert.equal(sustain.energy, onset.energy, "same rms must map to the same energy");
  assert.ok(onset.punch > sustain.punch, "punch should rise on onset, got " + onset.punch + " vs " + sustain.punch);
  assert.ok(onset.punch - sustain.punch > 0.25, "punch must not be a linear copy of rms");
});

test("visualStateAt maps a Hex timeline frame at t", () => {
  const sr = 22050;
  const n = Math.floor(sr * 1.5);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    samples[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t);
    if (t % 0.25 < 2 / sr) samples[i] += 0.9;
  }
  const timeline = hex.analyzeMonoPcm(samples, { sampleRate: sr, hopMs: 20 });
  const vs = echo.visualStateAt(timeline, 0.5);
  KEYS.forEach(function (k) {
    assert.ok(vs[k] != null, "timeline visual missing " + k);
  });
});

test("visualStateFromLive maps a spectrum/time frame", () => {
  const freq = new Float32Array(64);
  for (let i = 0; i < 64; i++) freq[i] = i < 8 ? 0.7 : 0.15;
  const live = echo.visualStateFromLive(
    { frequencies: freq, waveform: new Float32Array(128), energy: 0.55, binCount: 64, currentTime: 1.2 },
    0.1
  );
  KEYS.forEach(function (k) {
    assert.ok(live[k] != null, "live visual missing " + k);
  });
  assert.ok(live.energy > 0);
  assert.equal(live.bandWeights.length, 7);
});
