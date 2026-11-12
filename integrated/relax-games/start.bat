@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -c "import pygame" 2>nul || (
  echo 正在安装 pygame...
  python -m pip install pygame>=2.5.0 -q
)
python run.py
