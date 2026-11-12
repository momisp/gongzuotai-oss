# -*- coding: utf-8 -*-
"""微信 PC 桌面链接申诉 — 双屏 3840×1080 固定环境（mss + OpenCV 模板，不依赖 win32ui）"""
from __future__ import annotations

import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import wechat_win_input as win_input

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "wechat_appeal"

CERT_DIR = r"F:\OA-test\项目安装包\微信申请恢复访问专用\泉州龙啸星空网络科技有限公司1"
GAME_SCREENSHOT_DIR = r"F:\OA-test\项目安装包\微信申请恢复访问专用\18294游戏截图"
APPEAL_REASON = (
    "网站已备案、内容合规，没有诱导分享、下载等违规设计，"
    "望平台核实反馈，我们将配合提供证明资料和相应整改"
)

AIR_DIR = Path(r"f:\yzdpd_uiauto_test\code_test\script\微信链接申诉流程.air")
SIMILARITY_SKIP_THRESHOLD = 0.85

# 双屏 3840×1080：本机实测左屏常在负坐标（如 left=-1920），右屏/主屏从 0 开始
DUAL_SCREEN = (3840, 1080)
MONITOR_W = 1920
MONITOR_H = 1080
BROWSER_MOBILE_VIEW_W = 820

_mon_cache: tuple[dict, dict] | None = None


def _get_monitors() -> tuple[dict, dict]:
    """返回 (左屏, 右屏) 的 mss 矩形：left/top/width/height。"""
    global _mon_cache
    if _mon_cache is not None:
        return _mon_cache
    import mss

    with mss.mss() as sct:
        mons = [dict(m) for m in sct.monitors[1:]]
    if not mons:
        left = {"left": -MONITOR_W, "top": 0, "width": MONITOR_W, "height": MONITOR_H}
        right = {"left": 0, "top": 0, "width": MONITOR_W, "height": MONITOR_H}
    elif len(mons) == 1:
        left = right = mons[0]
    else:
        mons.sort(key=lambda m: m["left"])
        left, right = mons[0], mons[-1]
    _mon_cache = (left, right)
    return _mon_cache


def _left_mon() -> dict:
    return _get_monitors()[0]


def _right_mon() -> dict:
    return _get_monitors()[1]


def _wechat_dialog_fallback() -> tuple[int, int, int, int]:
    m = _left_mon()
    return m["left"] + 730, m["top"] + 158, 365, 570


def _browser_view_fallback() -> tuple[int, int, int, int]:
    m = _right_mon()
    # 左右多留边，避免 H5 按钮/文字被裁切
    return m["left"] + 40, m["top"] + 70, min(BROWSER_MOBILE_VIEW_W + 160, m["width"] - 80), m["height"] - 100

# 模板参数（与 AirtestIDE 录制一致）
TPL_SPECS: dict[str, dict] = {
    "tpl1785985696083.png": {"record_pos": (-0.363, -0.259), "resolution": (1223, 745)},
    "tpl1785985820982.png": {"record_pos": (0.243, -0.006), "resolution": (1223, 745)},
    "tpl1785986144062.png": {"record_pos": (0.128, 0.238), "resolution": (1223, 745)},
    "tpl1785986913598.png": {"record_pos": (-0.0, 0.304), "resolution": (1025, 696)},
    "tpl1785986991543.png": {"record_pos": (-0.36, 0.033), "resolution": (1025, 696)},
    "tpl1785987024662.png": {"record_pos": (-0.245, -0.089), "resolution": (1025, 696)},
    "tpl1785987074038.png": {"record_pos": (-0.383, 0.081), "resolution": (1025, 696)},
    "tpl1785987206981.png": {"target_pos": 4, "record_pos": (-0.096, -0.032), "resolution": (3840, 1080)},
    "tpl1785987458869.png": {"target_pos": 6, "record_pos": (-0.222, 0.08), "resolution": (3840, 1080)},
    "tpl1785987498934.png": {"record_pos": (-0.069, 0.088), "resolution": (3840, 1080)},
    "tpl1785987601938.png": {"record_pos": (-0.235, 0.06), "resolution": (3840, 1080)},
    "tpl1785987903047.png": {"record_pos": (-0.203, 0.059), "resolution": (3840, 1080)},
    "tpl1785988362783.png": {"record_pos": (-0.143, 0.091), "resolution": (3840, 1080)},
}

