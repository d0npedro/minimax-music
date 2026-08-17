#!/usr/bin/env node
/**
 * Operator start: reuse or launch the DJ booth, print stable URL + ComfyUI readiness.
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const readiness = require("../dj/js/readiness.js");

const DJ = readiness.djUrl().replace(/\/$/, "") || "http://127.0.0.1:8787";
const DJ_URL = DJ + "/";

function request(method, urlString, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(urlString);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: method,
        timeout: 2500,
        headers: data
          ? { "Content-Type": "application/json", "Content-Length": data.length }
          : {},
      },
      function (res) {
        const chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", function () {
      req.destroy(new Error("timeout"));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function fetchHealth() {
  try {
    const res = await request("GET", DJ + "/health");
    if (res.status !== 200) return null;
    const json = JSON.parse(res.body);
    if (!json || !json.comfy) return null;
    return json;
  } catch (e) {
    return null;
  }
}

const COMFY_ROOT = process.env.COMFY_ROOT || "D:\\WAN22\\ComfyUI_windows_portable";

function probeComfyDirect() {
  return request("GET", "http://127.0.0.1:8188/system_stats")
    .then(function (res) {
      return res.status === 200;
    })
    .catch(function () {
      return false;
    });
}

function spawnComfy() {
  const py = path.join(COMFY_ROOT, "python_embeded", "python.exe");
  const mainPy = path.join(COMFY_ROOT, "ComfyUI", "main.py");
  const child = spawn(py, ["-s", mainPy, "--windows-standalone-build", "--listen", "127.0.0.1", "--port", "8188", "--reserve-vram", "0.9"], {
    detached: true,
    stdio: "ignore",
    cwd: COMFY_ROOT,
    env: process.env,
    windowsHide: true,
  });
  child.unref();
  return child.pid;
}

function comfyProcessListed() {
  return new Promise(function (resolve) {
    const { exec } = require("child_process");
    exec("wmic process get CommandLine", { windowsHide: true, timeout: 5000 }, function (err, stdout) {
      if (err || !stdout) return resolve(false);
      resolve(/ComfyUI[\\/]main\.py/i.test(stdout));
    });
  });
}

async function ensureComfy() {
  if (await probeComfyDirect()) return true;
  if (await comfyProcessListed()) return false;
  try {
    spawnComfy();
  } catch (e) {
    return false;
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    if (await probeComfyDirect()) return true;
    await new Promise(function (r) {
      setTimeout(r, 400);
    });
  }
  return probeComfyDirect();
}

function spawnServe() {
  const serve = path.join(__dirname, "..", "dj", "serve.js");
  const cwd = path.join(__dirname, "..");
  const child = spawn(process.execPath, [serve], {
    detached: true,
    stdio: "ignore",
    cwd: cwd,
    env: process.env,
    windowsHide: true,
  });
  child.unref();
  return child.pid;
}

function killListener(port) {
  return new Promise(function (resolve) {
    if (process.platform !== "win32") return resolve();
    const { exec } = require("child_process");
    exec("netstat -ano", function (err, stdout) {
      if (err || !stdout) return resolve();
      const pids = new Set();
      stdout.split(/\r?\n/).forEach(function (line) {
        if (line.indexOf(":" + port + " ") === -1 && line.indexOf(":" + port + "\t") === -1) return;
        if (line.indexOf("LISTENING") === -1) return;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0") pids.add(pid);
      });
      if (!pids.size) return resolve();
      const list = Array.from(pids);
      exec("taskkill /F " + list.map(function (p) { return "/PID " + p; }).join(" "), function () {
        resolve();
      });
    });
  });
}

async function waitHealth(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const h = await fetchHealth();
    if (h) return h;
    await new Promise(function (r) {
      setTimeout(r, 150);
    });
  }
  return null;
}

async function ensureBooth() {
  let health = await fetchHealth();
  if (health) return health;
  const page = await request("GET", DJ_URL).catch(function () {
    return null;
  });
  if (page && page.status === 200) {
    await killListener(8787);
    await new Promise(function (r) {
      setTimeout(r, 800);
    });
  }
  spawnServe();
  health = await waitHealth(10000);
  if (health) return health;
  spawnServe();
  return waitHealth(8000);
}

async function main() {
  const health = await ensureBooth();
  const comfyStarted = await ensureComfy();
  const health2 = (await fetchHealth()) || health;
  const models = health2 && health2.models ? health2.models : readiness.checkModels();
  const comfyUp = comfyStarted || !!(health2 && health2.comfy && health2.comfy.up);
  const comfyLine = "ComfyUI: " + (comfyUp ? "up" : "down");
  console.log("DJ URL: " + DJ_URL);
  console.log(comfyLine);
  if (models && models.ok === false) {
    console.log("Models: missing");
  }
  if (!health2) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main: main, fetchHealth: fetchHealth, DJ_URL: DJ_URL, ensureComfy: ensureComfy, probeComfyDirect: probeComfyDirect };
