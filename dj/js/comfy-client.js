/**
 * Thin ComfyUI /prompt adapter. Generate payload comes from MainFloorGenerate.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.MainFloorComfy = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  function createClient(baseUrl) {
    var fallback =
      typeof root !== "undefined" && root.MainFloorReadiness
        ? root.MainFloorReadiness.comfyBase()
        : "/comfy";
    var base = (baseUrl != null && baseUrl !== "" ? baseUrl : fallback).replace(/\/$/, "");

    function json(method, path, body) {
      var opts = { method: method, headers: {} };
      if (body != null) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      return fetch(base + path, opts).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            data = { raw: text };
          }
          if (!res.ok) {
            var err = new Error("ComfyUI " + res.status + " " + path);
            err.status = res.status;
            err.body = data;
            throw err;
          }
          return data;
        });
      });
    }

    function ping() {
      return json("GET", "/system_stats").then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }

    function queuePrompt(prompt) {
      return json("POST", "/prompt", { prompt: prompt, client_id: "main-floor-dj" });
    }

    function history(id) {
      return json("GET", "/history/" + encodeURIComponent(id));
    }

    function waitFor(id, onTick, timeoutMs) {
      var t0 = Date.now();
      timeoutMs = timeoutMs || 600000;
      function loop() {
        if (Date.now() - t0 > timeoutMs) {
          return Promise.reject(new Error("ComfyUI generate timed out"));
        }
        return history(id).then(function (hist) {
          var entry = hist && hist[id];
          if (onTick) onTick(entry, Date.now() - t0);
          if (entry && entry.status && (entry.status.completed || entry.status.status_str === "success" || entry.status.status_str === "error")) {
            return entry;
          }
          return new Promise(function (resolve) {
            setTimeout(resolve, 2000);
          }).then(loop);
        });
      }
      return loop();
    }

    function viewUrl(file) {
      var q = new URLSearchParams({
        filename: file.filename,
        subfolder: file.subfolder || "",
        type: file.type || "output",
      });
      return base + "/view?" + q.toString();
    }

    function fetchAudio(file) {
      return fetch(viewUrl(file)).then(function (res) {
        if (!res.ok) throw new Error("audio fetch " + res.status);
        return res.arrayBuffer();
      });
    }

    return {
      base: base,
      ping: ping,
      queuePrompt: queuePrompt,
      history: history,
      waitFor: waitFor,
      viewUrl: viewUrl,
      fetchAudio: fetchAudio,
    };
  }

  return { createClient: createClient };
});
