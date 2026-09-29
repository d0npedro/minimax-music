#!/usr/bin/env node
/**
 * Verification step 2: serve the DJ page and try a headless browser readback.
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const SCRATCH = process.env.SCRATCH || "C:\\Users\\info\\AppData\\Local\\Temp\\grok-goal-63a8a82f0856\\implementer";
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
      const magic = await page.locator("#magic-btn").textContent();
      const playHidden = await page.locator("#play-btn").getAttribute("hidden");
      logs.push("visit " + (i + 1) + " magic=" + JSON.stringify(magic) + " playHidden=" + playHidden + " errors=" + errors.length);
      if (errors.length) throw new Error("page errors: " + errors.join(" | "));
      if (!/START THE MAGIC/i.test(magic || "")) throw new Error("missing Magic button label");
      if (playHidden == null) throw new Error("Play should be hidden until the queue is armed");
      const canvasSize = await page.locator("#stage-canvas").evaluate(function (c) {
        return { width: c.width, height: c.height };
      });
      if (canvasSize.width !== 1280 || canvasSize.height !== 720) {
        throw new Error("canvas internal size is not 1280x720: " + JSON.stringify(canvasSize));
      }
      await page.evaluate(function (fixture) {
        window.MainFloorApp.setVisualMode("organic");
        return window.MainFloorApp.applyStageFixture(fixture);
      }, stageFixture());
      await page.evaluate(function () {
        return new Promise(function (resolve) {
          requestAnimationFrame(function () {
            requestAnimationFrame(resolve);
          });
        });
      });
      const paint = await paintedFraction(page);
      logs.push("paint=" + JSON.stringify(paint));
      if (paint.fraction < 0.85 || paint.bboxFraction < 0.85) {
        throw new Error("stage surface not substantially filled: " + JSON.stringify(paint));
      }
      const modes = ["organic", "kaleidoscope", "fluid"];
      const shots = {};
      for (var m = 0; m < modes.length; m++) {
        var mode = modes[m];
        await page.evaluate(function (id) {
          return window.MainFloorApp.setVisualMode(id);
        }, mode);
        await page.evaluate(function () {
          return new Promise(function (resolve) {
            requestAnimationFrame(function () {
              requestAnimationFrame(resolve);
            });
          });
        });
        var pixels = await page.locator("#stage-canvas").evaluate(function (canvas) {
          var ctx = canvas.getContext("2d");
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice(0, 64).join(",");
        });
        var shotPath = path.join(SCRATCH, "stage-" + mode + ".png");
        await page.locator("#stage").screenshot({ path: shotPath });
        shots[mode] = pixels;
        logs.push("mode " + mode + " shot=" + shotPath);
      }
      if (shots.organic === shots.kaleidoscope) {
        throw new Error("switching to Kaleidoscope did not change stage pixels");
      }
      if (shots.kaleidoscope === shots.fluid) {
        throw new Error("switching to Fluid did not change stage pixels");
      }
      const shot = path.join(SCRATCH, i === 1 ? "dj-page.png" : "dj-page-first.png");
      await page.locator("body").screenshot({ path: shot });
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
    if (!/stage-canvas/.test(html.body) || !/data-capture="16:9"/.test(html.body)) {
      throw new Error("HTML missing 16:9 stage canvas");
    }
    if (!/magic-btn/.test(html.body) || !/START THE MAGIC/.test(html.body)) {
      throw new Error("HTML missing Magic button");
    }
    if (!/play-btn/.test(html.body)) {
      throw new Error("HTML missing Play button");
    }
    serveLog += "html has 16:9 canvas + Magic + Play\n";
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
