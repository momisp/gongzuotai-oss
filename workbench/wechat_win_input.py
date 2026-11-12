# -*- coding: utf-8 -*-
"""Windows 键盘输入（独立实现，避免 import airtest.core.win → pywinauto → win32ui）"""
from __future__ import annotations

import ctypes
from ctypes.wintypes import DWORD, LONG, WORD, WPARAM

import win32con

KEYEVENTF_SCANCODE = 0x0008

KEYS = {
    "ENTER": 0x1C,
    "LCTRL": 0x1D,
    "LALT": 0x38,
    "A": 0x1E,
    "D": 0x20,
    "F": 0x21,
    "V": 0x2F,
}

ULONG_PTR = WPARAM


class KeyBdInput(ctypes.Structure):
    _fields_ = [
        ("wVk", WORD),
        ("wScan", WORD),
        ("dwFlags", DWORD),
        ("time", DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class MouseInput(ctypes.Structure):
    _fields_ = [
        ("dx", LONG),
        ("dy", LONG),
        ("mouseData", DWORD),
        ("dwFlags", DWORD),
        ("time", DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HardwareInput(ctypes.Structure):
    _fields_ = [("uMsg", DWORD), ("wParamL", WORD), ("wParamH", WORD)]


class _Input(ctypes.Union):
    _fields_ = [("ki", KeyBdInput), ("mi", MouseInput), ("hi", HardwareInput)]


class Input(ctypes.Structure):
    _anonymous_ = ("_input",)
    _fields_ = [("type", DWORD), ("_input", _Input)]


def _send_scancode(hex_code: int, flags: int) -> None:
    inputs = Input(type=ctypes.c_ulong(win32con.INPUT_KEYBOARD), ki=KeyBdInput(wScan=hex_code, dwFlags=flags))
    ctypes.windll.user32.SendInput(1, ctypes.byref(inputs), ctypes.sizeof(inputs))


def key_press(key: str) -> None:
    code = KEYS[key.upper()]
    _send_scancode(code, KEYEVENTF_SCANCODE)


def key_release(key: str) -> None:
    code = KEYS[key.upper()]
    _send_scancode(code, KEYEVENTF_SCANCODE | win32con.KEYEVENTF_KEYUP)


def key_combo(*keys: str) -> None:
    for k in keys:
        key_press(k)
    for k in reversed(keys):
        key_release(k)
