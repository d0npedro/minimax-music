/**
 * MAIN FLOOR shell: Magic plays the current album in order, or cooks MiniMax if no album.
 */
(function (root) {
  var Deck = root.MainFloorDeck;
  var Mixer = root.MainFloorMixer;
  var Gen = root.MainFloorGenerate;
  var AudioEng = root.MainFloorAudio;
  var Comfy = root.MainFloorComfy;
  var OnePress = root.MainFloorOnePress;
  var Endless = root.MainFloorEndless;
  var Crate = root.MainFloorCrate;
  var Stage = root.MainFloorStage;
  var Tracks = root.MainFloorTracks;
  var Album = root.MainFloorAlbum;
  var Magic = root.MainFloorMagic;
  var Lab = root.MainFloorLab;

  var policy = Magic && Magic.cratePolicy ? Magic.cratePolicy() : { warmupSize: 2, targetSize: 5 };

  var state = {
    session: Deck ? Deck.createSession() : null,
    arc: 1,
    lastRequest: null,
    genStatus: "idle",
    target: "auto",
    peaks: { a: [], b: [] },
    endless: Endless ? Endless.createEndless({ arcIndex: 1 }) : null,
    crate: Crate ? Crate.createCrate(policy) : null,
    stageFixture: null,
    visualMode: "organic",
    visualFrom: null,
    visualSwitchedAt: 0,
    lastPunch: 0,
    phase: "idle",
    activity: "",
    activityKind: "",
    activityLog: [],
    comfyReady: false,
    lab: Lab && Lab.createLab ? Lab.createLab() : { events: [], overlay: null },
    styleShift: 0,
    source: "generate",
    albumCatalog: [],
    albumReady: false,
    albumUsed: {},
  };

  var audio = null;
  var comfy = null;
  var raf = 0;
  var cookLock = false;
  var lastFillFail = 0;
  var ingesting = false;

  function $(sel, el) {
    return (el || document).querySelector(sel);
  }

  function deckOf(id) {
    return state.session.decks[id];
  }

  function crateCount() {
    return Crate && state.crate ? Crate.size(state.crate) : 0;
  }

  function nowClock() {
    if (audio && audio.context()) return audio.context().currentTime;
    return (root.performance ? performance.now() : Date.now()) / 1000;
  }

  function setStatus(text) {
    state.genStatus = text;
    var el = $("#gen-status");
    if (el) el.textContent = text;
  }

  function setActivity(kind, text) {
    state.activityKind = kind || "";
    state.activity = text || "";
    if (text) {
      state.activityLog = [{ kind: kind, text: text }].concat(state.activityLog).slice(0, 4);
    }
    renderShell();
  }

  function renderShell() {
    var shell = $("#shell");
    if (shell) shell.setAttribute("data-phase", state.phase);
    var stageEl = $("#stage");
    if (stageEl) {
      stageEl.setAttribute("data-phase", state.phase);
      stageEl.setAttribute("data-source", state.source || "");
    }
    var nowEl = $("#hud-now");
    var live = state.endless ? deckOf(state.endless.liveId) : null;
    var hudEl = $("#stage-hud");
    if (hudEl) hudEl.hidden = false;
    if (nowEl) {
      nowEl.textContent = live && live.loaded ? shownTrackName(live) : "";
    }
    var artistEl = $("#hud-artist");
    var albumEl = $("#hud-album");
    var ytEl = $("#hud-yt");
    var card = liveAlbumCard(live);
    if (artistEl) artistEl.textContent = card && card.artist ? card.artist : "";
    if (albumEl) {
      albumEl.textContent = card ? [card.album, card.catalog].filter(Boolean).join("  ·  ") : "";
    }
    if (ytEl) {
      ytEl.textContent = card ? "YouTube Music" : "";
    }
    var magic = $("#magic-btn");
    var play = $("#play-btn");
    var enabled = Magic && Magic.magicButtonEnabled
      ? Magic.magicButtonEnabled(!!state.comfyReady, state.phase, !!state.albumReady)
      : (!!state.albumReady || !!state.comfyReady) && state.phase === "idle";
    if (magic) {
      magic.disabled = !enabled;
      magic.classList.toggle("on", state.phase !== "idle");
      magic.classList.toggle("waiting", !state.comfyReady && state.phase === "idle");
    }
    if (play) {
      var show = Magic ? Magic.playButtonVisible(state.phase, crateCount()) : state.phase === "armed";
      play.hidden = !show;
      if (show) play.removeAttribute("hidden");
      else play.setAttribute("hidden", "");
    }
    var countEl = $("#queue-count");
    if (countEl) {
      countEl.textContent = Magic && Magic.queueCountLabel ? Magic.queueCountLabel(crateCount()) : "Queue " + crateCount();
    }
    var act = $("#queue-activity");
    if (act) {
      act.textContent = state.activity || "";
      act.setAttribute("data-kind", state.activityKind || "");
    }
    var log = $("#queue-log");
    if (log) {
      log.textContent = "";
      state.activityLog.forEach(function (row) {
        var li = document.createElement("li");
        li.setAttribute("data-kind", row.kind || "");
        li.textContent = row.text;
        log.appendChild(li);
      });
    }
  }

  function sampleVisualState() {
    var Echo = root.MainFloorEcho;
    if (!Echo) return null;
    if (state.stageFixture && state.stageFixture.visual) return state.stageFixture.visual;
    var live = audio && audio.sampleLiveFrame ? audio.sampleLiveFrame() : null;
    if (live) {
      var vs = Echo.visualStateFromLive(live, state.lastPunch || 0);
      state.lastPunch = vs.punch;
      return vs;
    }
    return Echo.idleVisual ? Echo.idleVisual(nowClock()) : null;
  }

  function liveStageInput() {
    var mixP = 0;
    if (state.endless && state.endless.mixing && Endless && Endless.mixProgress) {
      mixP = Endless.mixProgress(state.endless, nowClock());
    }
    return {
      session: state.session,
      crate: state.crate,
      endless: state.endless,
      mixProgress: mixP,
      peaks: state.peaks,
    };
  }

  function stageInput() {
    var base = state.stageFixture || liveStageInput();
    return Object.assign({}, base, {
      visualMode: (state.stageFixture && state.stageFixture.visualMode) || state.visualMode,
      visualFrom: state.stageFixture ? null : state.visualFrom,
      visualFade: visualFadeNow(),
      visual: sampleVisualState(),
      time: nowClock(),
      overlay: currentOverlayView(),
      statusHint: statusHint(),
    });
  }

  function statusHint() {
    if (state.phase === "idle") return "PEDDA VOM MOND AUTOMIXER";
    if (cookLock) return "GENERATING";
    if (state.endless && state.endless.mixing) return "MIXING";
    if (state.phase === "warming") return "WARMUP · Q" + crateCount();
    if (state.phase === "playing") return "LIVE · Q" + crateCount();
    return String(state.genStatus || "").toUpperCase().slice(0, 40);
  }

  function queuedNames() {
    if (!state.crate || !state.crate.items) return [];
    return state.crate.items
      .map(function (it) {
        return (it && it.meta && (it.meta.trackName || it.meta.label)) || "";
      })
      .filter(Boolean);
  }

  function emitLab(kind, payload) {
    if (!Lab || !Lab.pushEvent) return;
    if (!state.lab) state.lab = Lab.createLab();
    Lab.pushEvent(
      state.lab,
      kind,
      Object.assign({ queue: crateCount(), queuedNames: queuedNames() }, payload || {}),
      Date.now()
    );
  }

  function currentOverlayView() {
    if (state.stageFixture && state.stageFixture.overlay) return state.stageFixture.overlay;
    if (!Lab || !state.lab || !Lab.activeOverlay) return null;
    var raw = Lab.activeOverlay(state.lab, Date.now());
    return raw && Lab.overlayView ? Lab.overlayView(raw) : raw;
  }

  async function refreshComfyReady() {
    var up = false;
    try {
      var healthUrl = root.MainFloorReadiness ? root.MainFloorReadiness.healthUrl() : "/health";
      var res = await fetch(healthUrl, { cache: "no-store" });
      var json = await res.json();
      up = !!(json && json.comfy && json.comfy.up);
    } catch (e) {
      if (comfy && comfy.ping) up = await comfy.ping();
    }
    if (up !== state.comfyReady) {
      state.comfyReady = up;
      if (state.phase === "idle") {
        setStatus(Magic && Magic.comfyReadyLabel ? Magic.comfyReadyLabel(up) : "Pedda vom Mond Automixer");
      }
    }
    renderShell();
    return up;
  }

  function renderStage() {
    var canvas = document.getElementById("stage-canvas");
    if (!canvas || !Stage) return null;
    var model = Stage.buildStage ? Stage.buildStage(stageInput()) : null;
    var ctx = canvas.getContext("2d");
    if (ctx && Stage.paintStageVisualizer && model) Stage.paintStageVisualizer(ctx, model);
    return model;
  }

  function applyStageFixture(input) {
    state.stageFixture = input || null;
    if (input && input.visualMode) state.visualMode = input.visualMode;
    render();
    return Stage && Stage.buildStage ? Stage.buildStage(stageInput()) : null;
  }

  function visualFadeNow() {
    if (!state.visualFrom || state.visualFrom === state.visualMode) return 1;
    var Ghost = root.MainFloorGhost;
    if (Ghost && Ghost.fadeAmount) return Ghost.fadeAmount(Date.now() - (state.visualSwitchedAt || 0));
    return 1;
  }

  function setVisualMode(mode, opts) {
    var Ghost = root.MainFloorGhost;
    var allowed = (Ghost && Ghost.MODES) || (Stage && Stage.VISUAL_MODES) || ["organic", "kaleidoscope", "fluid"];
    if (allowed.indexOf(mode) === -1) return state.visualMode;
    var fade = !!(opts && opts.fade) && state.visualMode && state.visualMode !== mode;
    state.visualFrom = fade ? state.visualMode : null;
    state.visualMode = mode;
    state.visualSwitchedAt = Date.now();
    if (Ghost && Ghost.prepareMode) Ghost.prepareMode(mode);
    else if (Ghost && Ghost.resetMode && !fade) Ghost.resetMode(mode);
    renderStage();
    return mode;
  }

  function rollVisual() {
    if (visualFadeNow() < 1 && state.visualFrom) return state.visualMode;
    var Ghost = root.MainFloorGhost;
    var next = Ghost && Ghost.nextInRotation ? Ghost.nextInRotation(state.visualMode) : null;
    if (!next || next === state.visualMode) return state.visualMode;
    return setVisualMode(next, { fade: true });
  }

  function maybeRollVisual() {
    if (state.phase !== "playing") return state.visualMode;
    var now = Date.now();
    if (visualFadeNow() >= 1 && state.visualFrom) state.visualFrom = null;
    if (!state.visualSwitchedAt) {
      state.visualSwitchedAt = now;
      return state.visualMode;
    }
    if (visualFadeNow() < 1) return state.visualMode;
    var Ghost = root.MainFloorGhost;
    var hold = Ghost && Ghost.HOLD_MS ? Ghost.HOLD_MS : 14000;
    if (Ghost && Ghost.shouldAdvanceRotation) {
      if (!Ghost.shouldAdvanceRotation(now - state.visualSwitchedAt, hold)) return state.visualMode;
    } else if (now - state.visualSwitchedAt < hold) {
      return state.visualMode;
    }
    return rollVisual();
  }

  function render() {
    renderShell();
    renderStage();
  }

  function updateXfaderUi() {
    var xf = $("#xfader");
    if (xf) xf.value = String(state.session.xfader);
  }

  function armTailLoop(deck) {
    if (!deck || !deck.loaded || !Endless) return;
    var pts = Endless.holdLoopPoints(deck, state.endless ? state.endless.mixDuration : 16);
    var same = deck.loop.enabled && deck.loop.in === pts.in && deck.loop.out === pts.out;
    if (same) return;
    Deck.setLoopIn(deck, pts.in);
    Deck.setLoopOut(deck, pts.out);
    if (audio) audio.applyLoop(deck.id, deck);
  }

  function liveAlbumCard(live) {
    if (!Album || !live || !live.loaded) return null;
    if (state.source !== "album" && !live.youtubeMusic && !(live.meta && live.meta.youtubeMusic)) return null;
    var file = (live.meta && live.meta.file) || live.file || "";
    var parsed = file && Album.parseAlbumTrack ? Album.parseAlbumTrack(file) : null;
    return Album.trackCard(
      {
        file: file || (parsed && parsed.file),
        index: live.albumIndex || (live.meta && live.meta.albumIndex) || (parsed && parsed.index),
        title: shownTrackName(live),
        artist: live.artist || (live.meta && live.meta.artist),
        album: live.album || (live.meta && live.meta.album),
      },
      { total: state.albumCatalog && state.albumCatalog.length }
    );
  }

  function shownTrackName(source) {
    source = source || {};
    var meta = source.meta || source;
    var raw = source.trackName || meta.trackName || meta.label || "";
    var file = meta.file || source.file || raw;
    if (Tracks && Tracks.isGenericName && Tracks.isGenericName(raw)) {
      return Tracks.displayNameFromFile ? Tracks.displayNameFromFile(file || raw) : raw;
    }
    if ((!raw || Tracks && Tracks.isGenericName && Tracks.isGenericName(raw)) && Gen && Gen.uniqueTitle) {
      return Gen.uniqueTitle({
        file: file,
        seed: source.seed || meta.seed,
        preset: source.preset || meta.preset,
        arc: source.arc || meta.arc,
        bpm: source.bpm || meta.bpm,
        label: raw,
      });
    }
    return raw;
  }

  function remapGenericNames() {
    function fix(obj) {
      if (!obj) return;
      var next = shownTrackName(obj);
      if (next && obj.trackName != null) obj.trackName = next;
      if (obj.meta) obj.meta.trackName = next || obj.meta.trackName;
    }
    if (state.session && state.session.decks) {
      fix(state.session.decks.a);
      fix(state.session.decks.b);
    }
    if (state.crate && state.crate.items) {
      state.crate.items.forEach(fix);
    }
  }

  function loadReadyItem(id, item) {
    if (!item || !item.audioBuffer || !audio) return false;
    audio.setBuffer(id, item.audioBuffer);
    Deck.loadTrack(deckOf(id), {
      trackName: shownTrackName(item) || "queued",
      duration: item.audioBuffer.duration,
      bpm: item.meta && item.meta.bpm,
      energy: item.meta && item.meta.energy,
      artist: item.meta && item.meta.artist,
      album: item.meta && item.meta.album,
      youtubeMusic: item.meta && item.meta.youtubeMusic,
      albumIndex: item.meta && item.meta.albumIndex,
      catalog: item.meta && item.meta.catalog,
      file: item.meta && item.meta.file,
    });
    if (state.source === "album") rememberAlbumFile(item.meta && item.meta.file);
    state.peaks[id] = audio.peaks(id, 480);
    audio.syncPlayback(state.session);
    render();
    return true;
  }

  function takeNextAlbumItem() {
    if (!state.crate || !state.crate.items || !state.crate.items.length) return null;
    if (Album && Album.takeNextQueued) return Album.takeNextQueued(state.crate.items);
    var best = 0;
    var i;
    for (i = 1; i < state.crate.items.length; i++) {
      var ia = (state.crate.items[best].meta && state.crate.items[best].meta.albumIndex) || 999;
      var ib = (state.crate.items[i].meta && state.crate.items[i].meta.albumIndex) || 999;
      if (ib < ia) best = i;
    }
    return state.crate.items.splice(best, 1)[0];
  }

  function takeAlbumItemByIndex(index) {
    if (!state.crate || !state.crate.items || !state.crate.items.length) return null;
    if (Album && Album.takeQueuedByIndex) return Album.takeQueuedByIndex(state.crate.items, index);
    var i;
    for (i = 0; i < state.crate.items.length; i++) {
      if (((state.crate.items[i].meta && state.crate.items[i].meta.albumIndex) || 999) === Number(index)) {
        return state.crate.items.splice(i, 1)[0];
      }
    }
    return null;
  }

  function loadNextFromCrate() {
    if (state.source === "album") {
      var nextId = state.endless.nextId;
      if (deckOf(nextId).loaded) return true;
      var albumItem = takeNextAlbumItem();
      if (!albumItem) return false;
      return loadReadyItem(nextId, albumItem);
    }
    if (!Crate || !state.endless || !state.crate) return false;
    var nextId = state.endless.nextId;
    if (deckOf(nextId).loaded) return true;
    var item = Crate.shift(state.crate);
    if (!item) return false;
    return loadReadyItem(nextId, item);
  }

  async function saveProjectTrack(ab, info) {
    try {
      var params = new URLSearchParams();
      params.set("label", (info && (info.label || info.trackName)) || "track");
      if (info && info.bpm != null) params.set("bpm", String(info.bpm));
      params.set("ext", "mp3");
      var res = await fetch("/tracks?" + params.toString(), {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: ab,
      });
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  }

  async function generateAudio(request, label) {
    if (!comfy) return { ok: false, reason: "no-client" };
    var up = await comfy.ping();
    if (!up) return { ok: false, reason: "offline" };
    var payload = Gen.buildComfyPrompt(request);
    var cookingName = (request && request.title) || (Gen && Gen.uniqueTitle && Gen.uniqueTitle(request)) || "Track";
    emitLab("workflow", { label: cookingName, request: request, prompt: payload });
    emitLab("generating", { label: cookingName, request: request, prompt: payload });
    var queued = await comfy.queuePrompt(payload);
    var entry = await comfy.waitFor(queued.prompt_id, function () {
      setActivity("generating", Magic.generatingMessage(cookingName, crateCount()));
      if (Lab && Lab.shouldPulseOverlay && Lab.shouldPulseOverlay(state.lab, Date.now(), true)) {
        emitLab("generating", { label: cookingName, request: request, prompt: payload });
      }
    });
    if (entry.status && entry.status.status_str === "error") return { ok: false, reason: "error" };
    var audioOut = entry.outputs && entry.outputs["35"] && entry.outputs["35"].audio && entry.outputs["35"].audio[0];
    if (!audioOut) return { ok: false, reason: "no-audio" };
    var ab = await comfy.fetchAudio(audioOut);
    var meta = {
      trackName: cookingName,
      label: cookingName,
      bpm: request.bpm,
      energy: request.energy,
      seed: request.seed,
      preset: request.preset,
      arc: request.arc,
    };
    await saveProjectTrack(ab, meta);
    if (audio) await audio.resume();
    var audioBuffer = audio ? await audio.decodeArrayBuffer(ab) : null;
    return { ok: true, ab: ab, audioBuffer: audioBuffer, meta: meta };
  }

  async function cookIntoCrate(request, label) {
    if (cookLock) return { ok: false, reason: "busy" };
    cookLock = true;
    if (state.endless) state.endless.cooking = true;
    state.lastRequest = request;
    var cookingName = (request && request.title) || (Gen && Gen.uniqueTitle && Gen.uniqueTitle(request || { label: label })) || label || "Track";
    setActivity("generating", Magic.generatingMessage(cookingName, crateCount()));
    emitLab("params", { label: cookingName, request: request, prompt: Gen && Gen.buildComfyPrompt ? Gen.buildComfyPrompt(request) : null });
    try {
      var gen = await generateAudio(request, label);
      if (!gen.ok) {
        lastFillFail = Date.now();
        if (gen.reason === "offline") setStatus("ComfyUI offline — queue " + crateCount());
        else setStatus("generate failed: " + gen.reason);
        if (!Magic || !Magic.shouldAnnounceGenerateFail || Magic.shouldAnnounceGenerateFail(gen.reason, crateCount())) {
          var failText = Magic && Magic.generateFailMessage
            ? Magic.generateFailMessage(gen.reason, crateCount())
            : "Generate fehlgeschlagen: " + (gen.reason || "error");
          var failKind = Magic && Magic.generateFailKind ? Magic.generateFailKind(gen.reason) : "error";
          setActivity(failKind, failText);
          emitLab("error", { label: cookingName, request: request, detail: failText });
        } else {
          setActivity("", "");
        }
        return gen;
      }
      if (Crate && state.crate && gen.audioBuffer) {
        if (Crate.atCapacity && Crate.atCapacity(state.crate)) Crate.shift(state.crate);
        Crate.push(state.crate, {
          audioBuffer: gen.audioBuffer,
          meta: gen.meta,
          peaks: Stage && Stage.peaksFromAudioBuffer ? Stage.peaksFromAudioBuffer(gen.audioBuffer) : null,
        });
      }
      var addedName = (gen.meta && gen.meta.trackName) || cookingName;
      setActivity("added", Magic.addedMessage(addedName, crateCount()));
      emitLab("queued", { label: addedName, request: request });
      if (state.phase === "playing" && state.endless) {
        setStatus("live " + state.endless.liveId + " · queue " + crateCount());
      }
      return { ok: true, crate: crateCount() };
    } catch (err) {
      setStatus("generate failed: " + (err && err.message));
      return { ok: false, reason: "exception", error: String(err && err.message) };
    } finally {
      cookLock = false;
      if (state.endless) state.endless.cooking = false;
      if (state.endless && state.endless.enabled) keepQueueMoving();
    }
  }

  function fillCrate(opts) {
    if (state.source === "album") return Promise.resolve({ ok: false, reason: "album-mode" });
    opts = opts || {};
    var force = opts === true || !!opts.force;
    if (!Crate || !state.crate || !state.endless || !state.endless.enabled || cookLock || ingesting) return Promise.resolve();
    if (!force) {
      if (Magic && Magic.shouldKeepFilling && !Magic.shouldKeepFilling(state.phase, crateCount(), cookLock)) {
        return Promise.resolve();
      }
    }
    if (!force && Date.now() - lastFillFail < 8000) return Promise.resolve();
    var live = deckOf(state.endless.liveId);
    var plan = Endless.planNext(state.endless, live && live.loaded ? live : null, Gen);
    if (Gen && Gen.applyStyleShift) {
      plan.request = Gen.applyStyleShift(plan.request, state.styleShift++);
    }
    state.endless.arcIndex = plan.arcIndex;
    state.arc = plan.arcIndex;
    return cookIntoCrate(plan.request, plan.preset);
  }

  async function ingestExistingTracks() {
    ingesting = true;
    try {
      var res = await fetch("/tracks", { cache: "no-store" });
      if (!res.ok) return 0;
      var json = await res.json();
      var files = Tracks && Tracks.queueExistingFirst
        ? Tracks.queueExistingFirst(json.files || [])
        : Tracks && Tracks.pickExistingTracks
          ? Tracks.pickExistingTracks(json.files || [])
          : json.files || [];
      if (audio) await audio.resume();
      var n = 0;
      for (var i = 0; i < files.length; i++) {
        var row = files[i];
        var name = typeof row === "string" ? row : row.file;
        try {
          var info = Tracks.metaFromFileName(name);
          var url = Tracks.trackAudioUrl(name);
          var bin = await fetch(url, { cache: "no-store" });
          if (!bin.ok) continue;
          var ab = await bin.arrayBuffer();
          if (!ab || ab.byteLength < 256) continue;
          var audioBuffer = audio ? await audio.decodeArrayBuffer(ab) : null;
          if (!audioBuffer) continue;
          Crate.push(state.crate, {
            audioBuffer: audioBuffer,
            meta: {
              trackName: Tracks && Tracks.displayNameFromFile ? Tracks.displayNameFromFile(name) : info.trackName,
              bpm: info.bpm,
              energy: "drive",
              file: info.file,
            },
            peaks: Stage && Stage.peaksFromAudioBuffer ? Stage.peaksFromAudioBuffer(audioBuffer) : null,
          });
          n++;
          setStatus("loaded " + n + " / " + files.length);
          renderShell();
        } catch (err) {
          /* skip unreadable disk track */
        }
        await new Promise(function (resolve) {
          setTimeout(resolve, 0);
        });
      }
      return n;
    } finally {
      ingesting = false;
    }
  }

  function promoteNext() {
    var nextId = state.endless.nextId;
    var liveId = state.endless.liveId;
    var incoming = deckOf(nextId);
    incoming.position = 0;
    Deck.play(incoming);
    state.endless.liveId = nextId;
    state.endless.nextId = liveId;
    state.session.xfader = Endless.xfaderForLive(nextId);
    updateXfaderUi();
    var outgoing = deckOf(liveId);
    Deck.pause(outgoing);
    Deck.emptyDeck(outgoing);
    if (audio) {
      audio.setBuffer(liveId, null);
      audio.syncPlayback(state.session);
    }
    state.peaks[liveId] = [];
    armTailLoop(incoming);
    loadNextFromCrate();
    setStatus("live " + nextId + " · queue " + crateCount());
    rollVisual();
    if (state.source !== "album") fillCrate();
  }

  function completeMix() {
    var done = Endless.finishMix(state.endless);
    var outgoing = deckOf(done.emptyId);
    Deck.pause(outgoing);
    Deck.emptyDeck(outgoing);
    if (audio) {
      audio.setBuffer(done.emptyId, null);
      audio.syncPlayback(state.session);
    }
    state.peaks[done.emptyId] = [];
    state.session.xfader = done.xfader;
    updateXfaderUi();
    armTailLoop(deckOf(done.liveId));
    loadNextFromCrate();
    setStatus("live " + done.liveId + " · queue " + crateCount());
    rollVisual();
    fillCrate();
  }

  function rememberAlbumFile(file) {
    var name = String(file || "").replace(/^.*[\\/]/, "");
    if (!name) return;
    if (!state.albumUsed) state.albumUsed = {};
    state.albumUsed[name] = true;
    if (Album && Album.markAlbumUsed) Album.markAlbumUsed(name);
  }

  function usedTrackFiles() {
    var used = [];
    function add(obj) {
      var f = obj && ((obj.meta && obj.meta.file) || obj.file);
      if (f) used.push(f);
    }
    if (state.source === "album" && state.albumUsed) {
      Object.keys(state.albumUsed).forEach(function (name) {
        used.push(name);
      });
    }
    if (state.session && state.session.decks) {
      add(state.session.decks.a);
      add(state.session.decks.b);
    }
    if (state.crate && state.crate.items) {
      state.crate.items.forEach(add);
    }
    return used;
  }

  function firstUnusedAlbumRow() {
    if (!Album || !state.albumCatalog || !state.albumCatalog.length) return null;
    var rows = Album.nextUnused(state.albumCatalog, usedTrackFiles(), 1);
    return rows && rows[0] ? rows[0] : null;
  }

  async function topUpFromDisk(want) {
    want = want != null ? Number(want) : 12;
    if (!Tracks || !state.crate || ingesting) return 0;
    if (crateCount() >= want) return 0;
    ingesting = true;
    var added = 0;
    try {
      var res = await fetch("/tracks", { cache: "no-store" });
      if (!res.ok) return 0;
      var json = await res.json();
      var need = want - crateCount();
      var files = Tracks.unusedExisting
        ? Tracks.unusedExisting(json.files || [], usedTrackFiles(), need)
        : [];
      if (audio) await audio.resume();
      for (var i = 0; i < files.length && crateCount() < want; i++) {
        var row = files[i];
        var name = typeof row === "string" ? row : row.file;
        try {
          var info = Tracks.metaFromFileName(name);
          var bin = await fetch(Tracks.trackAudioUrl(name), { cache: "no-store" });
          if (!bin.ok) continue;
          var ab = await bin.arrayBuffer();
          if (!ab || ab.byteLength < 256) continue;
          var audioBuffer = audio ? await audio.decodeArrayBuffer(ab) : null;
          if (!audioBuffer) continue;
          if (Crate.atCapacity && Crate.atCapacity(state.crate)) break;
          Crate.push(state.crate, {
            audioBuffer: audioBuffer,
            meta: {
              trackName: Tracks.displayNameFromFile ? Tracks.displayNameFromFile(name) : info.trackName,
              bpm: info.bpm,
              energy: "drive",
              file: info.file,
            },
            peaks: Stage && Stage.peaksFromAudioBuffer ? Stage.peaksFromAudioBuffer(audioBuffer) : null,
          });
          added++;
        } catch (err) {
          /* skip */
        }
      }
      if (added) {
        setStatus("live " + (state.endless && state.endless.liveId) + " · queue " + crateCount());
        renderShell();
      }
      return added;
    } finally {
      ingesting = false;
    }
  }

  function keepQueueMoving() {
    if (!state.endless || !state.endless.enabled) return;
    if (state.phase === "playing") {
      var next = deckOf(state.endless.nextId);
      var loadNext = Magic && Magic.shouldLoadNext
        ? Magic.shouldLoadNext(!!(next && next.loaded), crateCount())
        : !!(next && !next.loaded && crateCount() > 0);
      if (loadNext) loadNextFromCrate();
    }
    if (cookLock || ingesting) return;
    if (state.source === "album") {
      if (state.phase === "playing" && crateCount() < 8) topUpAlbum(8);
      return;
    }
    if (state.phase === "playing" && crateCount() < 12) topUpFromDisk(12);
    fillCrate();
  }

  function tickEndless() {
    if (!Endless || !state.endless || !state.endless.enabled) return;
    keepQueueMoving();
    if (state.phase !== "playing" || state.endless.warmingUp) return;
    var live = deckOf(state.endless.liveId);
    var next = deckOf(state.endless.nextId);
    var now = nowClock();
    if (state.endless.mixing) {
      state.session.xfader = Endless.xfaderDuringMix(state.endless, now);
      updateXfaderUi();
      if (Endless.mixDone(state.endless, now)) completeMix();
      return;
    }
    if (Endless.shouldPromoteNext(state.endless, live, next)) {
      promoteNext();
      return;
    }
    if (Endless.shouldStartMix(state.endless, live, next)) {
      next.position = 0;
      Deck.syncTo(next, live);
      Deck.play(next);
      Endless.beginMix(state.endless, now);
      if (audio) audio.syncPlayback(state.session);
      setStatus("mixing " + state.endless.liveId + " → " + state.endless.nextId);
      rollVisual();
      emitLab("mix", {
        label: (live && live.trackName ? live.trackName : "A") + " → " + (next && next.trackName ? next.trackName : "B"),
        request: state.lastRequest,
      });
      return;
    }
    if (Endless.shouldHoldLoop(state.endless, live, next)) {
      armTailLoop(live);
    }
  }

  function tick() {
    ["a", "b"].forEach(function (id) {
      var deck = deckOf(id);
      if (audio && deck.playing) {
        deck.position = audio.currentPosition(id, deck);
        if (deck.duration && deck.position >= deck.duration - 0.05 && !deck.loop.enabled) {
          if (Endless && Endless.shouldKeepPlaying(state.endless, id)) {
            armTailLoop(deck);
            Deck.play(deck);
            if (audio) audio.syncPlayback(state.session);
          } else {
            Deck.pause(deck);
            deck.position = deck.duration;
            audio.syncPlayback(state.session);
          }
        }
      }
    });
    tickEndless();
    maybeRollVisual();
    if (audio) audio.applyMixer(state.session);
    render();
    raf = root.requestAnimationFrame ? requestAnimationFrame(tick) : 0;
  }

  async function checkAlbumReady() {
    var rows = await fetchAlbumList();
    state.albumReady = rows.length >= 2;
    if (state.albumReady && state.phase === "idle") {
      setStatus("Pedda vom Mond Automixer");
    }
    renderShell();
    return state.albumReady;
  }

  async function fetchAlbumList() {
    if (!Album) return [];
    try {
      var res = await fetch("/album", { cache: "no-store" });
      if (!res.ok) return [];
      var json = await res.json();
      return Album.sortAlbum(json.files || []);
    } catch (err) {
      return [];
    }
  }

  function crateHasAlbumIndex(index) {
    if (!state.crate || !state.crate.items) return false;
    var want = Number(index);
    var i;
    for (i = 0; i < state.crate.items.length; i++) {
      var got = Album && Album.albumIndexOf
        ? Album.albumIndexOf(state.crate.items[i])
        : (state.crate.items[i].meta && state.crate.items[i].meta.albumIndex);
      if (got === want) return true;
    }
    return false;
  }

  function deckWithAlbumIndex(index) {
    var want = Number(index);
    var ids = ["a", "b"];
    var i;
    for (i = 0; i < ids.length; i++) {
      var deck = deckOf(ids[i]);
      if (deck && deck.loaded && Number(deck.albumIndex) === want) return ids[i];
    }
    return null;
  }

  function hasAlbumIndex(index) {
    return crateHasAlbumIndex(index) || !!deckWithAlbumIndex(index);
  }

  async function ingestAlbumRow(row) {
    if (!row || !row.file || !state.crate) return false;
    if (crateHasAlbumIndex(row.index)) return true;
    if (audio) await audio.resume();
    try {
      var bin = await fetch(Album.audioUrl(row.file), { cache: "no-store" });
      if (!bin.ok) {
        setStatus("album " + row.index + " fetch " + bin.status);
        return false;
      }
      var ab = await bin.arrayBuffer();
      if (!ab || ab.byteLength < 256) {
        setStatus("album " + row.index + " leer");
        return false;
      }
      var audioBuffer = audio ? await audio.decodeArrayBuffer(ab) : null;
      if (!audioBuffer) {
        setStatus("album " + row.index + " decode fail");
        return false;
      }
      var card = Album.trackCard(row, { total: state.albumCatalog.length });
      Crate.push(state.crate, {
        audioBuffer: audioBuffer,
        meta: {
          trackName: card.title,
          label: card.title,
          artist: card.artist,
          album: card.album,
          youtubeMusic: card.youtubeMusic,
          catalog: card.catalog,
          bpm: 0,
          energy: "album",
          file: row.file,
          albumIndex: row.index,
        },
        peaks: Stage && Stage.peaksFromAudioBuffer ? Stage.peaksFromAudioBuffer(audioBuffer) : null,
      });
      rememberAlbumFile(row.file);
      setStatus("album " + row.index + " · " + row.title);
      renderShell();
      return true;
    } catch (err) {
      setStatus("album " + row.index + " " + ((err && err.message) || "fail"));
      return false;
    }
  }

  async function loadAlbumOpener() {
    var opener = firstUnusedAlbumRow();
    if (!opener) return false;
    var tries = 0;
    while (tries < 4 && !crateHasAlbumIndex(opener.index)) {
      tries += 1;
      setStatus("album " + opener.index + " · Versuch " + tries);
      await ingestAlbumRow(opener);
    }
    return crateHasAlbumIndex(opener.index);
  }

  async function topUpAlbum(want) {
    want = want != null ? Number(want) : 4;
    if (!Album || !state.crate || ingesting) return 0;
    if (crateCount() >= want) return 0;
    ingesting = true;
    var added = 0;
    try {
      if (!state.albumCatalog || !state.albumCatalog.length) {
        state.albumCatalog = await fetchAlbumList();
      }
      var files = Album.nextUnused(state.albumCatalog, usedTrackFiles(), want - crateCount());
      var i;
      for (i = 0; i < files.length && crateCount() < want; i++) {
        if (await ingestAlbumRow(files[i])) added += 1;
      }
      return added;
    } finally {
      ingesting = false;
    }
  }

  function sortAlbumCrate() {
    if (!state.crate || !state.crate.items) return;
    state.crate.items.sort(function (a, b) {
      var ia = (a.meta && a.meta.albumIndex) || 999;
      var ib = (b.meta && b.meta.albumIndex) || 999;
      return ia - ib;
    });
  }

  async function startAlbum(opts) {
    opts = opts || {};
    var fromIndex = Number(opts.fromIndex) || 1;
    if (audio) await audio.resume();
    if (state.phase !== "idle") stopEndless();
    state.source = "album";
    state.phase = "warming";
    state.crate = Crate.createCrate(policy);
    state.endless = Endless.createEndless({ arcIndex: state.arc });
    state.endless.enabled = true;
    state.endless.warmingUp = true;
    state.albumUsed = {};
    if (Album && Album.beginAlbumSession) Album.beginAlbumSession();
    if (state.session && state.session.decks) {
      ["a", "b"].forEach(function (id) {
        var deck = deckOf(id);
        if (!deck) return;
        Deck.pause(deck);
        Deck.emptyDeck(deck);
        if (audio) audio.setBuffer(id, null);
      });
    }
    state.albumCatalog = await fetchAlbumList();
    state.albumCatalog.forEach(function (row) {
      if (row && row.index < fromIndex) rememberAlbumFile(row.file);
    });
    setStatus("album load · " + state.albumCatalog.length);
    renderShell();
    var opened = await loadAlbumOpener();
    if (!opened) {
      state.phase = "idle";
      state.endless.enabled = false;
      setStatus("album start fehlt");
      renderShell();
      return { ok: false, reason: "album-empty", queued: crateCount() };
    }
    await topUpAlbum(4);
    sortAlbumCrate();
    if (crateCount() < 2) {
      state.phase = "idle";
      state.endless.enabled = false;
      setStatus("album leer");
      renderShell();
      return { ok: false, reason: "album-empty", queued: crateCount() };
    }
    state.phase = "armed";
    state.endless.warmingUp = false;
    setStatus("album · queue " + crateCount());
    return startPlayback();
  }

  async function pressMagic() {
    if (!Endless || !Crate) {
      setStatus("magic missing");
      return { ok: false };
    }
    if (state.phase !== "idle") {
      return { ok: false, reason: "busy" };
    }
    var albumRows = await fetchAlbumList();
    if (albumRows.length >= 2) return startAlbum();
    if (!Gen) {
      setStatus("magic missing");
      return { ok: false };
    }
    if (!state.comfyReady) {
      setStatus(Magic && Magic.comfyReadyLabel ? Magic.comfyReadyLabel(false) : "Warte auf ComfyUI");
      return { ok: false, reason: "comfy-down" };
    }
    if (audio) await audio.resume();
    state.source = "generate";
    state.phase = "warming";
    state.crate = Crate.createCrate(policy);
    state.endless = Endless.createEndless({ arcIndex: state.arc });
    state.endless.enabled = true;
    state.endless.warmingUp = true;
    state.styleShift = 0;
    setStatus("experiment start");
    renderShell();
    await ingestExistingTracks();
    if (Magic.canStartPlayback(Magic.phaseAfterIngest(crateCount()), crateCount())) {
      state.phase = "armed";
      state.endless.warmingUp = false;
      setStatus("ready · queue " + crateCount());
      renderShell();
      fillCrate({ force: true });
      return startPlayback();
    }
    var pack = OnePress
      ? OnePress.startMagic(
          { generate: Gen, readiness: root.MainFloorReadiness, deck: Deck },
          { arc: state.arc, seed: Date.now() % 1e9, decks: state.session.decks }
        )
      : null;
    if (pack && Gen.applyStyleShift) {
      pack.request = Gen.applyStyleShift(pack.request, state.styleShift++);
    }
    if (pack) {
      var first = await cookIntoCrate(pack.request, pack.preset);
      if (!first.ok && first.reason === "offline") {
        state.comfyReady = false;
        setStatus(Magic.comfyReadyLabel(false));
      }
    }
    while (state.endless.enabled && crateCount() < policy.warmupSize) {
      var more = await fillCrate();
      if (more && more.ok === false) break;
    }
    state.phase = Magic.phaseAfterIngest(crateCount());
    state.endless.warmingUp = state.phase === "warming";
    if (Magic.canStartPlayback(state.phase, crateCount())) {
      state.phase = "armed";
      state.endless.warmingUp = false;
      setStatus("ready · queue " + crateCount());
      renderShell();
      fillCrate();
      return startPlayback();
    }
    setStatus("need " + policy.warmupSize + " tracks · queue " + crateCount());
    renderShell();
    fillCrate();
    return { ok: false, queued: crateCount(), phase: state.phase };
  }

  async function startPlayback() {
    if (!Magic.canStartPlayback(state.phase, crateCount())) {
      setStatus("queue not ready");
      return { ok: false, reason: "queue-short" };
    }
    state.phase = "playing";
    state.endless.enabled = true;
    state.endless.warmingUp = false;
    var liveId = "a";
    state.endless.liveId = liveId;
    state.endless.nextId = "b";
    if (state.source === "album") {
      sortAlbumCrate();
      var liveItem = takeNextAlbumItem();
      if (!liveItem) {
        state.phase = "armed";
        setStatus("album start fehlt");
        return { ok: false, reason: "album-empty" };
      }
      loadReadyItem(liveId, liveItem);
      if (!deckOf(state.endless.nextId).loaded) {
        loadReadyItem(state.endless.nextId, takeNextAlbumItem());
      }
    } else {
      loadReadyItem(liveId, Crate.shift(state.crate));
      loadNextFromCrate();
    }
    state.session.xfader = Endless.xfaderForLive(liveId);
    updateXfaderUi();
    var live = deckOf(liveId);
    Deck.play(live);
    armTailLoop(live);
    if (audio) {
      await audio.resume();
      audio.syncPlayback(state.session);
    }
    setStatus("playing · queue " + crateCount());
    rollVisual();
    render();
    fillCrate({ force: true });
    return { ok: true, playing: true, queued: crateCount() };
  }

  function startEndless() {
    if (state.phase !== "idle") stopEndless();
    return pressMagic();
  }

  function stopEndless() {
    if (state.endless) {
      state.endless.enabled = false;
      state.endless.mixing = false;
      state.endless.warmingUp = false;
      state.endless.cooking = false;
    }
    cookLock = false;
    ingesting = false;
    if (state.session && state.session.decks) {
      ["a", "b"].forEach(function (id) {
        var deck = deckOf(id);
        if (!deck) return;
        Deck.pause(deck);
        Deck.emptyDeck(deck);
        if (audio) audio.setBuffer(id, null);
      });
      if (audio) audio.syncPlayback(state.session);
    }
    state.phase = "idle";
    state.source = "album";
    state.crate = Crate ? Crate.createCrate(policy) : state.crate;
    setStatus("stopped");
    renderShell();
  }

  function applyPreset(name) {
    if (!Gen) return null;
    var req = Gen.buildFromPreset(name, { arc: state.arc, seed: Date.now() % 1e9 });
    state.lastRequest = req;
    return req;
  }

  function applyMatch() {
    var playing = Deck.playingDeck(state.session);
    if (!playing) return null;
    var req = Gen.matchPlayingDeck(playing, { arc: state.arc, seed: Date.now() % 1e9 });
    state.lastRequest = req;
    return req;
  }

  function previewFromCurrent() {
    return state.lastRequest;
  }

  function resolveTarget() {
    return Deck.firstEmptyDeckId(state.session) || "b";
  }

  async function generateNow() {
    if (state.source === "album") return { ok: false, reason: "album-mode" };
    return fillCrate();
  }

  function boot() {
    if (!document || !Deck) return;
    if (location.protocol === "file:") {
      var banner = $("#file-banner");
      if (banner) banner.style.display = "block";
    }
    audio = AudioEng.createAudioEngine(Mixer);
    var comfyBase = root.MainFloorReadiness ? root.MainFloorReadiness.comfyBase() : "/comfy";
    comfy = Comfy.createClient(comfyBase);
    checkAlbumReady();
    refreshComfyReady();
    if (root.setInterval) {
      root.setInterval(function () {
        if (state.source === "album" || state.albumReady) return;
        refreshComfyReady();
      }, 2500);
    }
    var magicBtn = $("#magic-btn");
    if (magicBtn) {
      magicBtn.addEventListener("click", function () {
        pressMagic();
      });
    }
    var playBtn = $("#play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        startPlayback();
      });
    }
    remapGenericNames();
    render();
    if (root.requestAnimationFrame) raf = requestAnimationFrame(tick);
  }

  var api = {
    state: state,
    boot: boot,
    applyPreset: applyPreset,
    applyMatch: applyMatch,
    generateNow: generateNow,
    topUpFromDisk: topUpFromDisk,
    startAlbum: startAlbum,
    refreshComfyReady: refreshComfyReady,
    pressMagic: pressMagic,
    startEndless: startEndless,
    startPlayback: startPlayback,
    stopEndless: stopEndless,
    previewFromCurrent: previewFromCurrent,
    resolveTarget: resolveTarget,
    applyStageFixture: applyStageFixture,
    liveStageInput: liveStageInput,
    renderStage: renderStage,
    afterLiveSwap: function (info) {
      remapGenericNames();
      renderShell();
      renderStage();
      return {
        ok: true,
        playing: state.phase === "playing",
        phase: state.phase,
        files: info && info.files ? info.files : [],
      };
    },
    setVisualMode: setVisualMode,
    rollVisual: rollVisual,
    sampleVisualState: sampleVisualState,
    toggleStageFullscreen: function () {
      var Stage = root.MainFloorStage;
      var el = typeof document !== "undefined" ? document.getElementById("stage") : null;
      if (!Stage || !Stage.toggleFullscreen || !el) return Promise.resolve(false);
      return Stage.toggleFullscreen(el, document);
    },
    syncFullscreenUi: function () {
      return false;
    },
  };
  root.MainFloorApp = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
