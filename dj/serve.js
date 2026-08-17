#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const readiness = require("./js/readiness.js");
const tracks = require("./js/tracks.js");

const root = __dirname;
const projectRoot = path.join(__dirname, "..");
const TRACKS_DIR = path.join(projectRoot, "tracks");
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
};

function writeJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function probeComfy(cb) {
  const req = http.get(
    { hostname: comfyHost, port: comfyPort, path: "/system_stats", timeout: 1500 },
    function (pres) {
      pres.resume();
      cb(pres.statusCode === 200);
    }
  );
  req.on("error", function () {
    cb(false);
  });
  req.on("timeout", function () {
    req.destroy();
    cb(false);
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
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
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
  saveTrackBuffer: saveTrackBuffer,
};
