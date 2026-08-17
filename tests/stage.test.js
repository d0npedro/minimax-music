const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const stage = require("../dj/js/stage.js");
const deckApi = require("../dj/js/deck.js");
const crateApi = require("../dj/js/crate.js");
const endlessApi = require("../dj/js/endless.js");

function peaks(n, amp) {
  const out = [];
  for (var i = 0; i < n; i++) out.push(amp != null ? amp : 0.2 + (i % 10) / 25);
  return out;
}

function loadDeck(deck, info) {
  deckApi.loadTrack(deck, {
    trackName: info.trackName,
    duration: info.duration,
    bpm: info.bpm,
    energy: info.energy,
  });
  if (info.artist) deck.artist = info.artist;
  if (info.position != null) deck.position = info.position;
  if (info.playing) deckApi.play(deck);
  return deck;
}

function liveSet(opts) {
  opts = opts || {};
  const session = deckApi.createSession();
  loadDeck(session.decks.a, {
    trackName: opts.liveTitle || "Warehouse Drive 148bpm",
    artist: opts.liveArtist || "Main Floor",
    duration: opts.liveDuration != null ? opts.liveDuration : 180,
    position: opts.livePosition != null ? opts.livePosition : 90,
    bpm: 148,
    playing: opts.livePlaying !== false,
  });
  loadDeck(session.decks.b, {
    trackName: opts.nextTitle || "Peak Schranz 156bpm",
    artist: opts.nextArtist || "Schranz Unit",
    duration: opts.nextDuration != null ? opts.nextDuration : 200,
    position: opts.nextPosition != null ? opts.nextPosition : 0,
    bpm: 156,
    playing: !!opts.nextPlaying,
  });
  const crate = crateApi.createCrate({ warmupSize: 4, targetSize: 5 });
  const queued = opts.queued || [
    { title: "Last 20 Minutes", artist: "Closing Crew", waveform: peaks(48, 0.4) },
    { title: "Night Shift", artist: "Acid Unit", waveform: peaks(48, 0.35) },
    { title: "Closed Eyes", artist: "Pedda", waveform: peaks(48, 0.3) },
  ];
  queued.forEach(function (q) {
    crateApi.push(crate, {
      meta: { trackName: q.title, artist: q.artist },
      peaks: q.waveform,
    });
  });
  const endless = endlessApi.createEndless();
  endless.enabled = true;
  endless.liveId = opts.liveId || "a";
  endless.nextId = opts.nextId || "b";
  endless.mixing = !!opts.mixing;
  return {
    session: session,
    crate: crate,
    endless: endless,
    mixProgress: opts.mixProgress != null ? opts.mixProgress : 0,
    peaks: {
      a: opts.peaksA || peaks(64, 0.55),
      b: opts.peaksB || peaks(64, 0.45),
    },
  };
}

function visibleTitles(view) {
  const titles = [];
  if (view.nowPlaying && view.nowPlaying.title) titles.push(view.nowPlaying.title);
  if (view.transition && view.transition.outgoing && view.transition.outgoing.title) {
    titles.push(view.transition.outgoing.title);
  }
  if (view.transition && view.transition.incoming && view.transition.incoming.title) {
    titles.push(view.transition.incoming.title);
  }
  (view.upcoming || []).forEach(function (row) {
    if (row && row.title) titles.push(row.title);
  });
  return titles;
}

test("now-playing title and artist match the live deck display fields", () => {
  const view = stage.buildStage(
    liveSet({ liveTitle: "Warehouse Drive 148bpm", liveArtist: "Main Floor", livePosition: 90, liveDuration: 180 })
  );
  assert.ok(view.nowPlaying, "now-playing slot missing");
  assert.equal(view.nowPlaying.title, "Warehouse Drive 148bpm");
  assert.equal(view.nowPlaying.artist, "Main Floor");
  assert.ok(Array.isArray(view.nowPlaying.waveform));
  assert.ok(view.nowPlaying.waveform.length > 0, "now-playing waveform payload missing");
});

test("playhead is position/duration and maps onto waveform width", () => {
  const mid = stage.buildStage(liveSet({ livePosition: 90, liveDuration: 180 }));
  assert.equal(mid.nowPlaying.playhead, 0.5);
  assert.equal(mid.nowPlaying.playheadX, 0.5 * stage.WAVEFORM_WIDTH);

  const start = stage.buildStage(liveSet({ livePosition: 0, liveDuration: 180 }));
  assert.equal(start.nowPlaying.playhead, 0);
  assert.equal(start.nowPlaying.playheadX, 0);

  const end = stage.buildStage(liveSet({ livePosition: 180, liveDuration: 180 }));
  assert.equal(end.nowPlaying.playhead, 1);
  assert.equal(end.nowPlaying.playheadX, stage.WAVEFORM_WIDTH);
});

test("upcoming list is soonest-first with decreasing visual weight", () => {
  const view = stage.buildStage(liveSet());
  assert.ok(view.upcoming.length >= 3, "expected queued rows, got " + view.upcoming.length);
  assert.equal(view.upcoming[0].title, "Peak Schranz 156bpm");
  assert.equal(view.upcoming[0].artist, "Schranz Unit");
  assert.equal(view.upcoming[1].title, "Last 20 Minutes");
  assert.equal(view.upcoming[2].title, "Night Shift");
  assert.equal(view.upcoming[3].title, "Closed Eyes");

  view.upcoming.forEach(function (row, i) {
    assert.ok(row.title, "row " + i + " missing title");
    assert.ok(Array.isArray(row.waveform) && row.waveform.length > 0, "row " + i + " missing waveform");
    assert.equal(row.depth, i);
    if (i === 0) {
      assert.equal(row.nearNext, true);
      assert.equal(row.animation, "near-next");
    } else {
      assert.equal(row.nearNext, false);
    }
    if (i > 0) {
      const prev = view.upcoming[i - 1];
      assert.ok(row.opacity < prev.opacity, "opacity not strictly decreasing at " + i);
      assert.ok(row.scale < prev.scale, "scale not strictly decreasing at " + i);
      assert.ok(row.emphasis < prev.emphasis, "emphasis not strictly decreasing at " + i);
    }
  });
  assert.equal(view.upcoming[0].emphasis, Math.max.apply(null, view.upcoming.map(function (r) { return r.emphasis; })));
});

