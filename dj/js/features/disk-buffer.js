/**
 * Top up the live crate from already-generated disk tracks when the
 * queue drains faster than MiniMax can cook.
 */
(function (root) {
  var WANT = 12;
  var topping = false;

  function hookContext() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC || !AC.prototype || AC.prototype.__mfHooked) return;
    var orig = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () {
      root.__mfCtx = this;
      return orig.apply(this, arguments);
    };
    AC.prototype.__mfHooked = true;
  }

  function usedNames(state) {
    var used = {};
    function add(obj) {
      var f = obj && ((obj.meta && obj.meta.file) || obj.file);
      if (f) used[String(f).replace(/^.*[\\/]/, "")] = true;
    }
    if (!state) return used;
    if (state.session && state.session.decks) {
      add(state.session.decks.a);
      add(state.session.decks.b);
    }
    (state.crate && state.crate.items ? state.crate.items : []).forEach(add);
    return used;
  }

  async function topUp() {
    var app = root.MainFloorApp;
    var Tracks = root.MainFloorTracks;
    var Crate = root.MainFloorCrate;
    var Stage = root.MainFloorStage;
    if (!app || !app.state || topping) return 0;
    var state = app.state;
    if (state.phase !== "playing" || !state.crate || state.source === "album") return 0;
    var have = Crate.size(state.crate);
    if (have >= WANT) return 0;
    var ctx = root.__mfCtx;
    if (!ctx || typeof ctx.decodeAudioData !== "function") return 0;
    topping = true;
    var added = 0;
    try {
      var res = await fetch("/tracks", { cache: "no-store" });
      if (!res.ok) return 0;
      var json = await res.json();
      var used = usedNames(state);
      var files = Tracks.unusedExisting
        ? Tracks.unusedExisting(json.files || [], Object.keys(used), WANT - have)
        : [];
      for (var i = 0; i < files.length && Crate.size(state.crate) < WANT; i++) {
        var name = typeof files[i] === "string" ? files[i] : files[i].file;
        if (!name || used[name]) continue;
        var bin = await fetch(Tracks.trackAudioUrl(name), { cache: "no-store" });
        if (!bin.ok) continue;
        var ab = await bin.arrayBuffer();
        if (!ab || ab.byteLength < 256) continue;
        var audioBuffer = await ctx.decodeAudioData(ab.slice(0));
        if (!audioBuffer) continue;
        var info = Tracks.metaFromFileName(name);
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
        used[name] = true;
        added++;
      }
      if (added && app.afterLiveSwap) app.afterLiveSwap({ files: ["js/features/disk-buffer.js"] });
      var countEl = document.getElementById("queue-count");
      if (countEl && root.MainFloorMagic) {
        countEl.textContent = root.MainFloorMagic.queueCountLabel(Crate.size(state.crate));
      }
      return added;
    } catch (err) {
      return added;
    } finally {
      topping = false;
    }
  }

  function start() {
    if (typeof document === "undefined") return;
    hookContext();
    if (root.setInterval) {
      root.setInterval(function () {
        hookContext();
        topUp();
      }, 2500);
    }
    if (root.requestAnimationFrame) {
      root.requestAnimationFrame(function () {
        topUp();
      });
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  root.MainFloorDiskBuffer = { topUp: topUp, WANT: WANT };
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
