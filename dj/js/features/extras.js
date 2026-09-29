/**
 * Live extras: YouTube chat background + additional visual identities.
 * Safe to inject via live-swap while the mix is playing.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorExtras = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var DEFAULT_VIDEO = "H7zf6h7D5H0";
  var STYLE_ID = "main-floor-extras-style";
  var LAYER_ID = "yt-chat-bg";
  var extras = {};
  var chatNotes = [];

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function resolveVideoId(opts) {
    opts = opts || {};
    if (opts.videoId) return String(opts.videoId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
    if (root && root.MAIN_FLOOR_YT_VIDEO) {
      return String(root.MAIN_FLOOR_YT_VIDEO).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
    }
    if (root && root.localStorage) {
      try {
        var stored = root.localStorage.getItem("mainFloorYtVideo");
        if (stored) return String(stored).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
      } catch (e) {
        /* ignore */
      }
    }
    if (root && root.location && root.location.search) {
      var m = String(root.location.search).match(/[?&]yt=([a-zA-Z0-9_-]{6,16})/);
      if (m) return m[1];
    }
    return DEFAULT_VIDEO;
  }

  function chatEmbedUrl(videoId, host) {
    var id = resolveVideoId({ videoId: videoId });
    var domain = host || (root && root.location && root.location.hostname) || "127.0.0.1";
    return (
      "https://www.youtube.com/live_chat?v=" +
      encodeURIComponent(id) +
      "&embed_domain=" +
      encodeURIComponent(domain) +
      "&dark_theme=1"
    );
  }

  function ensureStyle(doc) {
    if (!doc || !doc.getElementById || doc.getElementById(STYLE_ID)) return;
    var css = doc.createElement("style");
    css.id = STYLE_ID;
    css.textContent =
      "#stage-canvas{z-index:1}" +
      ".yt-chat-bg{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 1.4s ease;background:radial-gradient(ellipse at 50% 42%,rgba(8,10,16,.2),rgba(0,0,0,.72) 72%)}" +
      ".stage-capture.chat-live .yt-chat-bg{opacity:.62}" +
      ".yt-chat-bg iframe{width:min(380px,88vw);height:min(78vh,calc(min(100vh,100vw * 9 / 16) * .84));border:0;background:transparent;filter:saturate(.75) contrast(1.05)}" +
      ".yt-chat-fallback{width:min(380px,88vw);max-height:70%;overflow:hidden;color:#ece8df;font:600 13px/1.45 'Segoe UI',sans-serif;text-align:center;text-shadow:0 1px 10px #000;letter-spacing:.06em;text-transform:uppercase;opacity:.8}";
    (doc.head || doc.documentElement).appendChild(css);
  }

  function ensureLayer(doc, videoId) {
    if (!doc || !doc.getElementById) return null;
    var stage = doc.getElementById("stage");
    if (!stage) return null;
    ensureStyle(doc);
    var layer = doc.getElementById(LAYER_ID);
    if (!layer) {
      layer = doc.createElement("div");
      layer.id = LAYER_ID;
      layer.className = "yt-chat-bg";
      var canvas = doc.getElementById("stage-canvas");
      if (canvas && canvas.parentNode === stage) stage.insertBefore(layer, canvas);
      else stage.insertBefore(layer, stage.firstChild);
      var frame = doc.createElement("iframe");
      frame.title = "YouTube Live Chat";
      frame.src = chatEmbedUrl(videoId);
      frame.setAttribute("referrerpolicy", "origin");
      layer.appendChild(frame);
      var fallback = doc.createElement("div");
      fallback.className = "yt-chat-fallback";
      fallback.hidden = true;
      layer.appendChild(fallback);
    }
    return layer;
  }

  function currentModes() {
    var app = root && root.MainFloorApp;
    var s = app && app.state;
    return {
      mode: (s && s.visualMode) || "",
      from: (s && s.visualFrom) || "",
    };
  }

  function syncChatLayer(doc) {
    if (!doc) return;
    var layer = ensureLayer(doc, resolveVideoId());
    var stage = doc.getElementById("stage");
    var cur = currentModes();
    var on = cur.mode === "yt-chat" || cur.from === "yt-chat";
    if (stage) {
      stage.setAttribute("data-visual", cur.mode);
      stage.classList.toggle("chat-live", on);
    }
    if (layer) layer.setAttribute("data-on", on ? "1" : "0");
  }

  function drawYtChat(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3, 5, 10, " + (0.12 + (v.viscosity || 0) * 0.08) + ")";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2;
    var safeW = Math.min(w, (h * 9) / 16);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 8; i++) {
      var band = (v.bandWeights && v.bandWeights[i]) || 0;
      var y = (h * 0.18 + ((i * 73 + time * 28) % (h * 0.64)));
      var x = cx + Math.sin(time * 0.6 + i) * safeW * 0.08;
      ctx.globalAlpha = 0.08 + band * 0.18 + (v.energy || 0) * 0.08;
      ctx.fillStyle = i % 2 ? "#ff3d9a" : "#ece8df";
      ctx.fillRect(x - safeW * 0.18, y, safeW * 0.36, 2 + band * 4);
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    if (chatNotes.length) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "600 14px Segoe UI, sans-serif";
      ctx.fillStyle = "rgba(236,232,223,0.55)";
      var note = chatNotes[Math.floor(time) % chatNotes.length];
      ctx.fillText(String(note).slice(0, 42), cx, h * 0.16);
      ctx.restore();
    }
  }

  function drawConstellation(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 6, 12, 0.28)";
    ctx.fillRect(0, 0, w, h);
    var pts = [];
    var n = 18;
    var i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + time * 0.08;
      var r = Math.min(w, h) * (0.12 + (i % 5) * 0.07 + (v.energy || 0) * 0.05);
      pts.push({
        x: w / 2 + Math.cos(a) * r * (i % 2 ? 1.15 : 0.82),
        y: h / 2 + Math.sin(a * 1.07) * r * 0.78,
        s: 1.4 + ((v.bandWeights && v.bandWeights[i % 7]) || 0) * 3,
      });
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,61,154,0.18)";
    ctx.lineWidth = 1;
    for (i = 0; i < n; i++) {
      var p = pts[i];
      var q = pts[(i + 3) % n];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    for (i = 0; i < n; i++) {
      var star = pts[i];
      ctx.fillStyle = "rgba(236,232,223," + (0.35 + (v.punch || 0) * 0.4) + ")";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawRadar(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3, 8, 8, 0.26)";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2;
    var cy = h / 2;
    var R = Math.min(w, h) * 0.38;
    var sweep = time * (0.7 + (v.flow || 0) * 0.8);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(255,61,154,0.2)";
    ctx.lineWidth = 1;
    var r;
    for (r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath();
      ctx.arc(0, 0, R * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-R, 0);
    ctx.lineTo(R, 0);
    ctx.moveTo(0, -R);
    ctx.lineTo(0, R);
    ctx.stroke();
    var grd = ctx.createConicalGradient ? null : ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    ctx.rotate(sweep);
    ctx.fillStyle = "rgba(255,61,154," + (0.08 + (v.energy || 0) * 0.12) + ")";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -0.35, 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,61,154,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R, 0);
    ctx.stroke();
    var blipR = R * (0.35 + (v.punch || 0) * 0.25);
    ctx.fillStyle = "#ff3d9a";
    ctx.beginPath();
    ctx.arc(Math.cos(1.2) * blipR, Math.sin(1.2) * blipR, 3 + (v.punch || 0) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (grd) ctx.fillStyle = grd;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawTypeRain(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 6, 10, 0.3)";
    ctx.fillRect(0, 0, w, h);
    var words = chatNotes.length ? chatNotes : ["MAIN FLOOR", "WAREHOUSE", "SCHRANZ", "DRIVE", "LIVE"];
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 13px Segoe UI, sans-serif";
    var i;
    for (i = 0; i < 12; i++) {
      var word = words[i % words.length];
      var x = w * (0.18 + (i % 5) * 0.16);
      var y = ((time * (40 + i * 9) + i * 80) % (h + 40)) - 20;
      ctx.globalAlpha = 0.18 + ((v.bandWeights && v.bandWeights[i % 7]) || 0) * 0.45;
      ctx.fillStyle = i % 3 === 0 ? "#ff3d9a" : "#ece8df";
      ctx.fillText(String(word).slice(0, 18).toUpperCase(), x, y);
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawKickChevrons(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    var bands = v.bandWeights || [];
    var energy = v.energy || 0;
    var punch = v.punch || 0;
    var flow = v.flow || 0;
    var chaos = v.chaos || 0;
    var kick = punch * 0.65 + (v.transient || 0) * 0.35;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6, 4, 8, " + (0.26 + chaos * 0.08) + ")";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2;
    var cy = h / 2;
    var safe = Math.min(w, (h * 9) / 16) * 0.44;
    var hue = (14 + (v.warmth || 0) * 30 + (v.sectionHueShift || 0) * 360 + time * 8) % 360;
    var pitch = Math.min(h * (0.062 + energy * 0.018), safe * 0.22);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 2.6;
    var i;
    for (i = 0; i < 7; i++) {
      var band = bands[i] || 0;
      var y = (i - 3) * pitch;
      var half = safe * (0.38 + band * 0.32 + kick * 0.22);
      var span = safe * (0.22 + band * 0.2 + kick * 0.14);
      var tip = span * (0.7 + kick * 0.3);
      var arm = span * 0.52;
      var wob = Math.sin(time * (1.15 + flow) + i * 0.65) * safe * 0.03 * (0.4 + flow);
      ctx.save();
      ctx.translate(wob, y);
      ctx.rotate((i % 2 ? 1 : -1) * (0.06 + kick * 0.1 + chaos * 0.05));
      ctx.strokeStyle = "hsla(" + (hue + i * 5) + ", 88%, " + (50 + kick * 22) + "%, " + (0.12 + band * 0.36 + kick * 0.22) + ")";
      ctx.lineWidth = 2 + band * 6 + kick * 8;
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
      ctx.strokeStyle = "hsla(" + (hue + 34 + i * 8) + ", 92%, 64%, " + (0.2 + band * 0.4 + punch * 0.18) + ")";
      ctx.lineWidth = 1.6 + band * 2.6 + punch * 2;
      ctx.beginPath();
      ctx.moveTo(-span, -arm);
      ctx.lineTo(-span + tip, 0);
      ctx.lineTo(-span, arm);
      ctx.moveTo(span, -arm);
      ctx.lineTo(span - tip, 0);
      ctx.lineTo(span, arm);
      ctx.stroke();
      if (kick > 0.4) {
        ctx.fillStyle = "hsla(" + (hue + 16) + ", 95%, 68%, " + kick * 0.09 + ")";
        ctx.beginPath();
        ctx.moveTo(-span, -arm * 0.72);
        ctx.lineTo(-span + tip, 0);
        ctx.lineTo(-span, arm * 0.72);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(span, -arm * 0.72);
        ctx.lineTo(span - tip, 0);
        ctx.lineTo(span, arm * 0.72);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawShardSpin(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    var bands = v.bandWeights || [];
    var energy = v.energy || 0;
    var punch = v.punch || 0;
    var flow = v.flow || 0;
    var chaos = v.chaos || 0;
    var transient = v.transient || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 5, 10, " + (0.24 + energy * 0.06) + ")";
    ctx.fillRect(0, 0, w, h);
    var cx = w / 2;
    var cy = h / 2;
    var col = Math.min(w, (h * 9) / 16);
    var R = col * (0.155 + energy * 0.04 + punch * 0.03);
    var hue = (208 + (v.warmth || 0) * -75 + (v.sectionHueShift || 0) * 360 + time * 13) % 360;
    var n = 8 + Math.floor(chaos * 5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    var layer;
    for (layer = 0; layer < 2; layer++) {
      var dir = layer ? -1 : 1;
      var spin = time * (0.32 + flow * 0.7 + punch * 1.2) * dir + layer * 0.35;
      var count = n - layer * 2;
      var i;
      for (i = 0; i < count; i++) {
        var band = bands[i % 7] || 0;
        var out = R * (0.55 + layer * 0.4 + band * 0.5 + punch * 0.22 + transient * 0.12);
        var inn = R * (0.1 + layer * 0.16);
        var spr = 0.15 + band * 0.18 + chaos * 0.1;
        ctx.save();
        ctx.rotate((i / count) * Math.PI * 2 + spin + Math.sin(time * 2.1 + i) * chaos * 0.16);
        ctx.beginPath();
        ctx.moveTo(inn, 0);
        ctx.lineTo(Math.cos(-spr) * out, Math.sin(-spr) * out * 0.68);
        ctx.lineTo(out * (1.04 + band * 0.12), 0);
        ctx.lineTo(Math.cos(spr) * out, Math.sin(spr) * out * 0.68);
        ctx.closePath();
        ctx.fillStyle = "hsla(" + (hue + i * 12 + layer * 26) + ", 82%, " + (46 + band * 20) + "%, " + (0.07 + band * 0.2 + energy * 0.1) + ")";
        ctx.fill();
        ctx.strokeStyle = "hsla(" + (hue + i * 12 + 18) + ", 90%, 70%, " + (0.16 + band * 0.38 + punch * 0.24) + ")";
        ctx.lineWidth = 1.1 + band * 2.2;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawHexPulse(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    var bands = v.bandWeights || [];
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 6, 10, " + (0.22 + (v.viscosity || 0) * 0.08) + ")";
    ctx.fillRect(0, 0, w, h);
    var safe = Math.min(w, (h * 9) / 16);
    var size = safe * (0.052 + (v.energy || 0) * 0.018);
    var dx = size * 1.78;
    var dy = size * 1.54;
    var pulse = 1 + (v.punch || 0) * 0.2 + Math.sin(time * 3.1) * 0.04 * (v.flow || 0);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = "lighter";
    var row;
    var col;
    var n = 0;
    for (row = -3; row <= 3; row++) {
      for (col = -2; col <= 2; col++) {
        var x = (col + (row & 1 ? 0.5 : 0)) * dx;
        var y = row * dy;
        if (x * x + y * y > safe * safe * 0.17) continue;
        var band = bands[n % 7] || 0;
        n += 1;
        var r = size * pulse * (0.7 + band * 0.5);
        var a = 0.07 + band * 0.3 + (v.punch || 0) * 0.14;
        ctx.fillStyle = n % 3 === 0 ? "rgba(255,61,154," + a + ")" : "rgba(236,232,223," + a * 0.72 + ")";
        ctx.beginPath();
        var k;
        for (k = 0; k < 6; k++) {
          var ang = Math.PI / 6 + (k * Math.PI) / 3;
          var px = x + Math.cos(ang) * r;
          var py = y + Math.sin(ang) * r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawStrobeRing(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    var punch = v.punch || 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 10, 0.24)";
    ctx.fillRect(0, 0, w, h);
    if (punch > 0.62) {
      ctx.fillStyle = "rgba(255,61,154," + (0.04 + punch * 0.08) + ")";
      ctx.fillRect(0, 0, w, h);
    }
    var R = Math.min(w, (h * 9) / 16) * 0.4;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = "lighter";
    var wave;
    for (wave = 0; wave < 4; wave++) {
      var life = (time * 0.55 + wave * 0.25) % 1;
      ctx.strokeStyle = "rgba(255,61,154," + (1 - life) * (0.14 + (v.energy || 0) * 0.3) + ")";
      ctx.lineWidth = 2 + (1 - life) * 6;
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.16 + life * 0.84), time + wave, time + wave + 4.1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawInkBloom(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    var bands = v.bandWeights || [];
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3, 2, 7, 0.2)";
    ctx.fillRect(0, 0, w, h);
    var cx = w * 0.5;
    var cy = h * 0.56;
    var col = Math.min(w, (h * 9) / 16);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var i;
    for (i = 0; i < 7; i++) {
      var band = bands[i] || 0;
      var side = i % 2 === 0 ? -1 : 1;
      var lift = col * (0.16 + band * 0.28 + (v.energy || 0) * 0.18);
      var mx = cx + side * col * 0.08 + Math.sin(time * 0.5 + i) * col * 0.04;
      var my = cy - lift * 0.45;
      var ex = cx + side * col * (0.06 + i * 0.02);
      var ey = cy - lift;
      var hue = (222 + i * 14 + (v.warmth || 0) * -40) % 360;
      var g = ctx.createLinearGradient(cx, cy, ex, ey);
      g.addColorStop(0, "hsla(" + hue + ", 68%, 36%, 0)");
      g.addColorStop(0.4, "hsla(" + hue + ", 78%, 48%, " + (0.08 + band * 0.24) + ")");
      g.addColorStop(1, "hsla(" + hue + ", 70%, 58%, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(mx + 10, my, ex, ey);
      ctx.quadraticCurveTo(mx - 8, my, cx, cy);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawPlasmaVeil(dc) {
    var ctx = dc.ctx;
    var w = dc.width;
    var h = dc.height;
    var v = dc.visual || {};
    var time = dc.time || 0;
    var bands = v.bandWeights || [];
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(2, 5, 10, 0.22)";
    ctx.fillRect(0, 0, w, h);
    var col = Math.min(w, (h * 9) / 16);
    var x0 = (w - col) * 0.5;
    var x1 = x0 + col;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var i;
    for (i = 0; i < 6; i++) {
      var band = bands[i] || 0;
      var y = h * (0.22 + i * 0.1);
      var amp = col * (0.04 + band * 0.07);
      var phase = time * 0.6 + i * 0.9;
      var cpx = w * 0.5 + Math.sin(phase) * col * 0.12;
      var hue = (168 + i * 21 + (v.warmth || 0) * 40) % 360;
      var g = ctx.createLinearGradient(x0, y, x1, y + amp);
      g.addColorStop(0, "hsla(" + hue + ", 80%, 55%, 0)");
      g.addColorStop(0.45, "hsla(" + hue + ", 85%, 56%, " + (0.08 + band * 0.24) + ")");
      g.addColorStop(1, "hsla(" + hue + ", 70%, 50%, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo(cpx, y - 12 - amp, x1, y);
      ctx.lineTo(x1, y + 12);
      ctx.quadraticCurveTo(cpx, y + 12 + amp, x0, y + 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  extras["yt-chat"] = drawYtChat;
  extras.constellation = drawConstellation;
  extras.radar = drawRadar;
  extras["type-rain"] = drawTypeRain;
  extras["kick-chevrons"] = drawKickChevrons;
  extras["shard-spin"] = drawShardSpin;
  extras["hex-pulse"] = drawHexPulse;
  extras["strobe-ring"] = drawStrobeRing;
  extras["ink-bloom"] = drawInkBloom;
  extras["plasma-veil"] = drawPlasmaVeil;

  function pullNotes() {
    var app = root && root.MainFloorApp;
    var notes = [];
    if (app && app.state) {
      if (app.state.activity) notes.push(app.state.activity);
      var crate = app.state.crate && app.state.crate.items;
      if (crate) {
        crate.slice(0, 4).forEach(function (it) {
          if (it && it.meta && it.meta.trackName) notes.push(it.meta.trackName);
        });
      }
    }
    if (notes.length) chatNotes = notes;
  }

  function installDraws() {
    var G = root && root.MainFloorGhost;
    if (!G) return false;
    Object.keys(extras).forEach(function (id) {
      if (G.registerMode) G.registerMode(id, extras[id]);
      else if (G.MODES && G.MODES.indexOf(id) === -1) G.MODES.push(id);
    });
    if (!G.registerMode && !G.__extrasWrapped) {
      var origMode = G.drawMode && G.drawMode.bind(G);
      var origT = G.drawTransition && G.drawTransition.bind(G);
      G.drawMode = function (id, dc) {
        if (extras[id]) extras[id](dc);
        else if (origMode) origMode(id, dc);
      };
      G.drawTransition = function (fromId, toId, t, dc) {
        if (!extras[fromId] && !extras[toId] && origT) return origT(fromId, toId, t, dc);
        var amt = clamp(Number(t) || 0, 0, 1);
        var draw = function (id) {
          if (extras[id]) extras[id](dc);
          else if (origMode) origMode(id, dc);
        };
        if (amt <= 0) {
          draw(fromId);
          return amt;
        }
        if (amt >= 1 || !fromId) {
          draw(toId);
          return amt;
        }
        draw(fromId);
        if (dc && dc.ctx && dc.ctx.save) {
          dc.ctx.save();
          dc.ctx.globalAlpha = amt * amt * (3 - 2 * amt);
          draw(toId);
          dc.ctx.restore();
        }
        return amt;
      };
      G.__extrasWrapped = true;
    }
    return true;
  }

  function startSync() {
    if (!root || typeof document === "undefined") return;
    pullNotes();
    syncChatLayer(document);
    if (root.requestAnimationFrame) {
      var frames = 0;
      var loop = function () {
        frames += 1;
        if (frames % 20 === 0) {
          pullNotes();
          syncChatLayer(document);
        }
        root.requestAnimationFrame(loop);
      };
      root.requestAnimationFrame(loop);
    } else if (root.setInterval) {
      root.setInterval(function () {
        pullNotes();
        syncChatLayer(document);
      }, 400);
    }
  }

  function install() {
    if (!installDraws()) return false;
    startSync();
    return true;
  }

  if (root && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  }

  return {
    DEFAULT_VIDEO: DEFAULT_VIDEO,
    resolveVideoId: resolveVideoId,
    chatEmbedUrl: chatEmbedUrl,
    extras: extras,
    install: install,
    drawYtChat: drawYtChat,
    drawConstellation: drawConstellation,
    drawRadar: drawRadar,
    drawTypeRain: drawTypeRain,
    drawKickChevrons: drawKickChevrons,
    drawShardSpin: drawShardSpin,
    drawHexPulse: drawHexPulse,
    drawStrobeRing: drawStrobeRing,
    drawInkBloom: drawInkBloom,
    drawPlasmaVeil: drawPlasmaVeil,
  };
});
