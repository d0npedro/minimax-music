/**
 * Ghost modes — Organic, Orbit, Kaleidoscope, Lattice, Fluid, Aurora.
 * Extra identities can register live via registerMode without stopping the mix.
 * Each paints from VisualState onto a 2D canvas. Dual window + module.exports.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorGhost = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MODES = ["organic", "orbit", "kaleidoscope", "lattice", "fluid", "aurora"];
  var HOLD_MS = 14000;
  var FADE_MS = 2400;

  var blobs = [];
  var organicInit = false;
  var filaments = [];

  var kalRot = 0;
  var kalFolds = 8;
  var kalAperture = 0.5;

  var GW = 120;
  var GH = 68;
  var h1 = new Float32Array(GW * GH);
  var h2 = new Float32Array(GW * GH);
  var fluidReady = false;
  var lastPunch = 0;
  var justReset = false;
  var orbitRot = 0;
  var layerFrom = null;
  var layerTo = null;

  function clamp(x, a, b) {
    return Math.min(b, Math.max(a, x));
  }

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    function k(n) {
      return (n + h / 30) % 12;
    }
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    }
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  function ensureBlobs(w, h, n) {
    if (organicInit && blobs.length === n) return;
    blobs.length = 0;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      blobs.push({
        x: w / 2 + Math.cos(a) * w * 0.12,
        y: h / 2 + Math.sin(a) * h * 0.12,
        r: Math.min(w, h) * 0.08,
        phase: a,
      });
    }
    organicInit = true;
  }

  function resetOrganic() {
    organicInit = false;
    blobs.length = 0;
    filaments = [];
    justReset = true;
  }

  function drawOrganic(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual;
    var time = dc.time || 0;
    var n = 7;
    ensureBlobs(w, h, n);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 6, 10, " + (0.22 + v.viscosity * 0.12) + ")";
    ctx.fillRect(0, 0, w, h);

    var cx = w / 2;
    var cy = h / 2;
    var breath = 1 + Math.sin(time * 0.7 + v.tension * 2) * 0.04 * v.flow;
    var i;

    for (i = 0; i < n; i++) {
      var band = v.bandWeights[i] || 0;
      var targetR = Math.min(w, h) * (0.05 + band * 0.14 + v.energy * 0.06) * breath;
      var orbit = Math.min(w, h) * (0.1 + v.energy * 0.18 + band * 0.08) * (1 + v.chaos * 0.15);
      var spin = time * (0.15 + i * 0.03 + v.punch * 0.4) + blobs[i].phase;
      var tx = cx + Math.cos(spin) * orbit * (i % 2 === 0 ? 1 : 0.72);
      var ty = cy + Math.sin(spin * 1.07) * orbit * 0.85;
      var b = blobs[i];
      b.x += (tx - b.x) * (0.06 + v.flow * 0.08);
      b.y += (ty - b.y) * (0.06 + v.flow * 0.08);
      b.r += (targetR - b.r) * 0.12;
    }

    for (var pass = 0; pass < 3; pass++) {
      for (i = 0; i < n; i++) {
        var bb = blobs[i];
        var bd = v.bandWeights[i] || 0;
        var hue =
          (v.warmth * 40 + (1 - v.warmth) * 190 + (i / n) * 80 + v.sectionHueShift * 360 + v.brightness * 20) % 360;
        var alpha = 0.1 + bd * 0.22 + v.energy * 0.08 - pass * 0.03;
        var radius = bb.r * (1.35 - pass * 0.22);
        var g = ctx.createRadialGradient(bb.x, bb.y, 0, bb.x, bb.y, radius);
        g.addColorStop(
          0,
          "hsla(" + hue + ", " + (55 + v.brightness * 30) + "%, " + (48 + v.energy * 20) + "%, " + Math.max(0, alpha) + ")"
        );
        g.addColorStop(0.55, "hsla(" + (hue + 20) + ", 50%, 40%, " + Math.max(0, alpha * 0.45) + ")");
        g.addColorStop(1, "hsla(" + hue + ", 40%, 30%, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bb.x, bb.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1.2 + v.energy * 1.5;
    for (i = 0; i < n; i++) {
      var bc = blobs[i];
      var hueC = (160 + i * 25 + v.warmth * 40) % 360;
      ctx.strokeStyle = "hsla(" + hueC + ", 70%, 65%, " + (0.15 + v.energy * 0.25) + ")";
      ctx.beginPath();
      ctx.arc(bc.x, bc.y, bc.r * 1.05, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (v.transient > 0.45 && filaments.length < 80) {
      var src = blobs[Math.floor(Math.random() * n)];
      for (var k = 0; k < 4 + Math.floor(v.punch * 6); k++) {
        var ang = Math.random() * Math.PI * 2;
        var sp = 2 + v.punch * 10;
        filaments.push({
          x: src.x,
          y: src.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 1,
        });
      }
    }

    ctx.lineWidth = 1.5;
    for (i = filaments.length - 1; i >= 0; i--) {
      var fil = filaments[i];
      fil.x += fil.vx;
      fil.y += fil.vy;
      fil.vx *= 0.96;
      fil.vy *= 0.96;
      fil.life -= 0.03 + (1 - v.viscosity) * 0.02;
      if (fil.life <= 0) {
        filaments.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = "hsla(" + (40 + v.warmth * 30) + ", 90%, 70%, " + fil.life * 0.7 + ")";
      ctx.beginPath();
      ctx.moveTo(fil.x, fil.y);
      ctx.lineTo(fil.x - fil.vx * 2, fil.y - fil.vy * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function resetKaleidoscope() {
    kalRot = 0;
    kalFolds = 8;
    kalAperture = 0.5;
    justReset = true;
  }

  function drawWedgeMotif(ctx, R, v, time, seed) {
    var bands = v.bandWeights;
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 7; i++) {
      var band = bands[i] || 0;
      var r0 = R * (0.15 + i * 0.1);
      var r1 = r0 + R * (0.04 + band * 0.12 + v.energy * 0.04);
      var hue =
        (seed * 40 + i * 28 + v.warmth * 50 + v.brightness * 30 + v.sectionHueShift * 360 + time * (8 + v.chaos * 20)) %
        360;
      ctx.strokeStyle = "hsla(" + hue + ", " + (60 + band * 30) + "%, " + (50 + v.energy * 20) + "%, " + (0.2 + band * 0.45) + ")";
      ctx.lineWidth = 1.5 + band * 4 + v.punch * 2;
      ctx.beginPath();
      var sweep = 0.4 + band * 0.8 + v.chaos * 0.3;
      ctx.arc(0, 0, (r0 + r1) / 2, -sweep / 2, sweep / 2);
      ctx.stroke();

      var bx = Math.cos(0) * r1;
      var by = Math.sin(time * 0.5 + i) * r0 * 0.15;
      var gr = ctx.createRadialGradient(bx, by, 0, bx, by, 8 + band * 18);
      gr.addColorStop(0, "hsla(" + hue + ", 90%, 75%, " + (0.3 + v.punch * 0.5) + ")");
      gr.addColorStop(1, "transparent");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(bx, by, 10 + band * 20, 0, Math.PI * 2);
      ctx.fill();
    }

    if (v.transient > 0.5) {
      ctx.strokeStyle = "hsla(50, 100%, 80%, " + v.transient * 0.6 + ")";
      ctx.lineWidth = 1;
      for (var k = 0; k < 5; k++) {
        var ang = (k / 5) * 0.6 - 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
        ctx.stroke();
      }
    }
  }

  function drawKaleidoscope(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual;
    var time = dc.time || 0;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 4, 8, " + (0.28 + v.viscosity * 0.1) + ")";
    ctx.fillRect(0, 0, w, h);

    var targetFolds = Math.round(6 + v.tension * 4 + v.chaos * 6 + (v.sectionLabel === "drop" ? 2 : 0));
    kalFolds += (Math.max(4, Math.min(16, targetFolds)) - kalFolds) * 0.08;
    var n = Math.max(4, Math.round(kalFolds));

    var targetAp = 0.35 + v.energy * 0.5 + v.punch * 0.15;
    kalAperture += (targetAp - kalAperture) * 0.1;

    kalRot += 0.004 + v.flow * 0.01 + v.punch * 0.04;
    if (v.sectionLabel === "break") kalRot += 0.001;

    var cx = w / 2;
    var cy = h / 2;
    var R = Math.min(w, h) * 0.48 * kalAperture;

    ctx.save();
    ctx.translate(cx, cy);

    for (var s = 0; s < n; s++) {
      var a0 = (s / n) * Math.PI * 2 + kalRot;
      var a1 = ((s + 1) / n) * Math.PI * 2 + kalRot;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 1.2, a0, a1);
      ctx.closePath();
      ctx.clip();
      if (s % 2 === 1) {
        ctx.scale(1, -1);
        ctx.rotate(-(a0 + a1));
      } else {
        ctx.rotate(a0);
      }
      drawWedgeMotif(ctx, R, v, time, s);
      ctx.restore();
    }

    var eyeR = R * (0.08 + v.energy * 0.06);
    var hue = (200 + v.warmth * -80 + v.sectionHueShift * 360 + time * 12) % 360;
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, eyeR * 3);
    g.addColorStop(0, "hsla(" + hue + ", 80%, 70%, " + (0.5 + v.punch * 0.4) + ")");
    g.addColorStop(0.4, "hsla(" + (hue + 40) + ", 60%, 45%, 0.2)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, eyeR * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function fluidIdx(x, y) {
    return y * GW + x;
  }

  function resetFluid() {
    h1 = new Float32Array(GW * GH);
    h2 = new Float32Array(GW * GH);
    fluidReady = true;
    lastPunch = 0;
    justReset = true;
    inject(Math.floor(GW * 0.5), Math.floor(GH * 0.48), 2.2, 7);
    inject(Math.floor(GW * 0.36), Math.floor(GH * 0.4), 1.4, 5);
    inject(Math.floor(GW * 0.64), Math.floor(GH * 0.58), 1.2, 4);
  }

  function inject(cx, cy, force, radius) {
    var r = Math.max(1, Math.floor(radius));
    for (var y = cy - r; y <= cy + r; y++) {
      for (var x = cx - r; x <= cx + r; x++) {
        if (x <= 0 || y <= 0 || x >= GW - 1 || y >= GH - 1) continue;
        var d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        h1[fluidIdx(x, y)] += force * (1 - d / r);
      }
    }
  }

  function stepFluid(viscosity, energy) {
    var spread = 0.88 + (1 - viscosity) * 0.1 + energy * 0.04;
    var damp = 0.988 - viscosity * 0.045;
    for (var y = 1; y < GH - 1; y++) {
      for (var x = 1; x < GW - 1; x++) {
        var i = fluidIdx(x, y);
        var sum = h1[fluidIdx(x - 1, y)] + h1[fluidIdx(x + 1, y)] + h1[fluidIdx(x, y - 1)] + h1[fluidIdx(x, y + 1)];
        h2[i] = (sum / 2 - h2[i]) * spread;
        h2[i] *= damp;
      }
    }
    var tmp = h1;
    h1 = h2;
    h2 = tmp;
  }

  function drawFluid(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual;
    if (!fluidReady) resetFluid();

    if (v.rippleForce > 0.35 && v.punch > lastPunch + 0.08) {
      var cx = Math.floor(GW * (0.35 + Math.random() * 0.3));
      var cy = Math.floor(GH * (0.35 + Math.random() * 0.3));
      inject(cx, cy, v.rippleForce * 2.8, 3 + v.rippleForce * 5);
      for (var b = 0; b < 7; b++) {
        if ((v.bandWeights[b] || 0) > 0.55) {
          inject(Math.floor(((b + 0.5) / 7) * (GW - 4)) + 2, Math.floor(GH * 0.5), (v.bandWeights[b] || 0) * v.energy * 1.2, 2);
        }
      }
    }
    lastPunch = v.punch;

    if (v.energy > 0.15) {
      var yMid = Math.floor(GH * 0.5);
      for (var x = 2; x < GW - 2; x += 4) {
        h1[fluidIdx(x, yMid)] += Math.sin(x * 0.2 + v.t * 3) * v.energy * 0.02 * (1 - v.viscosity);
      }
    }

    var steps = v.sectionLabel === "drop" ? 3 : 2;
    for (var s = 0; s < steps; s++) stepFluid(v.viscosity, v.energy);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3, 5, 10, " + (0.15 + v.viscosity * 0.1) + ")";
    ctx.fillRect(0, 0, w, h);

    var hueBase = 190 - v.warmth * 90 + v.sectionHueShift * 360;
    var cellW = w / GW;
    var cellH = h / GH;
    ctx.globalAlpha = 0.92;
    for (var y = 0; y < GH; y++) {
      for (var x2 = 0; x2 < GW; x2++) {
        var z = h1[fluidIdx(x2, y)];
        var nx = x2 < GW - 1 ? h1[fluidIdx(x2 + 1, y)] - z : 0;
        var ny = y < GH - 1 ? h1[fluidIdx(x2, y + 1)] - z : 0;
        var light = clamp(0.45 + nx * 2.5 - ny * 1.8 + z * 0.8, 0, 1);
        var hue = (hueBase + z * 40 + v.brightness * 20) % 360;
        var sat = 50 + v.energy * 30;
        var lig = 18 + light * 55 + v.energy * 8;
        var rgb = hslToRgb(hue, sat, lig);
        ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
        ctx.fillRect(Math.floor(x2 * cellW), Math.floor(y * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }
    ctx.globalAlpha = 1;

    if (v.punch > 0.55) {
      ctx.strokeStyle = "hsla(" + (hueBase + 40) + ", 90%, 80%, " + v.punch * 0.35 + ")";
      ctx.lineWidth = 2 + v.punch * 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * (0.15 + v.punch * 0.2), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function resetOrbit() {
    orbitRot = 0;
  }

  function drawOrbit(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual;
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 10, " + (0.24 + v.viscosity * 0.1) + ")";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2;
    var cy = h / 2;
    var R = Math.min(w, h) * 0.42;
    orbitRot += 0.006 + v.flow * 0.012 + v.punch * 0.03;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 7; i++) {
      var band = v.bandWeights[i] || 0;
      var r = R * (0.18 + i * 0.11);
      var hue = (200 + i * 18 + v.warmth * -40 + v.sectionHueShift * 360 + time * 6) % 360;
      ctx.strokeStyle = "hsla(" + hue + ", 70%, 60%, " + (0.12 + band * 0.35 + v.energy * 0.1) + ")";
      ctx.lineWidth = 1 + band * 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      var dots = 3 + (i % 3);
      for (var d = 0; d < dots; d++) {
        var a = orbitRot * (0.55 + i * 0.11) + (d / dots) * Math.PI * 2;
        var x = Math.cos(a) * r;
        var y = Math.sin(a) * r * 0.62;
        var gr = ctx.createRadialGradient(x, y, 0, x, y, 6 + band * 10);
        gr.addColorStop(0, "hsla(" + hue + ", 90%, 75%, " + (0.35 + v.punch * 0.4) + ")");
        gr.addColorStop(1, "transparent");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, 4 + band * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawLattice(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual;
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 6, 11, " + (0.26 + v.viscosity * 0.1) + ")";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2;
    var vanishY = h * (0.34 + Math.sin(time * 0.35) * 0.03);
    var hue = (195 + v.warmth * -50 + v.sectionHueShift * 360 + time * 10) % 360;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;
    var i;
    for (i = -9; i <= 9; i++) {
      var alpha = 0.08 + v.energy * 0.12 + (1 - Math.abs(i) / 9) * 0.1;
      ctx.strokeStyle = "hsla(" + hue + ", 70%, 62%, " + alpha + ")";
      ctx.beginPath();
      ctx.moveTo(cx + i * w * 0.085, h + 8);
      ctx.lineTo(cx + i * w * 0.01, vanishY);
      ctx.stroke();
    }
    for (i = 1; i <= 12; i++) {
      var t = Math.pow(i / 12, 1.55);
      var y = vanishY + (h - vanishY) * t;
      var half = w * 0.5 * t;
      var pulse = 0.08 + v.energy * 0.18 + Math.max(0, 0.2 - Math.abs(t - (v.punch % 1)) * 2);
      ctx.strokeStyle = "hsla(" + (hue + 24) + ", 75%, 66%, " + pulse + ")";
      ctx.beginPath();
      ctx.moveTo(cx - half, y);
      ctx.lineTo(cx + half, y);
      ctx.stroke();
    }
    if (v.punch > 0.45) {
      ctx.strokeStyle = "hsla(" + (hue + 50) + ", 90%, 78%, " + v.punch * 0.35 + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, vanishY, Math.min(w, h) * 0.04, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawAurora(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual;
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 6, 12, " + (0.2 + v.viscosity * 0.1) + ")";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var i = 0; i < 6; i++) {
      var band = v.bandWeights[i] || 0;
      var x = w * (0.16 + i * 0.135);
      var hue = (132 + i * 22 + v.warmth * 55 + v.sectionHueShift * 360 + time * 9) % 360;
      var amp = w * (0.035 + band * 0.07 + v.energy * 0.03);
      var g = ctx.createLinearGradient(x, 0, x, h);
      g.addColorStop(0, "hsla(" + hue + ", 80%, 60%, 0)");
      g.addColorStop(0.28, "hsla(" + hue + ", 85%, 64%, " + (0.12 + band * 0.28 + v.punch * 0.15) + ")");
      g.addColorStop(0.72, "hsla(" + (hue + 18) + ", 70%, 55%, " + (0.08 + v.energy * 0.18) + ")");
      g.addColorStop(1, "hsla(" + hue + ", 70%, 50%, 0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 16 + band * 22 + v.energy * 10;
      ctx.beginPath();
      ctx.moveTo(x, -8);
      ctx.quadraticCurveTo(x + Math.sin(time * 0.7 + i * 0.9) * amp, h * 0.5, x + Math.cos(time * 0.45 + i) * amp * 0.6, h + 8);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function makeLayer(w, h) {
    var c = null;
    if (typeof OffscreenCanvas === "function") {
      c = new OffscreenCanvas(w, h);
    } else if (typeof document !== "undefined" && document.createElement) {
      c = document.createElement("canvas");
      c.width = w;
      c.height = h;
    }
    return c;
  }

  function acquireLayer(slot, w, h) {
    var cur = slot === "to" ? layerTo : layerFrom;
    if (!cur || cur.width !== w || cur.height !== h) {
      cur = makeLayer(w, h);
      if (slot === "to") layerTo = cur;
      else layerFrom = cur;
    }
    return cur;
  }

  function nextInRotation(current) {
    var i = MODES.indexOf(current);
    if (i < 0) return MODES[0];
    return MODES[(i + 1) % MODES.length];
  }

  function fadeAmount(elapsedMs, fadeMs) {
    var span = fadeMs != null ? fadeMs : FADE_MS;
    return clamp((Number(elapsedMs) || 0) / span, 0, 1);
  }

  function shouldAdvanceRotation(elapsedMs, holdMs) {
    var hold = holdMs != null ? holdMs : HOLD_MS;
    return (Number(elapsedMs) || 0) >= hold;
  }

  function pickRandomMode(current, rand) {
    var pool = [];
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i] !== current) pool.push(MODES[i]);
    }
    if (!pool.length) pool = MODES.slice();
    var r = typeof rand === "function" ? rand() : rand;
    if (r == null || r !== r) r = Math.random();
    r = Number(r);
    if (r < 0) r = 0;
    if (r >= 1) r = 0.999999;
    return pool[Math.floor(r * pool.length) % pool.length];
  }

  function resetMode(id) {
    if (id === "organic") resetOrganic();
    else if (id === "kaleidoscope") resetKaleidoscope();
    else if (id === "fluid") resetFluid();
    else if (id === "orbit") resetOrbit();
    else if (id === "lattice" || id === "aurora") justReset = false;
    else resetAll();
  }

  function prepareMode(id) {
    if (id === "fluid" && !fluidReady) resetFluid();
    if (id === "organic" && !organicInit) organicInit = false;
    if (id === "orbit") resetOrbit();
  }

  function resetAll() {
    resetOrganic();
    resetKaleidoscope();
    resetFluid();
    resetOrbit();
    justReset = true;
  }

  var extraDraws = {};

  function registerMode(id, draw) {
    var name = String(id || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!name || typeof draw !== "function") return MODES.slice();
    extraDraws[name] = draw;
    if (MODES.indexOf(name) === -1) MODES.push(name);
    return MODES.slice();
  }

  function paintIdentity(id, dc) {
    if (extraDraws[id]) {
      extraDraws[id](dc);
      return;
    }
    if (id === "kaleidoscope") drawKaleidoscope(dc);
    else if (id === "fluid") drawFluid(dc);
    else if (id === "orbit") drawOrbit(dc);
    else if (id === "lattice") drawLattice(dc);
    else if (id === "aurora") drawAurora(dc);
    else drawOrganic(dc);
  }

  function drawMode(id, dc) {
    if (justReset && dc && dc.ctx) {
      dc.ctx.globalCompositeOperation = "source-over";
      dc.ctx.fillStyle = "#05060a";
      dc.ctx.fillRect(0, 0, dc.width, dc.height);
      justReset = false;
    }
    paintIdentity(id, dc);
  }

  function drawTransition(fromId, toId, t, dc) {
    var amt = clamp(Number(t) || 0, 0, 1);
    if (!fromId || !toId || fromId === toId || amt >= 1) {
      drawMode(toId || fromId, dc);
      return amt;
    }
    if (amt <= 0) {
      drawMode(fromId, dc);
      return amt;
    }
    var ctx = dc && dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var a = acquireLayer("from", w, h);
    var b = acquireLayer("to", w, h);
    if (!ctx || !a || !b || !a.getContext || !ctx.drawImage) {
      drawMode(toId, dc);
      return amt;
    }
    var eased = amt * amt * (3 - 2 * amt);
    paintIdentity(fromId, { ctx: a.getContext("2d"), width: w, height: h, visual: dc.visual, time: dc.time });
    paintIdentity(toId, { ctx: b.getContext("2d"), width: w, height: h, visual: dc.visual, time: dc.time });
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(a, 0, 0, w, h);
    ctx.globalAlpha = eased;
    ctx.drawImage(b, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();
    return amt;
  }

  return {
    MODES: MODES,
    HOLD_MS: HOLD_MS,
    FADE_MS: FADE_MS,
    drawOrganic: drawOrganic,
    resetOrganic: resetOrganic,
    drawKaleidoscope: drawKaleidoscope,
    resetKaleidoscope: resetKaleidoscope,
    drawFluid: drawFluid,
    resetFluid: resetFluid,
    drawOrbit: drawOrbit,
    drawLattice: drawLattice,
    drawAurora: drawAurora,
    drawMode: drawMode,
    drawTransition: drawTransition,
    nextInRotation: nextInRotation,
    fadeAmount: fadeAmount,
    shouldAdvanceRotation: shouldAdvanceRotation,
    pickRandomMode: pickRandomMode,
    registerMode: registerMode,
    prepareMode: prepareMode,
    resetMode: resetMode,
    resetAll: resetAll,
  };
});
