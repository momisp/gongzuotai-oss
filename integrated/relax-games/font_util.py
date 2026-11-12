# -*- coding: utf-8 -*-
"""安全加载中文字体：绕开 pygame Win32 SysFont 扫注册表时的 TypeError。"""
from __future__ import annotations

import os
from pathlib import Path

import pygame

_WIN_FONTS = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
_FONT_FILES_BOLD = (
    _WIN_FONTS / "msyhbd.ttc",
    _WIN_FONTS / "msyh.ttc",
    _WIN_FONTS / "simhei.ttf",
    _WIN_FONTS / "arialbd.ttf",
    _WIN_FONTS / "arial.ttf",
)
_FONT_FILES_REG = (
    _WIN_FONTS / "msyh.ttc",
    _WIN_FONTS / "msyhbd.ttc",
    _WIN_FONTS / "simhei.ttf",
    _WIN_FONTS / "arial.ttf",
    _WIN_FONTS / "simsun.ttc",
)
_SYS_FONT_NAMES = ("microsoftyahei", "微软雅黑", "simhei", "arial", "sans")


def load_font(size: int, bold: bool = False) -> pygame.font.Font:
    files = _FONT_FILES_BOLD if bold else _FONT_FILES_REG
    for path in files:
        try:
            if path.is_file():
                return pygame.font.Font(str(path), size)
        except (OSError, TypeError, ValueError, pygame.error):
            continue
    for name in _SYS_FONT_NAMES:
        try:
            return pygame.font.SysFont(name, size, bold=bold)
        except (TypeError, OSError, ValueError, pygame.error):
            continue
    return pygame.font.Font(None, size)
