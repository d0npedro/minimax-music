const { test } = require("node:test");
const assert = require("node:assert/strict");
const tracks = require("../dj/js/tracks.js");

test("trackFileName is a safe project-folder mp3 name with label and bpm", () => {
  const name = tracks.trackFileName({
    label: "Warehouse Drive 148bpm",
    bpm: 148,
    ext: "mp3",
    when: Date.UTC(2026, 7, 17, 12, 4, 5),
  });
  assert.match(name, /\.mp3$/);
  assert.match(name, /warehouse-drive/);
  assert.match(name, /148bpm/);
  assert.doesNotMatch(name, /[\\/:*?"<>|]/);
  assert.doesNotMatch(name, /\s/);
});

test("saveTrackBuffer writes into the project tracks folder", () => {
  const fs = require("fs");
  const path = require("path");
  const serve = require("../dj/serve.js");
  const buf = Buffer.from("ID3fake-mp3");
  const saved = serve.saveTrackBuffer(buf, {
    label: "unit-save",
    bpm: 150,
    ext: "mp3",
    when: Date.UTC(2026, 7, 17, 14, 0, 0),
  });
  assert.ok(saved.path.indexOf(path.join("minimax-music", "tracks")) !== -1 || saved.path.indexOf("minimax-music\\tracks") !== -1 || /tracks/.test(saved.path));
  assert.equal(fs.existsSync(saved.path), true);
  assert.equal(fs.readFileSync(saved.path).length, buf.length);
  fs.unlinkSync(saved.path);
});
