const { test } = require("node:test");
const assert = require("node:assert/strict");
const extras = require("../dj/js/features/extras.js");

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
    createConicalGradient: undefined,
  };
}

function count(ctx, name) {
  return ctx.calls.filter(function (c) {
    return c.name === name;
  }).length;
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

test("YouTube chat embed targets the live video in the 9:16 column", () => {
  assert.equal(extras.resolveVideoId({ videoId: "H7zf6h7D5H0" }), "H7zf6h7D5H0");
  assert.equal(extras.resolveVideoId({ videoId: "../bad" }), "bad");
  const url = extras.chatEmbedUrl("H7zf6h7D5H0", "127.0.0.1");
  assert.match(url, /youtube\.com\/live_chat/);
  assert.match(url, /v=H7zf6h7D5H0/);
  assert.match(url, /embed_domain=127\.0\.0\.1/);
  assert.match(url, /dark_theme=1/);
});

test("extra identities ship chat plus five more canvas modes", () => {
  assert.equal(typeof extras.drawYtChat, "function");
  assert.equal(typeof extras.drawConstellation, "function");
  assert.equal(typeof extras.drawRadar, "function");
  assert.equal(typeof extras.drawTypeRain, "function");
  assert.equal(typeof extras.drawKickChevrons, "function");
  assert.equal(typeof extras.drawShardSpin, "function");
  assert.ok(extras.extras["yt-chat"]);
  assert.ok(extras.extras.constellation);
  assert.ok(extras.extras.radar);
  assert.ok(extras.extras["type-rain"]);
  assert.ok(extras.extras["kick-chevrons"]);
  assert.ok(extras.extras["shard-spin"]);
  assert.ok(extras.extras["hex-pulse"]);
  assert.ok(extras.extras["strobe-ring"]);
  assert.ok(extras.extras["ink-bloom"]);
  assert.ok(extras.extras["plasma-veil"]);
  assert.equal(typeof extras.drawHexPulse, "function");
  assert.equal(typeof extras.drawInkBloom, "function");
});

test("fullscreen visual pack fills the whole frame", () => {
  const pack = require("../dj/js/features/fullscreen-visuals.js");
  ["horizon", "flood", "burst", "scan", "city", "warp"].forEach(function (id) {
    assert.equal(typeof pack[id], "function", id);
    const ctx = recordingContext(1280, 720);
    pack[id]({ ctx: ctx, width: 1280, height: 720, visual: sampleVisual(), time: 1 });
    assert.equal(ctx.calls[0].name, "fillRect");
    assert.deepEqual(ctx.calls[0].args, [0, 0, 1280, 720]);
  });
});

test("kick-chevrons and shard-spin are hard-techno strokes, not tunnel/kaleidoscope", () => {
  const v = sampleVisual();
  const chev = recordingContext(320, 180);
  extras.drawKickChevrons({ ctx: chev, width: 320, height: 180, visual: v, time: 1.2 });
  const shard = recordingContext(320, 180);
  extras.drawShardSpin({ ctx: shard, width: 320, height: 180, visual: v, time: 1.2 });

  assert.equal(chev.calls[0].name, "fillRect");
  assert.deepEqual(chev.calls[0].args, [0, 0, 320, 180]);
  assert.equal(shard.calls[0].name, "fillRect");
  assert.deepEqual(shard.calls[0].args, [0, 0, 320, 180]);

  ["moveTo", "lineTo", "save", "restore", "rotate", "translate", "fill", "stroke"].forEach(function (op) {
    assert.ok(count(chev, op) >= 1, "kick-chevrons should use " + op);
    assert.ok(count(shard, op) >= 1, "shard-spin should use " + op);
  });
  assert.equal(count(chev, "clip"), 0, "kick-chevrons must not clip kaleidoscope wedges");
  assert.equal(count(shard, "clip"), 0, "shard-spin must not clip kaleidoscope wedges");
  assert.equal(count(chev, "createConicalGradient"), 0);
  assert.equal(count(shard, "createConicalGradient"), 0);
  assert.equal(count(chev, "strokeRect"), 0, "no boxes/frames");
  assert.equal(count(shard, "strokeRect"), 0, "no boxes/frames");
  assert.ok(count(chev, "lineTo") >= 14, "stacked chevrons + kick bars");
  assert.ok(count(shard, "rotate") >= 8, "counter-rotating shards");
  assert.notEqual(count(chev, "rotate"), count(shard, "rotate"));
});
