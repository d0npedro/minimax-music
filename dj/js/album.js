/**
 * Sequential album crate: numbered WAV/MP3 titles in play order.
 * Pure: no fetch, no audio.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorAlbum = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  var DEFAULT_ARTIST = "Pedda vom Mond";
  var DEFAULT_ALBUM = "Schranz Has Returned";

  function parseAlbumTrack(file) {
    var raw = String(file || "").replace(/^.*[\\/]/, "");
    var m = raw.match(/^(\d+)\s*[-._]\s*(.+?)\.(wav|mp3|flac)$/i);
    if (!m) return null;
    var title = m[2].replace(/_mastering$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!title) return null;
    return {
      file: raw,
      index: Number(m[1]),
      title: title,
      ext: m[3].toLowerCase(),
    };
  }

  function sortAlbum(files) {
    var rows = [];
    (files || []).forEach(function (f) {
      var name = typeof f === "string" ? f : f && f.file;
      var parsed = parseAlbumTrack(name);
      if (!parsed) return;
      if (typeof f === "object") {
        parsed.bytes = f.bytes;
        parsed.mtime = f.mtime;
      }
      rows.push(parsed);
    });
    rows.sort(function (a, b) {
      if (a.index !== b.index) return a.index - b.index;
      return a.file.localeCompare(b.file);
    });
    return rows;
  }

  var sessionUsed = {};

  function fileKey(name) {
    return String(name || "").replace(/^.*[\\/]/, "");
  }

  function beginAlbumSession() {
    sessionUsed = {};
  }

  function markAlbumUsed(file) {
    var key = fileKey(file);
    if (key) sessionUsed[key] = true;
    return key;
  }

  function isAlbumUsed(file, extra) {
    var key = fileKey(file);
    if (!key) return false;
    if (sessionUsed[key]) return true;
    if (!extra) return false;
    if (Object.prototype.toString.call(extra) === "[object Array]") {
      var i;
      for (i = 0; i < extra.length; i++) {
        if (fileKey(extra[i]) === key) return true;
      }
      return false;
    }
    return !!extra[key];
  }

  function nextUnused(album, used, limit) {
    var skip = {};
    (used || []).forEach(function (name) {
      var key = fileKey(name);
      if (key) skip[key] = true;
    });
    Object.keys(sessionUsed).forEach(function (key) {
      skip[key] = true;
    });
    var out = [];
    var cap = limit == null ? album.length : Number(limit);
    var i;
    for (i = 0; i < album.length && out.length < cap; i++) {
      if (skip[album[i].file]) continue;
      out.push(album[i]);
    }
    return out;
  }

  function albumIndexOf(item) {
    if (!item) return 999;
    if (item.meta && item.meta.albumIndex != null) return Number(item.meta.albumIndex) || 999;
    if (item.albumIndex != null) return Number(item.albumIndex) || 999;
    return 999;
  }

  function takeNextQueued(items) {
    if (!items || !items.length) return null;
    var best = 0;
    var i;
    for (i = 1; i < items.length; i++) {
      if (albumIndexOf(items[i]) < albumIndexOf(items[best])) best = i;
    }
    return items.splice(best, 1)[0];
  }

  function takeQueuedByIndex(items, index) {
    if (!items || !items.length) return null;
    var want = Number(index);
    var i;
    for (i = 0; i < items.length; i++) {
      if (albumIndexOf(items[i]) === want) return items.splice(i, 1)[0];
    }
    return null;
  }

  function audioUrl(file) {
    return "/album/" + encodeURIComponent(String(file || "").replace(/^.*[\\/]/, ""));
  }

  function youtubeMusicUrl(opts) {
    opts = opts || {};
    var artist = opts.artist || DEFAULT_ARTIST;
    var title = String(opts.title || "").trim();
    var q = title ? artist + " " + title : artist + " " + DEFAULT_ALBUM;
    return "https://music.youtube.com/search?q=" + encodeURIComponent(q);
  }

  function trackCard(row, opts) {
    opts = opts || {};
    var parsed = typeof row === "string" ? parseAlbumTrack(row) : row;
    if (!parsed || !parsed.title) return null;
    var artist = opts.artist || parsed.artist || DEFAULT_ARTIST;
    var albumName = opts.album || parsed.album || DEFAULT_ALBUM;
    var total = opts.total != null ? Number(opts.total) : 0;
    return {
      index: parsed.index,
      title: parsed.title,
      artist: artist,
      album: albumName,
      file: parsed.file,
      youtubeMusic: youtubeMusicUrl({ artist: artist, title: parsed.title }),
      catalog: total > 0 ? parsed.index + " / " + total : String(parsed.index || ""),
    };
  }

  return {
    DEFAULT_ARTIST: DEFAULT_ARTIST,
    DEFAULT_ALBUM: DEFAULT_ALBUM,
    parseAlbumTrack: parseAlbumTrack,
    sortAlbum: sortAlbum,
    beginAlbumSession: beginAlbumSession,
    markAlbumUsed: markAlbumUsed,
    isAlbumUsed: isAlbumUsed,
    nextUnused: nextUnused,
    albumIndexOf: albumIndexOf,
    takeNextQueued: takeNextQueued,
    takeQueuedByIndex: takeQueuedByIndex,
    audioUrl: audioUrl,
    youtubeMusicUrl: youtubeMusicUrl,
    trackCard: trackCard,
  };
});
