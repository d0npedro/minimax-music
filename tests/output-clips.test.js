const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const clips = require("../dj/js/features/output-clips.js");
const serve = require("../dj/serve.js");

test("clip urls stay inside /clips and lists ignore junk names", () => {
  assert.equal(clips.clipUrl("0042.mp4"), "/clips/" + encodeURIComponent("0042.mp4"));
  assert.equal(clips.clipUrl("H:\\\\Downloads\\\\output\\\\0001.mp4"), "/clips/0001.mp4");
  const list = clips.parseClipList({
    files: ["0001.mp4", { file: "0100.mp4" }, "notes.txt", "readme.md"],
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].file, "0001.mp4");
  assert.equal(list[1].file, "0100.mp4");
});

test("DJI videos join the reel and stills are dropped", () => {
  const list = clips.parseClipList({
    files: [
      { file: "0001.mp4", source: "output", kind: "video" },
      { file: "Eifel/GOPR0001.MP4", source: "pedda", kind: "video" },
      { file: "DJI_0034.MP4", source: "dji", kind: "video" },
      { file: "dji_fly_shot.jpg", source: "dji", kind: "image" },
    ],
  });
  assert.equal(list.length, 3);
  assert.ok(list.every(function (row) { return row.kind === "video"; }));
  const used = {};
  const picked = [clips.pickNextClip(list, used), clips.pickNextClip(list, used), clips.pickNextClip(list, used)];
  const sources = picked.map(function (row) { return clips.clipSource(row); }).sort();
  assert.deepEqual(sources, ["dji", "output", "pedda"]);
  assert.ok(picked.some(function (row) { return /Eifel/.test(clips.clipUrl(row)); }));
  assert.equal(clips.HOLD_SEC, 4.5);
  assert.equal(clips.PLAYBACK_RATE, 1);
  assert.equal(clips.isStalled(10, 0, 2000, 10, 1800), true);
  assert.equal(clips.isStalled(10, 0, 2000, 10.4, 1800), false);
  assert.equal(clips.isStalled(10, 0, 500, 10, 1800), false);
});

test("coverRect fills 16:9 from a 4K source without letterbox", () => {
  const box = clips.coverRect(3840, 2160, 1280, 720);
  assert.equal(box.x, 0);
  assert.equal(box.y, 0);
  assert.equal(box.w, 1280);
  assert.equal(box.h, 720);
});

test("pickNextClip walks unused files then recycles", () => {
  const files = clips.parseClipList(["a.mp4", "b.mp4", "c.mp4"]);
  const used = {};
  const first = clips.clipName(clips.pickNextClip(files, used));
  const second = clips.clipName(clips.pickNextClip(files, used));
  const third = clips.clipName(clips.pickNextClip(files, used));
  assert.equal(new Set([first, second, third]).size, 3);
  const fourth = clips.clipName(clips.pickNextClip(files, used));
  assert.ok(["a.mp4", "b.mp4", "c.mp4"].indexOf(fourth) !== -1);
});

test("rotation skips the reel identity so clips stay under the other looks", () => {
  assert.equal(clips.OVERLAY_BLEND, "screen");
  assert.equal(clips.nextNonReel("organic", function () { return "reel"; }), "organic");
  assert.equal(
    clips.nextNonReel("reel", function (cur) {
      return cur === "reel" ? "embers" : "organic";
    }),
    "embers"
  );
});

test("reel plus four canvas identities register as draw functions", () => {
  assert.equal(typeof clips.drawReel, "function");
  clips.EXTRA_MODES.forEach(function (id) {
    assert.equal(typeof clips.extras[id], "function", id);
  });
  const ctx = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    fillRect: function () {},
    beginPath: function () {},
    arc: function () {},
    fill: function () {},
    stroke: function () {},
    moveTo: function () {},
    lineTo: function () {},
    save: function () {},
    restore: function () {},
    createRadialGradient: function () {
      return { addColorStop: function () {} };
    },
  };
  clips.drawEmbers({ ctx: ctx, width: 1280, height: 720, visual: { bandWeights: [0.5] }, time: 1 });
});

test("clip folder is readable and /clips helpers see numbered mp4s", () => {
  assert.ok(serve.CLIPS_DIR);
  if (!fs.existsSync(serve.CLIPS_DIR)) return;
  const names = serve.listClipFiles();
  assert.ok(names.length > 100, "expected a large output reel, got " + names.length);
  assert.match(names[0], /\.mp4$/i);
});

test("current mix reel prefers Schranz Set Material when present", () => {
  assert.ok(serve.SET_MATERIAL_DIR);
  const media = serve.listMediaFiles();
  assert.ok(media.every(function (row) { return row.kind === "video"; }));
  if (!fs.existsSync(serve.SET_MATERIAL_DIR)) return;
  const setClips = media.filter(function (row) { return row.source === "set"; });
  assert.ok(setClips.length >= 100, "expected Schranz Set Material reel, got " + setClips.length);
  assert.ok(setClips.some(function (row) { return row.file.indexOf("clips/") === 0; }));
  assert.ok(setClips.some(function (row) { return /zeitraffer\//i.test(row.file); }));
  assert.ok(serve.resolveClipFile(setClips[0].file));
  const zeit = setClips.find(function (row) { return /zeitraffer\//i.test(row.file); });
  if (zeit) assert.ok(serve.resolveClipFile(zeit.file));
});
