#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const readiness = require("../dj/js/readiness.js");
const generate = require("../dj/js/generate.js");

const SCRATCH = process.env.SCRATCH || "C:\\Users\\info\\AppData\\Local\\Temp\\grok-goal-ed98a422a75e\\implementer";
const ORIGIN = "http://127.0.0.1:8787";

function req(method, urlString, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(urlString);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: method,
        timeout: 8000,
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
    r.on("error", reject);
    r.on("timeout", function () {
      r.destroy(new Error("timeout"));
    });
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const log = require("path").join(SCRATCH, "comfy-generate.log");
  const statsUrl = ORIGIN + readiness.systemStatsUrl();
  const promptUrl = ORIGIN + readiness.promptUrl();
  try {
    const stats = await req("GET", statsUrl);
    const lines = [
      "production_path GET " + statsUrl + " status=" + stats.status,
      stats.body.slice(0, 500),
    ];
    if (stats.status === 200) {
      const payload = generate.buildComfyPrompt(generate.buildFromPreset("Warehouse Drive", { seed: 42 }));
      const posted = await req("POST", promptUrl, readiness.buildPromptRequest(payload).body);
      lines.push("production_path POST " + promptUrl + " status=" + posted.status);
      lines.push(posted.body.slice(0, 800));
      console.log("COMFY_POST", posted.status);
    } else {
      lines.push("ComfyUI down via production proxy (502 expected when 8188 is off)");
      console.log("COMFY_ABSENT");
    }
    fs.writeFileSync(log, lines.join("\n") + "\n");
  } catch (err) {
    fs.writeFileSync(log, "production path failed: " + String(err) + "\n");
    console.log("COMFY_ABSENT");
  }
}

main();
