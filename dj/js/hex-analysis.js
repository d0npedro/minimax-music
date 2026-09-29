/**
 * Hex — offline PCM analysis → AnalysisTimeline.
 * Pure functions; no DOM. Dual window + module.exports for Node tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorHex = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ANALYSIS_VERSION = 1;
  var BAND_NAMES = ["sub", "bass", "lowMid", "mid", "highMid", "presence", "air"];
  var BAND_EDGES_HZ = {
    sub: [20, 60],
    bass: [60, 150],
    lowMid: [150, 400],
    mid: [400, 1000],
    highMid: [1000, 2500],
    presence: [2500, 6000],
    air: [6000, 16000],
  };

  function clamp01(x) {
    return Math.min(1, Math.max(0, x));
  }

  function nextPow2(n) {
    var p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  function hannWindow(n) {
    var w = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
    }
    return w;
  }

  function padToPow2(frame, nfft) {
    var out = new Float32Array(nfft);
    out.set(frame.subarray(0, Math.min(frame.length, nfft)));
    return out;
  }

  function fftMagnitudes(reIn) {
    var n = reIn.length;
    if (n === 0 || (n & (n - 1)) !== 0) {
      throw new Error("fftMagnitudes expects power-of-2 length, got " + n);
    }
    var re = new Float32Array(n);
    var im = new Float32Array(n);
    re.set(reIn);

    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        var ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }

    for (var len = 2; len <= n; len <<= 1) {
      var ang = (-2 * Math.PI) / len;
      var wlenRe = Math.cos(ang);
      var wlenIm = Math.sin(ang);
      for (var i0 = 0; i0 < n; i0 += len) {
        var wRe = 1;
        var wIm = 0;
        for (var j0 = 0; j0 < len / 2; j0++) {
          var uRe = re[i0 + j0];
          var uIm = im[i0 + j0];
          var vRe = re[i0 + j0 + len / 2] * wRe - im[i0 + j0 + len / 2] * wIm;
          var vIm = re[i0 + j0 + len / 2] * wIm + im[i0 + j0 + len / 2] * wRe;
          re[i0 + j0] = uRe + vRe;
          im[i0 + j0] = uIm + vIm;
          re[i0 + j0 + len / 2] = uRe - vRe;
          im[i0 + j0 + len / 2] = uIm - vIm;
          var nWRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nWRe;
        }
      }
    }

    var half = n / 2;
    var mags = new Float32Array(half);
    var inv = 1 / n;
    for (var k = 0; k < half; k++) {
      mags[k] = Math.hypot(re[k] * inv, im[k] * inv);
    }
    return mags;
  }

  function emptyBands() {
    return {
      sub: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      presence: 0,
      air: 0,
    };
  }

  function bandsFromSpectrum(mags, sampleRate, nfft) {
    var out = emptyBands();
    var binHz = sampleRate / nfft;
    var sums = {};
    var bi;
    for (bi = 0; bi < BAND_NAMES.length; bi++) {
      sums[BAND_NAMES[bi]] = { e: 0, c: 0 };
    }
    for (var i = 1; i < mags.length; i++) {
      var hz = i * binHz;
      var m = mags[i];
      for (bi = 0; bi < BAND_NAMES.length; bi++) {
        var name = BAND_NAMES[bi];
        var edge = BAND_EDGES_HZ[name];
        if (hz >= edge[0] && hz < edge[1]) {
          sums[name].e += m * m;
          sums[name].c += 1;
        }
      }
    }
    for (bi = 0; bi < BAND_NAMES.length; bi++) {
      var nm = BAND_NAMES[bi];
      var pair = sums[nm];
      out[nm] = pair.c ? Math.sqrt(pair.e / pair.c) : 0;
    }
    return out;
  }

  function normalizeBands(b) {
    var max = 1e-9;
    var i;
    for (i = 0; i < BAND_NAMES.length; i++) max = Math.max(max, b[BAND_NAMES[i]]);
    var out = emptyBands();
    for (i = 0; i < BAND_NAMES.length; i++) out[BAND_NAMES[i]] = Math.min(1, b[BAND_NAMES[i]] / max);
    return out;
  }

  function smooth(arr, radius) {
    if (radius <= 0) return arr.slice();
    var out = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
      var s = 0;
      var c = 0;
      for (var k = -radius; k <= radius; k++) {
        var j = i + k;
        if (j < 0 || j >= arr.length) continue;
        s += arr[j];
        c++;
      }
      out[i] = s / c;
    }
    return out;
  }

  function percentile(sortedCopy, p) {
    if (!sortedCopy.length) return 0;
    var idx = Math.min(sortedCopy.length - 1, Math.max(0, Math.floor(p * (sortedCopy.length - 1))));
    return sortedCopy[idx];
  }

  function buildTensionArc(frames) {
    if (!frames.length) return { t: [], v: [] };
    var lastT = frames[frames.length - 1].t;
    var step = Math.max(1, Math.round(frames.length / Math.max(1, lastT * 10)));
    var t = [];
    var raw = [];
    for (var i = 0; i < frames.length; i += step) {
      var f = frames[i];
      var bandTilt =
        (f.bands.presence + f.bands.air + f.bands.highMid) / 3 - (f.bands.sub + f.bands.bass) / 2;
      var v = clamp01(
        f.rms * 0.35 + f.spectralFlux * 0.3 + f.onsetStrength * 0.2 + clamp01(0.5 + bandTilt) * 0.15
      );
      t.push(f.t);
      raw.push(v);
    }
    return { t: t, v: smooth(raw, 2) };
  }

  function labelSection(idx, _total, _energy, start, duration) {
    if (start < duration * 0.08) return "intro";
    if (start > duration * 0.88) return "outro";
    return "unknown";
  }

  function refineLabel(sec, idx, total, maxE) {
    if (idx === 0) return "intro";
    if (idx === total - 1) return "outro";
    var rel = sec.energyMean / maxE;
    if (rel > 0.85) return "drop";
    if (rel < 0.35) return "break";
    return rel > 0.6 ? "verse" : "build";
  }

  function detectSections(frames, hopSec) {
    if (!frames.length) return [];
    var duration = frames[frames.length - 1].t + hopSec;
    var novelty = [0];
    var i;
    for (i = 1; i < frames.length; i++) {
      var a = frames[i - 1];
      var b = frames[i];
      var bandDiff = 0;
      for (var bi = 0; bi < BAND_NAMES.length; bi++) {
        var name = BAND_NAMES[bi];
        bandDiff += Math.abs(a.bands[name] - b.bands[name]);
      }
      novelty.push(
        Math.abs(a.rms - b.rms) * 0.5 + bandDiff / BAND_NAMES.length + Math.abs(a.spectralFlux - b.spectralFlux) * 0.3
      );
    }
    var sn = smooth(novelty, 3);
    var sorted = sn.slice().sort(function (x, y) {
      return x - y;
    });
    var thr = Math.max(0.08, percentile(sorted, 0.88));
    var minGap = Math.max(8, Math.round(4 / hopSec));
    var boundaries = [0];
    var last = 0;
    for (i = minGap; i < sn.length - minGap; i++) {
      if (sn[i] > thr && sn[i] >= sn[i - 1] && sn[i] >= sn[i + 1]) {
        if (i - last >= minGap) {
          boundaries.push(i);
          last = i;
        }
      }
    }
    boundaries.push(frames.length - 1);

    var sections = [];
    for (var s = 0; s < boundaries.length - 1; s++) {
      var i0 = boundaries[s];
      var i1 = boundaries[s + 1];
      var e = 0;
      var c = 0;
      for (i = i0; i <= i1; i++) {
        e += frames[i].rms;
        c++;
      }
      var energyMean = c ? e / c : 0;
      var startSec = frames[i0].t;
      var endSec = s === boundaries.length - 2 ? duration : frames[i1].t;
      sections.push({
        startSec: startSec,
        endSec: endSec,
        label: labelSection(s, sections.length, energyMean, startSec, duration),
        energyMean: energyMean,
      });
    }
    var maxE = 1e-9;
    for (i = 0; i < sections.length; i++) maxE = Math.max(maxE, sections[i].energyMean);
    return sections.map(function (sec, idx) {
      return {
        startSec: sec.startSec,
        endSec: sec.endSec,
        energyMean: sec.energyMean,
        label: refineLabel(sec, idx, sections.length, maxE),
      };
    });
  }

  function detectEvents(frames, hopSec) {
    if (!frames.length) return [];

    var onsetEnv = frames.map(function (f) {
      return f.onsetStrength;
    });
    var smoothOnset = smooth(onsetEnv, 1);
    var sorted = smoothOnset.slice().sort(function (a, b) {
      return a - b;
    });
    var med = percentile(sorted, 0.5);
    var madArr = smoothOnset
      .map(function (v) {
        return Math.abs(v - med);
      })
      .sort(function (a, b) {
        return a - b;
      });
    var mad = Math.max(1e-4, percentile(madArr, 0.5));
    var thrGlobal = Math.max(0.12, percentile(sorted, 0.72));
    var thrAdaptive = med + 3.5 * mad;
    var thr = Math.min(thrGlobal, Math.max(0.1, thrAdaptive));
    var refractory = Math.max(2, Math.round(0.08 / hopSec));

    var events = [];
    var lastOnset = -999;
    var i;
    for (i = 1; i < frames.length - 1; i++) {
      var v = smoothOnset[i];
      var local = 0;
      var lw = 6;
      var lc = 0;
      for (var k = -lw; k <= lw; k++) {
        var j = i + k;
        if (j < 0 || j >= smoothOnset.length || k === 0) continue;
        local += smoothOnset[j];
        lc++;
      }
      local = lc ? local / lc : 0;
      var isPeak =
        v >= smoothOnset[i - 1] && v >= smoothOnset[i + 1] && v > thr * 0.55 && v > local * 1.35 + 0.04;
      if (isPeak && i - lastOnset >= refractory) {
        events.push({ type: "onset", t: frames[i].t, strength: v });
        lastOnset = i;
      }
    }

    var rms = frames.map(function (f) {
      return f.rms;
    });
    var bass = frames.map(function (f) {
      return f.bands.bass;
    });
    var win = Math.max(4, Math.round(0.4 / hopSec));
    for (i = win; i < frames.length - win; i++) {
      var pre = 0;
      var post = 0;
      var preB = 0;
      var postB = 0;
      var k2;
      for (k2 = 1; k2 <= win; k2++) {
        pre += rms[i - k2];
        post += rms[i + k2];
        preB += bass[i - k2];
        postB += bass[i + k2];
      }
      pre /= win;
      post /= win;
      preB /= win;
      postB /= win;
      var rise = post - pre;
      var bassRise = postB - preB;
      if (rise > 0.22 && bassRise > 0.12 && frames[i].onsetStrength > 0.25) {
        var tDrop = frames[i].t;
        var nearDrop = events.some(function (e) {
          return e.type === "drop" && Math.abs(e.t - tDrop) < 0.5;
        });
        if (!nearDrop) {
          events.push({
            type: "drop",
            t: tDrop,
            strength: clamp01(rise + bassRise),
            label: "energy_drop",
          });
        }
      }
    }

    var breakWin = Math.max(6, Math.round(0.6 / hopSec));
    for (i = breakWin; i < frames.length - breakWin; i++) {
      var preBr = 0;
      var postBr = 0;
      var k3;
      for (k3 = 1; k3 <= breakWin; k3++) {
        preBr += rms[i - k3];
        postBr += rms[i + k3];
      }
      preBr /= breakWin;
      postBr /= breakWin;
      if (preBr > 0.35 && postBr < preBr * 0.45) {
        var tBr = frames[i].t;
        var nearBreak = events.some(function (e) {
          return e.type === "break" && Math.abs(e.t - tBr) < 1.2;
        });
        if (!nearBreak) {
          events.push({
            type: "break",
            t: tBr,
            strength: clamp01(preBr - postBr),
            label: "break_down",
          });
        }
      }
    }

    var tension = buildTensionArc(frames);
    for (i = 4; i < tension.v.length - 4; i++) {
      var d = tension.v[i] - tension.v[i - 4];
      var tArc = tension.t[i];
      if (d > 0.12) {
        var nearBuild = events.some(function (e) {
          return e.type === "build" && Math.abs(e.t - tArc) < 1.5;
        });
        if (!nearBuild) events.push({ type: "build", t: tArc, strength: clamp01(d * 2) });
      } else if (d < -0.12) {
        var nearRel = events.some(function (e) {
          return e.type === "release" && Math.abs(e.t - tArc) < 1.5;
        });
        if (!nearRel) events.push({ type: "release", t: tArc, strength: clamp01(-d * 2) });
      }
    }

    events.sort(function (a, b) {
      return a.t - b.t;
    });
    return events;
  }

  function analyzeMonoPcm(samples, opts) {
    opts = opts || {};
    var sampleRate = opts.sampleRate;
    var hopMs = opts.hopMs != null ? opts.hopMs : 20;
    var windowMs = opts.windowMs != null ? opts.windowMs : 46;
    var hop = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
    var win = Math.max(32, Math.round((windowMs / 1000) * sampleRate));
    var nfft = nextPow2(win);
    var window = hannWindow(win);

    var frames = [];
    var prevMags = new Float32Array(nfft / 2);
    var maxRms = 1e-9;
    var maxFlux = 1e-9;
    var maxOnset = 1e-9;

    for (var start = 0; start + win <= samples.length; start += hop) {
      var t = start / sampleRate;
      var sumSq = 0;
      var peak = 0;
      var zc = 0;
      var frame = new Float32Array(win);
      var prevS = samples[start];
      var i;
      for (i = 0; i < win; i++) {
        var s = samples[start + i];
        frame[i] = s * window[i];
        sumSq += s * s;
        peak = Math.max(peak, Math.abs(s));
        if ((s >= 0 && prevS < 0) || (s < 0 && prevS >= 0)) zc++;
        prevS = s;
      }
      var rms = Math.sqrt(sumSq / win);
      maxRms = Math.max(maxRms, rms);

      var padded = padToPow2(frame, nfft);
      var mags = fftMagnitudes(padded);

      var flux = 0;
      var weighted = 0;
      var magSum = 0;
      for (i = 0; i < mags.length; i++) {
        var d = mags[i] - prevMags[i];
        if (d > 0) flux += d;
        weighted += i * mags[i];
        magSum += mags[i];
        prevMags[i] = mags[i];
      }
      maxFlux = Math.max(maxFlux, flux);
      var centroid = magSum > 1e-12 ? (weighted / magSum) * (sampleRate / nfft) : 0;

      var bands = normalizeBands(bandsFromSpectrum(mags, sampleRate, nfft));
      var zcr = zc / win;
      var onsetStrength = flux * (0.35 + 0.4 * bands.bass + 0.25 * bands.presence + 0.2 * bands.mid);
      maxOnset = Math.max(maxOnset, onsetStrength);

      frames.push({
        t: t,
        rms: rms,
        peak: peak,
        bands: bands,
        spectralCentroid: centroid,
        spectralFlux: flux,
        zcr: zcr,
        onsetStrength: onsetStrength,
      });
    }

    for (var fi = 0; fi < frames.length; fi++) {
      var f = frames[fi];
      f.rms = clamp01(f.rms / maxRms);
      f.peak = clamp01(f.peak);
      f.spectralFlux = clamp01(f.spectralFlux / maxFlux);
      f.onsetStrength = clamp01(f.onsetStrength / maxOnset);
      f.zcr = clamp01(f.zcr * 4);
    }

    var hopSec = hopMs / 1000;
    var events = detectEvents(frames, hopSec);
    var sections = detectSections(frames, hopSec);
    var tension = buildTensionArc(frames);
    var durationSec = samples.length / sampleRate;

    return {
      version: ANALYSIS_VERSION,
      meta: {
        sampleRate: sampleRate,
        durationSec: durationSec,
        channels: opts.channels != null ? opts.channels : 1,
        fileName: opts.fileName || "audio.wav",
        analyzedAt: new Date().toISOString(),
        hopMs: hopMs,
        windowMs: windowMs,
      },
      frames: frames,
      events: events,
      sections: sections,
      arcs: { tension: tension },
    };
  }

  function mixToMono(channelData) {
    if (!channelData || !channelData.length) return new Float32Array(0);
    if (channelData.length === 1) return channelData[0];
    var n = channelData[0].length;
    var out = new Float32Array(n);
    var inv = 1 / channelData.length;
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var c = 0; c < channelData.length; c++) s += channelData[c][i];
      out[i] = s * inv;
    }
    return out;
  }

  return {
    ANALYSIS_VERSION: ANALYSIS_VERSION,
    BAND_NAMES: BAND_NAMES,
    BAND_EDGES_HZ: BAND_EDGES_HZ,
    emptyBands: emptyBands,
    bandsFromSpectrum: bandsFromSpectrum,
    normalizeBands: normalizeBands,
    fftMagnitudes: fftMagnitudes,
    hannWindow: hannWindow,
    nextPow2: nextPow2,
    padToPow2: padToPow2,
    analyzeMonoPcm: analyzeMonoPcm,
    mixToMono: mixToMono,
  };
});
