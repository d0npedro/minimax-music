@echo off
REM MiniMax Music 3 launch helper. Do not add --use-sage-attention.
cd /d D:\WAN22\ComfyUI_windows_portable
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 127.0.0.1 --port 8188 --reserve-vram 0.9
