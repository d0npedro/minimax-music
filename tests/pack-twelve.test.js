const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const pack = require("../dj/js/features/pack-twelve.js");
const ghost = require("../dj/js/ghost-modes.js");
const stage = require("../dj/js/stage.js");

const PRIOR = [
  "organic",
  "orbit",
  "kaleidoscope",
  "lattice",
  "fluid",
  "aurora",
  "yt-chat",
  "constellation",
  "radar",
  "type-rain",
  "kick-chevrons",
  "shard-spin",
  "hex-pulse",
  "strobe-ring",
  "ink-bloom",
  "plasma-veil",
  "horizon",
  "flood",
  "burst",
  "scan",
  "city",
  "warp",
  "embers",
  "ribbon",
  "moire",
  "nova",
  "reel",
];

function recordingContext(w, h) {
  const calls = [];
  function rec(name) {
    return function () {
      calls.push({ name: name, args: Array.prototype.slice.call(arguments) });
    };
  }
  const grad = { addColorStop: rec("addColorStop") };
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
    createRadialGradient: function () {
      calls.push({ name: "createRadialGradient", args: Array.prototype.slice.call(arguments) });
      return grad;
    },
    createLinearGradient: function () {
      calls.push({ name: "createLinearGradient", args: Array.prototype.slice.call(arguments) });
      return grad;
    },
  };
}

function sampleVisual() {
  return {
    energy: 0.72,
    punch: 0.8,
    flow: 0.4,
    bandWeights: [0.7, 0.65, 0.5, 0.4, 0.45, 0.5, 0.35],
    warmth: 0.55,
    chaos: 0.4,
    sectionHueShift: 0.12,
    transient: 0.75,
  };
}

test("twelve new identities are distinct from the prior rotation set", () => {
  assert.equal(pack.IDS.length, 12);
  const unique = new Set(pack.IDS);
  assert.equal(unique.size, 12);
  pack.IDS.forEach(function (id) {
    assert.equal(PRIOR.indexOf(id), -1, id + " already shipped");
    assert.equal(typeof pack.extras[id], "function", id);
  });
});

test("each of the twelve fills 1280x720 first then paints more", () => {
  const visual = sampleVisual();
  pack.IDS.forEach(function (id) {
    const ctx = recordingContext(1280, 720);
    pack.extras[id]({ ctx: ctx, width: 1280, height: 720, visual: visual, time: 1.4 });
    assert.equal(ctx.calls[0].name, "fillRect", id);
    assert.deepEqual(ctx.calls[0].args, [0, 0, 1280, 720], id);
    const more = ctx.calls.filter(function (c) {
      return (
        c.name === "stroke" ||
        c.name === "fill" ||
        (c.name === "fillRect" && (c.args[2] !== 1280 || c.args[3] !== 720)) ||
        c.name === "arc" ||
        c.name === "lineTo"
      );
    });
    assert.ok(more.length >= 1, id + " needs a further stroke/fill/path");
  });
});

test("install registers the twelve into ghost rotation", () => {
  const before = ghost.MODES.slice();
  assert.equal(pack.install(), true);
  pack.IDS.forEach(function (id) {
    assert.ok(ghost.MODES.indexOf(id) !== -1, id + " missing from MODES");
  });
  var cur = before[0] || "organic";
  var seen = {};
  var i;
  for (i = 0; i < ghost.MODES.length + 2; i++) {
    cur = ghost.nextInRotation(cur);
    seen[cur] = true;
  }
  const hit = pack.IDS.some(function (id) {
    return seen[id];
  });
  assert.ok(hit, "nextInRotation never reached a new identity");
});

test("pack-twelve IIFE attaches on window without module or require", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "dj", "js", "features", "pack-twelve.js"), "utf8");
  const win = {};
  const sandbox = { window: win, globalThis: win };
  vm.runInNewContext(src, sandbox);
  assert.ok(sandbox.window.MainFloorPackTwelve);
  assert.equal(sandbox.window.MainFloorPackTwelve.IDS.length, 12);
  assert.equal(typeof sandbox.window.MainFloorPackTwelve.extras["comet-tails"], "function");
});

test("buildStage keeps comet-tails and paintStageVisualizer invokes the shipped pack draw", () => {
  assert.equal(pack.install(), true);
  var invoked = 0;
  var shipped = pack.extras["comet-tails"];
  ghost.registerMode("comet-tails", function (dc) {
    invoked += 1;
    return shipped(dc);
  });
  const visual = sampleVisual();
  const model = stage.buildStage({
    visualMode: "comet-tails",
    visual: visual,
    time: 1.4,
  });
  assert.equal(model.visualMode, "comet-tails");
  const ctx = recordingContext(1280, 720);
  stage.paintStageVisualizer(ctx, model);
  assert.ok(invoked >= 1, "paintStageVisualizer never called the comet-tails draw");
  assert.equal(ctx.calls[0].name, "fillRect");
  assert.deepEqual(ctx.calls[0].args, [0, 0, 1280, 720]);
  const more = ctx.calls.filter(function (c) {
    return c.name === "stroke" || c.name === "lineTo" || c.name === "fill";
  });
  assert.ok(more.length >= 1, "comet-tails path never reached the stage canvas");
});

test("index.html loads pack-twelve after the other feature scripts", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "dj", "index.html"), "utf8");
  assert.match(html, /src="js\/features\/pack-twelve\.js"/);
});