test("mix progress 0 keeps the live track in the main slot", () => {
  const view = stage.buildStage(liveSet({ mixing: false, mixProgress: 0 }));
  assert.equal(view.nowPlaying.title, "Warehouse Drive 148bpm");
  assert.ok(!view.transition || view.transition.active !== true, "transition should be inactive at mix 0");
  const titles = visibleTitles(view);
  assert.ok(titles.indexOf("Warehouse Drive 148bpm") !== -1);
  assert.ok(titles.indexOf("Peak Schranz 156bpm") !== -1);
});

test("mid-mix outgoing leaves while incoming enters the main position", () => {
  const view = stage.buildStage(liveSet({ mixing: true, mixProgress: 0.5, nextPlaying: true }));
  assert.ok(view.transition && view.transition.active, "mid-mix must activate transition");
  assert.equal(view.transition.outgoing.title, "Warehouse Drive 148bpm");
  assert.equal(view.transition.incoming.title, "Peak Schranz 156bpm");
  assert.ok(view.transition.outgoing.leave > 0.3 && view.transition.outgoing.leave < 0.7);
  assert.ok(view.transition.incoming.enter > 0.3 && view.transition.incoming.enter < 0.7);
  assert.ok(view.transition.outgoing.translateY < 0, "outgoing should move upward");
  assert.ok(view.transition.incoming.translateY > 0, "incoming should rise from below");
  assert.ok(view.transition.outgoing.opacity < 1);
  assert.ok(view.transition.incoming.opacity > 0);
  const upTitles = view.upcoming.map(function (r) { return r.title; });
  assert.ok(upTitles.indexOf("Warehouse Drive 148bpm") === -1, "outgoing must not linger in upcoming");
  assert.ok(upTitles.indexOf("Peak Schranz 156bpm") === -1, "incoming must not be duplicated in upcoming");
});

test("mix progress 1 and post-handoff drop the outgoing track from the view", () => {
  const atEnd = stage.buildStage(liveSet({ mixing: true, mixProgress: 1, nextPlaying: true }));
  const endTitles = visibleTitles(atEnd);
  assert.equal(atEnd.nowPlaying.title, "Peak Schranz 156bpm");
  assert.ok(!atEnd.transition || atEnd.transition.active !== true, "handoff complete: no transition");
  assert.ok(endTitles.indexOf("Warehouse Drive 148bpm") === -1, "outgoing still visible at mix=1: " + endTitles.join(","));

  const session = deckApi.createSession();
  loadDeck(session.decks.b, {
    trackName: "Peak Schranz 156bpm",
    artist: "Schranz Unit",
    duration: 200,
    position: 4,
    playing: true,
  });
  deckApi.emptyDeck(session.decks.a);
  const crate = crateApi.createCrate();
  crateApi.push(crate, { meta: { trackName: "Last 20 Minutes", artist: "Closing Crew" }, peaks: peaks(24, 0.3) });
  const endless = endlessApi.createEndless();
  endless.enabled = true;
  endless.liveId = "b";
  endless.nextId = "a";
  endless.mixing = false;
  const after = stage.buildStage({
    session: session,
    crate: crate,
    endless: endless,
    mixProgress: 0,
    peaks: { a: [], b: peaks(32, 0.4) },
  });
  const afterTitles = visibleTitles(after);
  assert.equal(after.nowPlaying.title, "Peak Schranz 156bpm");
  assert.ok(afterTitles.indexOf("Warehouse Drive 148bpm") === -1);
  assert.equal(after.upcoming[0].title, "Last 20 Minutes");
});

test("capture surface is a fixed 16:9 stage", () => {
  const view = stage.buildStage(liveSet());
  assert.ok(view.capture);
  assert.equal(view.capture.width / view.capture.height, 16 / 9);
  assert.equal(view.capture.aspect, 16 / 9);
  assert.equal(stage.CAPTURE.width / stage.CAPTURE.height, 16 / 9);
});

test("artist falls back to a stable string when the track has none", () => {
  const input = liveSet({ liveArtist: null });
  delete input.session.decks.a.artist;
  const view = stage.buildStage(input);
  assert.equal(typeof view.nowPlaying.artist, "string");
  assert.ok(view.nowPlaying.artist.length > 0);
});

test("page ships a 16:9 capture stage instead of a visible two-deck booth", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "dj", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "dj", "css", "dj.css"), "utf8");
  assert.match(html, /id="stage"/);
  assert.match(html, /data-capture="16:9"/);
  assert.match(html, /data-role="now-title"/);
  assert.match(html, /data-role="now-artist"/);
  assert.match(html, /data-role="now-wave"/);
  assert.match(html, /id="upcoming-list"/);
  assert.match(html, /src="js\/stage\.js"/);
  assert.match(html, /id="booth"[^>]*hidden/);
  assert.match(css, /--stage-w:\s*1280px/);
  assert.match(css, /--stage-h:\s*720px/);
  assert.match(css, /\.booth\[hidden\]/);
});
