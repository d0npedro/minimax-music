/**
 * Pure 16:9 stage view-model: now-playing, upcoming weights, crossfade slots.
 * No DOM, no Web Audio.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorStage = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CAPTURE = { width: 1280, height: 720, aspect: 16 / 9 };
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
    if (ctx.canvas.width !== w) ctx.canvas.width = w;
    if (ctx.canvas.height !== h) ctx.canvas.height = h;
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0a0b10");
    g.addColorStop(0.55, "#07080c");
    g.addColorStop(1, "#050608");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var glow = ctx.createRadialGradient(w * 0.5, h * 0.22, 20, w * 0.5, h * 0.18, w * 0.55);
    glow.addColorStop(0, "rgba(214,255,47,0.08)");
    glow.addColorStop(1, "rgba(214,255,47,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(236,232,223,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(12.5, 12.5, w - 25, h - 25);
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
          color: row.nearNext ? "#d6ff2f" : "#c8c4bb",
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
      paintStageBackground(bgCtx, model);
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
      if (nctx) paintWaveform(nctx, shown, { showPlayhead: true, color: "#d6ff2f", dim: "#5c5a53" });
    }
    var inWave = root.querySelector("[data-role=in-wave]");
    if (inWave && trans && trans.incoming) {
      var ictx = inWave.getContext("2d");
      if (ictx) paintWaveform(ictx, trans.incoming, { showPlayhead: true, color: "#3de0ff", dim: "#3a4148" });
    }

    renderUpcoming(root.querySelector("[data-role=upcoming-list]") || root.querySelector("#upcoming-list"), model.upcoming);
    return model;
  }

  function paintWaveform(ctx, model, opts) {
    opts = opts || {};
    if (!ctx || !model) return;
    var w = opts.width != null ? opts.width : ctx.canvas.width;
    var h = opts.height != null ? opts.height : ctx.canvas.height;
    var samples = model.waveform || [];
    var color = opts.color || "#d6ff2f";
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
    playheadFraction: playheadFraction,
    playheadX: playheadX,
    displayOf: displayOf,
    visualWeight: visualWeight,
    waveformOf: waveformOf,
    peaksFromAudioBuffer: peaksFromAudioBuffer,
    buildStage: buildStage,
    paintWaveform: paintWaveform,
    paintStageBackground: paintStageBackground,
    render: render,
    transitionFromProgress: transitionFromProgress,
  };
});
