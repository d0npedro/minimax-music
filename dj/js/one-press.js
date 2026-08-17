/**
 * One-press magic: from a default booth session, build and address a MiniMax
 * generate-into-deck request on the same-origin /comfy path.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorOnePress = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var DEFAULT_PRESET = "Warehouse Drive";

  function resolveDeps(deps) {
    deps = deps || {};
    return {
      generate: deps.generate || (root && root.MainFloorGenerate),
      readiness: deps.readiness || (root && root.MainFloorReadiness),
      deck: deps.deck || (root && root.MainFloorDeck),
    };
  }

  function resolveTarget(session, deckApi) {
    session = session || {};
    var decks = session.decks;
    if (decks && deckApi && typeof deckApi.firstEmptyDeckId === "function") {
      return deckApi.firstEmptyDeckId(session) || "a";
    }
    if (decks && decks.a && decks.a.loaded && (!decks.b || !decks.b.loaded)) return "b";
    return "a";
  }

  function startMagic(deps, session) {
    var d = resolveDeps(deps);
    if (!d.generate || !d.readiness) {
      throw new Error("startMagic requires generate + readiness modules");
    }
    session = session || {};
    var arc = session.arc != null ? session.arc : "first kick";
    var seed = session.seed != null ? session.seed : 1;
    var req = d.generate.buildFromPreset(DEFAULT_PRESET, { arc: arc, seed: seed });
    var payload = d.generate.buildComfyPrompt(req);
    var httpReq = d.readiness.buildPromptRequest(payload);
    var target = resolveTarget(session, d.deck);
    if (/127\.0\.0\.1:8188/.test(httpReq.url)) {
      throw new Error("one-press must not target a raw 8188 browser URL");
    }
    return {
      mode: "one-press",
      preset: DEFAULT_PRESET,
      request: req,
      payload: payload,
      method: httpReq.method,
      url: httpReq.url,
      body: httpReq.body,
      target: target,
      status: "queued",
      statusText: "queued → deck " + target,
    };
  }

  function offlineStartedStatus(pack) {
    return {
      status: "offline-started",
      statusText: "ComfyUI offline — magic started",
      target: pack && pack.target,
    };
  }

  return {
    DEFAULT_PRESET: DEFAULT_PRESET,
    startMagic: startMagic,
    resolveTarget: resolveTarget,
    offlineStartedStatus: offlineStartedStatus,
  };
});