_runtime_ready: bool | None = None

# 强制停止：任意等待点都能立刻抛出，不必等当前链接跑完
_stop_check_fn = None


class StoppedError(Exception):
    """用户请求强制停止。"""


def _abort_if_stopped() -> None:
    if _stop_check_fn and _stop_check_fn():
        raise StoppedError("已手动停止")


def _sleep(seconds: float) -> None:
    end = time.time() + seconds
    while True:
        _abort_if_stopped()
        left = end - time.time()
        if left <= 0:
            return
        time.sleep(left if left < 0.12 else 0.12)


def _check_airtest() -> tuple[bool, str]:
    """检查自动化运行时（不再依赖 win32ui / Airtest Windows 设备）。"""
    global _runtime_ready
    if _runtime_ready is not None:
        return _runtime_ready, "" if _runtime_ready else "运行时不可用"
    if sys.platform != "win32":
        _runtime_ready = False
        return False, "仅支持 Windows 桌面微信"
    if not AIR_DIR.is_dir():
        _runtime_ready = False
        return False, f"模板目录不存在: {AIR_DIR}"
    try:
        import cv2  # noqa: F401
        import mss  # noqa: F401
        import numpy  # noqa: F401
        from airtest.core.cv import Template  # noqa: F401
    except ImportError as exc:
        _runtime_ready = False
        return False, f"缺少依赖: {exc}（需 opencv、mss、airtest）"
    missing = [n for n in TPL_SPECS if not (AIR_DIR / n).is_file()]
    if missing:
        _runtime_ready = False
        return False, f"缺少模板: {missing[0]} 等 {len(missing)} 个"
    _runtime_ready = True
    return True, ""


def _init_cv():
    from airtest.core.helper import G
    from airtest.core.settings import Settings as ST

    G.BASEDIR = [str(AIR_DIR)]
    ST.CVSTRATEGY = ["mstpl", "tpl", "sift", "brisk"]


def _grab_region(left: int, top: int, width: int, height: int):
    import mss
    import numpy as np
    import cv2

    with mss.mss() as sct:
        shot = sct.grab({"left": int(left), "top": int(top), "width": int(width), "height": int(height)})
        arr = np.frombuffer(shot.rgb, dtype=np.uint8).reshape(shot.height, shot.width, 3)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _grab_screen_bgr():
    import mss

    with mss.mss() as sct:
        mon = sct.monitors[0]
        return _grab_region(mon["left"], mon["top"], mon["width"], mon["height"])


def _find_wechat_hwnd() -> int | None:
    import ctypes
    import win32gui

    user32 = ctypes.windll.user32
    candidates: list[tuple[int, int]] = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def enum_cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        buf = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, buf, 256)
        title = buf.value or ""
        if "微信" not in title or "企业" in title or "支付" in title:
            return True
        try:
            l, t, r, b = win32gui.GetWindowRect(hwnd)
        except Exception:
            return True
        w, h = r - l, b - t
        if w < 400 or h < 400:
            return True
        candidates.append(((w * h), hwnd))
        return True

    user32.EnumWindows(enum_cb, 0)
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _grab_wechat_bgr() -> tuple[object, tuple[int, int]]:
    import win32gui

    hwnd = _find_wechat_hwnd()
    if not hwnd:
        return _grab_screen_bgr(), (0, 0)
    l, t, r, b = win32gui.GetWindowRect(hwnd)
    w, h = r - l, b - t
    return _grab_region(l, t, w, h), (l, t)


def _tpl_scope(name: str) -> str:
    """1223×745 主微信；1025×696 链接弹窗；3840×1080 文件对话框只在左屏匹配。"""
    res = TPL_SPECS.get(name, {}).get("resolution", (3840, 1080))
    w = int(res[0])
    if w >= 3000:
        return "left"  # 打开文件/文件名等，避免误点右屏
    if 900 <= w <= 1100:
        return "dialog"
    if w <= 1400:
        return "wechat"
    return "left"


def _grab_left_monitor_bgr() -> tuple[object, tuple[int, int]]:
    m = _left_mon()
    return _grab_region(m["left"], m["top"], m["width"], m["height"]), (m["left"], m["top"])


