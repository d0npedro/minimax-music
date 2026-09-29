/**
 * Live-lab overlay policy. Pure: no DOM, no fetch.
 * Event overlays stay 8–15s, then the visualizer owns the frame.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorLab = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var HOLD = {
    generating: 12000,
    queued: 10000,
    mix: 14000,
    params: 10000,
    workflow: 14000,
    error: 12000,
  };
  var PULSE_GAP = 35000;
  var CREDIT = "Pedda vom Mond Automixer";

  function createLab() {
    return { events: [], overlay: null };
  }

  function holdMs(kind) {
    var n = HOLD[kind] != null ? HOLD[kind] : 10000;
    return Math.max(8000, Math.min(15000, n));
  }

  function pushEvent(lab, kind, payload, nowMs) {
    if (!lab) return null;
    var at = Number(nowMs) || 0;
    var ev = {
      kind: kind || "params",
      payload: payload || {},
      at: at,
      until: at + holdMs(kind),
    };
    lab.events = [ev].concat(lab.events).slice(0, 24);
    lab.overlay = ev;
    return ev;
  }

  function activeOverlay(lab, nowMs) {
    if (!lab || !lab.overlay) return null;
    if ((Number(nowMs) || 0) >= lab.overlay.until) return null;
    return lab.overlay;
  }

  function shouldPulseOverlay(lab, nowMs, stillGenerating) {
    if (!stillGenerating) return false;
    if (!lab || !lab.overlay) return true;
    var now = Number(nowMs) || 0;
    if (now < lab.overlay.until) return false;
    return now - lab.overlay.until >= PULSE_GAP;
  }

  function workflowNodes(prompt) {
    var graph = prompt || {};
    var order = ["3", "6", "7", "13", "10", "15", "9", "42", "35"];
    var out = [];
    order.forEach(function (id) {
      var node = graph[id];
      if (node && node.class_type) out.push(String(node.class_type));
    });
    Object.keys(graph).forEach(function (id) {
      if (order.indexOf(id) !== -1) return;
      var node = graph[id];
      if (node && node.class_type && out.indexOf(node.class_type) === -1) out.push(String(node.class_type));
    });
    return out;
  }

  function paramRows(request) {
    request = request || {};
    var rows = [];
    if (request.preset) rows.push({ label: "Preset", value: String(request.preset) });
    if (request.bpm != null) rows.push({ label: "BPM", value: String(request.bpm) });
    if (request.energy) rows.push({ label: "Energy", value: String(request.energy) });
    if (request.arc) rows.push({ label: "Arc", value: String(request.arc) });
    if (request.seed != null) rows.push({ label: "Seed", value: String(request.seed) });
    if (request.maxDuration != null) rows.push({ label: "Length", value: String(request.maxDuration) + "s" });
    return rows;
  }

  function kindTitle(kind) {
    if (kind === "generating") return "Generating";
    if (kind === "queued") return "Queued";
    if (kind === "mix") return "Mixing";
    if (kind === "params") return "Next parameters";
    if (kind === "workflow") return "Comfy workflow";
    if (kind === "error") return "Retrying";
    return "Live lab";
  }

  function overlayView(overlay) {
    overlay = overlay || {};
    var payload = overlay.payload || {};
    var request = payload.request || {};
    return {
      kind: overlay.kind || "params",
      kicker: CREDIT,
      title: kindTitle(overlay.kind),
      label: payload.label || request.preset || request.mode || "",
      queue: Number(payload.queue) || 0,
      queuedNames: payload.queuedNames || [],
      params: paramRows(request),
      workflow: workflowNodes(payload.prompt),
      detail: payload.detail || "",
    };
  }

  return {
    CREDIT: CREDIT,
    HOLD: HOLD,
    PULSE_GAP: PULSE_GAP,
    createLab: createLab,
    pushEvent: pushEvent,
    activeOverlay: activeOverlay,
    shouldPulseOverlay: shouldPulseOverlay,
    workflowNodes: workflowNodes,
    paramRows: paramRows,
    overlayView: overlayView,
    kindTitle: kindTitle,
  };
});
