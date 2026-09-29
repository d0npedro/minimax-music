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

test("metaFromFileName and pickExistingTracks recover disk crate entries", () => {
  const meta = tracks.metaFromFileName("20260817-141737_warehouse-drive_148bpm.mp3");
  assert.equal(meta.bpm, 148);
  assert.match(meta.trackName, /warehouse drive/i);
  assert.equal(tracks.trackAudioUrl(meta.file), "/tracks/" + encodeURIComponent("20260817-141737_warehouse-drive_148bpm.mp3"));
  const picked = tracks.pickExistingTracks([
    { file: "b_156bpm.mp3", mtime: "2026-08-17T12:00:00.000Z" },
    { file: "notes.txt", mtime: "2026-08-17T13:00:00.000Z" },
    { file: "a_148bpm.mp3", mtime: "2026-08-16T12:00:00.000Z" },
  ]);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].file, "a_148bpm.mp3");
  assert.equal(picked[1].file, "b_156bpm.mp3");
  const queued = tracks.queueExistingFirst([
    { file: "20260817-141737_smoke-copy_148bpm.mp3", mtime: "2026-08-17T14:17:00.000Z" },
    { file: "old_148bpm.mp3", mtime: "2026-08-17T12:00:00.000Z" },
    { file: "new_156bpm.mp3", mtime: "2026-08-17T20:00:00.000Z" },
  ]);
  assert.equal(queued.length, 2);
  assert.equal(queued[0].file, "new_156bpm.mp3");
  assert.equal(queued[1].file, "old_148bpm.mp3");
  assert.equal(tracks.isGenericName("Peak Schranz 150bpm"), true);
  assert.equal(tracks.isGenericName("warehouse-drive"), true);
  assert.equal(tracks.isGenericName("Iron Halo"), false);
  const one = tracks.displayNameFromFile("20260817-204424_peak-schranz_146bpm.mp3");
  const two = tracks.displayNameFromFile("20260817-183606_peak-schranz_154bpm.mp3");
  assert.doesNotMatch(one, /peak schranz|bpm/i);
  assert.doesNotMatch(two, /peak schranz|bpm/i);
  assert.notEqual(one, two);
  const unused = tracks.unusedExisting(
    [
      { file: "keep_148bpm.mp3", mtime: "2026-08-17T20:00:00.000Z" },
      { file: "used_148bpm.mp3", mtime: "2026-08-17T21:00:00.000Z" },
    ],
    ["used_148bpm.mp3"],
    4
  );
  assert.equal(unused.length, 1);
  assert.equal(unused[0].file, "keep_148bpm.mp3");
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

test("GET /tracks/:file serves a project track and rejects path escape", () => {
  const http = require("http");
  const fs = require("fs");
  const path = require("path");
  const serve = require("../dj/serve.js");
  const name = "unit-serve-probe.mp3";
  const dest = path.join(serve.TRACKS_DIR, name);
  fs.writeFileSync(dest, Buffer.from("ID3serve"));
  return new Promise(function (resolve, reject) {
    const server = serve.server.listen(0, "127.0.0.1", function () {
      const port = server.address().port;
      http
        .get("http://127.0.0.1:" + port + "/tracks/" + name, function (res) {
          const chunks = [];
          res.on("data", function (c) {
            chunks.push(c);
          });
          res.on("end", function () {
            try {
              assert.equal(res.statusCode, 200);
              assert.equal(Buffer.concat(chunks).toString(), "ID3serve");
              http
                .get("http://127.0.0.1:" + port + "/tracks/../package.json", function (bad) {
                  bad.resume();
                  try {
                    assert.equal(bad.statusCode, 404);
                  } catch (e) {
                    server.close();
                    fs.unlinkSync(dest);
                    reject(e);
                    return;
                  }
                  server.close();
                  fs.unlinkSync(dest);
                  resolve();
                })
                .on("error", function (err) {
                  server.close();
                  fs.unlinkSync(dest);
                  reject(err);
                });
            } catch (e) {
              server.close();
              try {
                fs.unlinkSync(dest);
              } catch (e2) {
                /* ignore */
              }
              reject(e);
            }
          });
        })
        .on("error", function (err) {
          server.close();
          try {
            fs.unlinkSync(dest);
          } catch (e2) {
            /* ignore */
          }
          reject(err);
        });
    });
  });
});
