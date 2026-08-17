const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "dj", "js");

test("pure scripts attach window globals without Node module/require", () => {
  const window = {};
  const sandbox = {
    window: window,
    globalThis: window,
    console: console,
  };
  for (const file of ["mixer.js", "deck.js", "generate.js", "readiness.js", "tracks.js", "one-press.js", "endless.js", "crate.js", "audio-engine.js", "comfy-client.js", "stage.js", "app.js"]) {
    const code = fs.readFileSync(path.join(JS, file), "utf8");
    vm.runInNewContext(code, sandbox, { filename: file });
  }
  assert.equal(typeof sandbox.module, "undefined");
  assert.equal(typeof sandbox.require, "undefined");
  assert.equal(typeof window.MainFloorMixer.channelGains, "function");
  assert.equal(typeof window.MainFloorDeck.syncTo, "function");
  assert.equal(typeof window.MainFloorGenerate.buildComfyPrompt, "function");
  assert.equal(typeof window.MainFloorReadiness.checkModels, "function");
  assert.equal(window.MainFloorReadiness.systemStatsUrl(), "/comfy/system_stats");
  assert.equal(typeof window.MainFloorOnePress.startMagic, "function");
  assert.equal(typeof window.MainFloorEndless.shouldStartMix, "function");
  assert.equal(typeof window.MainFloorCrate.createCrate, "function");
  assert.equal(typeof window.MainFloorApp.pressMagic, "function");
  assert.equal(typeof window.MainFloorApp.startEndless, "function");
  assert.equal(typeof window.MainFloorApp.applyPreset, "function");
  assert.equal(typeof window.MainFloorApp.applyStageFixture, "function");
  assert.equal(typeof window.MainFloorStage.buildStage, "function");
  assert.equal(typeof window.MainFloorStage.render, "function");
  const staged = window.MainFloorStage.buildStage({
    session: {
      decks: {
        a: { loaded: true, playing: true, trackName: "Warehouse Drive", artist: "Main Floor", position: 60, duration: 120 },
        b: { loaded: true, trackName: "Peak Schranz", artist: "Unit", position: 0, duration: 120 },
      },
    },
    crate: { items: [{ meta: { trackName: "Last 20 Minutes", artist: "Close" }, peaks: [0.2, 0.4] }] },
    endless: { liveId: "a", nextId: "b", mixing: false },
    mixProgress: 0,
    peaks: { a: [0.5, 0.4], b: [0.3] },
  });
  assert.equal(staged.nowPlaying.title, "Warehouse Drive");
  assert.equal(staged.nowPlaying.artist, "Main Floor");
  assert.equal(staged.capture.width / staged.capture.height, 16 / 9);
  assert.equal(typeof window.MainFloorAudio.createAudioEngine, "function");
  assert.equal(typeof window.MainFloorComfy.createClient, "function");
  const g = window.MainFloorMixer.channelGains(
    { id: "a", volume: 1, eq: { low: 0.5, mid: 0.5, high: 0.5 }, filter: 0.5 },
    0
  );
  assert.equal(g.low, 1);
  const req = window.MainFloorGenerate.buildFromPreset("Warehouse Drive", { seed: 1 });
  assert.match(req.caption, /148 BPM/);
});
