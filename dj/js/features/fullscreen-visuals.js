/**
 * Full-bleed 16:9 visuals + F-key fullscreen. Live-swap safe.
 */
(function (root) {
  var extras = {};

  function fade(ctx, w, h, a) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 10, " + (a != null ? a : 0.22) + ")";
    ctx.fillRect(0, 0, w, h);
  }

  function drawHorizon(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.2);
    var y = h * (0.58 - (v.energy || 0) * 0.06);
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(4,8,16,0)");
    g.addColorStop(0.45, "hsla(" + (28 + (v.warmth || 0) * 40) + ", 80%, 45%, " + (0.08 + (v.energy || 0) * 0.2) + ")");
    g.addColorStop(0.58, "rgba(255,61,154," + (0.16 + (v.punch || 0) * 0.35) + ")");
    g.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var i;
    for (i = 0; i < 9; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var yy = y + Math.sin(time * 0.8 + i) * h * 0.02 * (0.4 + band);
      ctx.strokeStyle = "rgba(255,61,154," + (0.05 + band * 0.25) + ")";
      ctx.lineWidth = 1 + band * 3 + (v.punch || 0) * 2;
      ctx.beginPath();
      ctx.moveTo(0, yy + i * 6);
      ctx.lineTo(w, yy + i * 6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawFlood(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.24);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var rows = 14;
    var i;
    for (i = 0; i < rows; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var t = (i / rows + time * 0.04) % 1;
      var y = t * h;
      var hh = h * (0.03 + band * 0.06 + (v.energy || 0) * 0.03);
      ctx.fillStyle = i % 3 === 0
        ? "rgba(255,61,154," + (0.05 + band * 0.22 + (v.punch || 0) * 0.1) + ")"
        : "rgba(236,232,223," + (0.03 + band * 0.14) + ")";
      ctx.fillRect(0, y, w, hh);
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawBurst(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.2);
    var cx = w / 2;
    var cy = h / 2;
    var R = Math.hypot(w, h) * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    var n = 18;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var a = (i / n) * Math.PI * 2 + time * (0.12 + (v.flow || 0) * 0.2);
      var len = R * (0.25 + band * 0.45 + (v.punch || 0) * 0.2);
      ctx.strokeStyle = i % 2 ? "rgba(255,61,154," + (0.08 + band * 0.28) + ")" : "rgba(236,232,223," + (0.06 + band * 0.18) + ")";
      ctx.lineWidth = 2 + band * 6 + (v.punch || 0) * 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.04, Math.sin(a) * R * 0.04);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.35);
    g.addColorStop(0, "rgba(255,61,154," + (0.14 + (v.punch || 0) * 0.4) + ")");
    g.addColorStop(1, "rgba(255,61,154,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawScan(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.26);
    ctx.save();
    var y;
    for (y = 0; y < h; y += 3) {
      ctx.fillStyle = "rgba(236,232,223," + (0.015 + ((v.energy || 0) * 0.02)) + ")";
      ctx.fillRect(0, y, w, 1);
    }
    var sweep = ((time * (80 + (v.flow || 0) * 60)) % (h + 40)) - 20;
    var g = ctx.createLinearGradient(0, sweep - 30, 0, sweep + 30);
    g.addColorStop(0, "rgba(255,61,154,0)");
    g.addColorStop(0.5, "rgba(255,61,154," + (0.18 + (v.punch || 0) * 0.28) + ")");
    g.addColorStop(1, "rgba(255,61,154,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, sweep - 30, w, 60);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawCity(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.22);
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "rgba(8,10,18,0.2)");
    sky.addColorStop(1, "rgba(255,61,154," + (0.03 + (v.energy || 0) * 0.05) + ")");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var cols = 28;
    var i;
    for (i = 0; i < cols; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var bw = w / cols;
      var bh = h * (0.12 + band * 0.35 + Math.abs(Math.sin(i * 1.7 + time * 0.3)) * 0.18);
      ctx.fillStyle = "rgba(255,61,154," + (0.04 + band * 0.16 + (v.punch || 0) * 0.08) + ")";
      ctx.fillRect(i * bw + 2, h - bh, bw - 4, bh);
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawWarp(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.24);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 36;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var a = (i / n) * Math.PI * 2;
      var speed = 0.35 + (v.flow || 0) * 0.5 + (v.punch || 0) * 0.4;
      var t = (time * speed + i * 0.07) % 1;
      var r0 = Math.hypot(w, h) * 0.02 * t;
      var r1 = Math.hypot(w, h) * (0.15 + t * 0.7);
      ctx.strokeStyle = "rgba(255,61,154," + ((1 - t) * (0.06 + band * 0.22)) + ")";
      ctx.lineWidth = 1 + (1 - t) * (3 + band * 4);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  extras.horizon = drawHorizon;
  extras.flood = drawFlood;
  extras.burst = drawBurst;
  extras.scan = drawScan;
  extras.city = drawCity;
  extras.warp = drawWarp;

  function install() {
    var G = root && root.MainFloorGhost;
    if (!G) return false;
    Object.keys(extras).forEach(function (id) {
      if (G.registerMode) G.registerMode(id, extras[id]);
      else if (G.MODES && G.MODES.indexOf(id) === -1) G.MODES.push(id);
    });
    if (typeof document !== "undefined" && !document.__mfFsBound) {
      document.addEventListener("keydown", function (ev) {
        var Stage = root.MainFloorStage;
        if (!Stage || !Stage.shouldHandleFullscreenHotkey || !Stage.shouldHandleFullscreenHotkey(ev)) return;
        var el = document.getElementById("stage");
        if (el && Stage.toggleFullscreen) Stage.toggleFullscreen(el, document);
      });
      document.__mfFsBound = true;
    }
    if (typeof document !== "undefined" && !document.getElementById("mf-fs-style")) {
      var css = document.createElement("style");
      css.id = "mf-fs-style";
      css.textContent =
        ".stage-capture.is-fullscreen,.stage-capture:fullscreen,.stage-capture:-webkit-full-screen{background:#000}" +
        ".stage-capture.is-fullscreen canvas[data-role=stage-canvas]," +
        ".stage-capture:fullscreen canvas[data-role=stage-canvas]," +
        ".stage-capture:-webkit-full-screen canvas[data-role=stage-canvas]{" +
        "width:100vw;height:100vh;top:0;left:0;transform:none}";
      document.head.appendChild(css);
    }
    return true;
  }

  if (root && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  }

  if (root) root.MainFloorFullscreenVisuals = extras;
  if (typeof module === "object" && module.exports) module.exports = extras;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
