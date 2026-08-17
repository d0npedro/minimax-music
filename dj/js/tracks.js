/**
 * Project-folder filenames for generated MiniMax tracks.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorTracks = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  return { slug: slug, trackFileName: trackFileName };
});
