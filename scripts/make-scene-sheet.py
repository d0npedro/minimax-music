#!/usr/bin/env python3
"""Build one contact-sheet JPG of visual scenes from a video."""
from __future__ import annotations

import argparse
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SHOWINFO_RE = re.compile(r"n:\s*(\d+).*?pts_time:(-?[\d.]+)")


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )


def extract_keyframes(video: Path, work: Path, hwaccel: str | None) -> list[tuple[Path, float]]:
    work.mkdir(parents=True, exist_ok=True)
    pattern = str(work / "f%05d.jpg")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-skip_frame", "nokey"]
    if hwaccel:
        cmd += ["-hwaccel", hwaccel]
    cmd += [
        "-i",
        str(video),
        "-an",
        "-vf",
        "scale=480:-2,showinfo",
        "-vsync",
        "vfr",
        "-q:v",
        "4",
        pattern,
    ]
    proc = run(cmd)
    log = (proc.stderr or "") + (proc.stdout or "")
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg extract failed ({proc.returncode}): {log[-2000:]}")
    times = [float(m.group(2)) for m in SHOWINFO_RE.finditer(log) if float(m.group(2)) >= 0]
    files = sorted(work.glob("f*.jpg"))
    if not files:
        raise RuntimeError("no keyframes extracted")
    if len(times) < len(files):
        times.extend([times[-1] + 1 if times else 0.0] * (len(files) - len(times)))
    return list(zip(files, times[: len(files)]))


def signature(im: Image.Image) -> bytes:
    w, h = im.size
    crop = im.crop((int(w * 0.12), int(h * 0.10), int(w * 0.88), int(h * 0.80)))
    return crop.convert("L").resize((48, 27), Image.Resampling.BILINEAR).tobytes()


def mean_abs_diff(a: bytes, b: bytes) -> float:
    if not a or not b or len(a) != len(b):
        return 255.0
    total = 0
    for x, y in zip(a, b):
        total += abs(x - y)
    return total / len(a)


def pick_scenes(
    frames: list[tuple[Path, float]],
    min_diff: float = 14.0,
    min_gap: float = 2.4,
    cover_every: float = 20.0,
) -> list[tuple[Path, float, int]]:
    kept: list[tuple[Path, float, int]] = []
    last_sig: bytes | None = None
    last_t = -999.0
    for path, t in frames:
        try:
            with Image.open(path) as im:
                sig = signature(im)
        except OSError:
            continue
        if last_sig is None:
            kept.append((path, t, 0))
            last_sig, last_t = sig, t
            continue
        diff = mean_abs_diff(sig, last_sig)
        stale = t - last_t >= cover_every
        if t - last_t >= min_gap and (diff >= min_diff or stale):
            kept.append((path, t, int(diff)))
            last_sig, last_t = sig, t
    return kept


def fmt_time(sec: float) -> str:
    s = max(0, int(round(sec)))
    h, rem = divmod(s, 3600)
    m, r = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{r:02d}"
    return f"{m}:{r:02d}"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = (
        ["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf", "calibri.ttf"]
    )
    windir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    for name in names:
        p = windir / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def build_sheet(
    scenes: list[tuple[Path, float, int]],
    out: Path,
    title: str,
    duration: float,
    src_label: str,
) -> None:
    n = len(scenes)
    if n <= 80:
        thumb_w, cols_cap = 360, 10
    elif n <= 200:
        thumb_w, cols_cap = 280, 14
    elif n <= 420:
        thumb_w, cols_cap = 220, 16
    else:
        thumb_w, cols_cap = 176, 32
    cols = max(4, min(cols_cap, int(math.ceil(math.sqrt(n)))))
    rows = int(math.ceil(n / cols))
    thumb_h = int(round(thumb_w * 9 / 16))
    gap = 10
    pad = 28
    header = 92
    footer = 40
    label_h = 22
    width = pad * 2 + cols * thumb_w + (cols - 1) * gap
    height = header + pad + rows * (thumb_h + label_h) + (rows - 1) * gap + footer
    img = Image.new("RGB", (width, height), (10, 10, 12))
    draw = ImageDraw.Draw(img)
    font_title = load_font(36, bold=True)
    font_sub = load_font(18)
    font_label = load_font(14)

    draw.rectangle((0, 0, width, header - 8), fill=(16, 16, 20))
    draw.text((pad, 18), title, fill=(236, 232, 223), font=font_title)
    sub = f"{src_label}   ·   {fmt_time(duration)}   ·   {n} Szenen"
    draw.text((pad, 60), sub, fill=(160, 156, 148), font=font_sub)

    for i, (path, t, _h) in enumerate(scenes):
        c = i % cols
        r = i // cols
        x = pad + c * (thumb_w + gap)
        y = header + r * (thumb_h + label_h + gap)
        with Image.open(path) as src:
            tile = src.convert("RGB")
            tile = tile.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        img.paste(tile, (x, y))
        draw.rectangle((x, y + thumb_h - 2, x + thumb_w, y + thumb_h + label_h), fill=(16, 16, 20))
        draw.text((x + 4, y + thumb_h + 2), f"{i + 1:03d}  {fmt_time(t)}", fill=(210, 206, 198), font=font_label)

    draw.text(
        (pad, height - 30),
        "Keyframe-Szenen in Abspielreihenfolge",
        fill=(110, 108, 102),
        font=font_sub,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=88, optimize=True, progressive=True)


def probe_duration(video: Path) -> float:
    proc = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video),
        ]
    )
    try:
        return float((proc.stdout or "").strip())
    except ValueError:
        return 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=r"H:\Aufnahmen\schranz.mkv")
    ap.add_argument("--out", default=r"H:\Aufnahmen\schranz-szenen.jpg")
    ap.add_argument("--work", default=r"H:\Aufnahmen\_schranz_scene_work")
    ap.add_argument("--keep-work", action="store_true")
    args = ap.parse_args()

    video = Path(args.video)
    out = Path(args.out)
    work = Path(args.work)
    if not video.is_file():
        print("missing video", video, file=sys.stderr)
        return 1

    duration = probe_duration(video)
    print(f"video {video} duration={duration:.1f}s", flush=True)
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)

    frames = None
    last_err = None
    for accel in ("cuda", "d3d11va", None):
        print(f"extract keyframes hwaccel={accel or 'none'}", flush=True)
        try:
            frames = extract_keyframes(video, work, accel)
            print(f"keyframes {len(frames)}", flush=True)
            break
        except Exception as err:
            last_err = err
            print(f"extract failed: {err}", flush=True)
            shutil.rmtree(work, ignore_errors=True)
    if frames is None:
        print(last_err, file=sys.stderr)
        return 1

    scenes = pick_scenes(frames)
    print(f"scenes {len(scenes)}", flush=True)
    if len(scenes) < 12:
        scenes = pick_scenes(frames, min_diff=8.0, min_gap=1.2, cover_every=12.0)
        print(f"scenes retry {len(scenes)}", flush=True)
    if not scenes:
        print("no scenes", file=sys.stderr)
        return 1

    build_sheet(
        scenes,
        out,
        title="SCHRANZ",
        duration=duration,
        src_label="schranz.mkv  ·  3840×2160  ·  60 fps",
    )
    print(f"wrote {out} bytes={out.stat().st_size}", flush=True)
    if not args.keep_work:
        shutil.rmtree(work, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
