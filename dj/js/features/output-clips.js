/**
 * Output-reel underlay: clips keep crossfading on the 16:9 stage,
 * other identities paint as a screen layer on top. Live-swap safe.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorOutputClips = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var MODE_REEL = "reel";
  var EXTRA_MODES = ["embers", "ribbon", "moire", "nova"];
  var CLIP_EVERY = 3;
  var CLIP_FADE = 0.02;
  var CLIP_TAIL = 1.15;
  var HOLD_SEC = 4.5;
  var PLAYBACK_RATE = 1;
  var STALL_MS = 1800;
  var SEEK_TIMEOUT_MS = 2500;
  var FADE_TIMEOUT_MS = 3500;
  var OVERLAY_BLEND = "screen";

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function clipName(item) {
    if (!item) return "";
    var raw = typeof item === "string" ? item : item.file || "";
    raw = String(raw).replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(raw)) return raw.replace(/^.*\//, "");
    return raw.replace(/^\/+/, "");
  }

  function clipKind(item) {
    var name = clipName(item);
    if (item && item.kind) return item.kind;
    if (/\.(jpe?g|png|webp)$/i.test(name)) return "image";
    return "video";
  }

  function clipSource(item) {
    if (item && item.source) return item.source;
    var name = clipName(item);
    if (/^dji[_-]/i.test(name)) return "dji";
    if (name.indexOf("/") !== -1 || /^GOPR|^GP\d+/i.test(name.replace(/^.*\//, ""))) return "pedda";
    return "output";
  }

  function clipUrl(file) {
    return "/clips/" + encodeURIComponent(clipName(file));
  }

  function isMediaName(name) {
    var base = String(name || "").replace(/^.*[\\/]/, "");
    return !!(base && /\.(mp4|webm|mov|avi)$/i.test(base));
  }

  function parseClipList(json) {
    var raw = json && json.files ? json.files : json;
    if (!Array.isArray(raw)) return [];
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var f = raw[i];
      var name = typeof f === "string" ? f : f && f.file;
      if (!isMediaName(name)) continue;
      out.push({
        file: clipName(name),
        source: (f && f.source) || clipSource(name),
        kind: (f && f.kind) || clipKind(name),
      });
    }
    return out;
  }

  function pickNextClip(files, used) {
    var names = files || [];
    if (!names.length) return null;
    var skip = used || {};
    function unusedOf(pred) {
      var pool = [];
      var i;
      for (i = 0; i < names.length; i++) {
        var key = clipName(names[i]);
        if (!key || skip[key]) continue;
        if (clipKind(names[i]) === "image") continue;
        if (pred && !pred(names[i])) continue;
        pool.push(names[i]);
      }
      return pool;
    }
    var pool = unusedOf(null);
    if (!pool.length) {
      Object.keys(skip).forEach(function (k) {
        delete skip[k];
      });
      pool = unusedOf(null);
    }
    if (!pool.length) return null;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    skip[clipName(pick)] = true;
    return pick;
  }

  function coverRect(sw, sh, dw, dh) {
    sw = Number(sw) || 0;
    sh = Number(sh) || 0;
    dw = Number(dw) || 0;
    dh = Number(dh) || 0;
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
      return { x: 0, y: 0, w: dw, h: dh };
    }
    var s = Math.max(dw / sw, dh / sh);
    var w = sw * s;
    var h = sh * s;
    return { x: (dw - w) / 2, y: (dh - h) / 2, w: w, h: h };
  }

  function fadeFrame(ctx, w, h, a) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 10, " + (a != null ? a : 0.2) + ")";
    ctx.fillRect(0, 0, w, h);
  }

  function drawEmbers(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fadeFrame(ctx, w, h, 0.22);
    var cx = w / 2;
    var col = Math.min(w, (h * 9) / 16);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 48;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var seed = i * 17.17;
      var t = (time * (0.08 + (i % 5) * 0.02) + seed) % 1;
      var x = cx + Math.sin(seed + time * 0.4) * col * (0.08 + (i % 9) * 0.035);
      var y = h * (1.05 - t * 1.15);
      var r = 1.2 + band * 6 + (v.punch || 0) * 4;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, "rgba(255,61,154," + (0.08 + band * 0.35) + ")");
      g.addColorStop(0.45, "hsla(" + (28 + (v.warmth || 0) * 30) + ",90%,58%," + (0.06 + band * 0.2) + ")");
      g.addColorStop(1, "rgba(255,61,154,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawRibbon(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fadeFrame(ctx, w, h, 0.2);
    var col = Math.min(w, (h * 9) / 16);
    var x0 = (w - col) / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    var i;
    for (i = 0; i < 5; i++) {
      var band = (v.bandWeights && v.bandWeights[i]) || 0;
      ctx.strokeStyle = "hsla(" + (168 + i * 28 + (v.warmth || 0) * 40) + ",80%,60%," + (0.12 + band * 0.35) + ")";
      ctx.lineWidth = 2 + band * 7 + (v.punch || 0) * 4;
      ctx.beginPath();
      var y = h * (0.22 + i * 0.12);
      ctx.moveTo(x0, y);
      var s;
      for (s = 1; s <= 8; s++) {
        var u = s / 8;
        var xx = x0 + col * u;
        var yy = y + Math.sin(time * (0.7 + i * 0.11) + u * 4.2 + i) * h * (0.04 + band * 0.08);
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawMoire(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fadeFrame(ctx, w, h, 0.18);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var rings = 18;
    var i;
    for (i = 0; i < rings; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var r = (Math.min(w, h) * 0.08 + i * 18 + time * 22) % (Math.min(w, h) * 0.62);
      ctx.strokeStyle = "rgba(236,232,223," + (0.03 + band * 0.16 + (v.punch || 0) * 0.08) + ")";
      ctx.lineWidth = 1 + band * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(time * 0.3 + i) * 10, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawNova(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fadeFrame(ctx, w, h, 0.24);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var punch = v.punch || 0;
    var g = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.min(w, h) * (0.22 + punch * 0.2));
    g.addColorStop(0, "rgba(255,61,154," + (0.18 + punch * 0.45) + ")");
    g.addColorStop(0.4, "hsla(" + (200 - (v.warmth || 0) * 40) + ",80%,55%," + (0.08 + (v.energy || 0) * 0.16) + ")");
    g.addColorStop(1, "rgba(255,61,154,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var i;
    for (i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2 + time * 0.2;
      var len = Math.min(w, h) * (0.18 + (v.energy || 0) * 0.2 + punch * 0.12);
      ctx.strokeStyle = "rgba(255,61,154," + (0.08 + punch * 0.28) + ")";
      ctx.lineWidth = 1 + punch * 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  var files = [];
  var used = {};
  var slots = [];
  var active = 0;
  var fade = 1;
  var fadeFrom = 0;
  var lastMode = "";
  var fetching = false;
  var advances = 0;
  var overlay = null;

  function nextNonReel(current, pick) {
    if (typeof pick !== "function") return current;
    var next = pick(current);
    if (next === MODE_REEL) next = pick(MODE_REEL);
    if (next === MODE_REEL || !next) next = current === MODE_REEL ? "organic" : current;
    return next;
  }

  function bindSlot(el) {
    if (!el.__mfClipBound) {
      el.addEventListener("ended", function () {
        advanceClip({ force: true });
      });
      el.addEventListener("error", function () {
        advanceClip({ force: true });
      });
      el.__mfClipBound = true;
    }
    var name = "";
    try {
      name = decodeURIComponent((el.currentSrc || el.src || "").split("/").pop() || "");
    } catch (e) {
      name = "";
    }
    return { el: el, file: name };
  }

  function ensureSlots() {
    if (!root || typeof document === "undefined") return;
    if (slots.length) return;
    var existing = document.querySelectorAll('video[data-role="output-clip"]');
    var i;
    for (i = 0; i < existing.length && slots.length < 2; i++) {
      slots.push(bindSlot(existing[i]));
    }
    while (slots.length < 2) {
      var el = document.createElement("video");
      el.muted = true;
      el.defaultMuted = true;
      el.autoplay = false;
      el.loop = false;
      el.preload = "auto";
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("muted", "");
      el.setAttribute("data-role", "output-clip");
      el.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
      (document.body || document.documentElement).appendChild(el);
      slots.push(bindSlot(el));
    }
  }

  function loadList() {
    if (fetching || !root || !root.fetch) return;
    fetching = true;
    root
      .fetch("/clips", { cache: "no-store" })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        files = parseClipList(json);
        var i;
        for (i = files.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = files[i];
          files[i] = files[j];
          files[j] = tmp;
        }
        fetching = false;
        if (slots[active] && !slots[active].file) advanceClip();
      })
      .catch(function () {
        fetching = false;
      });
  }

  function slotReady(slot) {
    if (!slot) return false;
    if (slot.kind === "image") return !!(slot.img && slot.img.complete && slot.img.naturalWidth);
    return !!(slot.el && !slot.seeking && slot.el.readyState >= 2 && slot.el.videoWidth);
  }

  function isStalled(lastT, lastTAt, now, currentT, limit) {
    if (currentT !== lastT) return false;
    return now - lastTAt >= (limit != null ? limit : STALL_MS);
  }

  function seekWindow(el, slot) {
    if (!el) return false;
    var dur = Number(el.duration) || 0;
    var need = HOLD_SEC * PLAYBACK_RATE;
    if (!(dur > need + 0.8)) return false;
    if (slot) {
      slot.seeking = true;
      slot.seekAt = Date.now();
    }
    try {
      el.currentTime = Math.random() * (dur - need);
    } catch (err) {
      if (slot) slot.seeking = false;
      return false;
    }
    return true;
  }

  function loadInto(slot, item) {
    if (!slot || !item) return;
    var name = clipName(item);
    var kind = clipKind(item);
    slot.file = name;
    slot.item = item;
    slot.kind = kind;
    slot.shownAt = 0;
    slot.ready = false;
    slot.seeking = false;
    slot.seekAt = 0;
    slot.lastT = -1;
    slot.lastTAt = Date.now();
    slot.fadeAt = Date.now();
    if (kind === "image") {
      if (slot.el) {
        try {
          slot.el.pause();
        } catch (e) {}
        slot.el.removeAttribute("src");
      }
      if (typeof Image === "undefined") return;
      var img = new Image();
      img.onload = function () {
        slot.ready = true;
      };
      img.onerror = function () {
        advanceClip();
      };
      img.src = clipUrl(name);
      slot.img = img;
      return;
    }
    slot.img = null;
    if (!slot.el) return;
    slot.el.onloadedmetadata = function () {
      if (!seekWindow(slot.el, slot)) playSlot(slot);
    };
    slot.el.onseeked = function () {
      slot.seeking = false;
      playSlot(slot);
    };
    slot.el.onstalled = function () {
      advanceClip({ force: true });
    };
    slot.el.src = clipUrl(name);
    slot.el.load();
  }

  function playSlot(slot) {
    if (!slot || slot.kind === "image" || !slot.el) return;
    slot.el.playbackRate = PLAYBACK_RATE;
    slot.el.defaultPlaybackRate = PLAYBACK_RATE;
    var p = slot.el.play();
    if (p && p.catch) p.catch(function () {});
  }

  function resetReel() {
    Object.keys(used).forEach(function (k) {
      delete used[k];
    });
    fade = 1;
    fetching = false;
    loadList();
  }

  function advanceClip(opts) {
    ensureSlots();
    if (opts && opts.force) fade = 1;
    if (fade < 1) return;
    if (!files.length) {
      loadList();
      return;
    }
    var next = pickNextClip(files, used);
    if (!next) return;
    var incoming = 1 - active;
    if (slots[incoming] && slots[incoming].file === clipName(next)) {
      next = pickNextClip(files, used) || next;
    }
    loadInto(slots[incoming], next);
    playSlot(slots[incoming]);
    fadeFrom = active;
    active = incoming;
    fade = 0;
    if (slots[active]) slots[active].fadeAt = Date.now();
  }

  function maybeAdvance() {
    var slot = slots[active];
    if (!slot || fade < 1) return;
    var now = Date.now();
    if (!slot.shownAt) slot.shownAt = now;
    if (now - slot.shownAt >= HOLD_SEC * 1000) {
      advanceClip();
      return;
    }
    if (slot.kind === "image") return;
    var cur = slot.el;
    if (!cur) return;
    if (cur.ended) {
      advanceClip();
      return;
    }
    if (cur.duration && cur.duration - cur.currentTime <= CLIP_TAIL) advanceClip();
  }

  function tickReel() {
    ensureSlots();
    if (!files.length) loadList();
    if (!slots[active] || !slots[active].file) advanceClip({ force: true });
    var slot = slots[active];
    var now = Date.now();
    if (slot && slot.el) {
      if (slot.seeking && slot.seekAt && now - slot.seekAt > SEEK_TIMEOUT_MS) {
        advanceClip({ force: true });
        return;
      }
      if (!slot.seeking && slot.el.readyState >= 2) {
        var t = slot.el.currentTime;
        if (slot.lastT === t && !slot.el.paused && !slot.el.ended) {
          if (isStalled(slot.lastT, slot.lastTAt, now, t, STALL_MS)) {
            advanceClip({ force: true });
            return;
          }
        } else {
          slot.lastT = t;
          slot.lastTAt = now;
        }
      }
      if (slot.el.ended) {
        advanceClip({ force: true });
        return;
      }
    }
    if (fade < 1 && slot && slot.fadeAt && now - slot.fadeAt > FADE_TIMEOUT_MS && !slotReady(slot)) {
      advanceClip({ force: true });
      return;
    }
    playSlot(slots[active]);
    if (fade < 1) {
      if (slotReady(slots[active])) fade = clamp(fade + CLIP_FADE, 0, 1);
    } else {
      var outgoing = slots[fadeFrom];
      if (outgoing && outgoing !== slots[active] && outgoing.el && !outgoing.el.paused) outgoing.el.pause();
      maybeAdvance();
    }
  }

  function blitSlot(ctx, slot, alpha, w, h) {
    var src = null;
    var sw = 0;
    var sh = 0;
    if (slot && slot.kind === "image" && slot.img && slot.img.naturalWidth) {
      src = slot.img;
      sw = slot.img.naturalWidth;
      sh = slot.img.naturalHeight;
    } else if (slot && slot.el && slot.el.readyState >= 2 && slot.el.videoWidth) {
      src = slot.el;
      sw = slot.el.videoWidth;
      sh = slot.el.videoHeight;
    }
    if (!src) return false;
    var box = coverRect(sw, sh, w, h);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, box.x, box.y, box.w, box.h);
    ctx.restore();
    return true;
  }

  function drawReel(dc) {
    if (!dc || !dc.ctx) return;
    tickReel();
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, w, h);
    var shown = false;
    if (fade < 1 && slots[fadeFrom]) shown = blitSlot(ctx, slots[fadeFrom], 1, w, h) || shown;
    shown = blitSlot(ctx, slots[active], fade < 1 ? fade : 1, w, h) || shown;
    if (!shown) fadeFrame(ctx, w, h, 0.35);
    var punch = v.punch || 0;
    var veil = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.min(w, h) * 0.78);
    veil.addColorStop(0, "rgba(0,0,0,0)");
    veil.addColorStop(1, "rgba(0,0,0," + (0.16 + punch * 0.08) + ")");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function acquireOverlay(w, h) {
    if (typeof document === "undefined") return null;
    if (!overlay || overlay.width !== w || overlay.height !== h) {
      overlay = document.createElement("canvas");
      overlay.width = w;
      overlay.height = h;
    }
    return overlay;
  }

  function blitOverlay(dc) {
    if (!dc || !dc.ctx || !overlay) return;
    dc.ctx.save();
    dc.ctx.globalCompositeOperation = OVERLAY_BLEND;
    dc.ctx.globalAlpha = 0.92;
    dc.ctx.drawImage(overlay, 0, 0);
    dc.ctx.restore();
    dc.ctx.globalCompositeOperation = "source-over";
  }

  function effectDc(dc, layer) {
    return {
      ctx: layer.getContext("2d"),
      width: dc.width,
      height: dc.height,
      visual: dc.visual,
      time: dc.time,
      overlay: true,
    };
  }

  var extras = {
    reel: drawReel,
    embers: drawEmbers,
    ribbon: drawRibbon,
    moire: drawMoire,
    nova: drawNova,
  };

  function wrapGhost(G) {
    if (!G) return;
    if (!G.__clipUnderlayOrig) {
      G.__clipUnderlayOrig = {
        drawMode: G.drawMode && G.drawMode.bind(G),
        drawTransition: G.drawTransition && G.drawTransition.bind(G),
        nextInRotation: G.nextInRotation && G.nextInRotation.bind(G),
      };
    }
    var orig = G.__clipUnderlayOrig;
    G.drawMode = function (id, dc) {
      drawReel(dc);
      if (!id || id === MODE_REEL || !dc || !dc.ctx || !orig.drawMode) return;
      var layer = acquireOverlay(dc.width, dc.height);
      if (!layer) {
        orig.drawMode(id, dc);
        return;
      }
      orig.drawMode(id, effectDc(dc, layer));
      blitOverlay(dc);
    };
    G.drawTransition = function (fromId, toId, t, dc) {
      drawReel(dc);
      if (!dc || !dc.ctx || !orig.drawTransition) return t;
      var from = fromId === MODE_REEL ? null : fromId;
      var to = toId === MODE_REEL ? from : toId;
      if (!from && !to) return t;
      var layer = acquireOverlay(dc.width, dc.height);
      if (!layer) return orig.drawTransition(fromId, toId, t, dc);
      orig.drawTransition(from || to, to || from, t, effectDc(dc, layer));
      blitOverlay(dc);
      return t;
    };
    G.nextInRotation = function (current) {
      var modes = G.MODES || [];
      var i = modes.indexOf(current);
      var n = modes.length;
      if (!n) return current;
      var next = current;
      var guard = 0;
      do {
        i = i < 0 ? 0 : (i + 1) % n;
        next = modes[i];
        guard += 1;
      } while ((next === MODE_REEL || next === current) && guard < n);
      return next === MODE_REEL ? current : next;
    };
    G.__clipUnderlay = true;
  }

  function installDraws() {
    var G = root && root.MainFloorGhost;
    if (!G) return false;
    Object.keys(extras).forEach(function (id) {
      if (id === MODE_REEL) return;
      if (G.registerMode) G.registerMode(id, extras[id]);
      else if (G.MODES && G.MODES.indexOf(id) === -1) G.MODES.push(id);
    });
    if (G.MODES) {
      var idx = G.MODES.indexOf(MODE_REEL);
      if (idx !== -1) G.MODES.splice(idx, 1);
    }
    wrapGhost(G);
    return true;
  }

  function install() {
    if (!installDraws()) return false;
    loadList();
    if (root && root.setInterval && !root.__mfClipListTimer) {
      root.__mfClipListTimer = root.setInterval(function () {
        fetching = false;
        loadList();
      }, 45000);
    }
    if (root && root.requestAnimationFrame) {
      root.__mfClipGen = (root.__mfClipGen || 0) + 1;
      var gen = root.__mfClipGen;
      var loop = function () {
        if (root.__mfClipGen !== gen) return;
        tickReel();
        root.requestAnimationFrame(loop);
      };
      root.requestAnimationFrame(loop);
    }
    var app = root && root.MainFloorApp;
    if (app && app.state && app.state.visualMode === MODE_REEL && app.rollVisual) {
      app.rollVisual();
    }
    return true;
  }

  if (root && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  }

  return {
    MODE_REEL: MODE_REEL,
    EXTRA_MODES: EXTRA_MODES,
    CLIP_EVERY: CLIP_EVERY,
    CLIP_FADE: CLIP_FADE,
    HOLD_SEC: HOLD_SEC,
    PLAYBACK_RATE: PLAYBACK_RATE,
    STALL_MS: STALL_MS,
    isStalled: isStalled,
    OVERLAY_BLEND: OVERLAY_BLEND,
    resetReel: resetReel,
    clipName: clipName,
    clipKind: clipKind,
    clipSource: clipSource,
    clipUrl: clipUrl,
    parseClipList: parseClipList,
    pickNextClip: pickNextClip,
    coverRect: coverRect,
    nextNonReel: nextNonReel,
    extras: extras,
    drawReel: drawReel,
    drawEmbers: drawEmbers,
    drawRibbon: drawRibbon,
    drawMoire: drawMoire,
    drawNova: drawNova,
    install: install,
  };
});