def _grab_dialog_bgr() -> tuple[object, tuple[int, int]]:
    """截取链接弹窗区域，供「申请恢复访问」等模板匹配。"""
    import win32gui

    main_hwnd = _find_wechat_hwnd()
    hwnd = _find_wechat_link_dialog_hwnd(main_hwnd)
    if hwnd:
        try:
            l, t, r, b = win32gui.GetWindowRect(hwnd)
            w, h = r - l, b - t
            if w >= 200 and h >= 200:
                return _grab_region(l, t, w, h), (l, t)
        except Exception:
            pass
    # 左屏中部宽区域：弹窗可能偏大（weixin110）或位置略有偏移
    m = _left_mon()
    left, top, width, height = m["left"] + 520, m["top"] + 60, 1100, 980
    return _grab_region(left, top, width, height), (left, top)


def _grab_for_tpl(name: str) -> tuple[object, tuple[int, int]]:
    scope = _tpl_scope(name)
    if scope == "wechat":
        return _grab_wechat_bgr()
    if scope == "dialog":
        return _grab_dialog_bgr()
    if scope == "left":
        return _grab_left_monitor_bgr()
    return _grab_left_monitor_bgr()


def _save_image(path: Path, img) -> None:
    """保存截图（兼容中文路径）。"""
    import cv2

    path.parent.mkdir(parents=True, exist_ok=True)
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise OSError(f"截图编码失败: {path}")
    path.write_bytes(buf.tobytes())


def _load_image_bgr(path: Path):
    """读取图片（兼容中文路径；cv2.imread 对中文路径会返回 None）。"""
    import cv2
    import numpy as np

    p = Path(path)
    if not p.is_file():
        return None
    data = np.fromfile(str(p), dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def _save_screen(path: Path) -> None:
    _save_image(path, _grab_screen_bgr())


def _iter_visible_windows() -> list[tuple[int, str, tuple[int, int, int, int]]]:
    import ctypes

    user32 = ctypes.windll.user32
    out: list[tuple[int, str, tuple[int, int, int, int]]] = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def enum_cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        buf = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, buf, 512)
        title = buf.value or ""
        try:
            import win32gui

            rect = win32gui.GetWindowRect(hwnd)
        except Exception:
            return True
        l, t, r, b = rect
        if r - l < 80 or b - t < 80:
            return True
        out.append((hwnd, title, rect))
        return True

    user32.EnumWindows(enum_cb, 0)
    return out


def _window_client_rect(hwnd: int) -> tuple[int, int, int, int]:
    import win32gui

    _, _, cr, cb = win32gui.GetClientRect(hwnd)
    x, y = win32gui.ClientToScreen(hwnd, (0, 0))
    return x, y, cr, cb


def _save_region(path: Path, left: int, top: int, width: int, height: int, log=None, note: str = "") -> None:
    img = _grab_region(left, top, width, height)
    _save_image(path, img)
    if log:
        log(f"{note}区域截图 {width}×{height} @ ({left},{top})")


def _save_window(path: Path, hwnd: int, *, client: bool = True, log=None, note: str = "") -> bool:
    import win32gui

    try:
        if client:
            left, top, width, height = _window_client_rect(hwnd)
        else:
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            width, height = right - left, bottom - top
        if width < 80 or height < 80:
            return False
        _save_region(path, left, top, width, height, log, note or win32gui.GetWindowText(hwnd))
        return True
    except Exception as exc:
        if log:
            log(f"窗口截图失败: {exc}")
        return False


def _narrow_mobile_viewport(left: int, top: int, width: int, height: int, viewport_w: int = BROWSER_MOBILE_VIEW_W):
    """H5 游戏页居中裁切；保留左右边距，避免按钮/文字被切掉。"""
    # 浏览器本身不太宽时，直接用整客户区
    if width <= viewport_w + 40:
        return left, top, width, height
    cx = left + width // 2
    crop_w = min(viewport_w, width)
    return cx - crop_w // 2, top, crop_w, height


def _rect_on_screen(l: int, t: int, r: int, b: int) -> bool:
    """排除最小化/真·屏外窗口（常见坐标 -32000）；允许左屏负坐标。"""
    if l <= -10000 or t <= -10000:
        return False
    import mss

    with mss.mss() as sct:
        virt = sct.monitors[0]
    if r < virt["left"] + 20 or b < virt["top"] + 20:
        return False
    if l > virt["left"] + virt["width"] - 20 or t > virt["top"] + virt["height"] - 20:
        return False
    if (r - l) < 200 or (b - t) < 200:
        return False
    return True


