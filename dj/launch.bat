@echo off
cd /d "%~dp0\.."
echo MAIN FLOOR DJ  http://127.0.0.1:8787/
echo ComfyUI (optional) should be at http://127.0.0.1:8188
node dj\serve.js
