/**
 * Magic → queue → play phase machine. Pure: no DOM, no fetch.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorMagic = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MIN_PLAY = 2;
  var TARGET_SIZE = 6;
  var MAX_SIZE = 32;

  function cratePolicy() {
    return { warmupSize: MIN_PLAY, targetSize: MAX_SIZE, maxSize: MAX_SIZE };
  }

  function phaseAfterIngest(queued) {
    var n = Number(queued) || 0;
    if (n >= MIN_PLAY) return "armed";
    return "warming";
  }

  function canStartPlayback(phase, queued) {
    var n = Number(queued) || 0;
    if (n < MIN_PLAY) return false;
    return phase === "armed" || phase === "warming" || phase === "playing" || phase === "loading";
  }

  function shouldKeepFilling(phase, queued, cooking) {
    if (phase === "idle" || phase === "loading") return false;
    if (cooking) return false;
    return phase === "playing" || phase === "warming" || phase === "armed";
  }

  function shouldLoadNext(nextLoaded, queued) {
    return !nextLoaded && (Number(queued) || 0) > 0;
  }

  function generateFailKind(reason) {
    return reason === "offline" ? "offline" : "error";
  }

  function generateFailMessage(reason, queued) {
    if (reason === "offline") return "ComfyUI offline · Queue " + (Number(queued) || 0);
    return "Generate fehlgeschlagen: " + (reason || "error");
  }

  function shouldAnnounceGenerateFail(reason, queued) {
    if (reason === "offline" && (Number(queued) || 0) >= MIN_PLAY) return false;
    return true;
  }

  function playButtonVisible(phase, queued) {
    return canStartPlayback(phase, queued) && phase !== "playing";
  }

  function magicButtonBusy(phase) {
    return phase === "loading" || phase === "warming";
  }

  function magicButtonEnabled(comfyReady, phase, albumReady) {
    if (phase !== "idle") return false;
    return !!albumReady || !!comfyReady;
  }

  function comfyReadyLabel(comfyReady) {
    return "Pedda vom Mond Automixer";
  }

  function trackLabel(name) {
    var s = String(name || "").replace(/\s+/g, " ").trim();
    return s || "Track";
  }

  function generatingMessage(label, queued) {
    return "Generiert gerade: " + trackLabel(label);
  }

  function addedMessage(label, queued) {
    return "Hinzugefügt: " + trackLabel(label);
  }

  function queueCountLabel(queued) {
    var n = Number(queued) || 0;
    return n === 1 ? "Queue 1 Track" : "Queue " + n + " Tracks";
  }

  return {
    MIN_PLAY: MIN_PLAY,
    TARGET_SIZE: TARGET_SIZE,
    MAX_SIZE: MAX_SIZE,
    cratePolicy: cratePolicy,
    phaseAfterIngest: phaseAfterIngest,
    canStartPlayback: canStartPlayback,
    shouldKeepFilling: shouldKeepFilling,
    shouldLoadNext: shouldLoadNext,
    generateFailKind: generateFailKind,
    generateFailMessage: generateFailMessage,
    shouldAnnounceGenerateFail: shouldAnnounceGenerateFail,
    playButtonVisible: playButtonVisible,
    magicButtonBusy: magicButtonBusy,
    magicButtonEnabled: magicButtonEnabled,
    comfyReadyLabel: comfyReadyLabel,
    trackLabel: trackLabel,
    generatingMessage: generatingMessage,
    addedMessage: addedMessage,
    queueCountLabel: queueCountLabel,
  };
});