def _img_mostly_black(img, threshold: float = 15.0) -> bool:
    try:
        return float(img.mean()) < threshold
    except Exception:
        return True


def _ensure_window_visible(hwnd: int, log=None) -> bool:
    """仅当窗口已在屏外/最小化时，拉回右屏（主屏）可见位置。"""
    import win32con
    import win32gui

    try:
        l, t, r, b = win32gui.GetWindowRect(hwnd)
    except Exception:
        return False
    if _rect_on_screen(l, t, r, b):
        return False
    rm = _right_mon()
    if log:
        log(f"浏览器窗口在屏外 ({l},{t})，拉回主屏可见区域")
    try:
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetWindowPos(
            hwnd,
            None,
            rm["left"] + 80,
            rm["top"] + 60,
            min(1600, rm["width"] - 100),
            960,
            win32con.SWP_NOZORDER | win32con.SWP_SHOWWINDOW,
        )
        _sleep(0.6)
        return True
    except Exception as exc:
        if log:
            log(f"拉回浏览器失败: {exc}")
        return False


def _point_on_left_monitor(x: int, y: int) -> bool:
    m = _left_mon()
    return m["left"] <= x < m["left"] + m["width"] and m["top"] <= y < m["top"] + m["height"]


def _is_wechat_link_dialog_rect(l: int, t: int, r: int, b: int) -> bool:
    """链接弹窗在左屏，排除主微信超大窗和左侧图标窄栏。"""
    w, h = r - l, b - t
    cx = (l + r) // 2
    cy = (t + b) // 2
    if not _point_on_left_monitor(cx, cy):
        return False
    if w < 280 or h < 360:
        return False
    lm = _left_mon()
    # 排除贴左屏左边缘的图标栏
    if w < 220 and l < lm["left"] + 80:
        return False
    # 排除几乎占满左屏的主微信
    if w > 1500 and h > 800:
        return False
    if w > 1200:
        return False
    return True


def _find_wechat_link_dialog_hwnd(main_hwnd: int | None = None) -> int | None:
    """左屏上的微信链接弹窗 / weixin110 安全页。"""
    import win32gui

    try:
        fg = win32gui.GetForegroundWindow()
        if fg and (not main_hwnd or fg != main_hwnd):
            rect = win32gui.GetWindowRect(fg)
            if _is_wechat_link_dialog_rect(*rect):
                return fg
    except Exception:
        pass

    candidates: list[tuple[int, int, str]] = []
    for hwnd, title, rect in _iter_visible_windows():
        if main_hwnd and hwnd == main_hwnd:
            continue
        l, t, r, b = rect
        if not _is_wechat_link_dialog_rect(l, t, r, b):
            continue
        w, h = r - l, b - t
        score = w * h
        tl = title.lower()
        if any(k in title for k in ("停止访问", "即将访问", "继续访问", "申请恢复")):
            score += 800_000
        if "weixin110" in tl:
            score += 700_000
        if "http" in tl or "https" in tl:
            score += 200_000
        if "chrome" in tl or "edge" in tl:
            # 微信内置页有时标题带 Chrome，但不要选到工作台浏览器
            if "工作台" in title or "localhost" in tl or "127.0.0.1" in tl:
                continue
            score += 80_000
        candidates.append((score, hwnd, title))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _focus_hwnd(hwnd: int | None) -> None:
    if not hwnd:
        return
    import ctypes

    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    _sleep(0.4)


def _focus_link_dialog(log=None) -> None:
    """把链接弹窗提到前台，避免主微信盖住「申请恢复访问」。"""
    main_hwnd = _find_wechat_hwnd()
    hwnd = _find_wechat_link_dialog_hwnd(main_hwnd)
    if hwnd:
        if log:
            log("置顶微信链接弹窗")
        _focus_hwnd(hwnd)
        return
    if log:
        log("未找到链接弹窗句柄，改置顶主微信")
    _focus_wechat()


