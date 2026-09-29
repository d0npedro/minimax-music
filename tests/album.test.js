const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const album = require("../dj/js/album.js");
const serve = require("../dj/serve.js");

test("album tracks sort by leading index and keep real titles", () => {
  const rows = album.sortAlbum([
    "10. SYSTEMBRIEF WAIT.wav",
    "2. Look At Me.wav",
    "MOON HITS Albumcover.png",
    "1. Lowrider Heartbeat.wav",
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].title, "Lowrider Heartbeat");
  assert.equal(rows[1].title, "Look At Me");
  assert.equal(rows[2].index, 10);
  assert.equal(album.parseAlbumTrack("21. Der Einkaufswagen nimmt die Kurve.wav").title, "Der Einkaufswagen nimmt die Kurve");
  assert.equal(album.audioUrl("2. Look At Me.wav"), "/album/" + encodeURIComponent("2. Look At Me.wav"));
  const card = album.trackCard("1. Lowrider Heartbeat.wav", { total: 35 });
  assert.equal(card.artist, "Pedda vom Mond");
  assert.equal(album.parseAlbumTrack("01 - Phonk Lovers.wav").title, "Phonk Lovers");
  assert.equal(album.parseAlbumTrack("1_SoundCloud to the Skyline_mastering.wav").title, "SoundCloud to the Skyline");
  assert.equal(album.parseAlbumTrack("1_SoundCloud to the Skyline_mastering.wav").index, 1);
  assert.equal(card.album, "Schranz Has Returned");
  assert.equal(card.catalog, "1 / 35");
  assert.match(card.youtubeMusic, /^https:\/\/music\.youtube\.com\/search\?q=/);
  assert.match(decodeURIComponent(card.youtubeMusic), /Pedda vom Mond/);
  assert.match(decodeURIComponent(card.youtubeMusic), /Lowrider Heartbeat/);
});

test("album crate take-next prefers the lowest index even when files arrive unsorted", () => {
  const items = [
    { meta: { albumIndex: 4, trackName: "Cybernetic love" } },
    { meta: { albumIndex: 2, trackName: "Look At Me" } },
    { meta: { albumIndex: 1, trackName: "Lowrider Heartbeat" } },
    { meta: { albumIndex: 3, trackName: "Catapult to Impact" } },
  ];
  assert.equal(album.takeNextQueued(items).meta.trackName, "Lowrider Heartbeat");
  assert.equal(album.takeQueuedByIndex(items, 1), null);
  assert.equal(album.takeQueuedByIndex(items, 2).meta.trackName, "Look At Me");
  assert.equal(items.length, 2);
});

test("album session remembers played files so the crate never rewinds to track 1", () => {
  const all = album.sortAlbum(["1. A.wav", "2. B.wav", "3. C.wav", "4. D.wav"]);
  album.beginAlbumSession();
  album.markAlbumUsed("1. A.wav");
  album.markAlbumUsed("2. B.wav");
  album.markAlbumUsed("3. C.wav");
  const next = album.nextUnused(all, [], 2);
  assert.equal(next.length, 1);
  assert.equal(next[0].title, "D");
  assert.equal(next[0].index, 4);
  album.beginAlbumSession();
  const fresh = album.nextUnused(all, [], 1);
  assert.equal(fresh[0].index, 1);
});

test("nextUnused walks the album in order and skips already queued files", () => {
  album.beginAlbumSession();
  const all = album.sortAlbum(["1. A.wav", "2. B.wav", "3. C.wav"]);
  const next = album.nextUnused(all, ["1. A.wav"], 2);
  assert.equal(next.length, 2);
  assert.equal(next[0].title, "B");
  assert.equal(next[1].title, "C");
});

test("album directory is readable and starts with Schranzoesisch", () => {
  assert.ok(serve.ALBUM_DIR);
  if (!fs.existsSync(serve.ALBUM_DIR)) return;
  const names = fs.readdirSync(serve.ALBUM_DIR);
  const rows = album.sortAlbum(names);
  assert.ok(rows.length >= 18, "expected Schranz Has Returned album, got " + rows.length);
  assert.equal(rows[0].title, "Schranzoesisch");
  assert.equal(rows[0].index, 1);
  assert.equal(rows[rows.length - 1].index, rows.length);
});
