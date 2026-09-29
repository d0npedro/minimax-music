/**
 * Live-swap: pull changed booth modules while audio keeps running.
 * Pure policy is exported for tests. The browser runner never reloads
 * app.js / audio-engine / mixer / deck — those own the mix.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorLiveSwap = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var PINNED = [
    "js/app.js",
    "js/audio-engine.js",
    "js/mixer.js",
    "js/deck.js",
    "js/live-swap.js",
  ];

  var SWAP = [
    "js/generate.js",
    "js/readiness.js",
    "js/tracks.js",
    "js/album.js",
    "js/one-press.js",
    "js/endless.js",
    "js/crate.js",
    "js/comfy-client.js",
    "js/hex-analysis.js",
    "js/echo-mapping.js",
    "js/ghost-modes.js",
    "js/stage.js",
    "js/magic-flow.js",
    "js/lab.js",
    "css/dj.css",
  ];

  function normalizePath(p) {
    return String(p || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/");
  }

  function isPinned(rel) {
    return PINNED.indexOf(normalizePath(rel)) !== -1;
  }

  function isSafePath(rel) {
    var p = normalizePath(rel);
    if (!p || p.indexOf("..") !== -1) return false;
    if (isPinned(p)) return false;
    if (SWAP.indexOf(p) !== -1) return true;
    if (p.indexOf("js/features/") === 0 && /\.js$/i.test(p) && p.indexOf("..") === -1) return true;
    return false;
  }

  function fileStamp(entry) {
    if (!entry) return "";
    return String(entry.mtimeMs || entry.mtime || "") + ":" + String(entry.size || 0);
  }

  function manifestRev(files) {
    files = files || {};
    var keys = Object.keys(files).sort();
    var acc = "";
    for (var i = 0; i < keys.length; i++) {
      acc += keys[i] + "=" + fileStamp(files[keys[i]]) + ";";
    }
    var h = 2166136261;
    for (var j = 0; j < acc.length; j++) {
      h ^= acc.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function diffManifest(prev, next) {
    prev = prev || {};
    next = next || {};
    var added = [];
    var changed = [];
    var removed = [];
    var seen = {};
    Object.keys(next).forEach(function (p) {
      seen[p] = true;
      if (!prev[p]) added.push(p);
      else if (fileStamp(prev[p]) !== fileStamp(next[p])) changed.push(p);
    });
    Object.keys(prev).forEach(function (p) {
      if (!seen[p]) removed.push(p);
    });
    return { added: added, changed: changed, removed: removed };
  }

  function applyOrder(paths) {
    return (paths || []).slice().sort(function (a, b) {
      var af = normalizePath(a).indexOf("js/features/") === 0 ? 1 : 0;
      var bf = normalizePath(b).indexOf("js/features/") === 0 ? 1 : 0;
      if (af !== bf) return af - bf;
      return normalizePath(a).localeCompare(normalizePath(b));
    });
  }

  function planApply(prev, next) {
    var diff = diffManifest(prev, next);
    var raw = diff.added.concat(diff.changed);
    var ghostHit = raw.indexOf("js/ghost-modes.js") !== -1 || raw.indexOf("js/stage.js") !== -1;
    if (ghostHit && next) {
      Object.keys(next).forEach(function (p) {
        if (p.indexOf("js/features/") === 0 && raw.indexOf(p) === -1) raw.push(p);
      });
    }
    return applyOrder(raw.filter(isSafePath));
  }

  function assetUrl(rel, stamp) {
    var p = "/" + normalizePath(rel);
    return p + "?v=" + encodeURIComponent(String(stamp || Date.now()));
  }

  function swapCss(doc, rel, stamp) {
    if (!doc) return null;
    var path = normalizePath(rel);
    var href = assetUrl(path, stamp);
    var links = doc.querySelectorAll ? doc.querySelectorAll('link[rel="stylesheet"]') : [];
    var i;
    for (i = 0; i < links.length; i++) {
      var cur = links[i].getAttribute("href") || "";
      if (cur.indexOf(path) !== -1) {
        links[i].setAttribute("href", href);
        return links[i];
      }
    }
    if (!doc.createElement || !doc.head) return null;
    var link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    doc.head.appendChild(link);
    return link;
  }

  function swapJs(doc, rel, stamp) {
    if (!doc || !doc.createElement) {
      return Promise.resolve(rel);
    }
    return new Promise(function (resolve, reject) {
      var s = doc.createElement("script");
      s.src = assetUrl(rel, stamp);
      s.onload = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(normalizePath(rel));
      };
      s.onerror = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("live-swap failed " + rel));
      };
      (doc.head || doc.documentElement).appendChild(s);
    });
  }

  function start(opts) {
    opts = opts || {};
    if (!root || typeof root.fetch !== "function") return { ok: false, reason: "no-fetch" };
    if (root.location && root.location.protocol === "file:") return { ok: false, reason: "file" };
    if (root.__mainFloorLiveSwap) return root.__mainFloorLiveSwap;
    var interval = opts.interval != null ? opts.interval : 1600;
    var last = null;
    var busy = false;
    var timer = 0;

    function apply(man) {
      var planned = planApply(last && last.files, man.files);
      last = man;
      if (!planned.length) return Promise.resolve([]);
      busy = true;
      var chain = Promise.resolve();
      var done = [];
      planned.forEach(function (rel) {
        chain = chain.then(function () {
          var stamp = man.files[rel] && man.files[rel].mtimeMs;
          if (/\.css$/i.test(rel)) {
            swapCss(root.document, rel, stamp);
            done.push(rel);
            return;
          }
          return swapJs(root.document, rel, stamp).then(function () {
            done.push(rel);
          });
        });
      });
      return chain
        .then(function () {
          if (root.MainFloorApp && typeof root.MainFloorApp.afterLiveSwap === "function") {
            root.MainFloorApp.afterLiveSwap({ files: done, rev: man.rev });
          }
          return done;
        })
        .finally(function () {
          busy = false;
        });
    }

    function poll() {
      if (busy) return;
      return root
        .fetch("/live/manifest", { cache: "no-store" })
        .then(function (res) {
          return res.json();
        })
        .then(function (man) {
          if (!man || !man.files) return [];
          if (!last) {
            last = man;
            return [];
          }
          if (man.rev && last.rev && man.rev === last.rev) return [];
          return apply(man);
        })
        .catch(function () {
          return [];
        });
    }

    if (root.setInterval) timer = root.setInterval(poll, interval);
    poll();
    var handle = { ok: true, poll: poll, stop: function () {
      if (timer && root.clearInterval) root.clearInterval(timer);
      root.__mainFloorLiveSwap = null;
    } };
    root.__mainFloorLiveSwap = handle;
    return handle;
  }

  if (root && typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        start();
      });
    } else {
      start();
    }
  }

  return {
    PINNED: PINNED,
    SWAP: SWAP,
    normalizePath: normalizePath,
    isPinned: isPinned,
    isSafePath: isSafePath,
    manifestRev: manifestRev,
    diffManifest: diffManifest,
    planApply: planApply,
    applyOrder: applyOrder,
    assetUrl: assetUrl,
    swapCss: swapCss,
    swapJs: swapJs,
    start: start,
  };
});