def _find_browser_hwnd(url: str = "") -> int | None:
    """找浏览器窗口；优先标题含目标域名，允许稍后把屏外窗口拉回。"""
    domain = (urlparse(url).netloc or "").lower()
    browser_keys = ("chrome", "edge", "firefox", "opera", "brave", "microsoft edge")
    candidates: list[tuple[int, int, str]] = []
    for hwnd, title, rect in _iter_visible_windows():
        l, t, r, b = rect
        w, h = r - l, b - t
        # 最小化窗口宽高可能很小或坐标异常，仍保留域名命中的候选
        tl = title.lower()
        if "工作台" in title or "localhost" in tl or ":8765" in tl:
            continue
        is_browser = any(k in tl for k in browser_keys)
        domain_hit = bool(domain and domain in tl)
        if not is_browser and not domain_hit:
            continue
        on_screen = _rect_on_screen(l, t, r, b)
        if on_screen and (w < 400 or h < 300):
            continue
        score = max(w * h, 1)
        if domain_hit:
            score += 500_000
        if on_screen:
            score += 300_000
        else:
            score -= 200_000
        if is_browser:
            score += 100_000
        candidates.append((score, hwnd, title))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _save_wechat_dialog_shot(path: Path, log=None) -> None:
    import win32gui

    main_hwnd = _find_wechat_hwnd()
    for attempt in range(8):
        hwnd = _find_wechat_link_dialog_hwnd(main_hwnd)
        if hwnd:
            try:
                rect = win32gui.GetWindowRect(hwnd)
            except Exception:
                rect = None
            if rect and _is_wechat_link_dialog_rect(*rect):
                if _save_window(path, hwnd, client=True, log=log, note="微信弹窗"):
                    return
        _sleep(0.5)
    left, top, width, height = _wechat_dialog_fallback()
    if log:
        log(f"未定位微信弹窗窗口，使用固定裁切 ({left},{top},{width}×{height})")
    _save_region(path, left, top, width, height, log, "微信弹窗(兜底)")


def _capture_browser_from_hwnd(hwnd: int, log=None) -> tuple[object | None, str]:
    """从浏览器窗口截取 H5 区域；全黑则退回整客户区。"""
    import win32gui

    try:
        left, top, width, height = _window_client_rect(hwnd)
    except Exception as exc:
        return None, f"取客户区失败: {exc}"
    if not _rect_on_screen(left, top, left + width, top + height):
        return None, f"客户区仍在屏外 ({left},{top})"

    crops = [
        (*_narrow_mobile_viewport(left, top, width, height), "窄栏"),
        (left, top, width, height, "整页"),
    ]
    # 去重
    seen = set()
    for l, t, w, h, tag in crops:
        key = (l, t, w, h)
        if key in seen or w < 80 or h < 80:
            continue
        seen.add(key)
        img = _grab_region(l, t, w, h)
        if _img_mostly_black(img):
            if log:
                log(f"浏览器{tag}截图过黑，跳过 {w}×{h} @ ({l},{t})")
            continue
        title = ""
        try:
            title = win32gui.GetWindowText(hwnd)
        except Exception:
            pass
        return img, f"{title or '浏览器'}{tag} {w}×{h} @ ({l},{t})"
    return None, "窗口截图全黑"


def _save_browser_view_shot(path: Path, url: str = "", log=None) -> None:
    """截浏览器页面：屏外则先拉回可见区；拒绝全黑图。不主动挪到右屏外。"""
    for attempt in range(10):
        hwnd = _find_browser_hwnd(url)
        if hwnd:
            _ensure_window_visible(hwnd, log)
            img, note = _capture_browser_from_hwnd(hwnd, log)
            if img is not None:
                _save_image(path, img)
                if log:
                    log(f"浏览器截图成功: {note}")
                return
        _sleep(0.6)

    # 兜底：先试右屏固定区，再试左屏常见浏览器区，跳过全黑
    lm, rm = _left_mon(), _right_mon()
    for label, box in (
        ("右屏兜底", _browser_view_fallback()),
        ("右屏整屏", (rm["left"] + 40, rm["top"] + 40, rm["width"] - 80, rm["height"] - 80)),
        ("左屏兜底", (lm["left"] + 80, lm["top"] + 60, 1600, 960)),
    ):
        left, top, width, height = box
        img = _grab_region(left, top, width, height)
        if _img_mostly_black(img):
            if log:
                log(f"{label}仍是黑图，跳过")
            continue
        _save_image(path, img)
        if log:
            log(f"浏览器{label}截图 {width}×{height} @ ({left},{top})")
        return

    # 实在不行也写一张，避免后续缺文件，但打明确日志
    left, top, width, height = _browser_view_fallback()
    _save_region(path, left, top, width, height, log, "浏览器(可能黑图)")
    if log:
        log("警告：浏览器截图可能无效（全黑），请确认页面已打开且在可见屏幕内")


