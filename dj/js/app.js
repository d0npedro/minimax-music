/**
 * MAIN FLOOR booth UI. Wires pure mixer/deck/generate modules to DOM + Web Audio.
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

  var state = {
    session: Deck ? Deck.createSession() : null,
    arc: 1,
    lastRequest: null,
    genStatus: "idle",
    target: "auto",
    peaks: { a: [], b: [] },
    endless: Endless ? Endless.createEndless({ arcIndex: 1 }) : null,
    crate: Crate ? Crate.createCrate({ warmupSize: 4, targetSize: 5 }) : null,
  };

  var audio = null;
  var comfy = null;
  var raf = 0;
  var cookLock = false;

  function $(sel, el) {
    return (el || document).querySelector(sel);
  }

  function deckEl(id) {
    return document.getElementById("deck-" + id);
  }

  function deckOf(id) {
    return state.session.decks[id];
  }

  function otherId(id) {
    return id === "a" ? "b" : "a";
  }

  function setStatus(text, cls) {
    state.genStatus = text;
    var el = $("#gen-status");
    if (el) el.textContent = text;
    if (cls) el.className = "gen-status " + cls;
  }

  function refreshArc() {
    document.querySelectorAll("#energy-arc button").forEach(function (btn) {
      btn.classList.toggle("active", Number(btn.getAttribute("data-arc")) === state.arc);
    });
    previewFromCurrent();
  }

  function previewFromCurrent() {
    var box = $("#caption-preview");
    if (!box || !Gen) return;
    var req = state.lastRequest;
    if (!req) {
      req = Gen.buildFromPrompt($("#prompt") && $("#prompt").value, { arc: state.arc, seed: 1 });
    } else {
      req = Object.assign({}, req, {
        arc: Gen.normalizeArc(state.arc),
        caption: Gen.captionFor({
          arc: state.arc,
          bpm: req.bpm,
          bpmMin: req.bpmMin,
          bpmMax: req.bpmMax,
          energy: req.energy,
          prompt: ($("#prompt") && $("#prompt").value) || req.prompt,
        }),
      });
    }
    box.textContent = req.caption;
    box.dataset.arc = req.arc;
    return req;
  }

  function applyPreset(name) {
    var req = Gen.buildFromPreset(name, { arc: state.arc, seed: Date.now() % 1e9 });
    state.lastRequest = req;
    if ($("#prompt")) $("#prompt").value = "";
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-preset") === name);
    });
    var match = $("#match-btn");
    if (match) match.classList.remove("on");
    previewFromCurrent();
    setStatus("preset: " + name);
    return req;
  }

  function applyMatch() {
    var playing = Deck.playingDeck(state.session);
    if (!playing) {
      setStatus("no deck to match");
      return null;
    }
    var req = Gen.matchPlayingDeck(playing, { arc: state.arc, seed: Date.now() % 1e9 });
    state.lastRequest = req;
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.classList.remove("on");
    });
    var match = $("#match-btn");
    if (match) match.classList.add("on");
    previewFromCurrent();
    setStatus("match " + playing.id + " " + req.bpmMin + "-" + req.bpmMax + " BPM");
    return req;
  }

  function resolveTarget() {
    var t = ($("#gen-target") && $("#gen-target").value) || state.target;
    if (t === "a" || t === "b") return t;
    return Deck.firstEmptyDeckId(state.session) || "b";
  }

  function drawWave(id) {
    var canvas = $("[data-role=wave]", deckEl(id));
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = "#050608";
    ctx.fillRect(0, 0, w, h);
    var peaks = state.peaks[id] || [];
    var deck = deckOf(id);
    ctx.fillStyle = id === "a" ? "#d6ff2f" : "#ff2d55";
    var mid = h / 2;
    for (var i = 0; i < peaks.length; i++) {
      var x = (i / peaks.length) * w;
      var amp = peaks[i] * (h * 0.46);
      ctx.fillRect(x, mid - amp, Math.max(1, w / peaks.length - 0.4), amp * 2);
    }
    if (deck.duration > 0) {
      var px = (deck.position / deck.duration) * w;
      ctx.fillStyle = "#ece8df";
      ctx.fillRect(px, 0, 2, h);
      if (deck.loop.in != null && deck.loop.out != null) {
        ctx.fillStyle = "rgba(61,224,255,0.15)";
        var x0 = (deck.loop.in / deck.duration) * w;
        var x1 = (deck.loop.out / deck.duration) * w;
        ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
      }
      deck.hotCues.forEach(function (pos, i) {
        if (pos == null) return;
        var colors = ["#3de0ff", "#ff2d55", "#ffd400", "#7dff4d"];
        ctx.fillStyle = colors[i];
        ctx.fillRect((pos / deck.duration) * w, 0, 2, h);
      });
    }
  }

  function renderDeck(id) {
    var deck = deckOf(id);
    var rootEl = deckEl(id);
    if (!rootEl) return;
    $("[data-role=name]", rootEl).textContent = deck.trackName || "empty";
    var pct = ((deck.tempo - 1) * 100).toFixed(1);
    $("[data-role=tempo]", rootEl).textContent = (deck.tempo >= 1 ? "+" : "") + pct + "%";
    $("[data-role=pos]", rootEl).textContent = deck.position.toFixed(1) + "s";
    var bpmIn = $("[data-act=bpm]", rootEl);
    if (bpmIn && document.activeElement !== bpmIn) bpmIn.value = deck.bpm;
    var tempoIn = $("[data-act=tempo]", rootEl);
    if (tempoIn && document.activeElement !== tempoIn) tempoIn.value = String(deck.tempo);
    $("[data-act=play]", rootEl).textContent = deck.playing ? "Pause" : "Play";
    $("[data-act=play]", rootEl).classList.toggle("on", deck.playing);
    $("[data-act=loop]", rootEl).classList.toggle("on", deck.loop.enabled);
    rootEl.querySelectorAll("[data-act=hot]").forEach(function (btn) {
      var i = Number(btn.getAttribute("data-i"));
      btn.classList.toggle("set", deck.hotCues[i] != null);
    });
    drawWave(id);
  }

  function render() {
    renderDeck("a");
    renderDeck("b");
  }

  function updateXfaderUi() {
    var xf = $("#xfader");
    if (xf) xf.value = String(state.session.xfader);
  }

  function nowClock() {
    if (audio && audio.context()) return audio.context().currentTime;
    return (root.performance ? performance.now() : Date.now()) / 1000;
  }

  function tickEndless() {
    if (!Endless || !state.endless || !state.endless.enabled) return;
    if (state.endless.warmingUp) {
      if (Crate && state.crate && Crate.needsFill(state.crate) && !cookLock) fillCrate();
      return;
    }
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
      setStatus("endless: mixing " + state.endless.liveId + " → " + state.endless.nextId);
      return;
    }
    if (Endless.shouldHoldLoop(state.endless, live, next)) {
      armTailLoop(live);
      if (!cookLock) cookNext();
      return;
    }
    if (next && !next.loaded) loadNextFromCrate();
    if (Crate && state.crate && Crate.needsFill(state.crate) && !cookLock) fillCrate();
    if (live && live.playing && next && !next.loaded && !cookLock) cookNext();
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
    setStatus("endless: recovered on " + nextId + " · buffer " + (Crate ? Crate.size(state.crate) : 0));
    fillCrate();
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
    setStatus("endless: live " + done.liveId + " · buffer " + (Crate ? Crate.size(state.crate) : 0));
    fillCrate();
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
    if (audio) audio.applyMixer(state.session);
    render();
    raf = root.requestAnimationFrame ? requestAnimationFrame(tick) : 0;
  }

  async function loadArrayBuffer(id, ab, info) {
    if (!audio) return;
    await audio.resume();
    var buf = await audio.decodeArrayBuffer(ab);
    audio.setBuffer(id, buf);
    Deck.loadTrack(deckOf(id), {
      trackName: (info && info.trackName) || "loaded",
      duration: buf.duration,
      bpm: info && info.bpm,
      energy: info && info.energy,
    });
    state.peaks[id] = audio.peaks(id, 480);
    audio.syncPlayback(state.session);
    render();
  }

  async function loadFile(id, file) {
    var ab = await file.arrayBuffer();
    await loadArrayBuffer(id, ab, { trackName: file.name });
  }

  function bindDeck(id) {
    var rootEl = deckEl(id);
    if (!rootEl) return;
    rootEl.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-act]");
      if (!btn || btn.tagName === "INPUT") return;
      var act = btn.getAttribute("data-act");
      var deck = deckOf(id);
      if (audio) audio.resume();
      if (act === "play") {
        if (deck.playing) Deck.pause(deck);
        else Deck.play(deck);
      } else if (act === "cue") {
        Deck.cue(deck);
      } else if (act === "sync") {
        Deck.syncTo(deck, deckOf(otherId(id)));
      } else if (act === "loop-in") {
        Deck.setLoopIn(deck);
        if (audio) audio.applyLoop(id, deck);
      } else if (act === "loop-out") {
        Deck.setLoopOut(deck);
        if (audio) audio.applyLoop(id, deck);
      } else if (act === "loop") {
        Deck.toggleLoop(deck);
        if (audio) audio.applyLoop(id, deck);
      } else if (act === "hot") {
        var i = Number(btn.getAttribute("data-i"));
        if (ev.shiftKey) Deck.clearHotCue(deck, i);
        else if (deck.hotCues[i] == null) Deck.setHotCue(deck, i, deck.position);
        else {
          Deck.jumpHotCue(deck, i);
          if (audio) audio.seek(id, deck);
        }
      }
      if (audio) audio.syncPlayback(state.session);
      render();
    });
    rootEl.addEventListener("input", function (ev) {
      var t = ev.target;
      var deck = deckOf(id);
      if (t.getAttribute("data-act") === "tempo") {
        Deck.setTempo(deck, Number(t.value));
        if (audio) audio.syncPlayback(state.session);
      }
      if (t.getAttribute("data-act") === "bpm") Deck.setBpm(deck, Number(t.value));
      render();
    });
    var fileIn = $("[data-act=load]", rootEl);
    if (fileIn) {
      fileIn.addEventListener("change", function () {
        if (fileIn.files && fileIn.files[0]) loadFile(id, fileIn.files[0]);
      });
    }
  }

  function bindMixer() {
    document.querySelectorAll("[data-eq]").forEach(function (col) {
      var id = col.getAttribute("data-eq");
      col.querySelectorAll("[data-eq-band]").forEach(function (sl) {
        sl.addEventListener("input", function () {
          deckOf(id).eq[sl.getAttribute("data-eq-band")] = Number(sl.value);
          if (audio) audio.applyMixer(state.session);
        });
      });
    });
    var fa = $("[data-act=filter-a]");
    var fb = $("[data-act=filter-b]");
    if (fa) fa.addEventListener("input", function () {
      deckOf("a").filter = Number(fa.value);
      if (audio) audio.applyMixer(state.session);
    });
    if (fb) fb.addEventListener("input", function () {
      deckOf("b").filter = Number(fb.value);
      if (audio) audio.applyMixer(state.session);
    });
    var xf = $("#xfader");
    if (xf) xf.addEventListener("input", function () {
      state.session.xfader = Number(xf.value);
      if (audio) audio.applyMixer(state.session);
    });
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

  function crateCount() {
    return Crate && state.crate ? Crate.size(state.crate) : 0;
  }

  function loadReadyItem(id, item) {
    if (!item || !item.audioBuffer || !audio) return false;
    audio.setBuffer(id, item.audioBuffer);
    Deck.loadTrack(deckOf(id), {
      trackName: (item.meta && item.meta.trackName) || "queued",
      duration: item.audioBuffer.duration,
      bpm: item.meta && item.meta.bpm,
      energy: item.meta && item.meta.energy,
    });
    state.peaks[id] = audio.peaks(id, 480);
    audio.syncPlayback(state.session);
    render();
    return true;
  }

  function loadNextFromCrate() {
    if (!Crate || !state.endless || !state.crate) return false;
    var nextId = state.endless.nextId;
    if (deckOf(nextId).loaded) return true;
    var item = Crate.shift(state.crate);
    if (!item) return false;
    return loadReadyItem(nextId, item);
  }

  async function generateAudio(request, label) {
    if (!comfy) return { ok: false, reason: "no-client" };
    var up = await comfy.ping();
    if (!up) return { ok: false, reason: "offline" };
    var payload = Gen.buildComfyPrompt(request);
    var queued = await comfy.queuePrompt(payload);
    var entry = await comfy.waitFor(queued.prompt_id, function () {
      setStatus("cooking " + crateCount() + "/" + (state.crate ? state.crate.targetSize : 5));
    });
    if (entry.status && entry.status.status_str === "error") return { ok: false, reason: "error" };
    var audioOut = entry.outputs && entry.outputs["35"] && entry.outputs["35"].audio && entry.outputs["35"].audio[0];
    if (!audioOut) return { ok: false, reason: "no-audio" };
    var ab = await comfy.fetchAudio(audioOut);
    var meta = {
      trackName: (label || request.preset || request.mode) + " " + request.bpm + "bpm",
      label: label || request.preset || request.mode || "track",
      bpm: request.bpm,
      energy: request.energy,
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
    previewFromCurrent();
    setStatus("buffer " + crateCount() + "/" + (state.crate ? state.crate.warmupSize : 4) + " · " + (label || "track"));
    try {
      var gen = await generateAudio(request, label);
      if (!gen.ok) {
        if (gen.reason === "offline") setStatus("ComfyUI offline — waiting to cook next");
        else setStatus("generate failed: " + gen.reason);
        return gen;
      }
      if (Crate && state.crate && gen.audioBuffer) {
        Crate.push(state.crate, { audioBuffer: gen.audioBuffer, meta: gen.meta });
      }
      setStatus("buffer " + crateCount() + "/" + (state.crate ? state.crate.targetSize : 5));
      return { ok: true, crate: crateCount() };
    } catch (err) {
      setStatus("generate failed: " + (err && err.message));
      return { ok: false, reason: "exception", error: String(err && err.message) };
    } finally {
      cookLock = false;
      if (state.endless) state.endless.cooking = false;
    }
  }

  function fillCrate() {
    if (!Crate || !state.crate || !state.endless || !state.endless.enabled || cookLock) return Promise.resolve();
    if (!Crate.needsFill(state.crate)) return Promise.resolve();
    var live = deckOf(state.endless.liveId);
    var plan = Endless.planNext(state.endless, live && live.loaded ? live : null, Gen);
    state.endless.arcIndex = plan.arcIndex;
    state.arc = plan.arcIndex;
    refreshArc();
    return cookIntoCrate(plan.request, plan.preset);
  }

  async function cookIntoDeck(target, request, label) {
    if (cookLock) return { ok: false, reason: "busy" };
    cookLock = true;
    if (state.endless) state.endless.cooking = true;
    state.lastRequest = request;
    previewFromCurrent();
    setStatus("queued → deck " + target + (label ? " · " + label : ""));
    try {
      if (!comfy) {
        setStatus("no comfy client");
        return { ok: false, reason: "no-client" };
      }
      var up = await comfy.ping();
      if (!up) {
        setStatus("ComfyUI offline — waiting to cook next");
        return { ok: false, reason: "offline" };
      }
      var payload = Gen.buildComfyPrompt(request);
      var queued = await comfy.queuePrompt(payload);
      setStatus("cooking " + (queued.prompt_id || "").slice(0, 8) + " → " + target);
      var entry = await comfy.waitFor(queued.prompt_id, function () {
        setStatus("cooking next into " + target);
      });
      if (entry.status && entry.status.status_str === "error") {
        setStatus("generate error");
        return { ok: false, reason: "error" };
      }
      var audioOut = entry.outputs && entry.outputs["35"] && entry.outputs["35"].audio && entry.outputs["35"].audio[0];
      if (!audioOut) {
        setStatus("no audio in history");
        return { ok: false, reason: "no-audio" };
      }
      var ab = await comfy.fetchAudio(audioOut);
      var meta = {
        trackName: (label || request.preset || request.mode) + " " + request.bpm + "bpm",
        label: label || request.preset || request.mode || "track",
        bpm: request.bpm,
        energy: request.energy,
      };
      await loadArrayBuffer(target, ab, meta);
      await saveProjectTrack(ab, meta);
      setStatus("next ready on " + target);
      return { ok: true, target: target };
    } catch (err) {
      setStatus("generate failed: " + (err && err.message));
      return { ok: false, reason: "exception", error: String(err && err.message) };
    } finally {
      cookLock = false;
      if (state.endless) state.endless.cooking = false;
    }
  }

  function cookNext() {
    if (!Endless || !state.endless || !state.endless.enabled) return Promise.resolve();
    loadNextFromCrate();
    return fillCrate();
  }

  function stopEndless() {
    if (state.endless) {
      state.endless.enabled = false;
      state.endless.mixing = false;
      state.endless.warmingUp = false;
    }
    var btn = $("#endless-btn");
    if (btn) btn.classList.remove("on");
    var magic = $("#magic-btn");
    if (magic) magic.classList.remove("on");
    setStatus("endless off");
  }

  async function startEndless() {
    if (!Endless || !OnePress || !Gen) {
      setStatus("endless missing");
      return { ok: false };
    }
    if (state.endless && state.endless.enabled) {
      stopEndless();
      return { ok: true, stopped: true };
    }
    state.endless = Endless.createEndless({ arcIndex: state.arc });
    state.endless.enabled = true;
    state.endless.warmingUp = true;
    var ebtn = $("#endless-btn");
    if (ebtn) ebtn.classList.add("on");
    var magic = $("#magic-btn");
    if (magic) {
      magic.classList.add("on");
      magic.disabled = true;
    }
    state.crate = Crate.createCrate({ warmupSize: 4, targetSize: 5 });
    setStatus("warming up 0/4");
    var pack = OnePress.startMagic(
      { generate: Gen, readiness: root.MainFloorReadiness, deck: Deck },
      { arc: state.arc, seed: Date.now() % 1e9, decks: state.session.decks }
    );
    var first = await cookIntoCrate(pack.request, pack.preset);
    if (magic) magic.disabled = false;
    if (!first.ok) {
      if (first.reason === "offline" && OnePress.offlineStartedStatus) {
        setStatus(OnePress.offlineStartedStatus(pack).statusText);
      }
      return first;
    }
    while (state.endless.enabled && Crate && !Crate.readyToStart(state.crate)) {
      var more = await fillCrate();
      if (more && more.ok === false) break;
    }
    if (Crate.size(state.crate) < 2) {
      setStatus("warmup failed — need two decks");
      state.endless.warmingUp = false;
      return { ok: false, reason: "empty-crate" };
    }
    var liveId = "a";
    state.endless.liveId = liveId;
    state.endless.nextId = "b";
    loadReadyItem(liveId, Crate.shift(state.crate));
    loadNextFromCrate();
    state.session.xfader = Endless.xfaderForLive(liveId);
    updateXfaderUi();
    var live = deckOf(liveId);
    Deck.play(live);
    armTailLoop(live);
    if (audio) {
      await audio.resume();
      audio.syncPlayback(state.session);
    }
    state.endless.warmingUp = false;
    setStatus("endless: A playing, B cued · buffer " + crateCount());
    fillCrate();
    return { ok: true, endless: true };
  }

  async function pressMagic() {
    return startEndless();
  }

  async function generateNow() {
    var extra = $("#prompt") && $("#prompt").value;
    var req = state.lastRequest;
    if (!req) req = Gen.buildFromPrompt(extra, { arc: state.arc });
    else if (extra) {
      req = Gen.buildFromPrompt(extra, {
        arc: state.arc,
        bpm: req.bpm,
        energy: req.energy,
        seed: req.seed,
      });
    } else {
      req = Object.assign({}, req, { seed: Date.now() % 1e9 });
      req.caption = Gen.captionFor(req);
    }
    state.lastRequest = req;
    previewFromCurrent();
    var target = resolveTarget();
    setStatus("queued → deck " + target);
    var payload = Gen.buildComfyPrompt(req);
    if (!comfy) {
      setStatus("no comfy client");
      return { ok: false, reason: "no-client", request: req, payload: payload, target: target };
    }
    var up = await comfy.ping();
    if (!up) {
      setStatus("ComfyUI offline — payload ready");
      return { ok: false, reason: "offline", request: req, payload: payload, target: target };
    }
    try {
      var queued = await comfy.queuePrompt(payload);
      setStatus("cooking " + queued.prompt_id.slice(0, 8));
      var entry = await comfy.waitFor(queued.prompt_id, function () {
        setStatus("cooking…");
      });
      var msgs = (entry.status && entry.status.messages) || [];
      var failed = entry.status && entry.status.status_str === "error";
      if (failed) {
        setStatus("generate error");
        return { ok: false, reason: "error", entry: entry, request: req };
      }
      var audioOut = entry.outputs && entry.outputs["35"] && entry.outputs["35"].audio && entry.outputs["35"].audio[0];
      if (!audioOut) {
        setStatus("no audio in history");
        return { ok: false, reason: "no-audio", entry: entry, request: req };
      }
      var ab = await comfy.fetchAudio(audioOut);
      var meta = {
        trackName: req.preset || req.mode + " " + req.bpm + "bpm",
        label: req.preset || req.mode || "track",
        bpm: req.bpm,
        energy: req.energy,
      };
      await loadArrayBuffer(target, ab, meta);
      await saveProjectTrack(ab, meta);
      setStatus("loaded deck " + target);
      return { ok: true, target: target, request: req, promptId: queued.prompt_id };
    } catch (err) {
      setStatus("generate failed: " + (err && err.message));
      return { ok: false, reason: "exception", error: String(err && err.message) };
    }
  }

  async function pingComfy() {
    var pill = $("#comfy-pill");
    var up = false;
    var healthUrl = root.MainFloorReadiness ? root.MainFloorReadiness.healthUrl() : "/health";
    try {
      var health = await fetch(healthUrl, { cache: "no-store" }).then(function (r) {
        return r.json();
      });
      if (health && health.comfy) up = !!health.comfy.up;
    } catch (e) {
      if (comfy) up = await comfy.ping();
    }
    if (pill) {
      pill.textContent = up ? "ComfyUI live" : "ComfyUI offline";
      pill.className = "status-pill " + (up ? "up" : "down");
      pill.dataset.ready = up ? "up" : "down";
    }
    return up;
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
    bindDeck("a");
    bindDeck("b");
    bindMixer();
    document.querySelectorAll("#energy-arc button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.arc = Number(btn.getAttribute("data-arc"));
        if (state.lastRequest) {
          state.lastRequest.arc = Gen.normalizeArc(state.arc);
          state.lastRequest.caption = Gen.captionFor(state.lastRequest);
        }
        refreshArc();
      });
    });
    document.querySelectorAll("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyPreset(btn.getAttribute("data-preset"));
      });
    });
    var match = $("#match-btn");
    if (match) match.addEventListener("click", applyMatch);
    var genBtn = $("#generate-btn");
    if (genBtn) genBtn.addEventListener("click", function () {
      generateNow();
    });
    var magicBtn = $("#magic-btn");
    if (magicBtn) magicBtn.addEventListener("click", function () {
      pressMagic();
    });
    var endlessBtn = $("#endless-btn");
    if (endlessBtn) {
      endlessBtn.addEventListener("click", function () {
        if (state.endless && state.endless.enabled) stopEndless();
        else startEndless();
      });
    }
    if ($("#prompt")) {
      $("#prompt").addEventListener("input", function () {
        previewFromCurrent();
      });
    }
    refreshArc();
    render();
    pingComfy();
    if (root.requestAnimationFrame) raf = requestAnimationFrame(tick);
  }

  var api = {
    state: state,
    boot: boot,
    applyPreset: applyPreset,
    applyMatch: applyMatch,
    generateNow: generateNow,
    pressMagic: pressMagic,
    startEndless: startEndless,
    stopEndless: stopEndless,
    previewFromCurrent: previewFromCurrent,
    resolveTarget: resolveTarget,
    loadArrayBuffer: loadArrayBuffer,
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
