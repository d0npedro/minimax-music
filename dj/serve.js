#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const readiness = require("./js/readiness.js");
const tracks = require("./js/tracks.js");

const root = __dirname;
const projectRoot = path.join(__dirname, "..");
const TRACKS_DIR = path.join(projectRoot, "tracks");
const ALBUM_DIR = process.env.ALBUM_DIR || "F:\\Downloads\\Schranz Has Returned\\mastered";
const SET_MATERIAL_DIR = process.env.SET_MATERIAL_DIR || "H:\\Schranz Set Material";
const CLIPS_DIR = process.env.CLIPS_DIR || "H:\\Downloads\\output";
const DJI_DIR = process.env.DJI_DIR || "H:\\DJI Album";
const PEDDA_MIX_DIR = process.env.PEDDA_MIX_DIR || "H:\\Zeitraffer";
const GEH_HEIM_DIR = process.env.GEH_HEIM_DIR || "H:\\Medien\\Videos\\geh heim";
const DJI_A_DIR = process.env.DJI_A_DIR || "H:\\DJI Album\\a";
const DJI_B_DIR = process.env.DJI_B_DIR || "H:\\DJI Album\\b";
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const comfyHost = process.env.COMFY_HOST || "127.0.0.1";
const comfyPort = Number(process.env.COMFY_PORT || 8188);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function mimeFor(filePath) {
  return mime[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function addLiveFile(files, rel) {
  var abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  var st = fs.statSync(abs);
  files[rel.replace(/\\/g, "/")] = { mtimeMs: st.mtimeMs, size: st.size };
}

function liveManifest() {
  var liveSwap;
  try {
    liveSwap = require("./js/live-swap.js");
  } catch (e) {
    liveSwap = null;
  }
  var files = {};
  var list = (liveSwap && liveSwap.SWAP) || [];
  list.forEach(function (rel) {
    addLiveFile(files, rel);
  });
  var featDir = path.join(root, "js", "features");
  if (fs.existsSync(featDir)) {
    fs.readdirSync(featDir).forEach(function (name) {
      if (!/\.js$/i.test(name)) return;
      addLiveFile(files, "js/features/" + name);
    });
  }
  var rev = liveSwap && liveSwap.manifestRev ? liveSwap.manifestRev(files) : String(Date.now());
  return { ok: true, rev: rev, files: files };
}

function writeJson(res, code, obj) {
  if (res.headersSent) return;
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function probeComfy(cb) {
  var done = false;
  function finish(up) {
    if (done) return;
    done = true;
    cb(!!up);
  }
  const req = http.get(
    { hostname: comfyHost, port: comfyPort, path: "/system_stats", timeout: 1500 },
    function (pres) {
      pres.resume();
      finish(pres.statusCode === 200);
    }
  );
  req.on("error", function () {
    finish(false);
  });
  req.on("timeout", function () {
    req.destroy();
    finish(false);
  });
}

function sanitizeProxyHeaders(incoming) {
  const headers = Object.assign({}, incoming || {});
  delete headers.origin;
  delete headers.Origin;
  delete headers.referer;
  delete headers.Referer;
  delete headers["sec-fetch-site"];
  delete headers["Sec-Fetch-Site"];
  delete headers["accept-encoding"];
  headers.host = comfyHost + ":" + comfyPort;
  return headers;
}

function proxyComfy(req, res) {
  const raw = req.url || "/comfy";
  const stripped = raw.replace(/^\/comfy\/?/, "/");
  const targetPath = stripped === "" ? "/" : stripped;
  const headers = sanitizeProxyHeaders(req.headers);
  const p = http.request(
    {
      hostname: comfyHost,
      port: comfyPort,
      path: targetPath,
      method: req.method,
      headers: headers,
      timeout: 600000,
    },
    function (pres) {
      const outHeaders = Object.assign({}, pres.headers);
      delete outHeaders["access-control-allow-origin"];
      res.writeHead(pres.statusCode || 502, outHeaders);
      pres.pipe(res);
    }
  );
  p.on("error", function () {
    if (!res.headersSent) {
      writeJson(res, 502, { error: "comfy_unavailable", up: false });
    } else {
      res.end();
    }
  });
  p.on("timeout", function () {
    p.destroy();
    if (!res.headersSent) writeJson(res, 504, { error: "comfy_timeout" });
  });
  req.pipe(p);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function mediaKind(name) {
  if (/\.(mp4|webm|mov|avi)$/i.test(name)) return "video";
  return "";
}

function listClipFiles(dir) {
  var folder = dir || CLIPS_DIR;
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter(function (f) {
      return !!mediaKind(f);
    })
    .sort();
}

function listDirMedia(folder, source) {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter(function (f) {
      return !!mediaKind(f);
    })
    .sort()
    .map(function (f) {
      return { file: f, source: source, kind: mediaKind(f) };
    });
}

function walkDirMedia(folder, source, prefix, out) {
  if (!fs.existsSync(folder)) return out;
  var entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch (err) {
    return out;
  }
  entries.forEach(function (ent) {
    var rel = prefix ? prefix + "/" + ent.name : ent.name;
    var full = path.join(folder, ent.name);
    if (ent.isDirectory()) {
      walkDirMedia(full, source, rel, out);
      return;
    }
    if (!mediaKind(ent.name)) return;
    out.push({ file: rel.replace(/\\/g, "/"), source: source, kind: mediaKind(ent.name) });
  });
  return out;
}

function listMediaFiles() {
  var setOut = [];
  walkDirMedia(SET_MATERIAL_DIR, "set", "", setOut);
  if (setOut.length) {
    setOut.sort(function (a, b) {
      return a.file.localeCompare(b.file);
    });
    return setOut;
  }
  var out = [];
  walkDirMedia(PEDDA_MIX_DIR, "pedda", "", out);
  walkDirMedia(GEH_HEIM_DIR, "heim", "geh-heim", out);
  walkDirMedia(DJI_A_DIR, "djia", "dji-a", out);
  walkDirMedia(DJI_B_DIR, "djib", "dji-b", out);
  if (out.length) {
    out.sort(function (a, b) {
      return a.file.localeCompare(b.file);
    });
    return out;
  }
  return listDirMedia(CLIPS_DIR, "output").concat(listDirMedia(DJI_DIR, "dji"));
}

function resolveUnder(rootDir, rel) {
  if (!rootDir || !fs.existsSync(rootDir)) return null;
  var full = path.resolve(rootDir, rel);
  if (full.startsWith(path.resolve(rootDir)) && fs.existsSync(full)) return full;
  return null;
}

function resolveClipFile(name) {
  var rel = String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.indexOf("..") !== -1 || !mediaKind(path.basename(rel))) return null;
  var setFile = resolveUnder(SET_MATERIAL_DIR, rel);
  if (setFile) return setFile;
  if (rel.indexOf("geh-heim/") === 0) {
    var heim = resolveUnder(GEH_HEIM_DIR, rel.slice("geh-heim/".length));
    if (heim) return heim;
  }
  if (rel.indexOf("dji-a/") === 0) {
    var djia = resolveUnder(DJI_A_DIR, rel.slice("dji-a/".length));
    if (djia) return djia;
  }
  if (rel.indexOf("dji-b/") === 0) {
    var djib = resolveUnder(DJI_B_DIR, rel.slice("dji-b/".length));
    if (djib) return djib;
  }
  var pedda = resolveUnder(PEDDA_MIX_DIR, rel);
  if (pedda) return pedda;
  var heimFlat = resolveUnder(GEH_HEIM_DIR, path.basename(rel));
  if (heimFlat) return heimFlat;
  var base = path.basename(rel);
  var dirs = [CLIPS_DIR, DJI_DIR];
  var i;
  for (i = 0; i < dirs.length; i++) {
    var full = resolveUnder(dirs[i], base);
    if (full) return full;
  }
  return null;
}

function pipeFile(stream, res) {
  stream.on("error", function () {
    if (!res.headersSent) {
      res.writeHead(503, { "Cache-Control": "no-store" });
    }
    try {
      res.end();
    } catch (err) {}
  });
  res.on("close", function () {
    stream.destroy();
  });
  stream.pipe(res);
}

function streamRange(req, res, filePath, contentType) {
  var st;
  try {
    st = fs.statSync(filePath);
  } catch (err) {
    if (!res.headersSent) res.writeHead(err && err.code === "EBUSY" ? 503 : 404);
    res.end();
    return;
  }
  var size = st.size;
  var range = req.headers && req.headers.range;
  var type = contentType || mimeFor(filePath);
  if (range) {
    var m = String(range).match(/bytes=(\d*)-(\d*)/);
    var start = m && m[1] ? Number(m[1]) : 0;
    var end = m && m[2] ? Number(m[2]) : size - 1;
    if (end >= size) end = size - 1;
    if (start < 0 || start > end || start >= size) {
      res.writeHead(416, { "Content-Range": "bytes */" + size });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": "bytes " + start + "-" + end + "/" + size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    });
    pipeFile(fs.createReadStream(filePath, { start: start, end: end }), res);
    return;
  }
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  });
  pipeFile(fs.createReadStream(filePath), res);
}

function saveTrackBuffer(buf, meta) {
  fs.mkdirSync(TRACKS_DIR, { recursive: true });
  var name = tracks.trackFileName(meta);
  var dest = path.join(TRACKS_DIR, name);
  fs.writeFileSync(dest, buf);
  return { name: name, path: dest, bytes: buf.length };
}

const server = http.createServer(function (req, res) {
  var urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (req.method === "POST" && urlPath === "/tracks") {
    var q = new URL(req.url, "http://127.0.0.1").searchParams;
    readBody(req)
      .then(function (buf) {
        if (!buf.length) {
          writeJson(res, 400, { ok: false, error: "empty" });
          return;
        }
        var saved = saveTrackBuffer(buf, {
          label: q.get("label") || "track",
          bpm: q.get("bpm"),
          ext: q.get("ext") || "mp3",
          when: Date.now(),
        });
        writeJson(res, 200, { ok: true, file: saved.name, bytes: saved.bytes, dir: "tracks" });
      })
      .catch(function (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message) });
      });
    return;
  }
  if (req.method === "GET" && urlPath.indexOf("/tracks/") === 0) {
    var name = path.basename(decodeURIComponent(urlPath.slice("/tracks/".length)));
    if (!/\.(mp3|wav|flac)$/i.test(name) || name !== path.basename(name)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    var audioFile = path.resolve(TRACKS_DIR, name);
    if (!audioFile.startsWith(path.resolve(TRACKS_DIR)) || !fs.existsSync(audioFile)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    fs.readFile(audioFile, function (err, data) {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(audioFile)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
    return;
  }
  if (req.method === "GET" && urlPath === "/album") {
    if (!fs.existsSync(ALBUM_DIR)) {
      writeJson(res, 200, { ok: true, dir: ALBUM_DIR, files: [] });
      return;
    }
    var albumFiles = fs
      .readdirSync(ALBUM_DIR)
      .filter(function (f) {
        return /\.(wav|mp3|flac)$/i.test(f);
      })
      .map(function (f) {
        var st = fs.statSync(path.join(ALBUM_DIR, f));
        return { file: f, bytes: st.size, mtime: st.mtime.toISOString() };
      });
    writeJson(res, 200, { ok: true, dir: "album", files: albumFiles });
    return;
  }
  if (req.method === "GET" && urlPath.indexOf("/album/") === 0) {
    var albumName = path.basename(decodeURIComponent(urlPath.slice("/album/".length)));
    if (!/\.(wav|mp3|flac)$/i.test(albumName)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    var albumFile = path.resolve(ALBUM_DIR, albumName);
    if (!albumFile.startsWith(path.resolve(ALBUM_DIR)) || !fs.existsSync(albumFile)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    var st = fs.statSync(albumFile);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(albumFile)] || "audio/wav",
      "Content-Length": st.size,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(albumFile).pipe(res);
    return;
  }
  if (req.method === "GET" && urlPath === "/clips") {
    writeJson(res, 200, { ok: true, dir: "clips", files: listMediaFiles() });
    return;
  }
  if (req.method === "GET" && urlPath.indexOf("/clips/") === 0) {
    var clipName = decodeURIComponent(urlPath.slice("/clips/".length));
    var clipFile = resolveClipFile(clipName);
    if (!clipFile) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    streamRange(req, res, clipFile, mimeFor(clipFile));
    return;
  }
  if (req.method === "GET" && urlPath === "/tracks") {
    fs.mkdirSync(TRACKS_DIR, { recursive: true });
    var list = fs
      .readdirSync(TRACKS_DIR)
      .filter(function (f) {
        return /\.(mp3|wav|flac)$/i.test(f);
      })
      .map(function (f) {
        var st = fs.statSync(path.join(TRACKS_DIR, f));
        return { file: f, bytes: st.size, mtime: st.mtime.toISOString() };
      });
    writeJson(res, 200, { ok: true, dir: "tracks", files: list });
    return;
  }
  if (urlPath === "/health") {
    probeComfy(function (up) {
      writeJson(res, 200, {
        dj: "http://" + host + ":" + port + "/",
        comfy: {
          up: up,
          readiness: up ? "up" : "down",
          statsUrl: readiness.systemStatsUrl(),
        },
        models: readiness.checkModels(),
      });
    });
    return;
  }
  if (urlPath === "/comfy" || urlPath.indexOf("/comfy/") === 0) {
    proxyComfy(req, res);
    return;
  }
  if (req.method === "GET" && urlPath === "/live/manifest") {
    writeJson(res, 200, liveManifest());
    return;
  }
  if (urlPath === "/") urlPath = "/index.html";
  var rel = urlPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (rel.split("/").indexOf("..") !== -1) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  var file = path.resolve(root, rel);
  if (!file.startsWith(path.resolve(root))) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    var ext = path.extname(file);
    var headers = { "Content-Type": mime[ext] || "application/octet-stream" };
    if (ext === ".js" || ext === ".css" || ext === ".html") headers["Cache-Control"] = "no-store";
    res.writeHead(200, headers);
    res.end(data);
  });
});

if (require.main === module) {
  server.on("error", function (err) {
    if (err && err.code === "EADDRINUSE") {
      console.log("MAIN FLOOR DJ already listening on http://" + host + ":" + port + "/");
      process.exit(0);
      return;
    }
    throw err;
  });
  server.listen(port, host, function () {
    console.log("MAIN FLOOR DJ  http://" + host + ":" + port + "/");
  });
}

module.exports = {
  server: server,
  port: port,
  host: host,
  root: root,
  probeComfy: probeComfy,
  proxyComfy: proxyComfy,
  sanitizeProxyHeaders: sanitizeProxyHeaders,
  TRACKS_DIR: TRACKS_DIR,
  ALBUM_DIR: ALBUM_DIR,
  SET_MATERIAL_DIR: SET_MATERIAL_DIR,
  CLIPS_DIR: CLIPS_DIR,
  DJI_DIR: DJI_DIR,
  PEDDA_MIX_DIR: PEDDA_MIX_DIR,
  GEH_HEIM_DIR: GEH_HEIM_DIR,
  DJI_A_DIR: DJI_A_DIR,
  DJI_B_DIR: DJI_B_DIR,
  listClipFiles: listClipFiles,
  listMediaFiles: listMediaFiles,
  resolveClipFile: resolveClipFile,
  streamRange: streamRange,
  saveTrackBuffer: saveTrackBuffer,
  liveManifest: liveManifest,
};