def _click(x: int, y: int) -> None:
    import win32api
    import win32con

    win32api.SetCursorPos((int(x), int(y)))
    _sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)


def _key_combo(*keys: str) -> None:
    win_input.key_combo(*keys)


def _press_enter() -> None:
    win_input.key_press("ENTER")
    win_input.key_release("ENTER")


def _paste() -> None:
    _key_combo("LCTRL", "V")


def _select_all_paste() -> None:
    _key_combo("LCTRL", "A")
    _sleep(0.05)
    _paste()


def _type_ascii(text: str) -> None:
    """纯 ASCII 用剪贴板粘贴（比逐键输入更稳）。"""
    _set_clipboard(text)
    _sleep(0.05)
    _paste()


def _tpl(name: str):
    from airtest.core.cv import Template

    p = AIR_DIR / name
    if not p.is_file():
        raise FileNotFoundError(f"缺少模板: {p}")
    kw = dict(TPL_SPECS.get(name, {}))
    return Template(str(p), **kw)


def _touch_tpl(name: str, timeout: float = 15.0, debug_dir: Path | None = None) -> tuple[int, int]:
    tpl = _tpl(name)
    scope = _tpl_scope(name)
    deadline = time.time() + timeout
    last_screen = None
    while time.time() < deadline:
        screen, (ox, oy) = _grab_for_tpl(name)
        last_screen = screen
        pos = tpl.match_in(screen)
        if pos:
            x, y = int(pos[0]) + ox, int(pos[1]) + oy
            _click(x, y)
            return x, y
        _sleep(0.4)
    if debug_dir and last_screen is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        _save_image(debug_dir / f"miss_{name}", last_screen)
    raise RuntimeError(f"未找到模板: {name}（匹配范围: {scope}）")


def url_suffix_name(url: str) -> str:
    parsed = urlparse(url.strip())
    qs = parse_qs(parsed.query)
    gid = (qs.get("gid") or [None])[0]
    pid = (qs.get("pid") or [None])[0]
    if gid and pid:
        return f"gid{gid}pid{pid}"
    m = re.search(r"/gid/(\d+)", parsed.path, re.I)
    if m:
        return f"gid{m.group(1)}"
    m = re.search(r"gid[=/_-]?(\d+)", url, re.I)
    if m:
        return f"gid{m.group(1)}"
    tail = (parsed.path or url).rstrip("/").split("/")[-1] or "screenshot"
    tail = re.sub(r"[^\w.\-]+", "_", tail)[:48]
    return tail or "screenshot"


def image_similarity(path_a: Path, path_b: Path) -> float:
    from PIL import Image

    size = (128, 128)
    a = Image.open(path_a).convert("L").resize(size)
    b = Image.open(path_b).convert("L").resize(size)
    pa, pb = list(a.getdata()), list(b.getdata())
    diff = sum(abs(x - y) for x, y in zip(pa, pb)) / (size[0] * size[1] * 255)
    return round(1.0 - diff, 4)


def white_ratio(path: Path, threshold: int = 240) -> float:
    from PIL import Image

    img = Image.open(path).convert("L").resize((256, 256))
    pixels = list(img.getdata())
    white = sum(1 for p in pixels if p >= threshold)
    return white / len(pixels)


def images_can_open_directly(wechat_shot: Path, browser_shot: Path) -> tuple[bool, str]:
    sim = image_similarity(wechat_shot, browser_shot)
    wr = white_ratio(wechat_shot)
    if sim >= SIMILARITY_SKIP_THRESHOLD:
        return True, f"截图相似度 {sim:.2f}，微信能直接打开"
    if wr >= 0.55 and sim < SIMILARITY_SKIP_THRESHOLD:
        return False, f"微信页白底占比 {wr:.0%}、相似度 {sim:.2f}，需申诉"
    if sim < SIMILARITY_SKIP_THRESHOLD:
        return False, f"截图差异大（相似度 {sim:.2f}），需申诉"
    return True, f"截图相似度 {sim:.2f}，微信能直接打开"


def _set_clipboard(text: str) -> None:
    try:
        import pyperclip

        pyperclip.copy(text)
        return
    except ImportError:
        pass
    ps = "$t = @'\n" + text.replace("'", "''") + "\n'@; Set-Clipboard -Value $t"
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        timeout=10,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
    )


