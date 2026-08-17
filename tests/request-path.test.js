const { test } = require("node:test");
const assert = require("node:assert/strict");
const readiness = require("../dj/js/readiness.js");
const generate = require("../dj/js/generate.js");
const comfyFactory = require("../dj/js/comfy-client.js");
const start = require("../scripts/start.js");

test("request helper builds same-origin /comfy/system_stats URL", () => {
  const req = readiness.buildSystemStatsRequest();
  assert.equal(req.method, "GET");
  assert.equal(req.url, "/comfy/system_stats");
  assert.equal(req.sameOrigin, true);
  assert.ok(!/^https?:\/\/127\.0\.0\.1:8188/.test(req.url));
});

test("request helper builds MiniMax /prompt body naming int8 DiT, int8 encoder, VAE", () => {
  const payload = generate.buildComfyPrompt(
    generate.buildFromPreset("Warehouse Drive", { seed: 1, arc: "drive" })
  );
  const req = readiness.buildPromptRequest(payload);
  assert.equal(req.method, "POST");
  assert.equal(req.url, "/comfy/prompt");
  assert.equal(req.sameOrigin, true);
  const body = req.body.prompt;
  assert.equal(body["6"].inputs.unet_name, "minimax_music3_dit_int8_convrot.safetensors");
  assert.equal(body["3"].inputs.clip_name, "minimax_music3_text_encoder_pruned_int8_convrot.safetensors");
  assert.equal(body["7"].inputs.vae_name, "minimax_music3_dav.safetensors");
  assert.equal(readiness.RUNTIME_MODELS.unet, body["6"].inputs.unet_name);
  assert.equal(readiness.RUNTIME_MODELS.clip, body["3"].inputs.clip_name);
  assert.equal(readiness.RUNTIME_MODELS.vae, body["7"].inputs.vae_name);
});

test("shipped Comfy client defaults to same-origin /comfy base", () => {
  const client = comfyFactory.createClient();
  assert.equal(client.base, "/comfy");
  assert.ok(client.viewUrl({ filename: "x.mp3", subfolder: "audio", type: "output" }).indexOf("/comfy/view") === 0);
});

test("operator start entry advertises the same DJ URL as readiness", () => {
  assert.equal(start.DJ_URL, readiness.djUrl());
  assert.match(start.DJ_URL, /^http:\/\/127\.0\.0\.1:8787\/$/);
});
