const { test } = require("node:test");
const assert = require("node:assert/strict");
const serve = require("../dj/serve.js");

test("proxy strips Origin/Referer/Sec-Fetch-Site so ComfyUI will not 403 on port mismatch", () => {
  const cleaned = serve.sanitizeProxyHeaders({
    origin: "http://127.0.0.1:8787",
    Origin: "http://127.0.0.1:8787",
    referer: "http://127.0.0.1:8787/",
    Referer: "http://127.0.0.1:8787/",
    "sec-fetch-site": "same-origin",
    "Sec-Fetch-Site": "same-origin",
    host: "127.0.0.1:8787",
    "content-type": "application/json",
    "content-length": "12",
  });
  assert.equal(cleaned.origin, undefined);
  assert.equal(cleaned.Origin, undefined);
  assert.equal(cleaned.referer, undefined);
  assert.equal(cleaned.Referer, undefined);
  assert.equal(cleaned["sec-fetch-site"], undefined);
  assert.equal(cleaned["Sec-Fetch-Site"], undefined);
  assert.equal(cleaned.host, "127.0.0.1:8188");
  assert.equal(cleaned["content-type"], "application/json");
  assert.ok(cleaned.host !== "127.0.0.1:8787");
});
