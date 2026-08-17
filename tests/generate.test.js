const { test } = require("node:test");
const assert = require("node:assert/strict");
const gen = require("../dj/js/generate.js");

const SMOKE_UNET = "minimax_music3_dit_int8_convrot.safetensors";
const SMOKE_CLIP = "minimax_music3_text_encoder_pruned_int8_convrot.safetensors";
const SMOKE_VAE = "minimax_music3_dav.safetensors";

function assertModels(payload) {
  assert.equal(payload["6"].inputs.unet_name, SMOKE_UNET);
  assert.equal(payload["3"].inputs.clip_name, SMOKE_CLIP);
  assert.equal(payload["3"].inputs.type, "minimax");
  assert.equal(payload["7"].inputs.vae_name, SMOKE_VAE);
}

test("each named preset builds caption/lyrics/duration and smoke-workflow model names", () => {
  const expected = {
    "Warehouse Drive": { bpm: 148, energy: "drive" },
    "Peak Schranz": { bpm: 154, energy: "schranz peak" },
    "Last 20 Minutes": { bpm: 156, energy: "last beat" },
  };
  for (const [name, meta] of Object.entries(expected)) {
    const req = gen.buildFromPreset(name, { seed: 7 });
    const payload = gen.buildComfyPrompt(req);
    assertModels(payload);
    const caption = payload["13"].inputs.caption;
    const lyrics = payload["13"].inputs.lyrics;
    assert.match(caption, new RegExp(String(meta.bpm) + " BPM"));
    assert.match(caption, new RegExp(meta.energy));
    assert.match(caption, /Instrumental only/);
    assert.doesNotMatch(caption, /\[Vocals:/);
    assert.doesNotMatch(caption, /Spoken or shouted/);
    assert.equal(typeof lyrics, "string");
    assert.ok(lyrics.length > 10);
    assert.doesNotMatch(lyrics, /Kick online|Systems online|Distortion armed|Spoken/i);
    assert.match(lyrics, /\[Intro\]|\[Instrumental\]/);
    assert.equal(payload["13"].inputs.max_duration, req.maxDuration);
    assert.ok(req.maxDuration > 0);
    assert.equal(req.preset, name);
  }
});

test("free prompt payload still names MiniMax Music 3 models", () => {
  const req = gen.buildFromPrompt("dark warehouse schranz, spoken vocals", {
    arc: "drive",
    bpm: 152,
    seed: 1,
  });
  const payload = gen.buildComfyPrompt(req);
  assertModels(payload);
  assert.match(payload["13"].inputs.caption, /152 BPM/);
  assert.match(payload["13"].inputs.caption, /dark warehouse schranz/);
});

test("Match-playing-deck copies BPM ±2 and energy into caption + payload", () => {
  const playing = { id: "a", playing: true, bpm: 150, energy: "drive" };
  const req = gen.matchPlayingDeck(playing, { arc: "schranz peak", seed: 3 });
  const payload = gen.buildComfyPrompt(req);
  assertModels(payload);
  const caption = payload["13"].inputs.caption;
  assert.match(caption, /148-152 BPM/);
  assert.match(caption, /drive/);
  assert.match(caption, /schranz peak/);
  assert.equal(req.bpm, 150);
  assert.equal(req.bpmMin, 148);
  assert.equal(req.bpmMax, 152);
  assert.equal(req.mode, "match");
});

test("energy-arc position changes the built caption for preset and match", () => {
  const kick = gen.buildFromPreset("Peak Schranz", { arc: "first kick", seed: 1 });
  const last = gen.buildFromPreset("Peak Schranz", { arc: "last beat", seed: 1 });
  assert.notEqual(kick.caption, last.caption);
  assert.match(kick.caption, /first kick/);
  assert.match(last.caption, /last beat/);
  assert.match(kick.caption, /154 BPM/);
  assert.match(last.caption, /154 BPM/);

  const playing = { bpm: 146, energy: "drive" };
  const m0 = gen.matchPlayingDeck(playing, { arc: "first kick", seed: 2 });
  const m1 = gen.matchPlayingDeck(playing, { arc: "drive", seed: 2 });
  assert.notEqual(m0.caption, m1.caption);
  assert.match(m0.caption, /first kick/);
  assert.match(m1.caption, /Main-floor journey stage: drive/);
});
