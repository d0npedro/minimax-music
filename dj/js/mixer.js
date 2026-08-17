/**
 * Pure mixer gain math. No DOM, no Web Audio.
 * EQ knobs: 0 = kill, 0.5 = unity, 1 = +6 dB (linear gain 2).
 * Filter: 0 = full HPF, 0.5 = flat, 1 = full LPF.
 * Crossfader: 0 = deck A, 1 = deck B, equal-power curve.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorMixer = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function eqBandGain(v) {
    v = clamp(Number(v) || 0, 0, 1);
    if (v <= 0) return 0;
    if (v <= 0.5) return v / 0.5;
    return 1 + (v - 0.5) * 2;
  }

  function filterGains(v) {
    v = clamp(Number(v) || 0, 0, 1);
    if (v < 0.5) {
      var t = v / 0.5;
      return { low: t, mid: 0.25 + 0.75 * t, high: 1 };
    }
    if (v > 0.5) {
      var u = (v - 0.5) / 0.5;
      return { low: 1, mid: 1 - 0.75 * u, high: 1 - u };
    }
    return { low: 1, mid: 1, high: 1 };
  }

  function crossfaderGains(x) {
    x = clamp(Number(x) || 0, 0, 1);
    return {
      a: Math.cos((x * Math.PI) / 2),
      b: Math.sin((x * Math.PI) / 2),
    };
  }

  function channelGains(deck, xfader) {
    var xf = crossfaderGains(xfader);
    var side = deck && deck.id === "b" ? xf.b : xf.a;
    var eq = (deck && deck.eq) || {};
    var fil = filterGains(deck && deck.filter);
    var vol = deck && deck.volume != null ? Number(deck.volume) : 1;
    return {
      low: eqBandGain(eq.low) * fil.low * side * vol,
      mid: eqBandGain(eq.mid) * fil.mid * side * vol,
      high: eqBandGain(eq.high) * fil.high * side * vol,
    };
  }

  return {
    clamp: clamp,
    eqBandGain: eqBandGain,
    filterGains: filterGains,
    crossfaderGains: crossfaderGains,
    channelGains: channelGains,
  };
});