def _focus_wechat() -> None:
    import ctypes

    hwnd = _find_wechat_hwnd()
    if not hwnd:
        return
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    _sleep(0.8)


def _open_wechat_search(log=None) -> None:
    """打开微信内搜索框：优先模板，失败则用 Ctrl+F。"""
    try:
        _touch_tpl("tpl1785985696083.png", timeout=8.0)
    except RuntimeError:
        if log:
            log("搜索框模板未命中，改用 Ctrl+F")
        _key_combo("LCTRL", "F")
        _sleep(0.5)


def _open_in_browser(url: str) -> None:
    subprocess.Popen(
        ["cmd", "/c", "start", "", url],
        shell=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
    )


def _click_sent_link(debug_dir: Path | None = None, log=None) -> None:
    """点击刚发送的链接气泡（绿色气泡在聊天区右侧，链接文字在中上部）。"""
    screen, (ox, oy) = _grab_wechat_bgr()
    h, w = screen.shape[:2]
    tpl = _tpl("tpl1785986144062.png")
    pos = tpl.match_in(screen)
    if not pos:
        _touch_tpl("tpl1785986144062.png", debug_dir=debug_dir)
        _sleep(2.0)
        return

    ix, iy = int(pos[0]), int(pos[1])
    # 自己发的链接在右侧绿色气泡内；原逻辑用输入框 x 会偏左下（见图二红箭头）
    click_x = ox + max(ix + int(w * 0.22), int(w * 0.72))
    click_y = oy + iy - 115

    if log:
        log(f"点击链接坐标 ({click_x}, {click_y}) [窗口 {w}×{h}, 输入框 ({ix},{iy})]")

    if debug_dir is not None:
        import cv2

        dbg = screen.copy()
        cv2.circle(dbg, (click_x - ox, click_y - oy), 8, (0, 0, 255), 2)
        _save_image(debug_dir / "debug_click_link.png", dbg)

    _click(click_x, click_y)
    _sleep(2.0)


def _paste_path(path: str) -> None:
    _set_clipboard(path)
    _sleep(0.08)
    _select_all_paste()
    _sleep(0.15)
    _press_enter()
    _sleep(0.8)


def _fill_file_dialog_dir(folder: str, debug_dir: Path | None = None, log=None) -> None:
    """打开文件对话框后先填目录地址，再供后续填文件名。"""
    if log:
        log(f"填写目录: {folder}")
    try:
        _touch_tpl("tpl1785987206981.png", timeout=10.0, debug_dir=debug_dir)
        _sleep(0.25)
    except RuntimeError:
        if log:
            log("地址栏模板未命中，改用 Alt+D 聚焦地址栏")
        _key_combo("LALT", "D")
        _sleep(0.35)
    _paste_path(folder)


def run_one(
    url: str,
    *,
    work_dir: Path,
    stop_check=None,
    log=None,
) -> dict:
    """执行单条链接申诉；stop_check 返回 True 时在任意等待点立刻中断。"""
    global _stop_check_fn
    logs: list[str] = []

    def _log(msg: str) -> None:
        logs.append(msg)
        if log:
            log(msg)

    _stop_check_fn = stop_check
    try:
        return _run_one_flow(url, work_dir, _log, logs)
    except StoppedError:
        _log("已强制停止（P）")
        return {"ok": False, "stopped": True, "error": "已手动停止", "logs": logs}
    finally:
        _stop_check_fn = None


