const { test } = require("node:test");
const assert = require("node:assert/strict");
const live = require("../dj/js/live-swap.js");
const serve = require("../dj/serve.js");

test("live-swap never reloads the mix owners", () => {
  assert.equal(live.isSafePath("js/app.js"), false);
  assert.equal(live.isSafePath("js/audio-engine.js"), false);
  assert.equal(live.isSafePath("js/mixer.js"), false);
  assert.equal(live.isSafePath("js/deck.js"), false);
  assert.equal(live.isSafePath("../js/ghost-modes.js"), false);
  assert.equal(live.isSafePath("js/features/../../../etc/passwd.js"), false);
});

test("live-swap reloads paint, generate, css, and feature files", () => {
  assert.equal(live.isSafePath("js/ghost-modes.js"), true);
  assert.equal(live.isSafePath("js/stage.js"), true);
  assert.equal(live.isSafePath("js/generate.js"), true);
  assert.equal(live.isSafePath("css/dj.css"), true);
  assert.equal(live.isSafePath("js/features/nova.js"), true);
  assert.equal(live.isSafePath("js/features/readme.md"), false);
});

test("planApply ignores pinned changes and reloads features after ghost", () => {
  const prev = {
    "js/app.js": { mtimeMs: 1, size: 10 },
    "js/ghost-modes.js": { mtimeMs: 1, size: 10 },
    "js/features/nova.js": { mtimeMs: 1, size: 10 },
  };
  const next = {
    "js/app.js": { mtimeMs: 9, size: 11 },
    "js/ghost-modes.js": { mtimeMs: 2, size: 10 },
    "js/features/nova.js": { mtimeMs: 1, size: 10 },
    "js/features/pulse.js": { mtimeMs: 3, size: 8 },
  };
  const planned = live.planApply(prev, next);
  assert.ok(planned.indexOf("js/app.js") === -1);
  assert.ok(planned.indexOf("js/ghost-modes.js") !== -1);
  assert.ok(planned.indexOf("js/features/nova.js") !== -1, "ghost swap re-applies features");
  assert.ok(planned.indexOf("js/features/pulse.js") !== -1);
  assert.ok(planned.indexOf("js/ghost-modes.js") < planned.indexOf("js/features/nova.js"));
});

test("serve live manifest lists swappable booth files", () => {
  const man = serve.liveManifest();
  assert.equal(man.ok, true);
  assert.equal(typeof man.rev, "string");
  assert.ok(man.files["js/ghost-modes.js"]);
  assert.ok(man.files["css/dj.css"]);
  assert.equal(man.files["js/app.js"], undefined);
});
