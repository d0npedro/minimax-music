/**
 * Pure two-deck session state: tempo, cue, sync, hot cues, loop.
 * No DOM, no audio I/O.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorDeck = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createDeck(id) {
    return {
      id: id,
      playing: false,
      loaded: false,
      trackName: null,
      position: 0,
      duration: 0,
      cuePoint: 0,
      tempo: 1,
      bpm: 150,
      energy: "drive",
      volume: 1,
      eq: { low: 0.5, mid: 0.5, high: 0.5 },
      filter: 0.5,
      hotCues: [null, null, null, null],
      loop: { in: null, out: null, enabled: false },
    };
  }

  function createSession() {
    return {
      decks: { a: createDeck("a"), b: createDeck("b") },
      xfader: 0.5,
      masterGain: 1,
    };
  }

  function play(deck) {
    if (!deck.loaded) return deck;
    deck.playing = true;
    return deck;
  }

  function pause(deck) {
    deck.playing = false;
    return deck;
  }

  function togglePlay(deck) {
    return deck.playing ? pause(deck) : play(deck);
  }

  function cue(deck) {
    deck.playing = false;
    deck.position = deck.cuePoint || 0;
    return deck;
  }

  function setCuePoint(deck, seconds) {
    deck.cuePoint = Math.max(0, Number(seconds) || 0);
    return deck;
  }

  function setTempo(deck, tempo) {
    var t = Number(tempo);
    if (!isFinite(t)) t = 1;
    deck.tempo = Math.min(1.5, Math.max(0.5, t));
    return deck;
  }

  function setBpm(deck, bpm) {
    var n = Number(bpm);
    if (isFinite(n) && n > 0) deck.bpm = n;
    return deck;
  }

  function syncTo(slave, master) {
    if (!slave || !master) return slave;
    slave.tempo = master.tempo;
    return slave;
  }

  function setHotCue(deck, index, position) {
    if (index < 0 || index > 3) return deck;
    var pos = position == null ? deck.position : Number(position);
    deck.hotCues[index] = pos;
    return deck;
  }

  function clearHotCue(deck, index) {
    if (index < 0 || index > 3) return deck;
    deck.hotCues[index] = null;
    return deck;
  }

  function jumpHotCue(deck, index) {
    if (index < 0 || index > 3) return deck;
    var pos = deck.hotCues[index];
    if (pos == null) return deck;
    deck.position = pos;
    return deck;
  }

  function setLoopIn(deck, position) {
    deck.loop.in = position == null ? deck.position : Number(position);
    return deck;
  }

  function setLoopOut(deck, position) {
    deck.loop.out = position == null ? deck.position : Number(position);
    if (deck.loop.in != null && deck.loop.out != null && deck.loop.out > deck.loop.in) {
      deck.loop.enabled = true;
    }
    return deck;
  }

  function enableLoop(deck, on) {
    deck.loop.enabled = on !== false;
    return deck;
  }

  function toggleLoop(deck) {
    if (deck.loop.in == null || deck.loop.out == null || deck.loop.out <= deck.loop.in) {
      deck.loop.enabled = false;
      return deck;
    }
    deck.loop.enabled = !deck.loop.enabled;
    return deck;
  }

  function loadTrack(deck, info) {
    info = info || {};
    deck.loaded = true;
    deck.trackName = info.trackName || "untitled";
    deck.duration = Number(info.duration) || 0;
    deck.position = 0;
    deck.cuePoint = 0;
    deck.playing = false;
    if (info.bpm) setBpm(deck, info.bpm);
    if (info.energy) deck.energy = info.energy;
    deck.artist = info.artist || null;
    deck.album = info.album || null;
    deck.youtubeMusic = info.youtubeMusic || null;
    deck.albumIndex = info.albumIndex != null ? info.albumIndex : null;
    deck.catalog = info.catalog || null;
    deck.file = info.file || (info.meta && info.meta.file) || null;
    deck.hotCues = [null, null, null, null];
    deck.loop = { in: null, out: null, enabled: false };
    return deck;
  }

  function emptyDeck(deck) {
    deck.loaded = false;
    deck.trackName = null;
    deck.artist = null;
    deck.album = null;
    deck.youtubeMusic = null;
    deck.albumIndex = null;
    deck.catalog = null;
    deck.file = null;
    deck.duration = 0;
    deck.position = 0;
    deck.playing = false;
    deck.hotCues = [null, null, null, null];
    deck.loop = { in: null, out: null, enabled: false };
    return deck;
  }

  function firstEmptyDeckId(session) {
    if (!session.decks.a.loaded) return "a";
    if (!session.decks.b.loaded) return "b";
    return null;
  }

  function playingDeck(session) {
    if (session.decks.a.playing) return session.decks.a;
    if (session.decks.b.playing) return session.decks.b;
    if (session.decks.a.loaded) return session.decks.a;
    if (session.decks.b.loaded) return session.decks.b;
    return null;
  }

  return {
    createDeck: createDeck,
    createSession: createSession,
    play: play,
    pause: pause,
    togglePlay: togglePlay,
    cue: cue,
    setCuePoint: setCuePoint,
    setTempo: setTempo,
    setBpm: setBpm,
    syncTo: syncTo,
    setHotCue: setHotCue,
    clearHotCue: clearHotCue,
    jumpHotCue: jumpHotCue,
    setLoopIn: setLoopIn,
    setLoopOut: setLoopOut,
    enableLoop: enableLoop,
    toggleLoop: toggleLoop,
    loadTrack: loadTrack,
    emptyDeck: emptyDeck,
    firstEmptyDeckId: firstEmptyDeckId,
    playingDeck: playingDeck,
  };
});
