/**
 * Pre-generated track buffer. Pure queue — no audio I/O.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorCrate = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createCrate(opts) {
    opts = opts || {};
    return {
      items: [],
      warmupSize: opts.warmupSize != null ? opts.warmupSize : 4,
      targetSize: opts.targetSize != null ? opts.targetSize : 5,
    };
  }

  function size(crate) {
    return crate && crate.items ? crate.items.length : 0;
  }

  function push(crate, item) {
    if (!crate || !item) return 0;
    crate.items.push(item);
    return crate.items.length;
  }

  function shift(crate) {
    if (!crate || !crate.items.length) return null;
    return crate.items.shift();
  }

  function needsFill(crate) {
    return !!(crate && size(crate) < crate.targetSize);
  }

  function readyToStart(crate) {
    return !!(crate && size(crate) >= crate.warmupSize);
  }

  return {
    createCrate: createCrate,
    size: size,
    push: push,
    shift: shift,
    needsFill: needsFill,
    readyToStart: readyToStart,
  };
});
