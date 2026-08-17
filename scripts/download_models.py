"""Multi-range Hugging Face downloader for MiniMax Music 3 ComfyUI weights.

Resolves a fresh huggingface.co URL for every range so CDN signed links
cannot expire mid-file (same failure mode as the MiniMax-H3 setup).
"""

from __future__ import annotations

import hashlib
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


HF_BASE = "https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main"
CHUNK = 8 * 1024 * 1024  # 8 MiB parts
WORKERS = 8
RETRIES = 8
USER_AGENT = "minimax-music3-setup/1.0"

MODELS = [
    {
        "rel": "diffusion_models/minimax_music3_dit_int8_convrot.safetensors",
        "size": 2502161682,
        "sha256": "d6b959633e69899f99f3a92d6741c0fe79f26958a30811e50e372ef978b24d5f",
    },
    {
        "rel": "diffusion_models/minimax_music3_dit_fp16.safetensors",
        "size": 4914197682,
        "sha256": "45494a2b6b69af115902ff28eaf54118d19067aa54da01000f3e3efce7ba0e34",
    },
    {
        "rel": "text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
        "size": 9196611886,
        "sha256": "010b7416d2336a08c711bc22ee65849c9623069ddb7d89bec011a75699e52014",
    },
    {
        "rel": "vae/minimax_music3_dav.safetensors",
        "size": 216696128,
        "sha256": "2a32155b769be01445fcc2a8663b910fc9e1751e18dc1c3ec528064512d9ef0c",
    },
]


def log(msg: str) -> None:
    print(msg, flush=True)


def hf_url(rel: str) -> str:
    return f"{HF_BASE}/{rel}?download=true"


def request(url: str, headers: dict | None = None, timeout: int = 60):
    hdrs = {"User-Agent": USER_AGENT}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    return urllib.request.urlopen(req, timeout=timeout)


def fetch_range(rel: str, start: int, end: int) -> bytes:
    url = hf_url(rel)
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            with request(url, {"Range": f"bytes={start}-{end}"}, timeout=180) as resp:
                data = resp.read()
            expected = end - start + 1
            if len(data) != expected:
                raise IOError(f"short read {len(data)} != {expected}")
            return data
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            wait = min(2 ** attempt, 30)
            log(f"  retry {attempt}/{RETRIES} bytes {start}-{end}: {exc} (sleep {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"failed range {start}-{end} for {rel}: {last_err}")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(8 * 1024 * 1024)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def download_one(dest_root: Path, spec: dict) -> str:
    rel = spec["rel"]
    size = spec["size"]
    expected_sha = spec["sha256"]
    dest = dest_root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")

    if dest.exists() and dest.stat().st_size == size:
        log(f"[skip] {rel} already present ({size} bytes), verifying sha256...")
        digest = sha256_file(dest)
        if digest == expected_sha:
            log(f"[ok]   {rel} sha256 match")
            return "skipped"
        log(f"[warn] {rel} sha256 mismatch {digest} != {expected_sha}, redownloading")
        dest.unlink()

    ranges: list[tuple[int, int]] = []
    pos = 0
    while pos < size:
        end = min(pos + CHUNK - 1, size - 1)
        ranges.append((pos, end))
        pos = end + 1

    if part.exists() and part.stat().st_size != size:
        part.unlink()
    if not part.exists():
        with part.open("wb") as f:
            f.truncate(size)

    lock = threading.Lock()
    done = 0
    t0 = time.time()

    def worker(rng: tuple[int, int]) -> int:
        start, end = rng
        data = fetch_range(rel, start, end)
        with lock:
            with part.open("r+b") as f:
                f.seek(start)
                f.write(data)
        return len(data)

    log(f"[get]  {rel}  {size / 1e9:.2f} GB  {len(ranges)} parts x {WORKERS} workers")
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = [pool.submit(worker, rng) for rng in ranges]
        for fut in as_completed(futs):
            n = fut.result()
            done += n
            elapsed = max(time.time() - t0, 0.001)
            mbps = (done / 1e6) / elapsed
            pct = 100.0 * done / size
            log(f"  {rel}: {pct:6.2f}%  {done / 1e9:.2f}/{size / 1e9:.2f} GB  {mbps:.1f} MB/s")

    if part.stat().st_size != size:
        raise RuntimeError(f"{rel} part size {part.stat().st_size} != {size}")

    log(f"[hash] {rel}")
    digest = sha256_file(part)
    if digest != expected_sha:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"{rel} sha256 mismatch {digest} != {expected_sha}")

    os.replace(part, dest)
    log(f"[done] {rel}")
    return "downloaded"


def main() -> int:
    dest_root = Path(sys.argv[1] if len(sys.argv) > 1 else r"H:\toolz\minimax-music\models")
    dest_root.mkdir(parents=True, exist_ok=True)
    results = {}
    errors = []
    for spec in MODELS:
        try:
            results[spec["rel"]] = download_one(dest_root, spec)
        except Exception as exc:  # noqa: BLE001
            results[spec["rel"]] = f"FAILED: {exc}"
            errors.append(spec["rel"])
            log(f"[FAIL] {spec['rel']}: {exc}")
    log("==== SUMMARY ====")
    for rel, status in results.items():
        log(f"  {status:12}  {rel}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
