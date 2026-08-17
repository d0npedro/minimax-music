"""Queue the MiniMax Music 3 smoke-test graph against a running ComfyUI."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_URL = "http://127.0.0.1:8188"
WORKFLOW = Path(__file__).resolve().parents[1] / "workflows" / "minimax_music3_smoke_api.json"


def http_json(method: str, url: str, payload: dict | None = None, timeout: int = 60):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {body}") from exc
    return json.loads(raw) if raw else None


def wait_for_server(base: str, timeout: int = 180) -> None:
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        try:
            http_json("GET", f"{base}/system_stats", timeout=5)
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2)
    raise RuntimeError(f"ComfyUI did not become ready at {base}: {last}")


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    wait_for_server(base)
    stats = http_json("GET", f"{base}/system_stats")
    print("system_stats:", json.dumps(stats, indent=2)[:2000], flush=True)

    obj = http_json("GET", f"{base}/object_info")
    required = [
        "MiniMaxMusic3TextEncode",
        "EmptyMiniMaxMusic3LatentAudio",
        "UNETLoader",
        "CLIPLoader",
        "VAELoader",
        "VAEDecodeAudioTiled",
        "SaveAudioAdvanced",
    ]
    missing = [name for name in required if name not in obj]
    if missing:
        print("MISSING NODES:", missing, flush=True)
        return 2

    unets = obj["UNETLoader"]["input"]["required"]["unet_name"][0]
    clips = obj["CLIPLoader"]["input"]["required"]["clip_name"][0]
    vaes = obj["VAELoader"]["input"]["required"]["vae_name"][0]
    print("unet models:", [n for n in unets if "minimax_music3" in n], flush=True)
    print("clip models:", [n for n in clips if "minimax_music3" in n], flush=True)
    print("vae models:", [n for n in vaes if "minimax_music3" in n], flush=True)
    for needed, listing in [
        ("minimax_music3_dit_int8_convrot.safetensors", unets),
        ("minimax_music3_text_encoder_pruned_int8_convrot.safetensors", clips),
        ("minimax_music3_dav.safetensors", vaes),
    ]:
        if needed not in listing:
            print(f"MODEL NOT VISIBLE TO COMFYUI: {needed}", flush=True)
            return 3

    prompt = json.loads(WORKFLOW.read_text(encoding="utf-8"))
    queued = http_json("POST", f"{base}/prompt", {"prompt": prompt, "client_id": "minimax-music3-smoke"})
    prompt_id = queued["prompt_id"]
    print(f"queued prompt_id={prompt_id}", flush=True)

    t0 = time.time()
    last_status = None
    while True:
        hist = http_json("GET", f"{base}/history/{prompt_id}")
        entry = hist.get(prompt_id) if hist else None
        if entry:
            status = entry.get("status", {})
            last_status = status
            if status.get("completed") or status.get("status_str") in {"success", "error"}:
                break
        elapsed = time.time() - t0
        print(f"waiting... {elapsed:.0f}s status={last_status}", flush=True)
        if elapsed > 3600:
            print("TIMEOUT waiting for generation", flush=True)
            return 4
        time.sleep(10)

    print("final status:", json.dumps(last_status, indent=2), flush=True)
    outputs = entry.get("outputs", {})
    print("outputs:", json.dumps(outputs, indent=2)[:4000], flush=True)
    ok = last_status.get("status_str") == "success" and not last_status.get("messages", [])
    # messages may include execution_success
    msgs = last_status.get("messages") or []
    has_error = any(m[0] == "execution_error" for m in msgs if isinstance(m, (list, tuple)))
    has_success = any(m[0] == "execution_success" for m in msgs if isinstance(m, (list, tuple)))
    if has_error or not (ok or has_success):
        print("SMOKE TEST FAILED", flush=True)
        return 5
    print(f"SMOKE TEST OK in {time.time() - t0:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
