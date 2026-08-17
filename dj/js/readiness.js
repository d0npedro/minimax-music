/**
 * Operator readiness + same-origin ComfyUI request paths.
 * Pure: no process spawn. File existence uses an injectable checker.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorReadiness = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var DEFAULT_MODELS_ROOT = "H:/toolz/minimax-music/models";
  var COMFY_PREFIX = "/comfy";
  var DJ_ORIGIN = "http://127.0.0.1:8787";

  var REQUIRED_FILES = [
    {
      filename: "minimax_music3_dit_int8_convrot.safetensors",
      rel: "diffusion_models/minimax_music3_dit_int8_convrot.safetensors",
      role: "dit_int8",
    },
    {
      filename: "minimax_music3_dit_fp16.safetensors",
      rel: "diffusion_models/minimax_music3_dit_fp16.safetensors",
      role: "dit_fp16",
    },
    {
      filename: "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
      rel: "text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
      role: "clip",
    },
    {
      filename: "minimax_music3_dav.safetensors",
      rel: "vae/minimax_music3_dav.safetensors",
      role: "vae",
    },
  ];

  var RUNTIME_MODELS = {
    unet: "minimax_music3_dit_int8_convrot.safetensors",
    clip: "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
    vae: "minimax_music3_dav.safetensors",
  };

  function modelsRoot(override) {
    if (override) return String(override);
    if (typeof process !== "undefined" && process.env && process.env.MINIMAX_MODELS_ROOT) {
      return process.env.MINIMAX_MODELS_ROOT;
    }
    return DEFAULT_MODELS_ROOT;
  }

  function joinPath(base, rel) {
    var a = String(base || "").replace(/[\\/]+$/, "");
    var b = String(rel || "").replace(/^[\\/]+/, "");
    return a + "/" + b;
  }

  function nodeExists(p) {
    try {
      if (typeof require === "function") {
        return require("fs").existsSync(p);
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function checkModels(rootOverride, existsFn) {
    var rootDir = modelsRoot(rootOverride);
    var exists = existsFn || nodeExists;
    var files = REQUIRED_FILES.map(function (spec) {
      var full = joinPath(rootDir, spec.rel);
      var present = !!exists(full);
      return {
        filename: spec.filename,
        rel: spec.rel,
        role: spec.role,
        path: full,
        present: present,
        status: present ? "present" : "missing",
      };
    });
    return {
      root: rootDir,
      ok: files.every(function (f) {
        return f.present;
      }),
      files: files,
    };
  }

  function comfyBase(origin) {
    return String(origin || "") + COMFY_PREFIX;
  }

  function systemStatsUrl(origin) {
    return comfyBase(origin) + "/system_stats";
  }

  function promptUrl(origin) {
    return comfyBase(origin) + "/prompt";
  }

  function healthUrl(origin) {
    return String(origin || "") + "/health";
  }

  function djUrl() {
    return DJ_ORIGIN + "/";
  }

  function buildSystemStatsRequest(origin) {
    return { method: "GET", url: systemStatsUrl(origin), sameOrigin: systemStatsUrl("").indexOf("/comfy/") === 0 };
  }

  function buildPromptRequest(payload, origin) {
    return {
      method: "POST",
      url: promptUrl(origin),
      sameOrigin: promptUrl("").indexOf("/comfy/") === 0,
      body: { prompt: payload, client_id: "main-floor-dj" },
    };
  }

  return {
    DEFAULT_MODELS_ROOT: DEFAULT_MODELS_ROOT,
    COMFY_PREFIX: COMFY_PREFIX,
    REQUIRED_FILES: REQUIRED_FILES,
    RUNTIME_MODELS: RUNTIME_MODELS,
    modelsRoot: modelsRoot,
    joinPath: joinPath,
    checkModels: checkModels,
    comfyBase: comfyBase,
    systemStatsUrl: systemStatsUrl,
    promptUrl: promptUrl,
    healthUrl: healthUrl,
    djUrl: djUrl,
    buildSystemStatsRequest: buildSystemStatsRequest,
    buildPromptRequest: buildPromptRequest,
  };
});
