/**
 * Web Audio adapter. Reads pure deck/mixer state; does not own mixer math.
 * Playhead / restart policy is exported so tests drive the same functions the engine uses.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorAudio = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  function computePlayhead(originPos, startedAt, now, tempo, loop, duration) {
    var elapsed = (now - startedAt) * tempo;
    var pos = originPos + elapsed;
    if (loop && loop.enabled && loop.in != null && loop.out != null && loop.out > loop.in) {
      var span = loop.out - loop.in;
      if (pos >= loop.out && span > 0) {
        pos = loop.in + ((pos - loop.in) % span);
      }
    }
    if (duration && pos > duration) pos = duration;
    return Math.max(0, pos);
  }

  function seekClock(now, position) {
    return { originPos: position, startedAt: now, position: position };
  }

  function tempoSnapshot(originPos, startedAt, now, oldTempo, loop, duration) {
    var pos = computePlayhead(originPos, startedAt, now, oldTempo, loop, duration);
    return { originPos: pos, startedAt: now, position: pos };
  }

  function loopFingerprint(loop) {
    loop = loop || {};
    return String(!!loop.enabled) + ":" + String(loop.in) + ":" + String(loop.out);
  }

  function playbackAction(opts) {
    opts = opts || {};
    if (!opts.playing) return opts.hasSource ? "stop" : "none";
    if (!opts.hasSource) return "start";
    if (opts.seeked || opts.loopChanged) return "restart";
    if (opts.tempoChanged) return "tempo";
    return "none";
  }

  function createAudioEngine(mixer) {
    var ctx = null;
    var master = null;
    var startedAt = { a: 0, b: 0 };
    var originPos = { a: 0, b: 0 };
    var lastTempo = { a: 1, b: 1 };
    var lastLoop = { a: loopFingerprint(null), b: loopFingerprint(null) };
    var sources = { a: null, b: null };
    var buffers = { a: null, b: null };
    var channels = { a: null, b: null };

    function ensure() {
      if (ctx) return ctx;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) throw new Error("Web Audio not available");
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      ["a", "b"].forEach(function (id) {
        var low = ctx.createBiquadFilter();
        low.type = "lowshelf";
        low.frequency.value = 250;
        var mid = ctx.createBiquadFilter();
        mid.type = "peaking";
        mid.frequency.value = 1000;
        mid.Q.value = 0.7;
        var high = ctx.createBiquadFilter();
        high.type = "highshelf";
        high.frequency.value = 4000;
        var filter = ctx.createBiquadFilter();
        filter.type = "allpass";
        filter.frequency.value = 1000;
        var gain = ctx.createGain();
        low.connect(mid);
        mid.connect(high);
        high.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        channels[id] = { low: low, mid: mid, high: high, filter: filter, gain: gain };
      });
      return ctx;
    }

    function dbFromLinear(g) {
      if (g <= 0.0001) return -60;
      return 20 * Math.log10(g);
    }

    function applyMixer(session) {
      if (!ctx) return;
      master.gain.value = session.masterGain == null ? 1 : session.masterGain;
      ["a", "b"].forEach(function (id) {
        var deck = session.decks[id];
        var ch = channels[id];
        if (!ch) return;
        var xf = mixer.crossfaderGains(session.xfader);
        var side = id === "b" ? xf.b : xf.a;
        ch.low.gain.value = dbFromLinear(mixer.eqBandGain(deck.eq.low));
        ch.mid.gain.value = dbFromLinear(mixer.eqBandGain(deck.eq.mid));
        ch.high.gain.value = dbFromLinear(mixer.eqBandGain(deck.eq.high));
        ch.gain.gain.value = side * (deck.volume == null ? 1 : deck.volume);
        var f = deck.filter;
        if (f < 0.48) {
          ch.filter.type = "highpass";
          ch.filter.frequency.value = 40 + (0.5 - f) * 2 * 1200;
        } else if (f > 0.52) {
          ch.filter.type = "lowpass";
          ch.filter.frequency.value = 18000 - (f - 0.5) * 2 * 16000;
        } else {
          ch.filter.type = "allpass";
          ch.filter.frequency.value = 1000;
        }
      });
    }

    function stopSource(id) {
      if (sources[id]) {
        try {
          sources[id].stop();
        } catch (e) {
          /* already stopped */
        }
        try {
          sources[id].disconnect();
        } catch (e2) {
          /* already disconnected */
        }
        sources[id] = null;
      }
    }

    function appliedRate(id, deck) {
      return lastTempo[id] != null ? lastTempo[id] : deck.tempo;
    }

    function currentPosition(id, deck) {
      if (!ctx || !deck.playing) return deck.position;
      return computePlayhead(
        originPos[id],
        startedAt[id],
        ctx.currentTime,
        appliedRate(id, deck),
        deck.loop,
        deck.duration
      );
    }

    function startSource(id, deck) {
      stopSource(id);
      if (!buffers[id] || !ctx) return;
      var src = ctx.createBufferSource();
      src.buffer = buffers[id];
      src.playbackRate.value = deck.tempo;
      src.loop = !!(deck.loop.enabled && deck.loop.in != null && deck.loop.out != null && deck.loop.out > deck.loop.in);
      if (src.loop) {
        src.loopStart = deck.loop.in;
        src.loopEnd = deck.loop.out;
      }
      src.connect(channels[id].low);
      var maxOff = Math.max(0, buffers[id].duration - 0.01);
      var offset = Math.min(Math.max(0, deck.position), maxOff);
      src.start(0, offset);
      sources[id] = src;
      startedAt[id] = ctx.currentTime;
      originPos[id] = offset;
      lastTempo[id] = deck.tempo;
      lastLoop[id] = loopFingerprint(deck.loop);
      src.onended = function () {
        if (sources[id] === src) sources[id] = null;
      };
    }

    function applyTempoLive(id, deck) {
      var snap = tempoSnapshot(
        originPos[id],
        startedAt[id],
        ctx.currentTime,
        appliedRate(id, deck),
        deck.loop,
        deck.duration
      );
      originPos[id] = snap.originPos;
      startedAt[id] = snap.startedAt;
      lastTempo[id] = deck.tempo;
      if (sources[id]) sources[id].playbackRate.value = deck.tempo;
      deck.position = snap.position;
    }

    function seek(id, deck) {
      ensure();
      if (deck.playing && buffers[id]) startSource(id, deck);
      else originPos[id] = deck.position;
    }

    function applyLoop(id, deck) {
      ensure();
      if (deck.playing && buffers[id] && ctx) {
        deck.position = currentPosition(id, deck);
        startSource(id, deck);
      } else {
        lastLoop[id] = loopFingerprint(deck.loop);
      }
    }

    function syncPlayback(session) {
      ensure();
      applyMixer(session);
      ["a", "b"].forEach(function (id) {
        var deck = session.decks[id];
        var loopChanged = loopFingerprint(deck.loop) !== lastLoop[id];
        var tempoChanged = Math.abs((deck.tempo || 1) - (lastTempo[id] || 1)) > 1e-6;
        var action = playbackAction({
          playing: !!(deck.playing && buffers[id]),
          hasSource: !!sources[id],
          seeked: false,
          loopChanged: loopChanged,
          tempoChanged: tempoChanged,
        });
        if (action === "stop") {
          stopSource(id);
          return;
        }
        if (action === "start" || action === "restart") {
          if (action === "restart" && ctx) {
            deck.position = currentPosition(id, deck);
          }
          startSource(id, deck);
          return;
        }
        if (action === "tempo") {
          applyTempoLive(id, deck);
        }
      });
    }

    function setBuffer(id, audioBuffer) {
      buffers[id] = audioBuffer;
    }

    function getBuffer(id) {
      return buffers[id];
    }

    function decodeArrayBuffer(ab) {
      ensure();
      return ctx.decodeAudioData(ab.slice(0));
    }

    function resume() {
      ensure();
      if (ctx.state === "suspended") return ctx.resume();
      return Promise.resolve();
    }

    function peaks(id, buckets) {
      var buf = buffers[id];
      if (!buf) return [];
      buckets = buckets || 400;
      var data = buf.getChannelData(0);
      var block = Math.max(1, Math.floor(data.length / buckets));
      var out = new Array(buckets);
      for (var i = 0; i < buckets; i++) {
        var start = i * block;
        var max = 0;
        for (var j = 0; j < block && start + j < data.length; j += 8) {
          var v = Math.abs(data[start + j]);
          if (v > max) max = v;
        }
        out[i] = max;
      }
      return out;
    }

    function sourceState(id) {
      var src = sources[id];
      if (!src) return null;
      return {
        offset: src.offset != null ? src.offset : originPos[id],
        loop: !!src.loop,
        loopStart: src.loopStart,
        loopEnd: src.loopEnd,
        playbackRate: src.playbackRate.value,
        originPos: originPos[id],
        startedAt: startedAt[id],
        lastTempo: lastTempo[id],
        lastLoop: lastLoop[id],
      };
    }

    return {
      ensure: ensure,
      resume: resume,
      applyMixer: applyMixer,
      syncPlayback: syncPlayback,
      setBuffer: setBuffer,
      getBuffer: getBuffer,
      decodeArrayBuffer: decodeArrayBuffer,
      currentPosition: currentPosition,
      seek: seek,
      applyLoop: applyLoop,
      peaks: peaks,
      sourceState: sourceState,
      context: function () {
        return ctx;
      },
    };
  }

  return {
    createAudioEngine: createAudioEngine,
    computePlayhead: computePlayhead,
    seekClock: seekClock,
    tempoSnapshot: tempoSnapshot,
    loopFingerprint: loopFingerprint,
    playbackAction: playbackAction,
  };
});
