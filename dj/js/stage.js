/**
 * Pure 16:9 stage view-model: now-playing, upcoming weights, crossfade slots.
 * No DOM, no Web Audio.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorStage = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var CAPTURE = { width: 1280, height: 720, aspect: 16 / 9 };
  var VISUAL_MODES = ["organic", "orbit", "kaleidoscope", "lattice", "fluid", "aurora"];
  var DEFAULT_VISUAL_MODE = "organic";

  function resolveGhost() {
    if (root && root.MainFloorGhost) return root.MainFloorGhost;
    if (typeof require === "function") {
      try {
        return require("./ghost-modes.js");
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  var WAVEFORM_WIDTH = 1120;
  var WAVEFORM_BINS = 256;
  var FALLBACK_ARTIST = "Main Floor";
  var LEAVE_LIFT = 96;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function playheadFraction(position, duration) {
    var dur = Number(duration) || 0;
    if (dur <= 0) return 0;
    return clamp((Number(position) || 0) / dur, 0, 1);
  }

  function playheadX(position, duration) {
    return playheadFraction(position, duration) * WAVEFORM_WIDTH;
  }

  function formatClock(seconds) {
    var s = Math.max(0, Math.floor(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function stripExt(name) {
    return String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  }

  function displayOf(source) {
    source = source || {};
    var meta = source.meta || {};
    var rawName = source.trackName || meta.trackName || source.title || meta.title || "";
    var artist = source.artist || meta.artist || "";
    var title = stripExt(rawName);
    if (!artist) {
      var parts = title.split(/\s+[—–-]\s+/);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        artist = parts[0].trim();
        title = parts.slice(1).join(" - ").trim();
      } else {
        artist = FALLBACK_ARTIST;
      }
    }
    if (!title) title = "untitled";
    return { title: title, artist: artist };
  }

  function resample(samples, bins) {
    bins = bins || WAVEFORM_BINS;
    var src = samples && samples.length ? samples : null;
    if (!src) return null;
    if (src.length === bins) return src.slice();
    var out = [];
    var last = src.length - 1;
    for (var i = 0; i < bins; i++) {
      var t = (i / Math.max(1, bins - 1)) * last;
      var i0 = Math.floor(t);
      var i1 = Math.min(last, i0 + 1);
      var f = t - i0;
      out.push(src[i0] * (1 - f) + src[i1] * f);
    }
    return out;
  }

  function syntheticWaveform(seed, bins) {
    bins = bins || WAVEFORM_BINS;
    var out = [];
    var h = 2166136261;
    var s = String(seed || "track");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (var i = 0; i < bins; i++) {
      var t = i / bins;
      var envelope = t < 0.04 || t > 0.96 ? 0.18 : 0.42 + 0.18 * Math.sin(t * Math.PI);
      var n =
        Math.sin((i + (h % 97)) * 0.31) * 0.22 +
        Math.sin(i * 0.09 + (h % 13)) * 0.16 +
        Math.sin(i * 0.021 + h) * 0.08;
      out.push(clamp(envelope + Math.abs(n) * 0.55, 0.06, 1));
    }
    return out;
  }

  function peaksFromAudioBuffer(buf, buckets) {
    buckets = buckets || WAVEFORM_BINS;
    if (!buf || typeof buf.getChannelData !== "function") return null;
    var data = buf.getChannelData(0);
    if (!data || !data.length) return null;
    var block = Math.max(1, Math.floor(data.length / buckets));
    var out = [];
    for (var i = 0; i < buckets; i++) {
      var peak = 0;
      var start = i * block;
      for (var j = 0; j < block; j++) {
        var v = Math.abs(data[start + j] || 0);
        if (v > peak) peak = v;
      }
      out.push(Math.min(1, peak * 1.8));
    }
    return out;
  }

  function waveformOf(source, fallbackPeaks, seed) {
    var raw =
      (source && source.peaks) ||
      (source && source.waveform) ||
      (source && source.meta && source.meta.peaks) ||
      fallbackPeaks;
    var samples = resample(raw, WAVEFORM_BINS);
    if (!samples) samples = syntheticWaveform(seed || (source && (source.trackName || source.title)), WAVEFORM_BINS);
    return samples;
  }

  function visualWeight(depth) {
    return {
      depth: depth,
      opacity: Math.pow(0.72, depth),
      scale: Math.pow(0.88, depth),
      emphasis: Math.pow(0.7, depth),
      nearNext: depth === 0,
      animation: depth === 0 ? "near-next" : "idle",
    };
  }

  function trackView(source, extra) {
    extra = extra || {};
    var display = displayOf(source);
    var position = extra.position != null ? extra.position : source && source.position;
    var duration = extra.duration != null ? extra.duration : source && source.duration;
    var playhead = playheadFraction(position, duration);
    return {
      key: extra.key || "track",
      title: display.title,
      artist: display.artist,
      album: source.album || (source.meta && source.meta.album) || extra.album || "",
      youtubeMusic: source.youtubeMusic || (source.meta && source.meta.youtubeMusic) || extra.youtubeMusic || "",
      catalog: source.catalog || (source.meta && source.meta.catalog) || extra.catalog || "",
      waveform: extra.waveform || waveformOf(source, extra.peaks, display.title),
      playhead: playhead,
      playheadX: playhead * WAVEFORM_WIDTH,
      position: Number(position) || 0,
      duration: Number(duration) || 0,
    };
  }

  function crateItems(crate) {
    if (!crate) return [];
    if (Array.isArray(crate)) return crate;
    return crate.items || [];
  }

  function transitionFromProgress(progress) {
    var t = clamp(Number(progress) || 0, 0, 1);
    return {
      leave: t,
      enter: t,
      outgoingOpacity: 1 - t,
      incomingOpacity: t,
      outgoingY: -t * LEAVE_LIFT,
      incomingY: (1 - t) * LEAVE_LIFT,
    };
  }

  function resolveMixProgress(input) {
    if (input && input.mixProgress != null) return clamp(Number(input.mixProgress) || 0, 0, 1);
    var endless = input && input.endless;
    if (!endless || !endless.mixing) return 0;
    if (typeof input.mixProgressFn === "function") return clamp(input.mixProgressFn(endless, input.now) || 0, 0, 1);
    return 0;
  }

  function buildStage(input) {
    input = input || {};
    var session = input.session || {};
    var decks = session.decks || {};
    var endless = input.endless || {};
    var liveId = endless.liveId || "a";
    var nextId = endless.nextId || (liveId === "a" ? "b" : "a");
    var live = decks[liveId] || null;
    var next = decks[nextId] || null;
    var mixing = !!(endless.mixing && next && next.loaded);
    var progress = resolveMixProgress(input);
    var peakMap = input.peaks || {};
    var queued = crateItems(input.crate);

    var capture = {
      width: CAPTURE.width,
      height: CAPTURE.height,
      aspect: CAPTURE.aspect,
    };

    if (mixing && progress >= 1) {
      var handed = trackView(next, { key: "deck:" + nextId, peaks: peakMap[nextId] });
      var afterQueue = [];
      queued.forEach(function (item, i) {
        var row = trackView(item, { key: "crate:" + i, position: 0, duration: 0 });
        var weight = visualWeight(afterQueue.length);
        afterQueue.push(Object.assign(row, weight));
      });
      return {
        capture: capture,
        nowPlaying: handed,
        transition: { active: false, progress: 1, outgoing: null, incoming: null },
        upcoming: afterQueue,
        mixProgress: 1,
        visualMode: resolveVisualMode(input),
        visualFrom: input.visualFrom || null,
        visualFade: input.visualFade != null ? input.visualFade : 1,
        visual: input.visual || null,
        time: Number(input.time) || 0,
        overlay: input.overlay || null,
        credit: "Pedda vom Mond Automixer",
        statusHint: input.statusHint || "",
      };
    }

    var nowPlaying = null;
    if (live && live.loaded) {
      nowPlaying = trackView(live, { key: "deck:" + liveId, peaks: peakMap[liveId] });
    } else {
      nowPlaying = {
        key: "empty",
        title: "Waiting for the floor",
        artist: FALLBACK_ARTIST,
        waveform: syntheticWaveform("empty", WAVEFORM_BINS),
        playhead: 0,
        playheadX: 0,
        position: 0,
        duration: 0,
      };
    }

    var transition = { active: false, progress: progress, outgoing: null, incoming: null };
    if (mixing && progress > 0 && next && next.loaded) {
      var motion = transitionFromProgress(progress);
      var outgoing = trackView(live, { key: "deck:" + liveId, peaks: peakMap[liveId] });
      var incoming = trackView(next, { key: "deck:" + nextId, peaks: peakMap[nextId] });
      outgoing.leave = motion.leave;
      outgoing.opacity = motion.outgoingOpacity;
      outgoing.translateY = motion.outgoingY;
      outgoing.dissolve = motion.leave;
      incoming.enter = motion.enter;
      incoming.opacity = motion.incomingOpacity;
      incoming.translateY = motion.incomingY;
      transition = {
        active: true,
        progress: progress,
        outgoing: outgoing,
        incoming: incoming,
      };
    }

    var upcoming = [];
    var skipNext = mixing && next && next.loaded && progress > 0;
    if (!skipNext && next && next.loaded) {
      var nextRow = trackView(next, { key: "deck:" + nextId, peaks: peakMap[nextId] });
      upcoming.push(Object.assign(nextRow, visualWeight(0)));
    }
    queued.forEach(function (item, i) {
      var row = trackView(item, { key: "crate:" + i, position: 0, duration: 0 });
      upcoming.push(Object.assign(row, visualWeight(upcoming.length)));
    });

    return {
      capture: capture,
      nowPlaying: nowPlaying,
      transition: transition,
      upcoming: upcoming,
      mixProgress: progress,
      visualMode: resolveVisualMode(input),
      visualFrom: input.visualFrom || null,
      visualFade: input.visualFade != null ? input.visualFade : 1,
      visual: input.visual || null,
      time: Number(input.time) || 0,
      overlay: input.overlay || null,
      credit: "Pedda vom Mond Automixer",
      statusHint: input.statusHint || "",
    };
  }

  function allowedVisualModes() {
    var Ghost = resolveGhost();
    if (Ghost && Ghost.MODES && Ghost.MODES.length) return Ghost.MODES;
    return VISUAL_MODES;
  }

  function resolveVisualMode(input) {
    var mode = input && input.visualMode;
    var allowed = allowedVisualModes();
    if (allowed.indexOf(mode) !== -1) return mode;
    return DEFAULT_VISUAL_MODE;
  }

  function portraitSafeRect(w, h) {
    w = Number(w) || CAPTURE.width;
    h = Number(h) || CAPTURE.height;
    var safeW = Math.min(w, (h * 9) / 16);
    return {
      x: (w - safeW) / 2,
      y: 0,
      width: safeW,
      height: h,
      cx: w / 2,
    };
  }

  function chromeLayout(w, h) {
    var safe = portraitSafeRect(w, h);
    var panelW = Math.min(380, Math.max(160, safe.width - 24));
    var timeW = Math.min(360, Math.max(180, safe.width - 32));
    return {
      safe: safe,
      status: { x: safe.cx, y: h - 36, align: "center" },
      overlay: {
        x: safe.cx - panelW / 2,
        y: Math.max(24, h * 0.1),
        width: panelW,
        height: Math.min(260, h * 0.42),
      },
      timeline: {
        x: safe.cx - timeW / 2,
        y: h - 156,
        width: timeW,
        height: 52,
        cx: safe.cx,
      },
    };
  }

  function setText(root, role, text) {
    var el = root.querySelector("[data-role='" + role + "']");
    if (el) el.textContent = text == null ? "" : String(text);
  }

  function paintStageBackground(ctx, model) {
    if (!ctx) return;
    var w = (model && model.capture && model.capture.width) || CAPTURE.width;
    var h = (model && model.capture && model.capture.height) || CAPTURE.height;
    if (ctx.canvas && ctx.canvas.width !== w) ctx.canvas.width = w;
    if (ctx.canvas && ctx.canvas.height !== h) ctx.canvas.height = h;
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0a0b10");
    g.addColorStop(0.55, "#07080c");
    g.addColorStop(1, "#050608");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var glow = ctx.createRadialGradient(w * 0.5, h * 0.22, 20, w * 0.5, h * 0.18, w * 0.55);
    glow.addColorStop(0, "rgba(255,61,154),0.08)");
    glow.addColorStop(1, "rgba(255,61,154),0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(236,232,223,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(12.5, 12.5, w - 25, h - 25);
  }

  function paintStageVisualizer(ctx, model) {
    if (!ctx) return;
    var w = (model && model.capture && model.capture.width) || CAPTURE.width;
    var h = (model && model.capture && model.capture.height) || CAPTURE.height;
    if (ctx.canvas && ctx.canvas.width !== w) ctx.canvas.width = w;
    if (ctx.canvas && ctx.canvas.height !== h) ctx.canvas.height = h;
    var Ghost = resolveGhost();
    var Echo = root && root.MainFloorEcho;
    if (!Echo && typeof require === "function") {
      try {
        Echo = require("./echo-mapping.js");
      } catch (e) {
        Echo = null;
      }
    }
    var visual = (model && model.visual) || (Echo && Echo.idleVisual ? Echo.idleVisual((model && model.time) || 0) : null);
    var mode = (model && model.visualMode) || DEFAULT_VISUAL_MODE;
    var dc = {
      ctx: ctx,
      width: w,
      height: h,
      visual: visual,
      time: (model && model.time) || (visual && visual.t) || 0,
    };
    if (Ghost && visual && Ghost.drawTransition && model.visualFrom && (model.visualFade == null || model.visualFade < 1)) {
      Ghost.drawTransition(model.visualFrom, mode, model.visualFade, dc);
    } else if (Ghost && Ghost.drawMode && visual) {
      Ghost.drawMode(mode, dc);
    } else {
      paintStageBackground(ctx, model);
    }
    paintChrome(ctx, model);
  }

  function fitText(ctx, text, maxWidth) {
    var s = String(text || "");
    if (!maxWidth || !ctx.measureText) return s;
    if (ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) {
      s = s.slice(0, -1);
    }
    return s + "…";
  }

  function paintSoftLine(ctx, text, x, y, maxW) {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 1;
    ctx.fillText(fitText(ctx, text, maxW), x, y);
  }

  function paintChrome(ctx, model) {
    if (!ctx || !model) return;
    var w = (model.capture && model.capture.width) || CAPTURE.width;
    var h = (model.capture && model.capture.height) || CAPTURE.height;
    paintTimeline(ctx, model, w, h);
    if (model.overlay) paintLabOverlay(ctx, model.overlay, w, h);
  }

  function paintTimeline(ctx, model, w, h) {
    var now = model && model.nowPlaying;
    if (!now || !now.duration) return;
    var layout = chromeLayout(w, h).timeline;
    var samples = now.waveform && now.waveform.length ? now.waveform : syntheticWaveform(now.title, 96);
    var playhead = clamp(Number(now.playhead) || 0, 0, 1);
    var x0 = layout.x;
    var y0 = layout.y;
    var tw = layout.width;
    var th = layout.height;
    var mid = y0 + th * 0.42;
    var n = samples.length;
    var gap = tw / n;
    var bar = Math.max(1, gap * 0.62);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < n; i++) {
      var amp = Math.max(0.06, samples[i]) * (th * 0.42);
      var x = x0 + i * gap + (gap - bar) / 2;
      var played = i / n <= playhead;
      ctx.globalAlpha = played ? 0.92 : 0.22;
      ctx.fillStyle = played ? "#ff3d9a" : "#ece8df";
      ctx.fillRect(x, mid - amp, bar, amp * 2);
    }
    var px = x0 + playhead * tw;
    ctx.globalAlpha = 1;
    ctx.shadowColor = "rgba(255,61,154),0.85)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px - 1, y0 + 2, 2, th - 10);
    ctx.beginPath();
    ctx.arc(px, mid, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    if (model.mixProgress > 0 && model.mixProgress < 1) {
      var mx = x0 + clamp(model.mixProgress, 0, 1) * tw;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = "#ff2d55";
      ctx.fillRect(mx - 1, y0 + 8, 2, th - 22);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "top";
    ctx.font = "600 11px Segoe UI, Helvetica Neue, sans-serif";
    ctx.fillStyle = "rgba(236,232,223,0.72)";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.fillText(formatClock(now.position), x0, y0 + th - 8);
    ctx.textAlign = "right";
    ctx.fillText("-" + formatClock(Math.max(0, now.duration - now.position)), x0 + tw, y0 + th - 8);
    ctx.restore();
  }

  function paintLabOverlay(ctx, overlay, w, h) {
    var view = overlay;
    if (overlay && !overlay.kicker && root && root.MainFloorLab && root.MainFloorLab.overlayView) {
      view = root.MainFloorLab.overlayView(overlay);
    } else if (overlay && overlay.payload && !overlay.params) {
      if (typeof require === "function") {
        try {
          view = require("./lab.js").overlayView(overlay);
        } catch (e) {
          view = overlay;
        }
      }
    }
    if (!view) return;
    var layout = chromeLayout(w, h);
    var maxW = layout.overlay.width;
    var cx = layout.safe.cx;
    var y = layout.overlay.y + 8;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,61,154),0.78)";
    ctx.font = "600 11px Segoe UI, Helvetica Neue, sans-serif";
    paintSoftLine(ctx, String(view.kicker || "Pedda vom Mond Automixer").toUpperCase(), cx, y, maxW);
    y += 26;
    ctx.fillStyle = "#ece8df";
    ctx.font = "700 22px Segoe UI, Helvetica Neue, sans-serif";
    paintSoftLine(ctx, String(view.title || "Live lab").toUpperCase(), cx, y, maxW);
    y += 24;
    if (view.label) {
      ctx.fillStyle = "rgba(236,232,223,0.82)";
      ctx.font = "600 15px Segoe UI, Helvetica Neue, sans-serif";
      paintSoftLine(ctx, String(view.label), cx, y, maxW);
      y += 22;
    }
    var bits = [];
    (view.params || []).slice(0, 3).forEach(function (row) {
      if (row && row.value) bits.push(String(row.value));
    });
    if (view.queue != null) bits.push("Q" + view.queue);
    if (bits.length) {
      ctx.fillStyle = "rgba(255,61,154),0.8)";
      ctx.font = "600 12px Segoe UI, Helvetica Neue, sans-serif";
      paintSoftLine(ctx, bits.join("  ·  "), cx, y, maxW);
    }
    ctx.restore();
  }

  function renderUpcoming(list, rows) {
    if (!list) return;
    list.textContent = "";
    (rows || []).forEach(function (row) {
      var li = document.createElement("li");
      li.className = "upcoming-row" + (row.nearNext ? " is-next" : "");
      li.setAttribute("data-depth", String(row.depth));
      li.setAttribute("data-near-next", row.nearNext ? "true" : "false");
      li.style.opacity = String(row.opacity);
      li.style.setProperty("--row-scale", String(row.scale));
      li.style.fontSize = 15 * row.scale + "px";
      var meta = document.createElement("div");
      meta.className = "row-meta";
      var title = document.createElement("div");
      title.className = "row-title";
      title.setAttribute("data-role", "up-title");
      title.textContent = row.title;
      var artist = document.createElement("div");
      artist.className = "row-artist";
      artist.setAttribute("data-role", "up-artist");
      artist.textContent = row.artist;
      meta.appendChild(title);
      meta.appendChild(artist);
      var wrap = document.createElement("div");
      wrap.className = "row-wave";
      var cv = document.createElement("canvas");
      cv.setAttribute("data-role", "up-wave");
      cv.width = 720;
      cv.height = 64;
      wrap.appendChild(cv);
      li.appendChild(meta);
      li.appendChild(wrap);
      list.appendChild(li);
      var ctx = cv.getContext("2d");
      if (ctx) {
        paintWaveform(ctx, row, {
          showPlayhead: false,
          color: row.nearNext ? "#ff3d9a" : "#c8c4bb",
          dim: "#8a867c",
        });
      }
    });
  }

  function render(root, model) {
    if (!root || !model) return model;
    root.setAttribute("data-width", String(model.capture.width));
    root.setAttribute("data-height", String(model.capture.height));
    root.style.width = model.capture.width + "px";
    root.style.height = model.capture.height + "px";

    var bg = root.querySelector("[data-role=stage-canvas]");
    if (bg) {
      var bgCtx = bg.getContext("2d");
      paintStageVisualizer(bgCtx, model);
    }

    var trans = model.transition && model.transition.active ? model.transition : null;
    var shown = trans ? trans.outgoing : model.nowPlaying;
    setText(root, "now-title", shown && shown.title);
    setText(root, "now-artist", shown && shown.artist);
    setText(root, "now-kicker", trans ? "CROSSFADE" : "NOW PLAYING");

    var nowLayer = root.querySelector("[data-role=now-layer]");
    var inLayer = root.querySelector("[data-role=in-layer]");
    if (nowLayer) {
      nowLayer.style.opacity = trans ? String(trans.outgoing.opacity) : "1";
      nowLayer.style.transform = trans ? "translateY(" + trans.outgoing.translateY + "px)" : "translateY(0)";
    }
    if (inLayer) {
      if (trans && trans.incoming) {
        inLayer.hidden = false;
        inLayer.removeAttribute("hidden");
        setText(root, "in-title", trans.incoming.title);
        setText(root, "in-artist", trans.incoming.artist);
        inLayer.style.opacity = String(trans.incoming.opacity);
        inLayer.style.transform = "translateY(" + trans.incoming.translateY + "px)";
      } else {
        inLayer.hidden = true;
        inLayer.setAttribute("hidden", "");
        inLayer.style.opacity = "0";
      }
    }

    var nowWave = root.querySelector("[data-role=now-wave]");
    if (nowWave && shown) {
      var nctx = nowWave.getContext("2d");
      if (nctx) paintWaveform(nctx, shown, { showPlayhead: true, color: "#ff3d9a", dim: "#5c5a53" });
    }
    var inWave = root.querySelector("[data-role=in-wave]");
    if (inWave && trans && trans.incoming) {
      var ictx = inWave.getContext("2d");
      if (ictx) paintWaveform(ictx, trans.incoming, { showPlayhead: true, color: "#3de0ff", dim: "#3a4148" });
    }

    renderUpcoming(root.querySelector("[data-role=upcoming-list]") || root.querySelector("#upcoming-list"), model.upcoming);
    return model;
  }

  function fullscreenElement(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return null;
    return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
  }

  function isFullscreen(el, doc) {
    var current = fullscreenElement(doc);
    if (current) return !el || current === el;
    return !!(el && el.classList && el.classList.contains("is-fullscreen"));
  }

  function applyFullscreenChrome(rootEl, active) {
    if (!rootEl) return !!active;
    if (rootEl.classList && rootEl.classList.toggle) {
      rootEl.classList.toggle("is-fullscreen", !!active);
    }
    if (rootEl.setAttribute) rootEl.setAttribute("data-fullscreen", active ? "true" : "false");
    return !!active;
  }

  function requestFullscreen(el) {
    if (!el) return Promise.reject(new Error("no-element"));
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) return Promise.reject(new Error("unsupported"));
    return Promise.resolve(fn.call(el));
  }

  function exitFullscreen(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return Promise.reject(new Error("no-document"));
    var fn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (!fn) return Promise.reject(new Error("unsupported"));
    return Promise.resolve(fn.call(doc));
  }

  function toggleFullscreen(el, doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (isFullscreen(el, doc) && fullscreenElement(doc)) {
      return exitFullscreen(doc).then(function () {
        applyFullscreenChrome(el, false);
        return false;
      });
    }
    if (isFullscreen(el, doc)) {
      applyFullscreenChrome(el, false);
      return Promise.resolve(false);
    }
    if (el && (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)) {
      return requestFullscreen(el)
        .then(function () {
          applyFullscreenChrome(el, true);
          return true;
        })
        .catch(function () {
          var next = !(el.classList && el.classList.contains("is-fullscreen"));
          applyFullscreenChrome(el, next);
          return next;
        });
    }
    applyFullscreenChrome(el, true);
    return Promise.resolve(true);
  }

  function shouldHandleFullscreenHotkey(ev) {
    if (!ev) return false;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return false;
    var key = ev.key || ev.code || "";
    if (key !== "f" && key !== "F" && key !== "KeyF") return false;
    var t = ev.target;
    if (!t) return true;
    var tag = String(t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return false;
    if (t.isContentEditable) return false;
    return true;
  }

  function paintWaveform(ctx, model, opts) {
    opts = opts || {};
    if (!ctx || !model) return;
    var w = opts.width != null ? opts.width : ctx.canvas.width;
    var h = opts.height != null ? opts.height : ctx.canvas.height;
    var samples = model.waveform || [];
    var color = opts.color || "#ff3d9a";
    var dim = opts.dim || "#ece8df";
    var playhead = model.playhead != null ? model.playhead : 0;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = opts.background || "#07080c";
    ctx.fillRect(0, 0, w, h);
    var mid = h / 2;
    var n = samples.length || 1;
    var bar = Math.max(1, w / n);
    for (var i = 0; i < samples.length; i++) {
      var x = (i / n) * w;
      var amp = Math.max(0.04, samples[i]) * (h * 0.46);
      var played = opts.showPlayhead !== false && i / n <= playhead;
      ctx.fillStyle = played ? color : dim;
      ctx.globalAlpha = played ? 0.95 : 0.28;
      ctx.fillRect(x, mid - amp, Math.max(1, bar - 0.4), amp * 2);
    }
    ctx.globalAlpha = 1;
    if (opts.showPlayhead !== false) {
      var px = clamp(playhead, 0, 1) * w;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.max(0, px - 1), 0, 2, h);
    }
  }

  return {
    CAPTURE: CAPTURE,
    WAVEFORM_WIDTH: WAVEFORM_WIDTH,
    WAVEFORM_BINS: WAVEFORM_BINS,
    FALLBACK_ARTIST: FALLBACK_ARTIST,
    VISUAL_MODES: VISUAL_MODES,
    DEFAULT_VISUAL_MODE: DEFAULT_VISUAL_MODE,
    playheadFraction: playheadFraction,
    playheadX: playheadX,
    formatClock: formatClock,
    paintTimeline: paintTimeline,
    displayOf: displayOf,
    visualWeight: visualWeight,
    waveformOf: waveformOf,
    peaksFromAudioBuffer: peaksFromAudioBuffer,
    portraitSafeRect: portraitSafeRect,
    chromeLayout: chromeLayout,
    buildStage: buildStage,
    paintWaveform: paintWaveform,
    paintStageBackground: paintStageBackground,
    paintStageVisualizer: paintStageVisualizer,
    render: render,
    transitionFromProgress: transitionFromProgress,
    fullscreenElement: fullscreenElement,
    isFullscreen: isFullscreen,
    applyFullscreenChrome: applyFullscreenChrome,
    requestFullscreen: requestFullscreen,
    exitFullscreen: exitFullscreen,
    toggleFullscreen: toggleFullscreen,
    shouldHandleFullscreenHotkey: shouldHandleFullscreenHotkey,
  };
});
