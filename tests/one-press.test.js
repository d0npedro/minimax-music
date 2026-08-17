const { test } = require("node:test");
const assert = require("node:assert/strict");
const generate = require("../dj/js/generate.js");
const readiness = require("../dj/js/readiness.js");
const deck = require("../dj/js/deck.js");
const one = require("../dj/js/one-press.js");

test("one-press from default session builds MiniMax /prompt on same-origin path", () => {
  const session = deck.createSession();
  const pack = one.startMagic({ generate: generate, readiness: readiness, deck: deck }, {
    arc: "first kick",
    seed: 7,
    decks: session.decks,
  });
  assert.equal(pack.method, "POST");
  assert.equal(pack.url, "/comfy/prompt");
  assert.ok(!/127\.0\.0\.1:8188/.test(pack.url));
  assert.equal(pack.target, "a");
  assert.equal(pack.status, "queued");
  const prompt = pack.body.prompt;
  assert.equal(prompt["6"].inputs.unet_name, "minimax_music3_dit_int8_convrot.safetensors");
  assert.equal(prompt["3"].inputs.clip_name, "minimax_music3_text_encoder_pruned_int8_convrot.safetensors");
  assert.equal(prompt["7"].inputs.vae_name, "minimax_music3_dav.safetensors");
  assert.ok(prompt["13"].inputs.caption.length > 20);
  assert.ok(prompt["13"].inputs.lyrics.length > 10);
  assert.match(pack.statusText, /queued/);
});

test("one-press does not require a prior preset; default is Warehouse Drive", () => {
  const pack = one.startMagic({ generate: generate, readiness: readiness }, {});
  assert.equal(pack.preset, "Warehouse Drive");
  assert.equal(pack.request.preset, "Warehouse Drive");
  assert.match(pack.request.caption, /first kick|148 BPM|Warehouse/i);
});
