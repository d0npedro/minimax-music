/**
 * MiniMax Music 3 prompt / preset / match / energy-arc builders.
 * Pure: no fetch, no DOM. Produces the same ComfyUI graph shape as
 * workflows/minimax_music3_smoke_api.json.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorGenerate = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MODELS = {
    unet: "minimax_music3_dit_int8_convrot.safetensors",
    clip: "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
    vae: "minimax_music3_dav.safetensors",
  };

  var ENERGY_ARC = ["first kick", "drive", "schranz peak", "last beat"];

  var INSTRUMENTAL_LYRICS =
    "[Intro]\n\n[Instrumental]\n\n[Drop]\n\n[Outro]\n";

  var TITLE_LEFT = [
    "Iron", "Wet", "Cold", "Black", "Raw", "Dry", "Blind", "Hollow",
    "Mute", "Acid", "Night", "Steel", "Dead", "Burnt", "Silent", "Hard",
    "Lost", "Sharp", "False", "Empty", "Rust", "Low", "Red", "Deep",
  ];
  var TITLE_RIGHT = [
    "Halo", "Rivet", "Voltage", "Concrete", "Ammonia", "Catwalk", "Fuse", "Silo",
    "Sodium", "Girder", "Static", "Tunnel", "Clamp", "Relay", "Ash", "Needle",
    "Current", "Grate", "Cylinder", "Drift", "Circuit", "Bolt", "Chamber", "Signal",
  ];

  function hash32(text) {
    var h = 2166136261;
    var s = String(text || "");
    var i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function uniqueTitle(opts) {
    opts = opts || {};
    var key = [opts.file, opts.seed, opts.preset, opts.arc, opts.energy, opts.bpm, opts.label]
      .filter(function (v) {
        return v != null && String(v) !== "";
      })
      .join("|");
    if (!key) key = "floor";
    var h = hash32(key);
    var left = TITLE_LEFT[h % TITLE_LEFT.length];
    var right = TITLE_RIGHT[Math.floor(h / TITLE_LEFT.length) % TITLE_RIGHT.length];
    return left + " " + right;
  }

  var STYLE_SHIFTS = [
    "tighter industrial kick, dry warehouse air, restrained hats",
    "heavier bass pressure, rolling hats, longer blend tails",
    "denser offbeat stabs, harder distortion, higher rhythm density",
    "wider stereo hats, deeper sub kick, slightly more open midrange",
  ];

  var PRESETS = {
    "Warehouse Drive": {
      bpm: 148,
      energy: "drive",
      maxDuration: 60,
      lyrics: INSTRUMENTAL_LYRICS,
    },
    "Peak Schranz": {
      bpm: 154,
      energy: "schranz peak",
      maxDuration: 75,
      lyrics: INSTRUMENTAL_LYRICS,
    },
    "Last 20 Minutes": {
      bpm: 156,
      energy: "last beat",
      maxDuration: 90,
      lyrics: INSTRUMENTAL_LYRICS,
    },
  };

  var ARC_ARRANGEMENT = {
    "first kick":
      "Isolated industrial kick intro, hats enter late, no breakdown, first-kick pressure that starts the floor. Entirely instrumental.",
    drive:
      "Rolling drive section, relentless 4/4, riding hats, long blend-friendly energy, warehouse momentum. Entirely instrumental.",
    "schranz peak":
      "Peak-time Schranz assault, distorted kick, offbeat stabs, no soft breakdown, every bar pushes harder. Entirely instrumental.",
    "last beat":
      "Last-twenty-minutes closer, maximum density, final-drop pressure, ride to the last beat. Entirely instrumental.",
  };

  function normalizeArc(arc) {
    if (typeof arc === "number" && isFinite(arc)) {
      var i = Math.max(0, Math.min(ENERGY_ARC.length - 1, Math.round(arc)));
      return ENERGY_ARC[i];
    }
    var key = String(arc || "").toLowerCase();
    for (var n = 0; n < ENERGY_ARC.length; n++) {
      if (ENERGY_ARC[n] === key) return ENERGY_ARC[n];
    }
    return ENERGY_ARC[1];
  }

  function arcIndex(arc) {
    var name = normalizeArc(arc);
    var idx = ENERGY_ARC.indexOf(name);
    return idx < 0 ? 1 : idx;
  }

  function nextArc(arc) {
    return ENERGY_ARC[Math.min(ENERGY_ARC.length - 1, arcIndex(arc) + 1)];
  }

  function captionFor(opts) {
    opts = opts || {};
    var arc = normalizeArc(opts.arc);
    var bpm = opts.bpm;
    var bpmText;
    if (opts.bpmMin != null && opts.bpmMax != null) {
      bpmText = opts.bpmMin + "-" + opts.bpmMax + " BPM";
    } else if (bpm != null) {
      bpmText = bpm + " BPM";
    } else {
      bpmText = "150 BPM";
    }
    var energy = opts.energy || arc;
    var extra = opts.prompt ? String(opts.prompt).trim() : "";
    var style = opts.style || "driving techno / relentless Schranz, dark warehouse, distorted kick, no soft breakdown";
    var parts = [
      "Global Metadata: " + style + ". " + bpmText + ". Energy " + energy + ". Main-floor journey stage: " + arc + ".",
      "Vocal Details: Instrumental only. No sung vocals, no spoken vocals, no voiceover, no narration, no reading of instructions or captions aloud. No words.",
      "Arrangement: " + (ARC_ARRANGEMENT[arc] || ARC_ARRANGEMENT.drive),
    ];
    if (extra) parts.push("Production notes (do not sing or speak): " + extra);
    return parts.join("\n\n");
  }

  function defaultLyrics(arc) {
    return INSTRUMENTAL_LYRICS;
  }

  function buildRequest(opts) {
    opts = opts || {};
    var arc = normalizeArc(opts.arc);
    var bpm = opts.bpm != null ? Number(opts.bpm) : 150;
    var bpmMin = opts.bpmMin;
    var bpmMax = opts.bpmMax;
    var energy = opts.energy || arc;
    var lyrics = opts.lyrics || defaultLyrics(arc);
    var maxDuration = opts.maxDuration != null ? Number(opts.maxDuration) : 60;
    var seed = opts.seed != null ? Number(opts.seed) : Math.floor(Math.random() * 1e9);
    var caption = captionFor({
      arc: arc,
      bpm: bpm,
      bpmMin: bpmMin,
      bpmMax: bpmMax,
      energy: energy,
      prompt: opts.prompt,
      style: opts.style,
    });
    var title = opts.title || uniqueTitle({
      seed: seed,
      preset: opts.preset,
      arc: arc,
      energy: energy,
      bpm: bpm,
      label: opts.label,
    });
    return {
      mode: opts.mode || "prompt",
      preset: opts.preset || null,
      title: title,
      arc: arc,
      energy: energy,
      bpm: bpm,
      bpmMin: bpmMin != null ? bpmMin : bpm - 2,
      bpmMax: bpmMax != null ? bpmMax : bpm + 2,
      caption: caption,
      lyrics: lyrics,
      maxDuration: maxDuration,
      seed: seed,
      models: { unet: MODELS.unet, clip: MODELS.clip, vae: MODELS.vae },
    };
  }

  function buildFromPreset(name, opts) {
    opts = opts || {};
    var preset = PRESETS[name];
    if (!preset) throw new Error("Unknown preset: " + name);
    var arc = opts.arc != null ? normalizeArc(opts.arc) : preset.energy;
    return buildRequest({
      mode: "preset",
      preset: name,
      arc: arc,
      energy: preset.energy,
      bpm: preset.bpm,
      lyrics: preset.lyrics,
      maxDuration: preset.maxDuration,
      seed: opts.seed,
    });
  }

  function buildFromPrompt(text, opts) {
    opts = opts || {};
    return buildRequest({
      mode: "prompt",
      prompt: text,
      arc: opts.arc,
      energy: opts.energy,
      bpm: opts.bpm != null ? opts.bpm : 150,
      maxDuration: opts.maxDuration != null ? opts.maxDuration : 60,
      seed: opts.seed,
      lyrics: opts.lyrics,
    });
  }

  function matchPlayingDeck(deck, opts) {
    opts = opts || {};
    if (!deck) throw new Error("No playing deck to match");
    var bpm = Number(deck.bpm) || 150;
    var energy = deck.energy || "drive";
    var arc = opts.arc != null ? normalizeArc(opts.arc) : energy;
    return buildRequest({
      mode: "match",
      arc: arc,
      energy: energy,
      bpm: bpm,
      bpmMin: bpm - 2,
      bpmMax: bpm + 2,
      maxDuration: opts.maxDuration != null ? opts.maxDuration : 60,
      seed: opts.seed,
      prompt: "Match playing deck energy " + energy + " at " + (bpm - 2) + "-" + (bpm + 2) + " BPM",
    });
  }

  function applyStyleShift(request, shiftIndex) {
    request = request || {};
    var idx = Math.abs(Number(shiftIndex) || 0) % STYLE_SHIFTS.length;
    var note = STYLE_SHIFTS[idx];
    var bpm = Number(request.bpm) || 150;
    var drift = (idx % 3) - 1;
    var nextBpm = Math.max(140, Math.min(160, bpm + drift * 2));
    var seed = ((Number(request.seed) || 1) * 1103515245 + 12345 + idx * 9973) >>> 0;
    return buildRequest({
      mode: request.mode || "prompt",
      preset: request.preset,
      arc: request.arc,
      energy: request.energy,
      bpm: nextBpm,
      maxDuration: request.maxDuration,
      seed: seed,
      lyrics: request.lyrics,
      prompt: note,
      style: request.style,
    });
  }

  function buildComfyPrompt(request) {
    var req = request;
    if (!req || !req.caption) {
      throw new Error("buildComfyPrompt requires a generate request with caption");
    }
    var models = req.models || MODELS;
    return {
      "3": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: models.clip,
          type: "minimax",
          device: "default",
        },
      },
      "6": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: models.unet,
          weight_dtype: "default",
        },
      },
      "7": {
        class_type: "VAELoader",
        inputs: {
          vae_name: models.vae,
        },
      },
      "13": {
        class_type: "MiniMaxMusic3TextEncode",
        inputs: {
          clip: ["3", 0],
          caption: req.caption,
          lyrics: req.lyrics,
          seed: req.seed,
          max_duration: req.maxDuration,
          cfg_scale: 1.5,
          top_k: 50,
        },
      },
      "10": {
        class_type: "ConditioningZeroOut",
        inputs: { conditioning: ["13", 0] },
      },
      "15": {
        class_type: "EmptyMiniMaxMusic3LatentAudio",
        inputs: { seconds: ["13", 1], batch_size: 1 },
      },
      "9": {
        class_type: "KSampler",
        inputs: {
          model: ["6", 0],
          positive: ["13", 0],
          negative: ["10", 0],
          latent_image: ["15", 0],
          seed: req.seed,
          steps: 30,
          cfg: 1.7,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1.0,
        },
      },
      "42": {
        class_type: "VAEDecodeAudioTiled",
        inputs: {
          samples: ["9", 0],
          vae: ["7", 0],
          tile_size: 1536,
          overlap: 64,
        },
      },
      "35": {
        class_type: "SaveAudioAdvanced",
        inputs: {
          audio: ["42", 0],
          filename_prefix: "audio/main_floor_dj",
          format: "mp3",
          "format.quality": "V0",
        },
      },
    };
  }

  return {
    MODELS: MODELS,
    ENERGY_ARC: ENERGY_ARC,
    PRESETS: PRESETS,
    normalizeArc: normalizeArc,
    arcIndex: arcIndex,
    nextArc: nextArc,
    captionFor: captionFor,
    buildRequest: buildRequest,
    buildFromPreset: buildFromPreset,
    buildFromPrompt: buildFromPrompt,
    matchPlayingDeck: matchPlayingDeck,
    applyStyleShift: applyStyleShift,
    uniqueTitle: uniqueTitle,
    STYLE_SHIFTS: STYLE_SHIFTS,
    buildComfyPrompt: buildComfyPrompt,
  };
});
