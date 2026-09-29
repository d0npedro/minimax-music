/**
 * Project-folder filenames for generated MiniMax tracks.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorTracks = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function slug(text) {
    return String(text || "track")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "track";
  }

  function trackFileName(opts) {
    opts = opts || {};
    var stamp = opts.when != null ? new Date(opts.when) : new Date();
    var ts =
      stamp.getFullYear() +
      pad(stamp.getMonth() + 1) +
      pad(stamp.getDate()) +
      "-" +
      pad(stamp.getHours()) +
      pad(stamp.getMinutes()) +
      pad(stamp.getSeconds());
    var label = slug(opts.label || opts.trackName || "track");
    var bpmNum = opts.bpm != null && String(opts.bpm) !== "" ? String(opts.bpm).replace(/[^0-9.]/g, "") : "";
    var bpm = bpmNum ? bpmNum + "bpm" : "";
    var ext = String(opts.ext || "mp3").replace(/[^a-z0-9]/g, "") || "mp3";
    return [ts, label, bpm].filter(Boolean).join("_") + "." + ext;
  }

  function resolveGenerate() {
    if (root && root.MainFloorGenerate) return root.MainFloorGenerate;
    if (typeof require === "function") {
      try {
        return require("./generate.js");
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function isGenericName(name) {
    var s = String(name || "").replace(/[_-]+/g, " ").trim();
    if (!s) return true;
    if (/peak\s*schranz|warehouse\s*drive|last\s*20|main\s*floor\s*dj/i.test(s)) return true;
    if (/\d+(?:\.\d+)?\s*bpm/i.test(s) && /schranz|warehouse|drive|minutes|track/i.test(s)) return true;
    return false;
  }

  function displayNameFromFile(file) {
    var meta = metaFromFileName(file);
    var Gen = resolveGenerate();
    if (Gen && Gen.uniqueTitle) {
      return Gen.uniqueTitle({ file: meta.file, bpm: meta.bpm, label: meta.label });
    }
    return meta.trackName;
  }

  function metaFromFileName(file) {
    var raw = String(file || "");
    var base = raw.replace(/^.*[\\/]/, "");
    var stem = base.replace(/\.[a-z0-9]+$/i, "");
    var bpmMatch = stem.match(/(\d+(?:\.\d+)?)bpm/i);
    var bpm = bpmMatch ? Number(bpmMatch[1]) : 150;
    var label = stem
      .replace(/^\d{8}-\d{6}_/, "")
      .replace(/_?\d+(?:\.\d+)?bpm$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "track";
    return {
      file: base,
      trackName: label,
      label: label,
      bpm: isFinite(bpm) && bpm > 0 ? bpm : 150,
    };
  }

  function trackAudioUrl(file) {
    var name = metaFromFileName(file).file;
    return "/tracks/" + encodeURIComponent(name);
  }

  function pickExistingTracks(files) {
    var list = (files || []).filter(function (f) {
      var name = typeof f === "string" ? f : f && f.file;
      return /\.(mp3|wav|flac)$/i.test(name || "");
    });
    list.sort(function (a, b) {
      var am = (typeof a === "object" && a.mtime) || "";
      var bm = (typeof b === "object" && b.mtime) || "";
      if (am && bm && am !== bm) return am < bm ? -1 : 1;
      var an = typeof a === "string" ? a : a.file;
      var bn = typeof b === "string" ? b : b.file;
      return String(an).localeCompare(String(bn));
    });
    return list;
  }

  function queueExistingFirst(files, limit) {
    var list = pickExistingTracks(files).filter(function (f) {
      var name = typeof f === "string" ? f : f && f.file;
      return !/smoke/i.test(name || "");
    });
    list.reverse();
    var cap = limit == null ? list.length : Number(limit);
    if (isFinite(cap) && cap >= 0 && list.length > cap) list = list.slice(0, cap);
    return list;
  }

  function unusedExisting(files, used, limit) {
    var skip = {};
    (used || []).forEach(function (name) {
      if (name) skip[String(name).replace(/^.*[\\/]/, "")] = true;
    });
    var list = queueExistingFirst(files).filter(function (f) {
      var name = typeof f === "string" ? f : f && f.file;
      return name && !skip[String(name).replace(/^.*[\\/]/, "")];
    });
    var cap = limit == null ? list.length : Number(limit);
    if (isFinite(cap) && cap >= 0 && list.length > cap) list = list.slice(0, cap);
    return list;
  }

  return {
    slug: slug,
    trackFileName: trackFileName,
    metaFromFileName: metaFromFileName,
    isGenericName: isGenericName,
    displayNameFromFile: displayNameFromFile,
    trackAudioUrl: trackAudioUrl,
    pickExistingTracks: pickExistingTracks,
    queueExistingFirst: queueExistingFirst,
    unusedExisting: unusedExisting,
  };
});
