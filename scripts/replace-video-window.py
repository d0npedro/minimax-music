#!/usr/bin/env python3
"""Replace video only in [start, end), keep original audio. Stream-copy the rest."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

VIDEO = Path(r"H:\Aufnahmen\schranz.mkv")
REPLACEMENT = Path(r"H:\Schranz Set Material\Zeitraffer\Nightlapse Autobahn.mp4")
WORK = Path(r"H:\Aufnahmen\_replace_work")
OUT = Path(r"H:\Aufnahmen\schranz-edit.mkv")
START = 818.0
END = 824.0
DUR = END - START


def run(cmd: list[str], label: str) -> None:
    print(label, flush=True)
    print(" ", " ".join(cmd[:8]), "...", flush=True)
    proc = subprocess.run(cmd)
    if proc.returncode != 0:
        raise SystemExit(f"{label} failed ({proc.returncode})")


def main() -> int:
    if not VIDEO.is_file():
        print("missing", VIDEO, file=sys.stderr)
        return 1
    if not REPLACEMENT.is_file():
        print("missing", REPLACEMENT, file=sys.stderr)
        return 1
    WORK.mkdir(parents=True, exist_ok=True)
    mid_wav = WORK / "mid.wav"
    mid_v = WORK / "mid_v.mkv"
    mid = WORK / "mid.mkv"
    part_a = WORK / "partA.mkv"
    part_c = WORK / "partC.mkv"
    listing = WORK / "concat.txt"

    run(
        [
            "ffmpeg", "-y", "-hide_banner",
            "-ss", f"{START}", "-t", f"{DUR}", "-i", str(VIDEO),
            "-vn", "-c:a", "pcm_s24le", "-ar", "48000", "-ac", "2",
            str(mid_wav),
        ],
        "extract original audio window",
    )
    run(
        [
            "ffmpeg", "-y", "-hide_banner", "-hwaccel", "cuda",
            "-ss", "10", "-t", f"{DUR}", "-i", str(REPLACEMENT),
            "-an",
            "-vf",
            "scale=3840:2160:force_original_aspect_ratio=increase:flags=lanczos,crop=3840:2160,fps=60",
            "-frames:v", "360",
            "-c:v", "av1_nvenc", "-preset", "p4", "-rc", "vbr",
            "-b:v", "35M", "-maxrate", "50M", "-g", "120",
            "-pix_fmt", "yuv420p",
            "-color_range", "pc", "-colorspace", "bt709",
            "-color_primaries", "bt709", "-color_trc", "bt709",
            "-video_track_timescale", "1000",
            str(mid_v),
        ],
        "encode replacement video 4K60",
    )
    run(
        [
            "ffmpeg", "-y", "-hide_banner",
            "-i", str(mid_v), "-i", str(mid_wav),
            "-c:v", "copy", "-c:a", "pcm_s24le",
            "-t", f"{DUR}",
            str(mid),
        ],
        "mux mid (new video + original audio)",
    )
    run(
        [
            "ffmpeg", "-y", "-hide_banner",
            "-i", str(VIDEO),
            "-to", f"{START}",
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            str(part_a),
        ],
        "copy part A (0 to 13:38)",
    )
    run(
        [
            "ffmpeg", "-y", "-hide_banner",
            "-ss", f"{END}",
            "-i", str(VIDEO),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            str(part_c),
        ],
        "copy part C (13:44 to end)",
    )
    listing.write_text(
        f"file '{part_a.as_posix()}'\nfile '{mid.as_posix()}'\nfile '{part_c.as_posix()}'\n",
        encoding="utf-8",
    )
    run(
        [
            "ffmpeg", "-y", "-hide_banner",
            "-f", "concat", "-safe", "0", "-i", str(listing),
            "-c", "copy",
            "-fflags", "+genpts",
            str(OUT),
        ],
        "concat A + mid + C",
    )
    print("wrote", OUT, "bytes", OUT.stat().st_size, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