def _run_one_flow(url: str, work_dir: Path, _log, logs: list[str]) -> dict:
    ok, err = _check_airtest()
    if not ok:
        return {"ok": False, "error": err, "logs": logs}

    _init_cv()
    work_dir.mkdir(parents=True, exist_ok=True)
    wechat_shot = work_dir / "wechat.png"
    browser_shot = work_dir / "browser.png"
    submit_shot = work_dir / "submit.png"

    def _rel(p: Path) -> str:
        try:
            return str(p.relative_to(ROOT)).replace("\\", "/")
        except ValueError:
            return str(p).replace("\\", "/")

    _abort_if_stopped()
    _log("置顶微信窗口")
    _focus_wechat()

    _log("打开文件传输助手")
    _open_wechat_search(_log)
    _sleep(0.4)
    _type_ascii("文件传输助手")
    _sleep(0.5)
    _touch_tpl("tpl1785985820982.png", debug_dir=work_dir)
    _sleep(0.6)

    _log(f"发送链接: {url}")
    _touch_tpl("tpl1785986144062.png", debug_dir=work_dir)
    _sleep(0.3)
    _set_clipboard(url)
    _sleep(0.05)
    _paste()
    _sleep(0.2)
    _press_enter()
    _sleep(1.2)

    _log("点击刚发送的链接")
    _click_sent_link(work_dir, _log)

    _log("等待微信链接弹窗")
    _sleep(1.5)
    _log("微信弹窗截图")
    _save_wechat_dialog_shot(wechat_shot, _log)

    _log("浏览器打开并截图")
    _open_in_browser(url)
    _sleep(6.0)
    _save_browser_view_shot(browser_shot, url, _log)
    if browser_shot.exists():
        chk = _load_image_bgr(browser_shot)
        if chk is None or _img_mostly_black(chk):
            _log("浏览器截图无效，再等一次后重试")
            _sleep(3.0)
            _save_browser_view_shot(browser_shot, url, _log)

    can_open, cmp_remark = images_can_open_directly(wechat_shot, browser_shot)
    _log(cmp_remark)

    screenshots = {
        "wechat": _rel(wechat_shot) if wechat_shot.exists() else "",
        "browser": _rel(browser_shot) if browser_shot.exists() else "",
        "submit": "",
    }

    if can_open:
        return {
            "ok": True,
            "skipped": True,
            "remark": cmp_remark,
            "screenshots": screenshots,
            "logs": logs,
        }

    suffix = url_suffix_name(url)
    saved_browser = Path(GAME_SCREENSHOT_DIR) / f"{suffix}.png"
    Path(GAME_SCREENSHOT_DIR).mkdir(parents=True, exist_ok=True)
    if browser_shot.exists():
        import shutil

        chk = _load_image_bgr(browser_shot)
        if chk is None or _img_mostly_black(chk):
            return {
                "ok": False,
                "error": "浏览器截图失败（全黑/无效），请确认页面在可见屏幕内后重试",
                "screenshots": screenshots,
                "logs": logs,
            }
        shutil.copy2(browser_shot, saved_browser)
        _log(f"浏览器截图已保存: {saved_browser.name}")

    _focus_link_dialog(_log)
    _sleep(0.5)

    _log("点击「申请恢复访问」")
    _touch_tpl("tpl1785986913598.png", debug_dir=work_dir)
    _sleep(0.8)
    _touch_tpl("tpl1785986991543.png", debug_dir=work_dir)
    _sleep(0.8)

    _log("填写申请理由")
    _touch_tpl("tpl1785987024662.png", debug_dir=work_dir)
    _sleep(0.3)
    _set_clipboard(APPEAL_REASON)
    _sleep(0.05)
    _paste()
    _sleep(0.4)

    uploads = [
        ("tpl1785987074038.png", CERT_DIR, "备案查询.png"),
        ("tpl1785987601938.png", CERT_DIR, "营业执照.jpg"),
        ("tpl1785987903047.png", GAME_SCREENSHOT_DIR, f"{suffix}.png"),
    ]
    for plus_tpl, folder, fname in uploads:
        _abort_if_stopped()
        _log(f"上传证明: {fname}")
        _touch_tpl(plus_tpl, debug_dir=work_dir)
        _sleep(1.0)
        # 每次上传都先填目录地址（与申述流程一致）
        _fill_file_dialog_dir(folder, work_dir, _log)
        _sleep(0.4)
        _touch_tpl("tpl1785987458869.png", debug_dir=work_dir)
        _sleep(0.3)
        _set_clipboard(fname)
        _select_all_paste()
        _sleep(0.2)
        _touch_tpl("tpl1785987498934.png", debug_dir=work_dir)
        _sleep(3.5)

    _log("提交前截图")
    _save_wechat_dialog_shot(submit_shot, _log)
    screenshots["submit"] = _rel(submit_shot) if submit_shot.exists() else ""

    _log("点击提交")
    _touch_tpl("tpl1785988362783.png", debug_dir=work_dir)
    _sleep(1.5)

    return {
        "ok": True,
        "skipped": False,
        "remark": cmp_remark + "；已提交申诉",
        "screenshots": screenshots,
        "logs": logs,
    }
