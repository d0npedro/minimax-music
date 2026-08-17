#!/usr/bin/env node
/**
 * Verification step 2: serve the DJ page and try a headless browser readback.
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const SCRATCH = process.env.SCRATCH || "C:\\Users\\info\\AppData\\Local\\Temp\\grok-goal-1de505506ed7\\implementer";
const PORT = Number(process.env.DJ_PORT || 8797);
const URL = "http://127.0.0.1:" + PORT + "/";
const ROOT = path.join(__dirname, "..");

function write(name, text) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, name), text);
}

function get(url) {
  return new Promise(function (resolve, reject) {
    http
      .get(url, function (res) {
        const chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
        });
      })
      .on("error", reject);
  });
}

async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await get(URL);
      if (res.status === 200 && /Main Floor/i.test(res.body)) return res;
      last = "status " + res.status;
    } catch (e) {
      last = e.message;
    }
    await new Promise(function (r) {
      setTimeout(r, 150);
    });
  }
  throw new Error("server not ready: " + last);
}

function playwrightAvailable() {
  const r = spawnSync("npx", ["--yes", "playwright", "--version"], {
    encoding: "utf8",
    timeout: 120000,
    shell: true,
  });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  write("playwright-version.txt", "exit=" + r.status + "\n" + out + "\n");
  return r.status === 0 && /Playwright|Version/i.test(out);
}

function stageFixture() {
  function wave(n, amp) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(amp + Math.abs(Math.sin(i / 6)) * 0.35);
    return out;
  }
  return {
    session: {
      decks: {
        a: {
          id: "a",
          loaded: true,
          playing: true,
          trackName: "Neon Warehouse",
          artist: "Pedda vom Mond",
          position: 90,
          duration: 180,
        },
        b: {
          id: "b",
          loaded: true,
          playing: false,
          trackName: "Peak Schranz",
          artist: "Main Floor",
          position: 0,
          duration: 200,
        },
      },
    },
    crate: {
      items: [
        { meta: { trackName: "Last 20 Minutes", artist: "Closing Crew" }, peaks: wave(64, 0.28) },
        { meta: { trackName: "Night Shift", artist: "Acid Unit" }, peaks: wave(64, 0.22) },
        { meta: { trackName: "Closed Eyes", artist: "Pedda" }, peaks: wave(64, 0.18) },
      ],
    },
    endless: { liveId: "a", nextId: "b", mixing: false, enabled: true },
    mixProgress: 0,
    peaks: { a: wave(128, 0.5), b: wave(128, 0.36) },
  };
}

async function paintedFraction(page) {
  return page.locator("#stage-canvas").evaluate(function (canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var painted = 0;
    var total = w * h;
    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (data[i + 3] > 8 && data[i] + data[i + 1] + data[i + 2] > 0) {
          painted++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    var bbox = painted ? (maxX - minX + 1) * (maxY - minY + 1) : 0;
    return {
      width: w,
      height: h,
      painted: painted,
      total: total,
      fraction: painted / total,
      bboxFraction: bbox / total,
    };
  });
}

async function runPlaywright() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const logs = [];
  try {
    for (let i = 0; i < 2; i++) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
      const errors = [];
      page.on("pageerror", function (err) {
        errors.push(String(err));
      });
      page.on("console", function (msg) {
        if (msg.type() !== "error") return;
        var text = msg.text();
        if (/ERR_CONNECTION_REFUSED|127\.0\.0\.1:8188|\/comfy\/|comfy_unavailable/.test(text)) return;
        errors.push("console.error " + text);
      });
      await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
      const box = await page.locator("#stage").boundingBox();
      if (!box) throw new Error("missing #stage bbox on visit " + (i + 1));
      const aspect = box.width / box.height;
      logs.push(
        "visit " + (i + 1) + " stage=" + JSON.stringify(box) + " aspect=" + aspect.toFixed(4) + " errors=" + errors.length
      );
      if (errors.length) throw new Error("page errors: " + errors.join(" | "));
      if (Math.abs(aspect - 16 / 9) > 0.03) {
        throw new Error("stage aspect is not 16:9: " + aspect + " box=" + JSON.stringify(box));
      }
      if (Math.abs(box.width - 1280) > 2 || Math.abs(box.height - 720) > 2) {
        throw new Error("stage drawing box is not 1280x720: " + JSON.stringify(box));
      }
      const beforeTitle = await page.locator("[data-role=now-title]").textContent();
      const beforeWave = await page.locator("[data-role=now-wave]").evaluate(function (c) {
        return c.toDataURL();
      });
      await page.evaluate(function (fixture) {
        return window.MainFloorApp.applyStageFixture(fixture);
      }, stageFixture());
      await page.waitForFunction(function () {
        var el = document.querySelector("[data-role=now-title]");
        return el && /Neon Warehouse/.test(el.textContent || "");
      }, { timeout: 4000 });
      const afterTitle = await page.locator("[data-role=now-title]").textContent();
      const afterArtist = await page.locator("[data-role=now-artist]").textContent();
      const afterWave = await page.locator("[data-role=now-wave]").evaluate(function (c) {
        return c.toDataURL();
      });
      logs.push("driven title=" + JSON.stringify(afterTitle) + " artist=" + JSON.stringify(afterArtist));
      if (!/Neon Warehouse/.test(afterTitle || "")) {
        throw new Error("driven fixture did not change now-playing title: " + afterTitle + " (was " + beforeTitle + ")");
      }
      if (!/Pedda vom Mond/.test(afterArtist || "")) {
        throw new Error("driven fixture did not show artist: " + afterArtist);
      }
      if (afterWave === beforeWave) {
        throw new Error("driven fixture did not change now-playing waveform");
      }
      const paint = await paintedFraction(page);
      logs.push("paint=" + JSON.stringify(paint));
      if (paint.fraction < 0.85 || paint.bboxFraction < 0.85) {
        throw new Error("stage surface not substantially filled: " + JSON.stringify(paint));
      }
      await page.waitForFunction(function () {
        var el = document.getElementById("comfy-pill");
        return el && (el.getAttribute("data-ready") === "up" || el.getAttribute("data-ready") === "down");
      }, { timeout: 8000 });
      const ready = await page.locator("#comfy-pill").getAttribute("data-ready");
      const pill = await page.locator("#comfy-pill").textContent();
      logs.push("readiness pill=" + pill + " data-ready=" + ready);
      if (ready !== "up" && ready !== "down") {
        throw new Error("pill did not reflect ComfyUI up/down: " + pill);
      }
      const shot = path.join(SCRATCH, i === 1 ? "dj-page.png" : "dj-page-first.png");
      await page.locator("#stage").screenshot({ path: shot });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return logs.join("\n");
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const child = spawn(process.execPath, [path.join(ROOT, "dj", "serve.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serveLog = "";
  child.stdout.on("data", function (d) {
    serveLog += d.toString();
  });
  child.stderr.on("data", function (d) {
    serveLog += d.toString();
  });
  try {
    const html = await waitForServer(8000);
    serveLog += "\nGET / status=" + html.status + " bytes=" + html.body.length + "\n";
    if (!playwrightAvailable()) {
      write(
        "launch-unavailable.log",
        "Playwright CLI not usable here.\n" + serveLog + "\n" +
          fs.readFileSync(path.join(SCRATCH, "playwright-version.txt"), "utf8")
      );
      write("launch.log", "served OK but playwright unavailable\n" + serveLog);
      console.log("LAUNCH_UNAVAILABLE");
      process.exitCode = 0;
      return;
    }
    try {
      const pwLog = await runPlaywright();
      write("launch.log", serveLog + "\n" + pwLog + "\nOK\n");
      console.log("LAUNCH_OK");
    } catch (err) {
      if (/Cannot find module 'playwright'|browserType.launch/i.test(String(err))) {
        write("launch-unavailable.log", String(err) + "\n" + serveLog);
        write("launch.log", "playwright module/browser missing\n" + String(err) + "\n" + serveLog);
        console.log("LAUNCH_UNAVAILABLE");
        process.exitCode = 0;
        return;
      }
      write("launch.log", "PLAYWRIGHT_FAIL\n" + String(err && err.stack || err) + "\n" + serveLog);
      console.error(err);
      process.exitCode = 1;
    }
  } catch (err) {
    write("launch-unavailable.log", "server failed: " + String(err) + "\n" + serveLog);
    write("launch.log", "server failed: " + String(err) + "\n" + serveLog);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
}

main();
