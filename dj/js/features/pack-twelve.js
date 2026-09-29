/**
 * Twelve additional canvas identities for the booth rotation.
 * Pure draws: ctx, width, height, visual, time. Live-swap safe.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorPackTwelve = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var IDS = [
    "comet-tails",
    "grid-ripple",
    "voltage",
    "frost",
    "helix",
    "spark-fall",
    "tide-lines",
    "prism-cut",
    "signal-bars",
    "ember-ring",
    "night-road",
    "pulse-diamonds",
  ];

  function fade(ctx, w, h, a) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 10, " + (a != null ? a : 0.22) + ")";
    ctx.fillRect(0, 0, w, h);
  }

  function drawCometTails(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.2);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    var i;
    for (i = 0; i < 14; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var t = (time * (0.08 + i * 0.01) + i * 0.17) % 1;
      var y = h * ((i * 0.07 + Math.sin(time * 0.3 + i) * 0.04) % 1);
      var x0 = -w * 0.1 + t * w * 1.2;
      var x1 = x0 - w * (0.12 + band * 0.1);
      ctx.strokeStyle = "hsla(" + (48 + i * 8 + (v.warmth || 0) * 30) + ",90%,60%," + (0.08 + band * 0.35 + (v.punch || 0) * 0.12) + ")";
      ctx.lineWidth = 1.5 + band * 4;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y + Math.sin(i) * 8);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawGridRipple(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.22);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 16;
    var i;
    for (i = 1; i <= n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var r = ((i / n + time * 0.06) % 1) * Math.min(w, h) * 0.62;
      ctx.strokeStyle = "rgba(255,61,154," + (0.04 + band * 0.18) + ")";
      ctx.lineWidth = 1 + band * 2;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx, cy - r * 0.55);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r * 0.55);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawVoltage(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.24);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var bolts = 5;
    var b;
    for (b = 0; b < bolts; b++) {
      var band = (v.bandWeights && v.bandWeights[b]) || 0;
      var y = h * (0.18 + b * 0.16);
      ctx.strokeStyle = "rgba(180,230,255," + (0.1 + band * 0.4 + (v.punch || 0) * 0.2) + ")";
      ctx.lineWidth = 1.2 + band * 3;
      ctx.beginPath();
      var x = 0;
      ctx.moveTo(0, y);
      while (x < w) {
        x += 18 + (b * 3);
        y += Math.sin(time * 8 + x * 0.08 + b) * (6 + band * 14);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawFrost(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.2);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var arms = 10;
    var a;
    for (a = 0; a < arms; a++) {
      var band = (v.bandWeights && v.bandWeights[a % 7]) || 0;
      var ang = (a / arms) * Math.PI * 2 + time * 0.05;
      var len = Math.min(w, h) * (0.22 + band * 0.18);
      ctx.strokeStyle = "rgba(200,230,255," + (0.08 + band * 0.28) + ")";
      ctx.lineWidth = 1 + band * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
      var k;
      for (k = 1; k <= 3; k++) {
        var t = k / 3.4;
        var px = cx + Math.cos(ang) * len * t;
        var py = cy + Math.sin(ang) * len * t;
        var br = len * 0.12;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(ang + 0.7) * br, py + Math.sin(ang + 0.7) * br);
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(ang - 0.7) * br, py + Math.sin(ang - 0.7) * br);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawHelix(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.22);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var steps = 36;
    var s;
    for (s = 0; s < steps; s++) {
      var u = s / steps;
      var band = (v.bandWeights && v.bandWeights[s % 7]) || 0;
      var y = h * u;
      var amp = w * (0.12 + (v.energy || 0) * 0.06);
      var x1 = w * 0.5 + Math.sin(u * Math.PI * 4 + time) * amp;
      var x2 = w * 0.5 + Math.sin(u * Math.PI * 4 + time + Math.PI) * amp;
      ctx.fillStyle = "rgba(255,61,154," + (0.08 + band * 0.3) + ")";
      ctx.beginPath();
      ctx.arc(x1, y, 2.4 + band * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(120,200,255," + (0.08 + band * 0.28) + ")";
      ctx.beginPath();
      ctx.arc(x2, y, 2.4 + band * 3, 0, Math.PI * 2);
      ctx.fill();
      if (s % 3 === 0) {
        ctx.strokeStyle = "rgba(236,232,223," + (0.04 + band * 0.12) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSparkFall(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.2);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 40;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var seed = i * 13.7;
      var t = (time * (0.12 + (i % 5) * 0.03) + seed) % 1;
      var x = ((seed * 17) % 1) * w;
      var y = t * h * 1.1 - 20;
      ctx.fillStyle = "hsla(" + (40 + (v.warmth || 0) * 40) + ",95%,62%," + (0.1 + band * 0.4) + ")";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1.2, y + 10 + band * 16);
      ctx.lineTo(x - 1.2, y + 10 + band * 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawTideLines(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.22);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    var rows = 10;
    var r;
    for (r = 0; r < rows; r++) {
      var band = (v.bandWeights && v.bandWeights[r % 7]) || 0;
      var y = h * (0.12 + r * 0.08);
      ctx.strokeStyle = "hsla(" + (190 + r * 6) + ",80%,60%," + (0.08 + band * 0.3) + ")";
      ctx.lineWidth = 1.4 + band * 3;
      ctx.beginPath();
      var x;
      for (x = 0; x <= w; x += 16) {
        var yy = y + Math.sin(x * 0.012 + time * 1.2 + r) * (8 + band * 18);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawPrismCut(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.21);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 12;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var ang = (i / n) * Math.PI * 2 + time * 0.15;
      var r0 = Math.min(w, h) * 0.06;
      var r1 = Math.min(w, h) * (0.2 + band * 0.16 + (v.energy || 0) * 0.08);
      ctx.fillStyle = "hsla(" + (i * 28 + (v.warmth || 0) * 40) + ",80%,58%," + (0.06 + band * 0.22) + ")";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang - 0.18) * r1, cy + Math.sin(ang - 0.18) * r1);
      ctx.lineTo(cx + Math.cos(ang + 0.18) * r1, cy + Math.sin(ang + 0.18) * r1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(236,232,223," + (0.05 + band * 0.15) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSignalBars(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.23);
    var n = 24;
    var gap = w / n;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var bh = h * (0.12 + band * 0.45 + Math.sin(time * 2 + i * 0.4) * 0.08);
      var x = i * gap + gap * 0.2;
      ctx.fillStyle = i % 4 === 0
        ? "rgba(255,61,154," + (0.12 + band * 0.4 + (v.punch || 0) * 0.15) + ")"
        : "rgba(236,232,223," + (0.08 + band * 0.22) + ")";
      ctx.fillRect(x, h * 0.72 - bh, gap * 0.55, bh);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawEmberRing(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.2);
    var cx = w / 2;
    var cy = h / 2;
    var R = Math.min(w, h) * (0.22 + (v.energy || 0) * 0.06);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 28;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var a = (i / n) * Math.PI * 2 + time * 0.4;
      var rr = R + Math.sin(time * 3 + i) * 10 * (0.4 + band);
      var x = cx + Math.cos(a) * rr;
      var y = cy + Math.sin(a) * rr;
      ctx.fillStyle = "hsla(" + (28 + band * 20) + ",95%,58%," + (0.12 + band * 0.4) + ")";
      ctx.beginPath();
      ctx.arc(x, y, 2 + band * 4 + (v.punch || 0) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,61,154," + (0.08 + (v.punch || 0) * 0.2) + ")";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawNightRoad(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.24);
    var cx = w / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var i;
    for (i = 0; i < 18; i++) {
      var t = ((i / 18) + time * 0.08) % 1;
      var y = h * (0.35 + t * 0.65);
      var scale = 0.08 + t * 0.92;
      var hw = w * 0.08 * scale;
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      ctx.fillStyle = "rgba(236,232,223," + (0.06 + band * 0.28) + ")";
      ctx.fillRect(cx - hw * 0.15, y, hw * 0.3, 4 + t * 10);
      ctx.strokeStyle = "rgba(255,61,154," + (0.04 + band * 0.16) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - hw * 2.2, y);
      ctx.lineTo(cx - hw * 3.4, y + 18);
      ctx.moveTo(cx + hw * 2.2, y);
      ctx.lineTo(cx + hw * 3.4, y + 18);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawPulseDiamonds(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    fade(ctx, w, h, 0.21);
    var cx = w / 2;
    var cy = h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var n = 8;
    var i;
    for (i = 0; i < n; i++) {
      var band = (v.bandWeights && v.bandWeights[i % 7]) || 0;
      var t = ((i / n) + time * 0.1) % 1;
      var s = Math.min(w, h) * (0.04 + t * 0.38);
      ctx.strokeStyle = "rgba(255,61,154," + ((1 - t) * (0.08 + band * 0.28 + (v.punch || 0) * 0.12)) + ")";
      ctx.lineWidth = 1 + (1 - t) * 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  var extras = {
    "comet-tails": drawCometTails,
    "grid-ripple": drawGridRipple,
    voltage: drawVoltage,
    frost: drawFrost,
    helix: drawHelix,
    "spark-fall": drawSparkFall,
    "tide-lines": drawTideLines,
    "prism-cut": drawPrismCut,
    "signal-bars": drawSignalBars,
    "ember-ring": drawEmberRing,
    "night-road": drawNightRoad,
    "pulse-diamonds": drawPulseDiamonds,
  };

  function install() {
    var G = root && root.MainFloorGhost;
    if (!G) return false;
    IDS.forEach(function (id) {
      if (G.registerMode) G.registerMode(id, extras[id]);
      else if (G.MODES && G.MODES.indexOf(id) === -1) G.MODES.push(id);
    });
    return true;
  }

  if (root && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  }

  return {
    IDS: IDS,
    extras: extras,
    install: install,
    drawCometTails: drawCometTails,
    drawGridRipple: drawGridRipple,
    drawVoltage: drawVoltage,
    drawFrost: drawFrost,
    drawHelix: drawHelix,
    drawSparkFall: drawSparkFall,
    drawTideLines: drawTideLines,
    drawPrismCut: drawPrismCut,
    drawSignalBars: drawSignalBars,
    drawEmberRing: drawEmberRing,
    drawNightRoad: drawNightRoad,
    drawPulseDiamonds: drawPulseDiamonds,
  };
});
