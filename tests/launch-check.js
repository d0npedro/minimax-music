#!/usr/bin/env node
/**
 * Verification step 2: serve the DJ page and try a headless browser readback.
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const SCRATCH = process.env.SCRATCH || "C:\\Users\\info\\AppData\\Local\\Temp\\grok-goal-ed98a422a75e\\implementer";
const PORT = Number(process.env.DJ_PORT || 8787);
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

async function runPlaywright() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const logs = [];
  try {
    for (let i = 0; i < 2; i++) {
      const page = await browser.newPage();
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
      const box = await page.locator("main#booth").boundingBox();
      const bodyBox = await page.locator("body").boundingBox();
      if (!box || !bodyBox) throw new Error("missing booth/body bbox on visit " + (i + 1));
      const fill = (box.width * box.height) / (bodyBox.width * bodyBox.height);
      logs.push("visit " + (i + 1) + " booth=" + JSON.stringify(box) + " fill=" + fill.toFixed(3) + " errors=" + errors.length);
      if (errors.length) throw new Error("page errors: " + errors.join(" | "));
      if (fill < 0.25) throw new Error("main surface not substantially filled, fill=" + fill);
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
      await page.locator("#magic-btn").click();
      await page.waitForFunction(function () {
        var el = document.getElementById("gen-status");
        return el && el.textContent && el.textContent.trim() !== "idle";
      }, { timeout: 8000 });
      const preview = await page.locator("#caption-preview").textContent();
      const status = await page.locator("#gen-status").textContent();
      logs.push("after magic click preview=" + JSON.stringify(preview).slice(0, 240) + " status=" + status);
      if (!/queued|cooking|loaded|offline|magic started|endless|buffer|warming/i.test(status || "")) {
        throw new Error("one-press did not change visible generate status: " + status);
      }
      const shot = path.join(SCRATCH, i === 1 ? "dj-page.png" : "dj-page-first.png");
      await page.screenshot({ path: shot, fullPage: true });
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
