const { test } = require("node:test");
const assert = require("node:assert/strict");
const ghost = require("../dj/js/ghost-modes.js");
const echo = require("../dj/js/echo-mapping.js");

function recordingContext(w, h) {
  const calls = [];
  function rec(name) {
    return function () {
      const args = Array.prototype.slice.call(arguments);
      calls.push({ name: name, args: args });
    };
  }
  const grad = {
    addColorStop: rec("addColorStop"),
  };
  return {
    canvas: { width: w, height: h },
    calls: calls,
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    fillRect: rec("fillRect"),
    strokeRect: rec("strokeRect"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    arc: rec("arc"),
    fill: rec("fill"),
    stroke: rec("stroke"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    save: rec("save"),
    restore: rec("restore"),
    clip: rec("clip"),
    rotate: rec("rotate"),
    scale: rec("scale"),
    translate: rec("translate"),
    createRadialGradient: function () {
      calls.push({ name: "createRadialGradient", args: Array.prototype.slice.call(arguments) });
      return grad;
    },
    createLinearGradient: function () {
      calls.push({ name: "createLinearGradient", args: Array.prototype.slice.call(arguments) });
      return grad;
    },
    quadraticCurveTo: rec("quadraticCurveTo"),
    bezierCurveTo: rec("bezierCurveTo"),
    drawImage: rec("drawImage"),
  };
}

function names(ctx) {
  return ctx.calls.map(function (c) {
    return c.name;
  });
}

function count(ctx, name) {
  return ctx.calls.filter(function (c) {
    return c.name === name;
  }).length;
}

function signature(ctx) {
  return {
    fillRect: count(ctx, "fillRect"),
    arc: count(ctx, "arc"),
    clip: count(ctx, "clip"),
    rotate: count(ctx, "rotate"),
    scale: count(ctx, "scale"),
    createRadialGradient: count(ctx, "createRadialGradient"),
    translate: count(ctx, "translate"),
    lineTo: count(ctx, "lineTo"),
  };
}

function sampleVisual() {
  return echo.mapFrameToVisual(
    {
      t: 1.2,
      rms: 0.7,
      peak: 0.8,
      bands: { sub: 0.6, bass: 0.7, lowMid: 0.5, mid: 0.4, highMid: 0.45, presence: 0.5, air: 0.35 },
      spectralFlux: 0.4,
      zcr: 0.1,
      onsetStrength: 0.85,
    },
    { tension: 0.55, sectionLabel: "drop", punch: 0.8 }
  );
}

test("Organic / Kaleidoscope / Fluid issue distinct paint patterns on the same VisualState", () => {
  const v = sampleVisual();
  ghost.resetAll();
  const organic = recordingContext(320, 180);
  ghost.drawOrganic({ ctx: organic, width: 320, height: 180, visual: v, time: 1.2 });
  ghost.resetAll();
  const kale = recordingContext(320, 180);
  ghost.drawKaleidoscope({ ctx: kale, width: 320, height: 180, visual: v, time: 1.2 });
  ghost.resetAll();
  const fluid = recordingContext(320, 180);
  ghost.drawFluid({ ctx: fluid, width: 320, height: 180, visual: v, time: 1.2 });

  const so = signature(organic);
  const sk = signature(kale);
  const sf = signature(fluid);

  assert.ok(so.createRadialGradient >= 7, "Organic should paint soft radial blobs");
  assert.ok(so.arc >= 7, "Organic should stroke/fill blob contours");
  assert.equal(so.clip, 0, "Organic must not clip radial sectors");
  const organicBarRects = organic.calls.filter(function (c) {
    if (c.name !== "fillRect") return false;
    const w = c.args[2];
    const h = c.args[3];
    return w < 300 && h < 160;
  });
  assert.equal(organicBarRects.length, 0, "Organic must not paint hard bar rectangles");

  assert.ok(sk.clip >= 4, "Kaleidoscope should clip N-fold sectors");
  assert.ok(sk.rotate >= 2, "Kaleidoscope should rotate sectors");
  assert.ok(sk.scale >= 1, "Kaleidoscope should mirror alternate sectors");
  assert.ok(sk.translate >= 1);

  assert.ok(sf.fillRect > 100, "Fluid should paint a height-field of cells, got " + sf.fillRect);
  assert.equal(sf.clip, 0, "Fluid is a height field, not clipped wedges");
  assert.ok(sf.fillRect > so.fillRect * 10, "Fluid cell field vs Organic fade");

  assert.notDeepEqual(so, sk, "Organic and Kaleidoscope signatures must differ");
  assert.notDeepEqual(sk, sf, "Kaleidoscope and Fluid signatures must differ");
  assert.notDeepEqual(so, sf, "Organic and Fluid signatures must differ");

  const jo = names(organic).join(",");
  const jk = names(kale).join(",");
  const jf = names(fluid).join(",");
  assert.notEqual(jo, jk);
  assert.notEqual(jk, jf);
});

test("drawMode dispatches each shipped identity from a cold reset", () => {
  const v = sampleVisual();
  ghost.MODES.forEach(function (mode) {
    ghost.resetMode(mode);
    const ctx = recordingContext(160, 90);
    ghost.drawMode(mode, { ctx: ctx, width: 160, height: 90, visual: v, time: 0.4 });
    assert.ok(ctx.calls.length > 3, mode + " produced no paint calls");
  });
});

test("orbit lattice aurora stay distinct from each other and the original three", () => {
  const v = sampleVisual();
  function sig(mode, draw) {
    ghost.resetAll();
    const ctx = recordingContext(240, 140);
    draw({ ctx: ctx, width: 240, height: 140, visual: v, time: 1 });
    return signature(ctx);
  }
  const orbit = sig("orbit", ghost.drawOrbit);
  const lattice = sig("lattice", ghost.drawLattice);
  const aurora = sig("aurora", ghost.drawAurora);
  assert.ok(orbit.arc >= 10, "Orbit should stroke rings and satellites");
  assert.equal(orbit.clip, 0, "Orbit must not clip kaleidoscope wedges");
  assert.ok(lattice.lineTo >= 16, "Lattice should draw a converging grid");
  assert.equal(lattice.clip, 0);
  ghost.resetAll();
  const auroraCtx = recordingContext(240, 140);
  ghost.drawAurora({ ctx: auroraCtx, width: 240, height: 140, visual: v, time: 1 });
  assert.ok(count(auroraCtx, "createLinearGradient") >= 4, "Aurora should wash vertical ribbons");
  assert.ok(count(auroraCtx, "quadraticCurveTo") >= 4, "Aurora ribbons should curve");
  assert.notDeepEqual(orbit, lattice);
  assert.notDeepEqual(lattice, aurora);
  assert.notDeepEqual(orbit, aurora);
});

test("rotation walks the roster and fade policy is monotonic", () => {
  assert.deepEqual(ghost.MODES, ["organic", "orbit", "kaleidoscope", "lattice", "fluid", "aurora"]);
  assert.equal(ghost.nextInRotation("organic"), "orbit");
  assert.equal(ghost.nextInRotation("aurora"), "organic");
  assert.equal(ghost.fadeAmount(0), 0);
  assert.ok(ghost.fadeAmount(ghost.FADE_MS / 2) > 0.4 && ghost.fadeAmount(ghost.FADE_MS / 2) < 0.6);
  assert.equal(ghost.fadeAmount(ghost.FADE_MS), 1);
  assert.equal(ghost.shouldAdvanceRotation(ghost.HOLD_MS - 1), false);
  assert.equal(ghost.shouldAdvanceRotation(ghost.HOLD_MS), true);
  const v = sampleVisual();
  const ctx = recordingContext(80, 45);
  assert.equal(ghost.drawTransition("organic", "orbit", 0.4, { ctx: ctx, width: 80, height: 45, visual: v, time: 1 }), 0.4);
});

test("registerMode adds a live feature identity to the rotation", () => {
  const v = sampleVisual();
  const drawn = [];
  const modes = ghost.registerMode("comet", function (dc) {
    drawn.push(dc.width);
    dc.ctx.fillRect(0, 0, 2, 2);
  });
  assert.ok(modes.indexOf("comet") !== -1);
  const ctx = recordingContext(40, 20);
  ghost.drawMode("comet", { ctx: ctx, width: 40, height: 20, visual: v, time: 0 });
  assert.deepEqual(drawn, [40]);
  var idx = ghost.MODES.indexOf("comet");
  if (idx !== -1) ghost.MODES.splice(idx, 1);
});

test("pickRandomMode leaves the current mode and stays in the roster", () => {
  const a = ghost.pickRandomMode("organic", 0);
  const b = ghost.pickRandomMode("organic", 0.99);
  assert.notEqual(a, "organic");
  assert.notEqual(b, "organic");
  assert.ok(ghost.MODES.indexOf(a) !== -1);
  assert.ok(ghost.MODES.indexOf(b) !== -1);
  assert.equal(ghost.pickRandomMode("kaleidoscope", 0) !== "kaleidoscope", true);
});
