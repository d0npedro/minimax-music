const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const readiness = require("../dj/js/readiness.js");

const FOUR = [
  "minimax_music3_dit_int8_convrot.safetensors",
  "minimax_music3_dit_fp16.safetensors",
  "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
  "minimax_music3_dav.safetensors",
];

test("checkModels reports present/missing for each smoke-workflow filename", () => {
  const fake = {
    [readiness.joinPath("X:/models", "diffusion_models/minimax_music3_dit_int8_convrot.safetensors")]: true,
    [readiness.joinPath("X:/models", "diffusion_models/minimax_music3_dit_fp16.safetensors")]: false,
    [readiness.joinPath("X:/models", "text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors")]: true,
    [readiness.joinPath("X:/models", "vae/minimax_music3_dav.safetensors")]: true,
  };
  const report = readiness.checkModels("X:/models", function (p) {
    return !!fake[p];
  });
  const byName = Object.fromEntries(report.files.map((f) => [f.filename, f]));
  for (const name of FOUR) {
    assert.ok(byName[name], "missing report row for " + name);
    assert.ok(byName[name].status === "present" || byName[name].status === "missing");
  }
  assert.equal(byName["minimax_music3_dit_int8_convrot.safetensors"].status, "present");
  assert.equal(byName["minimax_music3_dit_fp16.safetensors"].status, "missing");
  assert.equal(byName["minimax_music3_text_encoder_pruned_int8_convrot.safetensors"].status, "present");
  assert.equal(byName["minimax_music3_dav.safetensors"].status, "present");
  assert.equal(report.ok, false);
});

test("checkModels against configured extra-model root sees the four files on disk", () => {
  const root = readiness.modelsRoot();
  assert.equal(path.normalize(root).toLowerCase().replace(/\\/g, "/"), "h:/toolz/minimax-music/models");
  const report = readiness.checkModels(root);
  const names = report.files.map((f) => f.filename).sort();
  assert.deepEqual(names, FOUR.slice().sort());
  for (const row of report.files) {
    assert.equal(row.status, "present", row.filename + " should exist at " + row.path);
    assert.equal(row.present, true);
  }
  assert.equal(report.ok, true);
});
