const { test } = require("node:test");
const assert = require("node:assert/strict");
const hex = require("../dj/js/hex-analysis.js");

const BANDS = ["sub", "bass", "lowMid", "mid", "highMid", "presence", "air"];

function impulseTrain(sr, dur, period) {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (t % period < 2 / sr) samples[i] = 0.95;
  }
  return samples;
}

function silenceThenBurst(sr, silentSec, burstSec) {
  const n = Math.floor(sr * (silentSec + burstSec));
  const samples = new Float32Array(n);
  const start = Math.floor(silentSec * sr);
  for (let i = start; i < n; i++) {
    const t = i / sr;
    samples[i] = 0.85 * Math.sin(2 * Math.PI * 70 * t) + 0.35 * Math.sin(2 * Math.PI * 110 * t);
  }
  return samples;
}

function tone(sr, dur, hz, amp) {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return samples;
}

function loudThenQuiet(sr, loudSec, quietSec) {
  const n = Math.floor(sr * (loudSec + quietSec));
  const samples = new Float32Array(n);
  const cut = Math.floor(loudSec * sr);
  for (let i = 0; i < cut; i++) {
    const t = i / sr;
    samples[i] = 0.8 * Math.sin(2 * Math.PI * 80 * t) + 0.4 * Math.sin(2 * Math.PI * 160 * t);
  }
  for (let i = cut; i < n; i++) samples[i] = 0.02 * Math.sin((2 * Math.PI * 400 * i) / sr);
  return samples;
}

test("analyzeMonoPcm emits frames with rms, peak, 7 bands, flux, onsetStrength", () => {
  const sr = 22050;
  const timeline = hex.analyzeMonoPcm(tone(sr, 1.2, 440, 0.4), {
    sampleRate: sr,
    fileName: "tone.wav",
    hopMs: 20,
  });
  assert.ok(timeline.frames.length > 20, "expected dense hops, got " + timeline.frames.length);
  const frame = timeline.frames[10];
  assert.equal(typeof frame.t, "number");
  assert.equal(typeof frame.rms, "number");
  assert.equal(typeof frame.peak, "number");
  assert.equal(typeof frame.spectralFlux, "number");
  assert.equal(typeof frame.onsetStrength, "number");
  BANDS.forEach(function (name) {
    assert.equal(typeof frame.bands[name], "number", "missing band " + name);
    assert.ok(frame.bands[name] >= 0 && frame.bands[name] <= 1);
  });
  assert.ok(frame.rms >= 0 && frame.rms <= 1);
  assert.ok(frame.peak > 0, "steady tone should have a peak");
});

test("impulse train yields onset events and elevated onsetStrength near impulses", () => {
  const sr = 22050;
  const period = 0.25;
  const timeline = hex.analyzeMonoPcm(impulseTrain(sr, 2.0, period), {
    sampleRate: sr,
    hopMs: 20,
    fileName: "impulses.wav",
  });
  const onsets = timeline.events.filter(function (e) {
    return e.type === "onset";
  });
  assert.ok(onsets.length >= 3, "expected multiple onsets, got " + onsets.length);

  const hop = timeline.meta.hopMs / 1000;
  const near = timeline.frames.filter(function (f) {
    const dist = Math.min(f.t % period, period - (f.t % period));
    return dist < hop * 2;
  });
  const far = timeline.frames.filter(function (f) {
    const dist = Math.min(f.t % period, period - (f.t % period));
    return dist > period * 0.3;
  });
  const nearMax = near.reduce(function (m, f) {
    return Math.max(m, f.onsetStrength);
  }, 0);
  const farMean =
    far.reduce(function (s, f) {
      return s + f.onsetStrength;
    }, 0) / (far.length || 1);
  assert.ok(near.length > 0 && far.length > 0, "need frames near and far from impulses");
  assert.ok(nearMax > farMean * 2, "onsetStrength near impulses " + nearMax + " should exceed far mean " + farMean);
  assert.ok(nearMax > 0.4, "impulse neighborhood should carry a strong onset envelope");
});

test("silence then burst yields a drop or energy jump", () => {
  const sr = 22050;
  const silent = 1.0;
  const timeline = hex.analyzeMonoPcm(silenceThenBurst(sr, silent, 1.2), {
    sampleRate: sr,
    hopMs: 20,
    fileName: "burst.wav",
  });
  const drops = timeline.events.filter(function (e) {
    return e.type === "drop";
  });
  const pre = timeline.frames.filter(function (f) {
    return f.t < silent - 0.15;
  });
  const post = timeline.frames.filter(function (f) {
    return f.t > silent + 0.15;
  });
  const mean = function (arr) {
    if (!arr.length) return 0;
    return (
      arr.reduce(function (s, f) {
        return s + f.rms;
      }, 0) / arr.length
    );
  };
  const jump = mean(post) - mean(pre);
  assert.ok(pre.length && post.length, "need frames on both sides of the burst");
  assert.ok(drops.length >= 1 || jump > 0.35, "expected drop event or energy jump, drops=" + drops.length + " jump=" + jump);
  if (drops.length) {
    assert.ok(drops[0].t > silent - 0.3 && drops[0].t < silent + 0.6, "drop time off: " + drops[0].t);
  }
});

test("loud then quiet yields a break when the gesture is present", () => {
  const sr = 22050;
  const timeline = hex.analyzeMonoPcm(loudThenQuiet(sr, 1.4, 1.4), {
    sampleRate: sr,
    hopMs: 20,
    fileName: "break.wav",
  });
  const breaks = timeline.events.filter(function (e) {
    return e.type === "break";
  });
  const pre = timeline.frames.filter(function (f) {
    return f.t < 1.1;
  });
  const post = timeline.frames.filter(function (f) {
    return f.t > 1.7;
  });
  const mean = function (arr) {
    return (
      arr.reduce(function (s, f) {
        return s + f.rms;
      }, 0) / arr.length
    );
  };
  assert.ok(breaks.length >= 1 || mean(post) < mean(pre) * 0.45, "expected break event or collapse");
});
