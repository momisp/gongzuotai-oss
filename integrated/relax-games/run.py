# -*- coding: utf-8 -*-
"""图形化总入口：明日方舟式主界面风格，「游戏模式」内可选各子游戏入口。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pygame

from font_util import load_font

ROOT = Path(__file__).resolve().parent

MODES: list[tuple[str, Path]] = [
    ("游戏模式一 · 圆内双球", ROOT / "modes" / "circle_ball" / "main.py"),
    ("游戏模式二 · 太极进化", ROOT / "modes" / "circle_taiji_evolve" / "main.py"),
    ("游戏模式三 · 抛射回合制 Demo", ROOT / "抛射类回合制demo" / "main.py"),
    ("游戏模式四 · 星铁双球对决", ROOT / "modes" / "star_rail_duel" / "main.py"),
    ("游戏模式五 · 圆内幸存者（实验）", ROOT / "modes" / "circle_survivor" / "main.py"),
]

W, H = 1100, 680
FPS = 60

COL_BG_TOP = (28, 32, 42)
COL_BG_BOT = (18, 20, 28)
COL_PANEL = (248, 248, 252)
COL_PANEL_DIM = (210, 212, 220)
COL_TEXT = (18, 18, 22)
COL_TEXT_SUB = (90, 92, 100)
COL_ACCENT = (0, 188, 220)
COL_ACCENT_DARK = (0, 140, 168)
COL_OVERLAY = (12, 14, 20)
COL_LINE = (180, 182, 190)


def _font(size: int, bold: bool = True) -> pygame.font.Font:
    return load_font(size, bold=bold)


def draw_gradient_bg(surf: pygame.Surface) -> None:
    h = surf.get_height()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(COL_BG_TOP[0] * (1 - t) + COL_BG_BOT[0] * t)
        g = int(COL_BG_TOP[1] * (1 - t) + COL_BG_BOT[1] * t)
        b = int(COL_BG_TOP[2] * (1 - t) + COL_BG_BOT[2] * t)
        pygame.draw.line(surf, (r, g, b), (0, y), (surf.get_width(), y))


def draw_left_decor(surf: pygame.Surface, t_ms: int) -> None:
    w = int(W * 0.52)
    layer = pygame.Surface((w, H), pygame.SRCALPHA)
    shift = (t_ms // 40) % 40
    for i in range(-2, w // 30 + 3):
        x0 = i * 36 + shift
        pygame.draw.line(layer, (255, 255, 255, 10), (x0, 0), (x0 - 120, H), 1)
    poly = [(40, 80), (w - 20, 40), (w - 60, H - 60), (20, H - 100)]
    pygame.draw.polygon(layer, (255, 255, 255, 22), poly)
    poly2 = [(60, 140), (w - 80, 100), (w - 120, H - 120), (40, H - 140)]
    pygame.draw.polygon(layer, (255, 255, 255, 12), poly2)
    surf.blit(layer, (0, 0))
    f = _font(56, True)
    te = f.render("解压", True, (255, 255, 255))
    te.set_alpha(38)
    surf.blit(te, (48, H // 2 - 80))
    te2 = _font(36, True).render("RELAX", True, (255, 255, 255))
    te2.set_alpha(22)
    surf.blit(te2, (52, H // 2 - 10))


def skew_hit_rect(x: int, y: int, rw: int, rh: int, skew: int) -> pygame.Rect:
    return pygame.Rect(x - 2, y - 2, rw + skew + 4, rh + 4)


def draw_skew_panel(
    surf: pygame.Surface,
    x: int,
    y: int,
    rw: int,
    rh: int,
    skew: int,
    fill: tuple[int, int, int],
    border: tuple[int, int, int] | None,
    alpha: int = 255,
) -> None:
    pts = [(x + skew, y), (x + rw, y), (x + rw - skew, y + rh), (x, y + rh)]
    if alpha < 255:
        tmp = pygame.Surface((W, H), pygame.SRCALPHA)
        pygame.draw.polygon(tmp, (*fill, alpha), pts)
        if border:
            pygame.draw.polygon(tmp, (*border, min(255, alpha + 40)), pts, 2)
        surf.blit(tmp, (0, 0))
    else:
        pygame.draw.polygon(surf, fill, pts)
        if border:
            pygame.draw.polygon(surf, border, pts, 2)


def layout_main_buttons() -> dict[str, tuple[int, int, int, int, int]]:
    """返回 skew 面板几何: key -> (x, y, rw, rh, skew)"""
    rx = int(W * 0.52) + 8
    rw = W - rx - 24
    skew = 14
    y = 48
    h0 = 108
    d: dict[str, tuple[int, int, int, int, int]] = {}
    d["terminal"] = (rx, y, rw, h0, skew)
    y += h0 + 12
    h1 = 76
    d["modes"] = (rx, y, rw, h1, skew)
    y += h1 + 10
    h2 = 64
    d["notice"] = (rx, y, rw, h2, skew)
    y += h2 + 10
    h3 = 56
    d["quit"] = (rx, y, rw, h3, skew)
    return d


def main_hit_rects() -> dict[str, pygame.Rect]:
    out: dict[str, pygame.Rect] = {}
    for key, (x, y, rw, rh, sk) in layout_main_buttons().items():
        out[key] = skew_hit_rect(x, y, rw, rh, sk)
    return out


def draw_main_column(
    surf: pygame.Surface,
    fonts: tuple[pygame.font.Font, pygame.font.Font, pygame.font.Font],
    hover: str | None,
) -> None:
    title_f, btn_f, sub_f = fonts
    geom = layout_main_buttons()

    x, y, rw, h0, sk = geom["terminal"]
    draw_skew_panel(surf, x, y, rw, h0, sk, COL_PANEL, COL_LINE, 235)
    surf.blit(title_f.render("主控终端", True, COL_TEXT), (x + sk + 16, y + 22))
    surf.blit(sub_f.render("HOME TERMINAL", True, COL_TEXT_SUB), (x + sk + 16, y + 62))

    x, y, rw, h1, sk = geom["modes"]
    c = (255, 255, 255) if hover == "modes" else COL_PANEL
    draw_skew_panel(surf, x, y, rw, h1, sk, c, COL_LINE, 252)
    surf.blit(btn_f.render("游戏模式", True, COL_TEXT), (x + sk + 18, y + 22))
    surf.blit(sub_f.render("GAME MODE", True, COL_TEXT_SUB), (x + sk + 18, y + 50))
    pygame.draw.circle(surf, (230, 72, 58), (x + rw - 28, y + 18), 6)

    x, y, rw, h2, sk = geom["notice"]
    draw_skew_panel(surf, x, y, rw, h2, sk, COL_ACCENT, COL_ACCENT_DARK, 240)
    surf.blit(btn_f.render("公告", True, (255, 255, 255)), (x + sk + 18, y + 18))
    surf.blit(sub_f.render("NOTICE", True, (220, 248, 255)), (x + sk + 18, y + 42))

    x, y, rw, h3, sk = geom["quit"]
    cq = (230, 232, 238) if hover == "quit" else COL_PANEL_DIM
    draw_skew_panel(surf, x, y, rw, h3, sk, cq, COL_LINE, 230)
    surf.blit(btn_f.render("退出", True, COL_TEXT), (x + sk + 20, y + 14))


def layout_submenu() -> dict[str, pygame.Rect]:
    n = len(MODES)
    gap = 10
    bh = 48
    back_h = 42
    by0 = 96
    content_h = by0 + n * (bh + gap) + 16 + back_h + 24
    ph = max(300, content_h)
    pw = 460
    px = (W - pw) // 2
    py = (H - ph) // 2
    bx, bw = px + 28, pw - 56
    by = py + by0
    out: dict[str, pygame.Rect] = {"panel": pygame.Rect(px, py, pw, ph)}
    for i in range(n):
        out[f"mode{i}"] = pygame.Rect(bx, by + i * (bh + gap), bw, bh)
    out["back"] = pygame.Rect(bx, by + n * (bh + gap) + 14, bw, back_h)
    return out


def draw_submenu(
    surf: pygame.Surface,
    fonts: tuple[pygame.font.Font, pygame.font.Font, pygame.font.Font],
    hover: str | None,
) -> None:
    title_f, btn_f, sub_f = fonts
    ov = pygame.Surface((W, H), pygame.SRCALPHA)
    ov.fill((*COL_OVERLAY, 210))
    surf.blit(ov, (0, 0))

    rects = layout_submenu()
    px, py, pw, ph = rects["panel"].x, rects["panel"].y, rects["panel"].w, rects["panel"].h
    pygame.draw.rect(surf, COL_PANEL, (px, py, pw, ph))
    pygame.draw.rect(surf, COL_LINE, (px, py, pw, ph), 2)
    surf.blit(title_f.render("选择游戏模式", True, COL_TEXT), (px + 28, py + 24))
    surf.blit(sub_f.render("SELECT MODE", True, COL_TEXT_SUB), (px + 28, py + 58))

    for i, (label, _) in enumerate(MODES):
        key = f"mode{i}"
        r = rects[key]
        c = (255, 255, 255) if hover == key else (238, 238, 244)
        pygame.draw.rect(surf, c, r)
        pygame.draw.rect(surf, COL_LINE, r, 1)
        surf.blit(btn_f.render(label, True, COL_TEXT), (r.x + 14, r.y + 10))

    r2 = rects["back"]
    c2 = (220, 222, 230) if hover == "back" else COL_PANEL_DIM
    pygame.draw.rect(surf, c2, r2)
    pygame.draw.rect(surf, COL_LINE, r2, 1)
    surf.blit(sub_f.render("返回", True, COL_TEXT), (r2.x + 16, r2.y + 10))


def pick_hover_main(mx: int, my: int) -> str | None:
    for key, rect in main_hit_rects().items():
        if rect.collidepoint(mx, my):
            return key
    return None


def pick_hover_sub(mx: int, my: int) -> str | None:
    for key, rect in layout_submenu().items():
        if key == "panel":
            continue
        if rect.collidepoint(mx, my):
            return key
    return None


def launch_mode(script: Path) -> None:
    if not script.is_file():
        return
    pygame.quit()
    subprocess.run([sys.executable, str(script)], cwd=str(script.parent))
    pygame.init()


def main() -> None:
    pygame.init()
    try:
        pygame.key.stop_text_input()
    except (AttributeError, pygame.error):
        pass
    screen = pygame.display.set_mode((W, H))
    pygame.display.set_caption("解压小游戏 · 启动器")
    clock = pygame.time.Clock()

    def reload_fonts() -> tuple[pygame.font.Font, pygame.font.Font, pygame.font.Font]:
        return _font(28, True), _font(22, True), _font(14, False)

    fonts = reload_fonts()
    submenu = False
    running = True

    while running:
        t_ms = pygame.time.get_ticks()
        mx, my = pygame.mouse.get_pos()
        hover = pick_hover_sub(mx, my) if submenu else pick_hover_main(mx, my)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                if submenu:
                    submenu = False
                else:
                    running = False
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                ex, ey = event.pos
                if submenu:
                    sr = layout_submenu()
                    launched = False
                    for i in range(len(MODES)):
                        if sr[f"mode{i}"].collidepoint(ex, ey):
                            launch_mode(MODES[i][1])
                            launched = True
                            break
                    if launched:
                        screen = pygame.display.set_mode((W, H))
                        pygame.display.set_caption("解压小游戏 · 启动器")
                        fonts = reload_fonts()
                        submenu = False
                    elif sr["back"].collidepoint(ex, ey):
                        submenu = False
                else:
                    hr = main_hit_rects()
                    if hr["modes"].collidepoint(ex, ey):
                        submenu = True
                    elif hr["quit"].collidepoint(ex, ey):
                        running = False

        screen.fill(COL_BG_BOT)
        draw_gradient_bg(screen)
        draw_left_decor(screen, t_ms)
        draw_main_column(screen, fonts, hover if not submenu else None)
        if submenu:
            draw_submenu(screen, fonts, hover)

        pygame.display.flip()
        clock.tick(FPS)

    pygame.quit()


if __name__ == "__main__":
    main()
