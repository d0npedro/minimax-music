/**
 * Echo — Feature → VisualState mapping (non-linear, musical).
 * Dual window + module.exports for Node tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorEcho = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var BAND_NAMES = ["sub", "bass", "lowMid", "mid", "highMid", "presence", "air"];
  var VISUAL_KEYS = [
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

  function clamp01(x) {
    return Math.min(1, Math.max(0, x));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutPow(x, p) {
    return 1 - Math.pow(1 - clamp01(x), p);
  }

  function emptyBands() {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  function frameIndexAt(timeline, t) {
    var frames = timeline && timeline.frames ? timeline.frames : [];
    if (!frames.length) return 0;
    var hop = ((timeline.meta && timeline.meta.hopMs) || 20) / 1000;
    var i = Math.floor(t / hop);
    if (i < 0) i = 0;
    if (i >= frames.length) i = frames.length - 1;
    while (i + 1 < frames.length && frames[i + 1].t <= t) i++;
    while (i > 0 && frames[i].t > t) i--;
    return i;
  }

  function sectionAt(timeline, t) {
    var sections = (timeline && timeline.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (t >= s.startSec && t < s.endSec) return s.label;
    }
    return "unknown";
  }

  function tensionAt(timeline, t) {
    var arc = timeline && timeline.arcs && timeline.arcs.tension;
    if (!arc || !arc.t || !arc.t.length) return 0.4;
    if (t <= arc.t[0]) return arc.v[0];
    if (t >= arc.t[arc.t.length - 1]) return arc.v[arc.v.length - 1];
    for (var i = 1; i < arc.t.length; i++) {
      if (t <= arc.t[i]) {
        var t0 = arc.t[i - 1];
        var t1 = arc.t[i];
        var u = (t - t0) / (t1 - t0 || 1e-9);
        return lerp(arc.v[i - 1], arc.v[i], u);
      }
    }
    return arc.v[arc.v.length - 1];
  }

  function recentPunch(timeline, t, lookback) {
    lookback = lookback != null ? lookback : 0.18;
    var best = 0;
    var events = (timeline && timeline.events) || [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type !== "onset" && e.type !== "drop") continue;
      var dt = t - e.t;
      if (dt < 0 || dt > lookback) continue;
      var decay = 1 - dt / lookback;
      best = Math.max(best, e.strength * Math.pow(decay, 1.6));
    }
    return best;
  }

  function bandList(frame) {
    if (frame.bandWeights && frame.bandWeights.length) return frame.bandWeights.slice();
    var bands = frame.bands || {};
    return BAND_NAMES.map(function (n) {
      return bands[n] || 0;
    });
  }

  function mapFrameToVisual(frame, ctx) {
    frame = frame || {};
    ctx = ctx || {};
    var bands = bandList(frame);
    var bandObj = frame.bands || {};
    var bass = bandObj.sub != null ? (bandObj.sub + bandObj.bass) * 0.5 : (bands[0] + bands[1]) * 0.5;
    var highs =
      bandObj.presence != null
        ? (bandObj.presence + bandObj.air + bandObj.highMid) / 3
        : (bands[4] + bands[5] + bands[6]) / 3;

    var energy = easeOutPow(frame.rms || 0, 1.35);
    var punch = clamp01(Math.max(ctx.punch || 0, easeOutPow(frame.onsetStrength || 0, 2.2) * 0.85));
    var flow = clamp01((1 - (frame.spectralFlux || 0)) * 0.55 + energy * 0.35 - punch * 0.25);
    var tension = ctx.tension != null ? ctx.tension : 0.4;
    var brightness = clamp01(0.25 + highs * 0.55 + energy * 0.2);
    var warmth = clamp01(0.2 + bass * 0.65 + (1 - highs) * 0.15);
    var transient = punch;
    var sectionLabel = ctx.sectionLabel || "unknown";
    var sectionHueShift =
      sectionLabel === "drop" ? 0.12 : sectionLabel === "break" ? -0.08 : sectionLabel === "build" ? 0.05 : 0;

    var chaos = clamp01(
      (frame.spectralFlux || 0) * 0.45 +
        (sectionLabel === "drop" ? 0.25 : 0) +
        punch * 0.2 +
        Math.abs(highs - bass) * 0.2
    );

    var viscosity = clamp01(0.55 - energy * 0.35 + (1 - (frame.spectralFlux || 0)) * 0.25);
    if (sectionLabel === "break") viscosity = clamp01(viscosity + 0.25);
    if (sectionLabel === "drop") viscosity = clamp01(viscosity - 0.3);

    var rippleForce = clamp01(punch * 0.85 + bass * 0.35 * energy);

    return {
      t: frame.t || 0,
      energy: energy,
      punch: punch,
      flow: clamp01(flow),
      tension: tension,
      brightness: brightness,
      warmth: warmth,
      bandWeights: bands,
      transient: transient,
      sectionHueShift: sectionHueShift,
      chaos: chaos,
      viscosity: viscosity,
      rippleForce: rippleForce,
      sectionLabel: sectionLabel,
    };
  }

  function visualStateAt(timeline, t) {
    if (!timeline || !timeline.frames || !timeline.frames.length) return idleVisual(t);
    var idx = frameIndexAt(timeline, t);
    var frame = timeline.frames[idx];
    return mapFrameToVisual(frame, {
      tension: tensionAt(timeline, t),
      sectionLabel: sectionAt(timeline, t),
      punch: recentPunch(timeline, t),
    });
  }

  function visualStateFromLive(live, prevPunch) {
    live = live || {};
    prevPunch = prevPunch || 0;
    var freq = live.frequencies || [];
    var n = freq.length || 1;
    var bandWeights = emptyBands();
    var edges = [0, 0.03, 0.08, 0.18, 0.35, 0.55, 0.75, 1];
    for (var b = 0; b < 7; b++) {
      var i0 = Math.floor(edges[b] * n);
      var i1 = Math.max(i0 + 1, Math.floor(edges[b + 1] * n));
      var s = 0;
      var c = 0;
      for (var i = i0; i < i1; i++) {
        s += freq[i] || 0;
        c++;
      }
      bandWeights[b] = c ? s / c : 0;
    }
    var energy = live.energy || 0;
    var high = (bandWeights[5] + bandWeights[6]) * 0.5;
    var bass = (bandWeights[0] + bandWeights[1]) * 0.5;
    var transient = clamp01(Math.max(energy - prevPunch * 0.7, 0) * 2.5);
    var punch = clamp01(Math.max(transient, prevPunch * 0.82));

    return {
      t: live.currentTime || 0,
      energy: easeOutPow(energy, 1.3),
      punch: punch,
      flow: clamp01((1 - punch) * 0.5 + energy * 0.3),
      tension: clamp01(energy * 0.5 + high * 0.3),
      brightness: clamp01(0.3 + high * 0.5),
      warmth: clamp01(0.25 + bass * 0.55),
      bandWeights: bandWeights,
      transient: punch,
      sectionHueShift: 0,
      chaos: clamp01(punch * 0.4 + energy * 0.2),
      viscosity: clamp01(0.5 - energy * 0.25),
      rippleForce: clamp01(punch * 0.8 + bass * energy * 0.4),
      sectionLabel: "unknown",
    };
  }

  function blendVisual(timelineState, liveEnergy, liveWeight) {
    var w = clamp01(liveWeight != null ? liveWeight : 0.25);
    var out = {};
    var k;
    for (k in timelineState) {
      if (Object.prototype.hasOwnProperty.call(timelineState, k)) out[k] = timelineState[k];
    }
    out.energy = lerp(timelineState.energy, liveEnergy, w);
    out.punch = Math.max(timelineState.punch, liveEnergy * w * 0.5);
    return out;
  }

  function idleVisual(t) {
    t = t || 0;
    var breath = 0.22 + 0.08 * Math.sin(t * 0.7);
    return {
      t: t,
      energy: breath,
      punch: 0.1 + 0.04 * Math.max(0, Math.sin(t * 1.4)),
      flow: 0.55,
      tension: 0.35,
      brightness: 0.42,
      warmth: 0.45,
      bandWeights: [0.32, 0.36, 0.28, 0.26, 0.24, 0.22, 0.2],
      transient: 0.1,
      sectionHueShift: 0,
      chaos: 0.16,
      viscosity: 0.5,
      rippleForce: 0.4,
      sectionLabel: "unknown",
    };
  }

  return {
    BAND_NAMES: BAND_NAMES,
    VISUAL_KEYS: VISUAL_KEYS,
    frameIndexAt: frameIndexAt,
    sectionAt: sectionAt,
    tensionAt: tensionAt,
    mapFrameToVisual: mapFrameToVisual,
    visualStateAt: visualStateAt,
    visualStateFromLive: visualStateFromLive,
    blendVisual: blendVisual,
    idleVisual: idleVisual,
    defaultVisual: idleVisual,
  };
});
