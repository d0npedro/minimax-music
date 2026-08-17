/**
 * Endless set: keep the next generated track ready, then crossfade into it.
 * Pure timing/xfader policy. No DOM, no fetch.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorEndless = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var DEFAULT_MIX = 16;
  var HOLD_PAD = 4;
  var ARC_CYCLE = [0, 1, 2, 3, 1];

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function createEndless(opts) {
    opts = opts || {};
    return {
      enabled: false,
      liveId: "a",
      nextId: "b",
      mixDuration: opts.mixDuration != null ? opts.mixDuration : DEFAULT_MIX,
      mixing: false,
      mixStartedAt: 0,
      mixFrom: 0,
      mixTo: 1,
      cooking: false,
      holdLoop: false,
      warmingUp: false,
      arcIndex: opts.arcIndex != null ? opts.arcIndex : 0,
    };
  }

  function isArmed(endless) {
    return !!(endless && endless.enabled && !endless.warmingUp);
  }

  function xfaderForLive(liveId) {
    return liveId === "b" ? 1 : 0;
  }

  function remaining(deck) {
    if (!deck || !deck.duration) return 0;
    return Math.max(0, deck.duration - (deck.position || 0));
  }

  function presetForArcIndex(idx) {
    if (idx >= 3) return "Last 20 Minutes";
    if (idx === 2) return "Peak Schranz";
    return "Warehouse Drive";
  }

  function advanceArcIndex(idx) {
    var i = ARC_CYCLE.indexOf(idx);
    if (i < 0) return 1;
    return ARC_CYCLE[Math.min(ARC_CYCLE.length - 1, i + 1)];
  }

  function inTail(deck, mixDuration) {
    if (!deck || !deck.loaded) return false;
    var window = (mixDuration != null ? mixDuration : DEFAULT_MIX) + HOLD_PAD;
    if (remaining(deck) <= window) return true;
    if (deck.loop && deck.loop.enabled && deck.loop.in != null && deck.position >= deck.loop.in) return true;
    return false;
  }

  function shouldKeepPlaying(endless, deckId) {
    return !!(isArmed(endless) && deckId && deckId === endless.liveId);
  }

  function shouldStartMix(endless, liveDeck, nextDeck) {
    if (!isArmed(endless) || endless.mixing) return false;
    if (!liveDeck || !liveDeck.playing || !liveDeck.loaded) return false;
    if (!nextDeck || !nextDeck.loaded) return false;
    return inTail(liveDeck, endless.mixDuration) || remaining(liveDeck) <= endless.mixDuration;
  }

  function shouldHoldLoop(endless, liveDeck, nextDeck) {
    if (!isArmed(endless) || endless.mixing) return false;
    if (!liveDeck || !liveDeck.playing || !liveDeck.loaded) return false;
    if (nextDeck && nextDeck.loaded) return false;
    return true;
  }

  function shouldPromoteNext(endless, liveDeck, nextDeck) {
    if (!isArmed(endless) || endless.mixing) return false;
    if (liveDeck && liveDeck.playing) return false;
    return !!(nextDeck && nextDeck.loaded);
  }

  function holdLoopPoints(deck, seconds) {
    seconds = seconds || 16;
    var dur = deck && deck.duration ? deck.duration : 0;
    var len = Math.min(seconds, Math.max(8, dur * 0.35));
    var out = Math.max(len, dur - 0.25);
    var inn = Math.max(0, out - len);
    return { in: inn, out: out };
  }

  function beginMix(endless, now) {
    endless.mixing = true;
    endless.holdLoop = false;
    endless.mixStartedAt = now;
    endless.mixFrom = xfaderForLive(endless.liveId);
    endless.mixTo = xfaderForLive(endless.nextId);
    return endless;
  }

  function mixProgress(endless, now) {
    if (!endless.mixing || !endless.mixDuration) return 0;
    return clamp((now - endless.mixStartedAt) / endless.mixDuration, 0, 1);
  }

  function xfaderDuringMix(endless, now) {
    var t = mixProgress(endless, now);
    var eased = t * t * (3 - 2 * t);
    return endless.mixFrom + (endless.mixTo - endless.mixFrom) * eased;
  }

  function mixDone(endless, now) {
    return endless.mixing && mixProgress(endless, now) >= 1;
  }

  function finishMix(endless) {
    var outgoing = endless.liveId;
    var incoming = endless.nextId;
    endless.liveId = incoming;
    endless.nextId = outgoing;
    endless.mixing = false;
    endless.holdLoop = false;
    return { emptyId: outgoing, liveId: incoming, xfader: xfaderForLive(incoming) };
  }

  function planNext(endless, liveDeck, generate) {
    var nextIdx = advanceArcIndex(endless.arcIndex);
    var arcName = generate.ENERGY_ARC[nextIdx];
    var preset = presetForArcIndex(nextIdx);
    var seed = (liveDeck && liveDeck.bpm ? Math.floor(liveDeck.bpm * 1000) : 0) + (Date.now() % 1e6);
    var req;
    if (liveDeck && liveDeck.bpm) {
      req = generate.matchPlayingDeck(liveDeck, { arc: arcName, seed: seed });
    } else {
      req = generate.buildFromPreset(preset, { arc: arcName, seed: seed });
    }
    return {
      arcIndex: nextIdx,
      arc: arcName,
      preset: preset,
      request: req,
    };
  }

  return {
    DEFAULT_MIX: DEFAULT_MIX,
    createEndless: createEndless,
    isArmed: isArmed,
    xfaderForLive: xfaderForLive,
    remaining: remaining,
    presetForArcIndex: presetForArcIndex,
    advanceArcIndex: advanceArcIndex,
    inTail: inTail,
    shouldKeepPlaying: shouldKeepPlaying,
    shouldStartMix: shouldStartMix,
    shouldHoldLoop: shouldHoldLoop,
    shouldPromoteNext: shouldPromoteNext,
    holdLoopPoints: holdLoopPoints,
    beginMix: beginMix,
    mixProgress: mixProgress,
    xfaderDuringMix: xfaderDuringMix,
    mixDone: mixDone,
    finishMix: finishMix,
    planNext: planNext,
  };
});
