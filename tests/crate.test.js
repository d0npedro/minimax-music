const { test } = require("node:test");
const assert = require("node:assert/strict");
const crateApi = require("../dj/js/crate.js");

test("crate warmup and refill policy", () => {
  const crate = crateApi.createCrate({ warmupSize: 4, targetSize: 5 });
  assert.equal(crateApi.size(crate), 0);
  assert.equal(crateApi.readyToStart(crate), false);
  assert.equal(crateApi.needsFill(crate), true);
  for (var i = 1; i <= 4; i++) crateApi.push(crate, { id: i });
  assert.equal(crateApi.size(crate), 4);
  assert.equal(crateApi.readyToStart(crate), true);
  assert.equal(crateApi.needsFill(crate), true);
  crateApi.push(crate, { id: 5 });
  assert.equal(crateApi.needsFill(crate), false);
  const first = crateApi.shift(crate);
  assert.equal(first.id, 1);
  assert.equal(crateApi.size(crate), 4);
  assert.equal(crateApi.needsFill(crate), true);
});
