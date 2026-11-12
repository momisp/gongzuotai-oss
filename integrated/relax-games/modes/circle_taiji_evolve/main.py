"""

太极进化模式：场内**旋转太极双色底**；少球方在**己方色区**内击杀异色球可**进化**为深色核心球造型，击杀越多**拖拽尾迹**越长。

圆形弹球小游戏：红蓝两色球在圆内弹跳，撞墙产生同色球；

前进方向约 30% 圆心角（108°）为无敌区；仅异色球相撞时可消灭对方（若对方不在无敌区内）。

少球方人数低于多球方二十分之一时，异色消灭判定下少球方球不会被消灭（双灭时仅多球方可灭）；人数比恢复后取消。

某一颜色球全部消失后游戏结束。

全局球速限制在 BALL_SPEED_MIN～BALL_SPEED_MAX（默认比原先更慢）；少球方威胁逃离中可超过上限。

少球方仅在与某敌球距离约「两个球直径」内、且该敌球处于可击中方位（与消灭判定一致）时加速逃离；被威胁时速率为最近威胁敌球速的 1.3 倍，脱离后恢复保存的速度；会扭转前进方向对准逃离方向。

一方刚成为多球方时现有球会乘一次降速系数；失去多数时对「曾降速」的球乘倒数恢复。多球方在球周径向柔光，并照亮圆内背景星点（星点染成己方主色）；少球方显示六边形霓虹框并保留尾迹（已进化个体为深色球体+尾迹，无六边形）；身份变化时对应 UI 与尾迹同步开关。

多球方**连续**保持严格人数优势达到 `MAJORITY_DOMINANCE_YELLOW_SEC`（默认 60 秒）后，从少球方**已进化**球中随机一只变为**黄球**：不计入红蓝人数，追击最近非黄目标，红蓝双方靠近时均会**躲避**；**黄球不会被红蓝消灭**；黄球击杀他人时不受少球超盾与进化免多数杀保护；每局仅转化一次（重置对局后重新计时）。

若**少球方身份**（哪一侧为少数）**连续** `STALE_MINORITY_BLACK_SEC`（默认 300 秒）未变，则在**多球方重心**附近生成**黑球**，规则与黄球一致。黄黑相撞仅弹开并进入**互斥追逐**窗口；双方击杀数均 ≥ `PREDATOR_SYNERGY_KILL_THRESHOLD`（30）时再次相撞，速度各乘 `PREDATOR_SYNERGY_SPEED_MULT`（可突破全局限速）。被黄/黑追击时逃离倍率随时间按 `PREDATOR_FLEE_WEAKEN_PER_SEC` 削弱。



性能：空间网格碰撞 + 无敌区用小表面绘制；球多时自动降低扇形精度。

UI：按 1 / 2 / 3 切换三种视觉主题。

"""



from __future__ import annotations



import math

import random

import sys

from collections import defaultdict

from dataclasses import dataclass, field

from typing import Dict, Iterator, List, Literal, Optional, Tuple, Union



import pygame





def _load_cjk_font(size, bold=False):
    import os
    from pathlib import Path as _P
    import pygame as _pg
    wind = _P(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    files = (
        [wind / "msyhbd.ttc", wind / "msyh.ttc", wind / "simhei.ttf", wind / "arialbd.ttf"]
        if bold
        else [wind / "msyh.ttc", wind / "simhei.ttf", wind / "arial.ttf", wind / "simsun.ttc"]
    )
    for p in files:
        try:
            if p.is_file():
                return _pg.font.Font(str(p), size)
        except Exception:
            pass
    for name in ("microsoftyahei", "微软雅黑", "simhei", "arial"):
        try:
            return _pg.font.SysFont(name, size, bold=bold)
        except Exception:
            pass
    return _pg.font.Font(None, size)


# --- 配置 ---

WIDTH, HEIGHT = 900, 900

FPS = 60

CIRCLE_CENTER = (WIDTH // 2, HEIGHT // 2)

CIRCLE_RADIUS = min(WIDTH, HEIGHT) // 2 - 40

BALL_RADIUS = 14

# 全局速率钳制（整体慢于原先约 220~320 的随机初速）
BALL_SPEED_MIN = 75.0
BALL_SPEED_MAX = 200.0

MAX_BALLS = 80

# 撞墙分裂冷却：同一球再次分裂前需等待的帧数（约 0.75 秒 @60FPS，可自行改大/改小）
SPLIT_COOLDOWN_SEC = 0.75
SPLIT_COOLDOWN_FRAMES = max(1, int(SPLIT_COOLDOWN_SEC * FPS))

# 无敌区：整圆的 30% 圆心角 = 108°，半角 54°

INVULN_FRACTION = 0.3

INVULN_HALF_RAD = math.pi * INVULN_FRACTION

COS_INVULN = math.cos(INVULN_HALF_RAD)

# 少球方威胁逃离：与敌球中心距 ≤ 约两个球直径，且敌球不在我无敌扇形内（视为「要被该敌球撞到」）时触发
FLEE_PROXIMITY_DIST = 4 * BALL_RADIUS
# 被威胁时，速率 = 最近威胁敌球速率 × 该系数；脱离威胁后恢复 saved 速度
FLEE_THREAT_SPEED_VS_ENEMY = 1.3
# 威胁逃离时，每秒将前进方向向「逃离威胁」方向扭转的强度（再乘 dt，且单帧最多扭满）
FLEE_HEADING_TURN_RATE = 12.0
# 一方刚成为「多球方」时，该方所有球速度一次性乘以该系数（<1 略降速）
MAJORITY_BECOMES_SPEED_MULT = 0.88
# 少球方轨迹：最多采样点数；尾端超过约「一球直径」距离则丢弃旧点
TRAIL_MAX_POINTS = 12
TRAIL_MAX_DIST = 2.0 * BALL_RADIUS

# 特效从触发点向外扩散的总时长（毫秒），单球淡入在到达后 FX_WAVE_FADE_MS 内完成
FX_WAVE_DURATION_MS = 1000
FX_WAVE_FADE_MS = 120

# 少球方人数 < 多球方 / 该值 时，异色碰撞中少球方不会被消灭（双灭时仅少球方保留）；人数比恢复后失效
MINORITY_ULTRA_SHIELD_DENOM = 20

# 场内背景星点数量（均匀分布在圆内）；仅多球方光晕范围内按距离提亮并染成队伍色
ARENA_STAR_FIELD_COUNT = 440

# 多球方对背景星点的「照亮」半径（像素，自球心计）
MAJORITY_STARLIGHT_RADIUS = BALL_RADIUS + 26

# 场内背景网格步长（仅多球光晕内可见，浅灰线）
ARENA_GRID_STEP = 30

# 太极背景绕圆心角速度（弧度/秒）
TAIJI_SPIN_RAD_PER_SEC = 0.12

# 进化机体尾迹：基础段数 + 每击杀增加段数
WAKE_TRAIL_BASE = 14
WAKE_TRAIL_PER_KILL = 10

# 多球方连续「严格人数优势」累计达此时长后，从少球方已进化球中随机一只变为追击黄球（秒）
MAJORITY_DOMINANCE_YELLOW_SEC = 60.0

# 黄球追击速率（相对全局上限）
YELLOW_CHASE_SPEED_MULT = 1.22

# 黄球体色（与主题无关，便于识别）
YELLOW_BALL_COLOR = (235, 198, 42)

# 黄球击杀卫星：半径≈主球半径×该系数；轨道半径 = 主球×系数 + 序号×步长
YELLOW_ORBIT_DOT_RADIUS_MULT = 0.1

YELLOW_ORBIT_BASE_R_MULT = 1.38

YELLOW_ORBIT_RING_STEP = 4.2

# 卫星轨道层数上限（每层半径固定，可挂多颗微球）
YELLOW_ORBIT_MAX_LAYERS = 10

# 黄球幻影尾迹最大采样点数
YELLOW_PHANTOM_TRAIL_MAX = 28

# 少球方身份连续不变达此时长后，在多球方重心附近生成黑球（秒）
STALE_MINORITY_BLACK_SEC = 300.0

# 黑球体色
BLACK_BALL_COLOR = (22, 22, 28)

# 黄黑互相短暂不追逐（毫秒）
PREDATOR_MUTUAL_IGNORE_MS = 2000

# 双捕食者各满该击杀数后相撞，速度×该系数（可叠乘突破全局限速）
PREDATOR_SYNERGY_KILL_THRESHOLD = 30

PREDATOR_SYNERGY_SPEED_MULT = 1.1

# 被黄/黑追逐时，逃离倍率随时间线性削弱（每秒减少量，不低于 0）
PREDATOR_FLEE_WEAKEN_PER_SEC = 0.08

# 双捕食者接触后速度叠乘冷却（毫秒），避免叠在同一帧
PREDATOR_CLASH_COOLDOWN_MS = 450



# 空间划分单元（略大于球直径，减少跨格漏检）

def _cell_size() -> int:

    return int(2 * BALL_RADIUS) + 4





def _taiji_norm_deg(a: float) -> float:

    x = a % 360.0

    if x < 0:

        x += 360.0

    return x





def _taiji_in_red_tint_local(lx: float, ly: float, R: float) -> bool:

    """与 taiji.py 一致：matplotlib 坐标 (mx,my)，y 轴向上 ↔ 场内局部 (lx,ly)，ly 为屏向下时 my = -ly。"""

    mx, my = lx, -ly

    if mx * mx + my * my > R * R + 1e-6:

        return False

    hR = R * 0.5

    r_eye = R / 6.0

    # 鱼眼（最上层）

    if math.hypot(mx, my - hR) <= r_eye:

        return False

    if math.hypot(mx, my + hR) <= r_eye:

        return True

    def in_small_wedge(px: float, py: float, ocx: float, ocy: float, rad: float, d0: float, d1: float) -> bool:

        ddx = px - ocx

        ddy = py - ocy

        if ddx * ddx + ddy * ddy > rad * rad + 1e-6:

            return False

        ang = math.degrees(math.atan2(ddy, ddx))

        a0 = _taiji_norm_deg(d0)

        a1 = _taiji_norm_deg(d1)

        a = _taiji_norm_deg(ang)

        if a0 <= a1:

            return a0 - 1e-6 <= a <= a1 + 1e-6

        return a >= a0 - 1e-6 or a <= a1 + 1e-6

    # 下阴楔（黑）盖住：Wedge((0,-r_half), r_half, 90, 270)

    if in_small_wedge(mx, my, 0.0, -hR, hR, 90.0, 270.0):

        return False

    # 上阳楔（白）盖住：Wedge((0,r_half), r_half, -90, 90)

    if in_small_wedge(mx, my, 0.0, hR, hR, -90.0, 90.0):

        return True

    # 左大半圆白、右大半圆黑

    return mx <= 0.0





def taiji_own_color_zone(

    is_red: bool,

    wx: float,

    wy: float,

    cx: float,

    cy: float,

    R: float,

    taiji_angle: float,

) -> bool:

    """球心是否在己方太极色区内（随太极旋转）。"""

    dx = wx - cx

    dy = wy - cy

    ca, sa = math.cos(-taiji_angle), math.sin(-taiji_angle)

    lx = dx * ca - dy * sa

    ly = dx * sa + dy * ca

    if lx * lx + ly * ly > R * R:

        return False

    red_side = _taiji_in_red_tint_local(lx, ly, R)

    return red_side if is_red else not red_side





# 缓存版本号（改画法时递增以失效旧贴图）
_TAIJI_LAYER_CACHE_VER = 6

_taiji_layer_cache: Tuple[int, int, Tuple[int, int, int], Tuple[int, int, int], pygame.Surface] | None = None





def _taiji_wedge_polygon(

    cx: float,

    cy: float,

    radius: float,

    deg_start: float,

    deg_end: float,

    n: int = 56,

) -> List[Tuple[int, int]]:

    """Matplotlib 式角度：从 +x 逆时针；屏坐标 y 向下 → 顶点 y = cy - r*sin(θ)。"""

    pts: List[Tuple[int, int]] = [(int(cx), int(cy))]

    for i in range(n + 1):

        t = math.radians(deg_start + (deg_end - deg_start) * (i / n))

        x = cx + radius * math.cos(t)

        y = cy - radius * math.sin(t)

        pts.append((int(round(x)), int(round(y))))

    return pts





def _get_taiji_rotating_layer(

    R_i: int, theme: Theme

) -> pygame.Surface:

    """几何与 modes/circle_taiji_evolve/taiji.py 中 draw_taichi 一致：左白右黑 + 上下楔 + 鱼眼；白→红、黑→蓝。"""

    global _taiji_layer_cache

    key = (_TAIJI_LAYER_CACHE_VER, R_i, theme.red, theme.blue)

    if (

        _taiji_layer_cache is not None

        and _taiji_layer_cache[0] == key[0]

        and _taiji_layer_cache[1] == key[1]

        and _taiji_layer_cache[2] == key[2]

        and _taiji_layer_cache[3] == key[3]

    ):

        return _taiji_layer_cache[4]

    s = 2 * R_i + 8

    surf = pygame.Surface((s, s), pygame.SRCALPHA)

    c = float(R_i + 4)

    hR = float(R_i // 2)

    Rf = float(R_i)

    eye_r = max(2.0, Rf / 6.0)

    rb, gb, bb = theme.blue[:3]

    rr, rg, rrb = theme.red[:3]

    def rgba(rgb: Tuple[int, int, int], a: int) -> Tuple[int, int, int, int]:

        return (rgb[0], rgb[1], rgb[2], a)

    a_w = 118

    a_b = 118

    a_eye_dark = 200

    a_eye_light = 230

    # 1～2：左大半圆白(红)、右大半圆黑(蓝)

    pygame.draw.polygon(

        surf,

        rgba((rr, rg, rrb), a_w),

        _taiji_wedge_polygon(c, c, Rf, 90.0, 270.0),

    )

    pygame.draw.polygon(

        surf,

        rgba((rb, gb, bb), a_b),

        _taiji_wedge_polygon(c, c, Rf, -90.0, 90.0),

    )

    # 3～4：上白楔、下黑楔（圆心 (0,±R/2) → 屏上 y 为 c∓hR）

    pygame.draw.polygon(

        surf,

        rgba((rr, rg, rrb), a_w),

        _taiji_wedge_polygon(c, c - hR, hR, -90.0, 90.0),

    )

    pygame.draw.polygon(

        surf,

        rgba((rb, gb, bb), a_b),

        _taiji_wedge_polygon(c, c + hR, hR, 90.0, 270.0),

    )

    # 5：上鱼眼阴(蓝)

    pygame.draw.circle(

        surf,

        rgba((rb, gb, bb), a_eye_dark),

        (int(c), int(c - hR)),

        int(round(eye_r)),

    )

    # 6：下鱼眼阳（白芯 + 深色边，同 taiji.py）

    pygame.draw.circle(

        surf,

        (250, 252, 255, a_eye_light),

        (int(c), int(c + hR)),

        int(round(eye_r)),

    )

    pygame.draw.circle(

        surf,

        (22, 28, 40, 255),

        (int(c), int(c + hR)),

        int(round(eye_r)),

        1,

    )

    _taiji_layer_cache = (key[0], key[1], key[2], key[3], surf)

    return surf





def draw_taiji_arena_overlay(

    screen: pygame.Surface,

    theme: Theme,

    R_i: int,

    taiji_angle: float,

) -> None:

    layer = _get_taiji_rotating_layer(R_i, theme)

    deg = -math.degrees(taiji_angle)

    rot = pygame.transform.rotate(layer, deg)

    rect = rot.get_rect(center=CIRCLE_CENTER)

    screen.blit(rot, rect)





def _wake_max_len(b: Ball) -> int:

    if b.minority_kills <= 0:

        return WAKE_TRAIL_BASE

    return WAKE_TRAIL_BASE + b.minority_kills * WAKE_TRAIL_PER_KILL





def update_evolved_wake_trails(

    balls: List[Ball],

    minority_is_red: bool | None,

) -> None:

    for b in balls:

        is_min = minority_is_red is not None and b.is_red == minority_is_red

        if b.evolved and not ball_is_predator(b) and is_min:

            b.wake_trail.append((float(b.x), float(b.y)))

            cap = _wake_max_len(b)

            while len(b.wake_trail) > cap:

                b.wake_trail.pop(0)

        else:

            b.wake_trail.clear()





def draw_evolved_wake(

    screen: pygame.Surface,

    theme: Theme,

    b: Ball,

    r: int,

) -> None:

    if len(b.wake_trail) < 2:

        return

    col = theme.red if b.is_red else theme.blue

    ar = theme.arena

    n = len(b.wake_trail)

    for k in range(n - 1):

        t = k / max(n - 2, 1)

        x1, y1 = b.wake_trail[k]

        x2, y2 = b.wake_trail[k + 1]

        u = 1.0 - t * 0.88

        rr = int(ar[0] * (1 - u) + col[0] * u)

        gg = int(ar[1] * (1 - u) + col[1] * u)

        bb = int(ar[2] * (1 - u) + col[2] * u)

        w = max(2, int(r * (1.0 - 0.55 * t)))

        pygame.draw.line(screen, (rr, gg, bb), (int(x1), int(y1)), (int(x2), int(y2)), w)





def draw_predator_phantom_trail(

    screen: pygame.Surface,

    balls: List[Ball],

    r: int,

    dot_buf: pygame.Surface,

) -> None:

    """黄/黑球移动残留：旧位置半透明叠影（索引 0 最旧）。"""

    ds = dot_buf.get_width() // 2

    for b in balls:

        if not ball_is_predator(b):

            continue

        yr, yg, yb = predator_body_color(b)

        n = len(b.predator_phantom_trail)

        if n < 2:

            continue

        for k in range(n):

            tx, ty = b.predator_phantom_trail[k]

            t = k / max(n - 1, 1)

            alpha = int(14 + 100 * t * t)

            rad = max(2, int(r * (0.2 + 0.55 * t)))

            dot_buf.fill((0, 0, 0, 0))

            pygame.draw.circle(dot_buf, (yr, yg, yb, alpha), (ds, ds), rad)

            screen.blit(dot_buf, (int(tx) - ds, int(ty) - ds))





def _yellow_orbit_radius_for_layer(layer: int) -> float:

    L = max(0, min(YELLOW_ORBIT_MAX_LAYERS - 1, layer))

    return float(BALL_RADIUS) * YELLOW_ORBIT_BASE_R_MULT + L * YELLOW_ORBIT_RING_STEP





def draw_predator_orbit_dots(screen: pygame.Surface, balls: List[Ball], r: int) -> None:

    """捕食者击杀卫星：同色微球绕心公转（在主体之下绘制）。"""

    sr = max(2, int(r * YELLOW_ORBIT_DOT_RADIUS_MULT))

    for b in balls:

        if not ball_is_predator(b):

            continue

        px, py = float(b.x), float(b.y)

        for d in b.predator_orbit_dots:

            orbit_r = _yellow_orbit_radius_for_layer(d.layer)

            ox = px + math.cos(d.angle) * orbit_r

            oy = py + math.sin(d.angle) * orbit_r

            ix, iy = int(ox), int(oy)

            cr, cg, cb = d.color

            glow = (

                min(255, cr + 40),

                min(255, cg + 35),

                min(255, cb + 30),

            )

            pygame.draw.circle(screen, glow, (ix, iy), sr + 1)

            pygame.draw.circle(screen, (cr, cg, cb), (ix, iy), sr)





def draw_evolved_craft(

    screen: pygame.Surface,

    b: Ball,

    theme: Theme,

    r: int,

) -> None:

    """进化体：深色外环 + 饱和核心 + 速度向高光（无三角翼）。"""

    mx, my = b.vel_norm()

    px, py = float(b.x), float(b.y)

    core_col = theme.red if b.is_red else theme.blue

    core_dark = tuple(max(18, int(c * 0.52)) for c in core_col)

    acc = tuple(min(255, int(c * 1.12) + 8) for c in core_dark)

    rr = int(r * 1.05)

    pygame.draw.circle(screen, (58, 62, 72), (int(px), int(py)), rr + 3)

    pygame.draw.circle(screen, (42, 46, 56), (int(px), int(py)), rr + 3, 2)

    pygame.draw.circle(screen, core_dark, (int(px), int(py)), rr)

    pygame.draw.circle(screen, acc, (int(px + mx * r * 0.25), int(py + my * r * 0.25)), max(2, r // 4))





@dataclass(frozen=True)

class Theme:

    key: str

    label: str

    bg: Tuple[int, int, int]

    arena: Tuple[int, int, int]

    ring: Tuple[int, int, int]

    ring_width: int

    ring_glow: Tuple[int, int, int] | None

    red: Tuple[int, int, int]

    blue: Tuple[int, int, int]

    ball_border: Tuple[int, int, int]

    wedge: Tuple[int, int, int, int]

    hint: Tuple[int, int, int]

    end_overlay: Tuple[int, int, int, int]

    end_title: Tuple[int, int, int]

    end_sub: Tuple[int, int, int]

    ball_shine: bool





THEMES: List[Theme] = [

    Theme(

        key="neon",

        label="深空霓虹",

        bg=(14, 16, 32),

        arena=(22, 26, 52),

        ring=(120, 230, 255),

        ring_width=3,

        ring_glow=(90, 60, 160),

        red=(255, 85, 110),

        blue=(85, 170, 255),

        ball_border=(240, 248, 255),

        wedge=(170, 235, 255, 70),

        hint=(165, 185, 215),

        end_overlay=(8, 10, 24, 200),

        end_title=(255, 245, 230),

        end_sub=(200, 210, 235),

        ball_shine=True,

    ),

    Theme(

        key="paper",

        label="暖沙纸张",

        bg=(232, 224, 212),

        arena=(252, 248, 240),

        ring=(120, 98, 78),

        ring_width=3,

        ring_glow=None,

        red=(205, 72, 72),

        blue=(68, 108, 198),

        ball_border=(60, 52, 44),

        wedge=(110, 100, 88, 45),

        hint=(75, 68, 58),

        end_overlay=(40, 36, 32, 170),

        end_title=(55, 48, 40),

        end_sub=(90, 82, 72),

        ball_shine=False,

    ),

    Theme(

        key="arcade",

        label="街机矩阵",

        bg=(10, 12, 14),

        arena=(18, 22, 26),

        ring=(55, 255, 140),

        ring_width=2,

        ring_glow=(20, 80, 45),

        red=(255, 55, 90),

        blue=(45, 210, 255),

        ball_border=(230, 255, 240),

        wedge=(55, 255, 140, 55),

        hint=(170, 210, 175),

        end_overlay=(0, 12, 6, 185),

        end_title=(180, 255, 200),

        end_sub=(140, 200, 150),

        ball_shine=True,

    ),

]





@dataclass

class FxWave:

    """特效扩散波：从 (ox,oy) 起按距离在 FX_WAVE_DURATION_MS 内扫到 d_max，再淡入/淡出。"""

    start_ms: int

    ox: float

    oy: float

    d_max: float

    appearing: bool

    category: str

    team_is_red: bool





@dataclass

class YellowOrbitDot:

    """黄球卫星：同色微球绕黄球心公转；layer∈[0, YELLOW_ORBIT_MAX_LAYERS) 为轨道层。"""

    angle: float

    layer: int

    color: Tuple[int, int, int]

    omega: float





@dataclass

class Ball:

    x: float

    y: float

    vx: float

    vy: float

    color: Tuple[int, int, int]

    is_red: bool

    # 追击黄球：不计入红蓝人数；可消灭任意非黄球；由多球优势计时转化而来
    is_yellow: bool = False

    # 黑球：与黄球同规则，由「少球身份长期不变」在多数方聚集处生成
    is_black: bool = False

    # 捕食者累计消灭数（红蓝球），用于双捕食者相撞加速条件
    predator_kill_count: int = 0

    # 与其它捕食者互斥追逐截止时刻（pygame.get_ticks）
    predator_mutual_ignore_until_ms: int = 0

    # 双捕食者接触叠速冷却（get_ticks）
    predator_clash_cooldown_ms: int = 0

    # 被任意捕食者追击时累计时间，用于削弱逃离速度
    predator_flee_press_sec: float = 0.0

    # 非逃离状态下的速度快照；脱离威胁时恢复
    saved_vx: float = 0.0

    saved_vy: float = 0.0

    # 上一帧是否在威胁逃离中（用于刚脱离威胁时恢复 saved 速度）
    threat_flee_active: bool = False

    # 逃离黄球（与少球逃离独立恢复）
    yellow_flee_active: bool = False

    yellow_saved_vx: float = 0.0

    yellow_saved_vy: float = 0.0

    # 少球方尾迹：[最新位置, ..., 最旧]
    trail: List[Tuple[float, float]] = field(default_factory=list)

    # 是否仍带「成为多球方时」的一次性降速（用于失去多数时只恢复这类球）
    has_majority_speed_penalty: bool = False

    # 太极模式：少球方在己方色区击杀累计；进化机体与尾迹长度
    evolved: bool = False

    minority_kills: int = 0

    wake_trail: List[Tuple[float, float]] = field(default_factory=list)

    predator_orbit_dots: List[YellowOrbitDot] = field(default_factory=list)

    predator_phantom_trail: List[Tuple[float, float]] = field(default_factory=list)



    def pos(self) -> Tuple[float, float]:

        return self.x, self.y



    def speed(self) -> float:

        return math.hypot(self.vx, self.vy)



    def vel_norm(self) -> Tuple[float, float]:

        s = self.speed()

        if s < 1e-6:

            return 1.0, 0.0

        return self.vx / s, self.vy / s





def ball_is_predator(b: Ball) -> bool:

    return b.is_yellow or b.is_black





def predator_body_color(b: Ball) -> Tuple[int, int, int]:

    return BLACK_BALL_COLOR if b.is_black else YELLOW_BALL_COLOR





def _hud_count_team_balls(balls: List[Ball], team_is_red: bool) -> int:

    return sum(1 for b in balls if b.is_red == team_is_red)





def _hud_count_team_evolved(balls: List[Ball], team_is_red: bool) -> int:

    return sum(

        1

        for b in balls

        if b.is_red == team_is_red and b.evolved and not ball_is_predator(b)

    )





def _hud_status_label_for_team(

    team_is_red: bool,

    curr_min: bool | None,

) -> str:

    if curr_min is None:

        return "平局"

    is_minor = (curr_min is True and team_is_red) or (

        curr_min is False and not team_is_red

    )

    return "少球方" if is_minor else "多球方"





def pick_hero_ball_for_follow(balls: List[Ball], team_is_red: bool) -> Ball | None:

    """己方焦点：优先进化体 → 捕食者(击杀多) → minority_kills 高。"""

    team = [b for b in balls if b.is_red == team_is_red]

    if not team:

        return None

    normals = [b for b in team if not ball_is_predator(b)]

    preds = [b for b in team if ball_is_predator(b)]

    ev = [b for b in normals if b.evolved]

    if ev:

        return max(ev, key=lambda b: (b.minority_kills, b.predator_kill_count))

    if preds:

        return max(preds, key=lambda b: b.predator_kill_count)

    if normals:

        return max(normals, key=lambda b: (b.minority_kills, int(b.evolved)))

    return team[0]





FollowTarget = Union[bool, Literal["top"], None]





def pick_top_kill_ball(balls: List[Ball]) -> Ball | None:

    """全场「击杀」最高：先比捕食击杀数，再比少球方进化击杀数。"""

    if not balls:

        return None

    return max(

        balls,

        key=lambda b: (b.predator_kill_count, b.minority_kills),

    )





def resolve_follow_ball(balls: List[Ball], follow_target: FollowTarget) -> Ball | None:

    if follow_target is None:

        return None

    if follow_target == "top":

        return pick_top_kill_ball(balls)

    return pick_hero_ball_for_follow(balls, follow_target)





def draw_match_hud_panels(

    screen: pygame.Surface,

    font_title: pygame.font.Font,

    font_cell: pygame.font.Font,

    theme: Theme,

    balls: List[Ball],

    n_red: int,

    n_blue: int,

    curr_min: bool | None,

    match_kills_red: int,

    match_kills_blue: int,

) -> None:

    """左上蓝方、右上红方：各两格（状态 / 关键）；焦点键说明在左上方面板下方。"""

    pw, h1, h2, gap = 212, 44, 50, 4

    margin = 10

    br, bg, bb = theme.hint

    panel_fill = (18, 20, 28, 235)

    border_c = (min(255, br + 40), min(255, bg + 40), min(255, bb + 40))

    def draw_corner_panel(

        x: int,

        y: int,

        team_is_red: bool,

    ) -> None:

        surf = pygame.Surface((pw, h1 + h2 + gap + 8), pygame.SRCALPHA)

        surf.fill((0, 0, 0, 0))

        pygame.draw.rect(surf, panel_fill, (0, 0, pw, h1 + h2 + gap + 8), border_radius=8)

        pygame.draw.rect(surf, border_c, (0, 0, pw, h1 + h2 + gap + 8), 2, border_radius=8)

        n_team = n_red if team_is_red else n_blue

        role = _hud_status_label_for_team(team_is_red, curr_min)

        lab = "红方" if team_is_red else "蓝方"

        tcol = theme.red if team_is_red else theme.blue

        head = font_title.render(lab, True, tcol)

        surf.blit(head, (8, 6))

        line1 = font_cell.render(f"{role} · 场上 {n_team} 球", True, (240, 242, 248))

        surf.blit(line1, (8, 8 + head.get_height()))

        ev = _hud_count_team_evolved(balls, team_is_red)

        mk = match_kills_red if team_is_red else match_kills_blue

        line2 = font_cell.render(f"进化 {ev} · 本场吞噬 {mk}", True, (210, 212, 220))

        y2 = h1 + gap + 4

        pygame.draw.line(surf, (*border_c[:3], 160), (6, y2 - 2), (pw - 6, y2 - 2), 1)

        surf.blit(line2, (8, y2 + 4))

        screen.blit(surf, (x, y))

    stack_h = h1 + h2 + gap + 8

    draw_corner_panel(margin, margin, False)

    draw_corner_panel(WIDTH - pw - margin, margin, True)

    leg = pygame.Surface((300, 94), pygame.SRCALPHA)

    leg.fill((0, 0, 0, 0))

    pygame.draw.rect(leg, panel_fill, (0, 0, 300, 94), border_radius=8)

    pygame.draw.rect(leg, border_c, (0, 0, 300, 94), 2, border_radius=8)

    t1 = font_cell.render("[ 尾随蓝方焦点球", True, theme.blue)

    t2 = font_cell.render("] 尾随红方焦点球", True, theme.red)

    t3 = font_cell.render("\\ 取消尾随视角", True, (200, 200, 208))

    t4 = font_cell.render("0 尾随全场击杀最高球", True, (255, 220, 140))

    leg.blit(t1, (8, 8))

    leg.blit(t2, (8, 28))

    leg.blit(t3, (8, 48))

    leg.blit(t4, (8, 68))

    screen.blit(leg, (margin, margin + stack_h + 6))





def draw_follow_camera_marker(

    screen: pygame.Surface,

    b: Ball,

    ball_r: int,

    font: pygame.font.Font,

    time_ms: int,

) -> None:

    """尾随锁定时，在场内该球上方绘制摄像机 + REC 拍摄标记（闪烁红点）。"""

    bx, by = int(b.x), int(b.y)

    body_w, body_h = 32, 22

    top_y = by - ball_r - body_h - 14

    if top_y < 6:

        top_y = by + ball_r + 10

    x0 = bx - body_w // 2

    pygame.draw.rect(screen, (48, 50, 60), (x0, top_y, body_w, body_h), border_radius=4)

    pygame.draw.rect(screen, (200, 206, 222), (x0, top_y, body_w, body_h), 2, border_radius=4)

    lens_cx = x0 + body_w // 2 - 5

    lens_cy = top_y + body_h // 2

    pygame.draw.circle(screen, (20, 22, 30), (lens_cx, lens_cy), 7)

    pygame.draw.circle(screen, (110, 175, 255), (lens_cx, lens_cy), 4)

    vf_h = max(3, body_h - 8)

    pygame.draw.rect(

        screen,

        (24, 26, 34),

        (x0 + body_w - 9, top_y + 4, 6, vf_h),

        border_radius=1,

    )

    rec_on = (time_ms // 420) % 2 == 0

    dot_col: Tuple[int, int, int] = (255, 50, 70) if rec_on else (120, 55, 62)

    rec_x = x0 + body_w + 8

    rec_y = top_y + body_h // 2

    pygame.draw.circle(screen, dot_col, (rec_x, rec_y), 5)

    lbl = font.render("REC", True, dot_col)

    screen.blit(lbl, (rec_x + 8, top_y + 3))





def draw_follow_pip(

    screen: pygame.Surface,

    scene_canvas: pygame.Surface,

    theme: Theme,

    follow: Ball | None,

    font_hint: pygame.font.Font,

    zoom: float = 2.35,

) -> None:

    """右下画中画：从完整场景画布裁切缩放，保持太极/星场/光晕/尾迹等与场内一致。"""

    pip_w, pip_h = 216, 216

    margin = 10

    gap_above_hint = 34

    x0 = WIDTH - pip_w - margin

    y0 = HEIGHT - pip_h - margin - gap_above_hint

    surf = pygame.Surface((pip_w, pip_h), pygame.SRCALPHA)

    surf.fill((0, 0, 0, 0))

    pygame.draw.rect(surf, (12, 14, 20, 250), (0, 0, pip_w, pip_h), border_radius=10)

    pygame.draw.rect(surf, (80, 85, 95), (0, 0, pip_w, pip_h), 2, border_radius=10)

    title = font_hint.render("尾随视角", True, (220, 222, 230))

    surf.blit(title, (pip_w // 2 - title.get_width() // 2, 6))

    inner_top = 28

    inner_h = pip_h - inner_top - 8

    ix0, iy0 = 6, inner_top

    inner_w = pip_w - 12

    inner = pygame.Surface((inner_w, inner_h))

    if follow is None:

        inner.fill(theme.bg)

        msg = font_hint.render("未锁定", True, (150, 152, 160))

        inner.blit(msg, (inner.get_width() // 2 - msg.get_width() // 2, inner_h // 2 - 8))

    else:

        sw = max(1, min(WIDTH, int(inner_w / zoom)))

        sh = max(1, min(HEIGHT, int(inner_h / zoom)))

        cx_i, cy_i = int(follow.x), int(follow.y)

        sx = max(0, min(WIDTH - sw, cx_i - sw // 2))

        sy = max(0, min(HEIGHT - sh, cy_i - sh // 2))

        src = pygame.Rect(sx, sy, sw, sh)

        try:

            chunk = scene_canvas.subsurface(src)

            scaled = pygame.transform.smoothscale(chunk, (inner_w, inner_h))

            inner.blit(scaled, (0, 0))

        except ValueError:

            inner.fill(theme.bg)

        fx = inner_w // 2

        fy = inner_h // 2

        pygame.draw.circle(inner, (255, 255, 255), (fx, fy), max(4, int(BALL_RADIUS * zoom * 0.35) + 4), 2)

    surf.blit(inner, (ix0, iy0))

    screen.blit(surf, (x0, y0))





def _predator_yellow_black_kills(balls: List[Ball]) -> Tuple[int, int]:

    yk, bk = 0, 0

    for b in balls:

        if b.is_yellow:

            yk = b.predator_kill_count

        if b.is_black:

            bk = b.predator_kill_count

    return yk, bk





def draw_predator_timers_panels(

    screen: pygame.Surface,

    font_title: pygame.font.Font,

    font_cell: pygame.font.Font,

    theme: Theme,

    time_ms: int,

    n_red: int,

    n_blue: int,

    curr_min: bool | None,

    majority_dominance_sec: float,

    minority_identity_stable_sec: float,

    yellow_released: bool,

    black_released: bool,

    yellow_spawn_ms: int | None,

    black_spawn_ms: int | None,

    balls: List[Ball],

) -> None:

    """左下角双窗：黄球 / 黑球 出场倒计时或已登场时长、捕食击杀数。"""

    y_kills, b_kills = _predator_yellow_black_kills(balls)

    pw, ph = 216, 52

    margin_x = 10

    hint_reserve = 36

    gap = 6

    br, bg, bb = theme.hint

    panel_fill = (18, 20, 28, 235)

    border_c = (min(255, br + 40), min(255, bg + 40), min(255, bb + 40))

    y_black = HEIGHT - hint_reserve - ph

    y_yellow = y_black - gap - ph

    def blit_panel(

        y: int,

        title: str,

        title_col: Tuple[int, int, int],

        line1: str,

        line1_col: Tuple[int, int, int],

        line2: str,

    ) -> None:

        surf = pygame.Surface((pw, ph), pygame.SRCALPHA)

        surf.fill((0, 0, 0, 0))

        pygame.draw.rect(surf, panel_fill, (0, 0, pw, ph), border_radius=8)

        pygame.draw.rect(surf, border_c, (0, 0, pw, ph), 2, border_radius=8)

        surf.blit(font_title.render(title, True, title_col), (8, 4))

        surf.blit(font_cell.render(line1, True, line1_col), (8, 22))

        surf.blit(font_cell.render(line2, True, (210, 212, 220)), (8, 36))

        screen.blit(surf, (margin_x, y))

    if yellow_released and yellow_spawn_ms is not None:

        elapsed_y = max(0.0, (time_ms - yellow_spawn_ms) / 1000.0)

        y_line1 = f"已登场 · {elapsed_y:.1f}s"

        y_c1 = (255, 235, 160)

    else:

        if n_red == n_blue:

            y_line1 = "未登场 · 平局（优势计时长清零）"

            y_c1 = (170, 175, 190)

        else:

            rem_y = max(0.0, MAJORITY_DOMINANCE_YELLOW_SEC - majority_dominance_sec)

            y_line1 = f"倒计时 · {rem_y:.1f}s"

            y_c1 = (255, 220, 140)

    y_line2 = f"击杀 {y_kills}"

    if black_released and black_spawn_ms is not None:

        elapsed_b = max(0.0, (time_ms - black_spawn_ms) / 1000.0)

        b_line1 = f"已登场 · {elapsed_b:.1f}s"

        b_c1 = (210, 215, 235)

    else:

        if curr_min is None:

            b_line1 = "未登场 · 尚无少球方身份"

            b_c1 = (150, 155, 170)

        else:

            rem_b = max(0.0, STALE_MINORITY_BLACK_SEC - minority_identity_stable_sec)

            b_line1 = f"倒计时 · {rem_b:.1f}s"

            b_c1 = (190, 200, 230)

    b_line2 = f"击杀 {b_kills}"

    blit_panel(y_yellow, "黄球", (255, 220, 90), y_line1, y_c1, y_line2)

    blit_panel(y_black, "黑球", (160, 168, 190), b_line1, b_c1, b_line2)





def dist_sq(ax: float, ay: float, bx: float, by: float) -> float:

    dx, dy = ax - bx, ay - by

    return dx * dx + dy * dy





def clamp_ball_speed(b: Ball) -> None:

    """将速率限制在 [BALL_SPEED_MIN, BALL_SPEED_MAX]（调用方跳过 threat_flee_active）。"""

    s = math.hypot(b.vx, b.vy)

    if s < 1e-12:

        return

    if s < BALL_SPEED_MIN:

        k = BALL_SPEED_MIN / s

        b.vx *= k

        b.vy *= k

    elif s > BALL_SPEED_MAX:

        k = BALL_SPEED_MAX / s

        b.vx *= k

        b.vy *= k





def _centroid_team(balls: List[Ball], team_is_red: bool) -> Tuple[float, float]:

    sx, sy, n = 0.0, 0.0, 0

    for b in balls:

        if b.is_red == team_is_red:

            sx += b.x

            sy += b.y

            n += 1

    if n == 0:

        return float(CIRCLE_CENTER[0]), float(CIRCLE_CENTER[1])

    return sx / n, sy / n





def _max_dist_team(

    balls: List[Ball], ox: float, oy: float, team_is_red: bool

) -> float:

    m = 1.0

    for b in balls:

        if b.is_red != team_is_red:

            continue

        d = math.hypot(b.x - ox, b.y - oy)

        if d > m:

            m = d

    return max(m, 40.0)





def fx_wave_multiplier(time_ms: int, wave: FxWave, bx: float, by: float) -> float:

    d_max = max(wave.d_max, 1.0)

    d = math.hypot(bx - wave.ox, by - wave.oy)

    delay = (d / d_max) * float(FX_WAVE_DURATION_MS)

    t_arrive = wave.start_ms + delay

    if time_ms < t_arrive:

        return 0.0 if wave.appearing else 1.0

    u = (time_ms - t_arrive) / float(FX_WAVE_FADE_MS)

    u = min(1.0, max(0.0, u))

    return u if wave.appearing else (1.0 - u)





def fx_wave_is_expired(time_ms: int, wave: Optional[FxWave]) -> bool:

    if wave is None:

        return True

    return time_ms > wave.start_ms + FX_WAVE_DURATION_MS + FX_WAVE_FADE_MS + 100





def _minority_fadeout_team(

    fx_minor_waves: List[FxWave], time_ms: int

) -> Optional[bool]:

    for w in fx_minor_waves:

        if (

            w.category == "minority"

            and not w.appearing

            and not fx_wave_is_expired(time_ms, w)

        ):

            return w.team_is_red

    return None





def _minority_visual_mult(

    time_ms: int, fx_minor_waves: List[FxWave], b: Ball

) -> float:

    m = 1.0

    for w in fx_minor_waves:

        if w.category != "minority" or w.team_is_red != b.is_red:

            continue

        m *= fx_wave_multiplier(time_ms, w, b.x, b.y)

    return m





def _majority_visual_mult(

    time_ms: int, fx_major_waves: List[FxWave], b: Ball

) -> float:

    m = 1.0

    for w in fx_major_waves:

        if w.category != "majority" or w.team_is_red != b.is_red:

            continue

        m *= fx_wave_multiplier(time_ms, w, b.x, b.y)

    return m





def _fx_wave_origin(

    removed_xy: List[Tuple[float, float]],

    balls: List[Ball],

    fallback_team_is_red: bool,

) -> Tuple[float, float]:

    """有消灭时用被消灭球重心，否则用 fallback 队伍重心。"""

    if removed_xy:

        sx = sum(p[0] for p in removed_xy)

        sy = sum(p[1] for p in removed_xy)

        n = len(removed_xy)

        return sx / n, sy / n

    return _centroid_team(balls, fallback_team_is_red)





def _minority_from_counts(n_red: int, n_blue: int) -> bool | None:

    if n_red < n_blue:

        return True

    if n_blue < n_red:

        return False

    return None





def _majority_from_counts(n_red: int, n_blue: int) -> bool | None:

    if n_red > n_blue:

        return True

    if n_blue > n_red:

        return False

    return None





def _append_minority_fx_waves(

    fx_minor_waves: List[FxWave],

    prev_m: bool | None,

    curr_m: bool | None,

    balls: List[Ball],

    removed_xy: List[Tuple[float, float]],

    start_ms: int,

) -> None:

    if prev_m == curr_m:

        return

    if prev_m is not None:

        ox, oy = _fx_wave_origin(removed_xy, balls, prev_m)

        d_max = _max_dist_team(balls, ox, oy, prev_m)

        fx_minor_waves.append(

            FxWave(start_ms, ox, oy, d_max, False, "minority", prev_m)

        )

    if curr_m is not None:

        ox, oy = _fx_wave_origin(removed_xy, balls, curr_m)

        d_max = _max_dist_team(balls, ox, oy, curr_m)

        fx_minor_waves.append(

            FxWave(start_ms, ox, oy, d_max, True, "minority", curr_m)

        )





def _append_majority_fx_waves(

    fx_major_waves: List[FxWave],

    prev_maj: bool | None,

    curr_maj: bool | None,

    balls: List[Ball],

    removed_xy: List[Tuple[float, float]],

    start_ms: int,

) -> None:

    if prev_maj == curr_maj:

        return

    if prev_maj is not None:

        ox, oy = _fx_wave_origin(removed_xy, balls, prev_maj)

        d_max = _max_dist_team(balls, ox, oy, prev_maj)

        fx_major_waves.append(

            FxWave(start_ms, ox, oy, d_max, False, "majority", prev_maj)

        )

    if curr_maj is not None:

        ox, oy = _fx_wave_origin(removed_xy, balls, curr_maj)

        d_max = _max_dist_team(balls, ox, oy, curr_maj)

        fx_major_waves.append(

            FxWave(start_ms, ox, oy, d_max, True, "majority", curr_maj)

        )





_ARENA_STARFIELD: Optional[List[Tuple[float, float, float]]] = None





def _arena_star_field() -> List[Tuple[float, float, float]]:

    global _ARENA_STARFIELD

    if _ARENA_STARFIELD is not None:

        return _ARENA_STARFIELD

    cx = float(CIRCLE_CENTER[0])

    cy = float(CIRCLE_CENTER[1])

    margin = 8.0

    R = float(CIRCLE_RADIUS) - margin

    rng = random.Random(7781)

    target = ARENA_STAR_FIELD_COUNT

    lst: List[Tuple[float, float, float]] = []

    while len(lst) < target:

        ang = rng.random() * 2 * math.pi

        rad = R * math.sqrt(rng.random())

        sx = cx + rad * math.cos(ang)

        sy = cy + rad * math.sin(ang)

        lst.append((sx, sy, rng.random()))

    _ARENA_STARFIELD = lst

    return _ARENA_STARFIELD





def _majority_light_emitters(

    balls: List[Ball],

    minority_is_red: bool | None,

    time_ms: int,

    fx_major_waves: List[FxWave],

) -> List[Tuple[Ball, float]]:

    out: List[Tuple[Ball, float]] = []

    for b in balls:

        is_major = (

            not ball_is_predator(b)

            and minority_is_red is not None

            and (

                (minority_is_red is True and not b.is_red)

                or (minority_is_red is False and b.is_red)

            )

        )

        fade_maj = False

        for w in fx_major_waves:

            if (

                w.category == "majority"

                and not w.appearing

                and not fx_wave_is_expired(time_ms, w)

                and not ball_is_predator(b)

                and b.is_red == w.team_is_red

            ):

                fade_maj = True

                break

        if not is_major and not fade_maj:

            continue

        mm = _majority_visual_mult(time_ms, fx_major_waves, b)

        if mm < 0.02:

            continue

        out.append((b, mm))

    return out





def _arena_majority_light_sample(

    px: float,

    py: float,

    emitters: List[Tuple[Ball, float]],

    theme: Theme,

    light_r: float,

) -> Tuple[float, Optional[Tuple[float, float, float]]]:

    """多球方光在 (px,py) 的加权强度 sw 与加权颜色；无光源时 sw=0。"""

    if not emitters:

        return 0.0, None

    sr = sg = sb = 0.0

    sw = 0.0

    for b, mm in emitters:

        d = math.hypot(px - b.x, py - b.y)

        if d >= light_r:

            continue

        u = (1.0 - d / light_r) ** 2 * mm

        c = theme.red if b.is_red else theme.blue

        sr += u * c[0]

        sg += u * c[1]

        sb += u * c[2]

        sw += u

    if sw < 1e-9:

        return 0.0, None

    return sw, (sr / sw, sg / sw, sb / sw)





def _merge_1d_intervals(intervals: List[Tuple[float, float]]) -> List[Tuple[float, float]]:

    if not intervals:

        return []

    intervals.sort()

    out: List[Tuple[float, float]] = [intervals[0]]

    for a, b in intervals[1:]:

        la, lb = out[-1]

        if a <= lb + 1e-4:

            out[-1] = (la, max(lb, b))

        else:

            out.append((a, b))

    return out





def _grid_lit_segments_vertical(

    gx: float,

    y0: float,

    y1: float,

    emitters: List[Tuple[Ball, float]],

    light_r: float,

) -> List[Tuple[float, float]]:

    """竖线 x=gx 上，落入任一多球光源圆内的 y 区间（已合并）。"""

    lr2 = light_r * light_r

    raw: List[Tuple[float, float]] = []

    for b, _mm in emitters:

        dx = gx - b.x

        if dx * dx >= lr2 - 1e-6:

            continue

        half = math.sqrt(max(0.0, lr2 - dx * dx))

        ya, yb = b.y - half, b.y + half

        ia, ib = max(y0, ya), min(y1, yb)

        if ia < ib - 1e-5:

            raw.append((ia, ib))

    return _merge_1d_intervals(raw)





def _grid_lit_segments_horizontal(

    gy: float,

    x0: float,

    x1: float,

    emitters: List[Tuple[Ball, float]],

    light_r: float,

) -> List[Tuple[float, float]]:

    """横线 y=gy 上，落入光源圆内的 x 区间。"""

    lr2 = light_r * light_r

    raw: List[Tuple[float, float]] = []

    for b, _mm in emitters:

        dy = gy - b.y

        if dy * dy >= lr2 - 1e-6:

            continue

        half = math.sqrt(max(0.0, lr2 - dy * dy))

        xa, xb = b.x - half, b.x + half

        ia, ib = max(x0, xa), min(x1, xb)

        if ia < ib - 1e-5:

            raw.append((ia, ib))

    return _merge_1d_intervals(raw)





def evolved_minority_immune_to_majority_kill(

    victim: Ball,

    killer: Ball,

    n_red: int,

    n_blue: int,

) -> bool:

    """进化且仍为少球方时，免疫多球方消灭；平局或非少球方时失效。"""

    if not victim.evolved:

        return False

    mi = _minority_from_counts(n_red, n_blue)

    if mi is None:

        return False

    if victim.is_red != (mi is True):

        return False

    ma = _majority_from_counts(n_red, n_blue)

    if ma is None:

        return False

    if killer.is_red != (ma is True):

        return False

    return victim.is_red != killer.is_red





def draw_arena_grid(

    screen: pygame.Surface,

    theme: Theme,

    balls: List[Ball],

    minority_is_red: bool | None,

    time_ms: int,

    fx_major_waves: List[FxWave],

) -> None:

    """场内方格网：仅多球方光晕内可见，浅灰线（参考图一）。"""

    emitters = _majority_light_emitters(balls, minority_is_red, time_ms, fx_major_waves)

    if not emitters:

        return

    cx, cy = float(CIRCLE_CENTER[0]), float(CIRCLE_CENTER[1])

    ar, ag, ab = theme.arena

    Rf = float(CIRCLE_RADIUS) - 4.0

    light_r = float(MAJORITY_STARLIGHT_RADIUS)

    step = float(ARENA_GRID_STEP)

    g_hi = (210, 214, 228)

    k0 = int(-Rf // step) - 2

    k1 = int(Rf // step) + 2

    for k in range(k0, k1 + 1):

        gx = cx + k * step

        adx = abs(gx - cx)

        if adx > Rf:

            continue

        half_h = math.sqrt(max(0.0, Rf * Rf - adx * adx))

        y0, y1 = cy - half_h, cy + half_h

        for ya, yb in _grid_lit_segments_vertical(gx, y0, y1, emitters, light_r):

            py_mid = 0.5 * (ya + yb)

            sw, tint = _arena_majority_light_sample(gx, py_mid, emitters, theme, light_r)

            if sw < 0.012 or tint is None:

                continue

            t = min(1.0, sw * 1.05)

            lr, lg, lb = tint

            cr = int(ar + (lr * 0.35 + g_hi[0] * 0.65 - ar) * t)

            cg = int(ag + (lg * 0.35 + g_hi[1] * 0.65 - ag) * t)

            cb = int(ab + (lb * 0.35 + g_hi[2] * 0.65 - ab) * t)

            pygame.draw.line(screen, (cr, cg, cb), (int(gx), int(ya)), (int(gx), int(yb)), 1)

    for k in range(k0, k1 + 1):

        gy = cy + k * step

        ady = abs(gy - cy)

        if ady > Rf:

            continue

        half_w = math.sqrt(max(0.0, Rf * Rf - ady * ady))

        x0, x1 = cx - half_w, cx + half_w

        for xa, xb in _grid_lit_segments_horizontal(gy, x0, x1, emitters, light_r):

            px_mid = 0.5 * (xa + xb)

            sw, tint = _arena_majority_light_sample(px_mid, gy, emitters, theme, light_r)

            if sw < 0.012 or tint is None:

                continue

            t = min(1.0, sw * 1.05)

            lr, lg, lb = tint

            cr = int(ar + (lr * 0.35 + g_hi[0] * 0.65 - ar) * t)

            cg = int(ag + (lg * 0.35 + g_hi[1] * 0.65 - ag) * t)

            cb = int(ab + (lb * 0.35 + g_hi[2] * 0.65 - ab) * t)

            pygame.draw.line(screen, (cr, cg, cb), (int(xa), int(gy)), (int(xb), int(gy)), 1)





def draw_arena_starfield(

    screen: pygame.Surface,

    theme: Theme,

    balls: List[Ball],

    minority_is_red: bool | None,

    time_ms: int,

    fx_major_waves: List[FxWave],

) -> None:

    """圆内星场：仅多球方光晕内提亮；带光晕层与少量十字星芒。"""

    emitters = _majority_light_emitters(balls, minority_is_red, time_ms, fx_major_waves)

    cx, cy = float(CIRCLE_CENTER[0]), float(CIRCLE_CENTER[1])

    ar, ag, ab = theme.arena

    r_lim_sq = (float(CIRCLE_RADIUS) - 4.0) ** 2

    light_r = float(MAJORITY_STARLIGHT_RADIUS)

    for sx, sy, seed in _arena_star_field():

        dx, dy = sx - cx, sy - cy

        if dx * dx + dy * dy > r_lim_sq:

            continue

        sw, tint = _arena_majority_light_sample(sx, sy, emitters, theme, light_r)

        tw = 0.88 + 0.12 * math.sin(time_ms * 0.0033 + seed * 6.28318)

        if sw > 0.008 and tint is not None:

            lr, lg, lb = tint

            bright = min(1.0, (0.2 + sw * 1.22) * tw)

            ix, iy = int(sx), int(sy)

            for rad, kdim in ((5, 0.14), (4, 0.22), (3, 0.38), (2, 0.58), (1, 0.82)):

                cr = int(ar + (lr - ar) * bright * kdim)

                cg = int(ag + (lg - ag) * bright * kdim)

                cb = int(ab + (lb - ab) * bright * kdim)

                pygame.draw.circle(screen, (cr, cg, cb), (ix, iy), rad)

            cr = int(min(255, lr * 0.5 + 140 * bright))

            cg = int(min(255, lg * 0.5 + 140 * bright))

            cb = int(min(255, lb * 0.5 + 150 * bright))

            pygame.draw.circle(screen, (cr, cg, cb), (ix, iy), 1)

            flare_h = ((seed * 127.1 + sy * 0.01) % 1.0) > 0.86

            if flare_h and bright > 0.42:

                L = int(5 + 8 * bright)

                fa = int(70 + 100 * bright)

                fc = (

                    min(255, int(lr * 0.4 + 200)),

                    min(255, int(lg * 0.4 + 200)),

                    min(255, int(lb * 0.4 + 220)),

                )

                pygame.draw.line(screen, fc, (ix - L, iy), (ix + L, iy), 1)

                pygame.draw.line(screen, fc, (ix, iy - L), (ix, iy + L), 1)

                if bright > 0.62:

                    pygame.draw.line(

                        screen,

                        (min(255, fc[0] + 15), min(255, fc[1] + 15), 255),

                        (ix - L // 2, iy - L // 2),

                        (ix + L // 2, iy + L // 2),

                        1,

                    )

                    pygame.draw.line(

                        screen,

                        (min(255, fc[0] + 15), min(255, fc[1] + 15), 255),

                        (ix - L // 2, iy + L // 2),

                        (ix + L // 2, iy - L // 2),

                        1,

                    )





def reflect_circle(b: Ball, cx: float, cy: float, R: float, r: float) -> None:

    dx, dy = b.x - cx, b.y - cy

    d = math.hypot(dx, dy)

    if d < 1e-6:

        return

    if d + r > R:

        nx, ny = dx / d, dy / d

        b.x = cx + nx * (R - r - 0.5)

        b.y = cy + ny * (R - r - 0.5)

        vn = b.vx * nx + b.vy * ny

        if vn > 0:

            b.vx -= 2 * vn * nx

            b.vy -= 2 * vn * ny





def spawn_same_color(parent: Ball, cx: float, cy: float, R: float, r: float) -> Ball:

    dx, dy = parent.x - cx, parent.y - cy

    d = math.hypot(dx, dy) or 1.0

    nx, ny = dx / d, dy / d

    px, py = -ny, nx

    jitter = random.uniform(-120, 120) * math.pi / 180

    c, s = math.cos(jitter), math.sin(jitter)

    rx = nx * c - ny * s

    ry = nx * s + ny * c

    speed = max(BALL_SPEED_MIN * 1.05, min(BALL_SPEED_MAX, parent.speed() * 0.85))

    vx, vy = rx * speed, ry * speed

    ox = px * (r * 2.2) * random.choice([-1, 1])

    oy = py * (r * 2.2) * random.choice([-1, 1])

    x, y = parent.x + ox, parent.y + oy

    nb = Ball(

        x,

        y,

        vx,

        vy,

        parent.color,

        parent.is_red,

        saved_vx=vx,

        saved_vy=vy,

        threat_flee_active=False,

    )

    reflect_circle(nb, cx, cy, R, r)

    return nb





def other_in_my_front(me: Ball, other: Ball) -> bool:

    ox, oy = other.x - me.x, other.y - me.y

    ol = math.hypot(ox, oy)

    if ol < 1e-6:

        return True

    ox, oy = ox / ol, oy / ol

    mx, my = me.vel_norm()

    return ox * mx + oy * my >= COS_INVULN





def resolve_collision(a: Ball, b: Ball, r: float) -> None:

    dx, dy = b.x - a.x, b.y - a.y

    d = math.hypot(dx, dy) or 1e-6

    nx, ny = dx / d, dy / d

    overlap = 2 * r - d

    if overlap > 0:

        push = overlap * 0.51

        a.x -= nx * push

        a.y -= ny * push

        b.x += nx * push

        b.y += ny * push

    rvx, rvy = b.vx - a.vx, b.vy - a.vy

    rel_n = rvx * nx + rvy * ny

    if rel_n > 0:

        return

    j = -rel_n

    a.vx -= j * nx

    a.vy -= j * ny

    b.vx += j * nx

    b.vy += j * ny





def iter_ball_pairs(balls: List[Ball], cell: int) -> Iterator[Tuple[int, int]]:

    """空间网格：同格内两两 + 与四个相邻格组合，避免 O(n²) 全量扫描。"""

    grid: Dict[Tuple[int, int], List[int]] = defaultdict(list)

    for idx, b in enumerate(balls):

        gx = int(b.x // cell)

        gy = int(b.y // cell)

        grid[(gx, gy)].append(idx)



    seen: set[Tuple[int, int]] = set()

    for (gx, gy), id_list in grid.items():

        m = len(id_list)

        for a in range(m):

            ia = id_list[a]

            for bb in range(a + 1, m):

                ib = id_list[bb]

                if ia > ib:

                    ia, ib = ib, ia

                if (ia, ib) not in seen:

                    seen.add((ia, ib))

                    yield ia, ib

        for dx, dy in ((1, 0), (1, 1), (0, 1), (-1, 1)):

            ng = (gx + dx, gy + dy)

            if ng not in grid:

                continue

            for ia in id_list:

                for ib in grid[ng]:

                    if ia >= ib:

                        continue

                    if (ia, ib) not in seen:

                        seen.add((ia, ib))

                        yield ia, ib





def count_by_color(balls: List[Ball]) -> Tuple[int, int]:

    reds = sum(1 for b in balls if b.is_red and not ball_is_predator(b))

    blues = sum(1 for b in balls if (not b.is_red) and not ball_is_predator(b))

    return reds, blues





def _balls_hostile(a: Ball, b: Ball) -> bool:

    """异色可互灭；捕食者与任意非捕食者敌对；两捕食者只弹开不互灭。"""

    pa, pb = ball_is_predator(a), ball_is_predator(b)

    if pa and pb:

        return False

    if pa or pb:

        return True

    return a.is_red != b.is_red





def _collision_kill_blocked_by_shields(

    victim: Ball,

    killer: Ball,

    n_red: int,

    n_blue: int,

) -> bool:

    """捕食者击杀无视少球超盾与进化免多数杀。"""

    if ball_is_predator(killer):

        return False

    if minority_ultra_shield_active(n_red, n_blue, victim):

        return True

    if evolved_minority_immune_to_majority_kill(victim, killer, n_red, n_blue):

        return True

    return False





def _victim_can_be_eliminated(victim: Ball) -> bool:

    """捕食者作为受害者时永不因异色碰撞退场。"""

    return not ball_is_predator(victim)





def _predator_register_orbit_dot(killer: Ball, victim: Ball) -> None:

    """黄/黑球每消灭一球，增加一颗同色卫星；挂到当前卫星数最少的一层。"""

    if not ball_is_predator(killer):

        return

    cr, cg, cb = victim.color[0], victim.color[1], victim.color[2]

    counts = [0] * YELLOW_ORBIT_MAX_LAYERS

    for d in killer.predator_orbit_dots:

        if 0 <= d.layer < YELLOW_ORBIT_MAX_LAYERS:

            counts[d.layer] += 1

    best_layer = 0

    best_c = counts[0]

    for L in range(1, YELLOW_ORBIT_MAX_LAYERS):

        if counts[L] < best_c:

            best_c = counts[L]

            best_layer = L

    ang = random.uniform(0.0, 2.0 * math.pi)

    omega = random.uniform(2.0, 3.4) * random.choice((-1.0, 1.0))

    killer.predator_orbit_dots.append(

        YellowOrbitDot(angle=ang, layer=best_layer, color=(cr, cg, cb), omega=omega)

    )

    killer.predator_kill_count += 1





def _predator_pair_contact(a: Ball, b: Ball, now_ms: int) -> None:

    """两捕食者接触：互斥追逐一段时间；若击杀均达标则叠乘速度。"""

    if not ball_is_predator(a) or not ball_is_predator(b):

        return

    if a.predator_clash_cooldown_ms > now_ms or b.predator_clash_cooldown_ms > now_ms:

        return

    until = now_ms + PREDATOR_MUTUAL_IGNORE_MS

    a.predator_mutual_ignore_until_ms = max(a.predator_mutual_ignore_until_ms, until)

    b.predator_mutual_ignore_until_ms = max(b.predator_mutual_ignore_until_ms, until)

    cd = now_ms + PREDATOR_CLASH_COOLDOWN_MS

    a.predator_clash_cooldown_ms = cd

    b.predator_clash_cooldown_ms = cd

    if (

        a.predator_kill_count >= PREDATOR_SYNERGY_KILL_THRESHOLD

        and b.predator_kill_count >= PREDATOR_SYNERGY_KILL_THRESHOLD

    ):

        for p in (a, b):

            sp = p.speed()

            if sp < 1e-9:

                continue

            f = PREDATOR_SYNERGY_SPEED_MULT

            p.vx *= f

            p.vy *= f





def update_predator_orbit_dots(balls: List[Ball], dt: float) -> None:

    for b in balls:

        if not ball_is_predator(b):

            continue

        for d in b.predator_orbit_dots:

            d.angle = (d.angle + d.omega * dt) % (2.0 * math.pi)





def update_predator_phantom_trails(balls: List[Ball]) -> None:

    min_d2 = (float(BALL_RADIUS) * 0.34) ** 2

    for b in balls:

        if not ball_is_predator(b):

            b.predator_phantom_trail.clear()

            continue

        lp = b.predator_phantom_trail

        if not lp or dist_sq(b.x, b.y, lp[-1][0], lp[-1][1]) > min_d2:

            lp.append((float(b.x), float(b.y)))

        cap = YELLOW_PHANTOM_TRAIL_MAX

        while len(lp) > cap:

            lp.pop(0)





def minority_ultra_shield_active(n_red: int, n_blue: int, ball: Ball) -> bool:

    """少球方人数严格低于多球方 1/MINORITY_ULTRA_SHIELD_DENOM 时，该方球本帧内免疫异色消灭。"""

    if ball_is_predator(ball):

        return False

    d = MINORITY_ULTRA_SHIELD_DENOM

    if n_red < n_blue:

        if not ball.is_red:

            return False

        return n_red * d < n_blue

    if n_blue < n_red:

        if ball.is_red:

            return False

        return n_blue * d < n_red

    return False





def majority_side_key(n_red: int, n_blue: int) -> str | None:

    if n_red > n_blue:

        return "red"

    if n_blue > n_red:

        return "blue"

    return None





def apply_majority_becomes_slowdown(

    balls: List[Ball],

    n_red: int,

    n_blue: int,

    prev: str | None,

) -> str | None:

    """多球方：上位时清少球状态并降速；失去多数时恢复速度（撤销降速系数）。"""

    cur = majority_side_key(n_red, n_blue)

    m = MAJORITY_BECOMES_SPEED_MULT

    inv = 1.0 / m

    if prev is not None and prev != cur:

        for b in balls:

            was_prev_major = (

                not ball_is_predator(b)

                and (

                    (prev == "red" and b.is_red)

                    or (prev == "blue" and not b.is_red)

                )

            )

            if was_prev_major and b.has_majority_speed_penalty:

                b.vx *= inv

                b.vy *= inv

                b.has_majority_speed_penalty = False

    if cur is not None and cur != prev:

        for b in balls:

            is_new_major = (

                not ball_is_predator(b)

                and (

                    (cur == "red" and b.is_red)

                    or (cur == "blue" and not b.is_red)

                )

            )

            if not is_new_major:

                continue

            if b.threat_flee_active:

                b.vx, b.vy = b.saved_vx, b.saved_vy

                b.threat_flee_active = False

            if b.yellow_flee_active:

                b.yellow_flee_active = False

            b.trail.clear()

            b.saved_vx, b.saved_vy = b.vx, b.vy

            b.vx *= m

            b.vy *= m

            b.has_majority_speed_penalty = True

    return cur





def apply_minority_flee(balls: List[Ball], dt: float) -> None:

    """少球方：被威胁时速率为最近威胁敌球速×FLEE_THREAT_SPEED_VS_ENEMY，脱离后恢复 saved 速度。"""

    # 非逃离中的球：每帧用当前速度刷新快照（含上一帧碰撞结果）；逃离中则冻结快照
    for b in balls:

        if not b.threat_flee_active:

            b.saved_vx, b.saved_vy = b.vx, b.vy

    n_red, n_blue = count_by_color(balls)

    prox_sq = FLEE_PROXIMITY_DIST * FLEE_PROXIMITY_DIST

    if n_red == n_blue:

        for b in balls:

            if b.threat_flee_active:

                b.vx, b.vy = b.saved_vx, b.saved_vy

                b.threat_flee_active = False

        return

    if n_red < n_blue:

        minority_is_red = True

    else:

        minority_is_red = False

    for b in balls:

        if ball_is_predator(b):

            continue

        if b.is_red != minority_is_red:

            if b.threat_flee_active:

                b.vx, b.vy = b.saved_vx, b.saved_vy

                b.threat_flee_active = False

            continue

        ax, ay = 0.0, 0.0

        threatened = False

        best_d2 = float("inf")

        threat_speed = 0.0

        for e in balls:

            if not ball_is_predator(e) and e.is_red == b.is_red:

                continue

            if dist_sq(b.x, b.y, e.x, e.y) > prox_sq:

                continue

            # 敌球在我无敌扇形内 → 不构成「要被撞到」的威胁（捕食者威胁始终算数）
            if not ball_is_predator(e) and other_in_my_front(b, e):

                continue

            threatened = True

            d2 = dist_sq(b.x, b.y, e.x, e.y)

            if d2 < best_d2:

                best_d2 = d2

                threat_speed = e.speed()

            dx = b.x - e.x

            dy = b.y - e.y

            d = math.hypot(dx, dy)

            if d < 1e-8:

                continue

            ax += dx / d

            ay += dy / d

        if not threatened:

            if b.threat_flee_active:

                b.vx, b.vy = b.saved_vx, b.saved_vy

                b.threat_flee_active = False

            continue

        al = math.hypot(ax, ay)

        if al < 1e-8:

            if b.threat_flee_active:

                b.vx, b.vy = b.saved_vx, b.saved_vy

                b.threat_flee_active = False

            continue

        ux, uy = ax / al, ay / al

        b.threat_flee_active = True

        bx, by = b.saved_vx, b.saved_vy

        target_sp = max(threat_speed * FLEE_THREAT_SPEED_VS_ENEMY, BALL_SPEED_MIN)

        s0 = math.hypot(bx, by)

        if s0 < 1e-6:

            mx, my = ux, uy

        else:

            mx, my = bx / s0, by / s0

        w = min(1.0, FLEE_HEADING_TURN_RATE * dt)

        fx = mx * (1.0 - w) + ux * w

        fy = my * (1.0 - w) + uy * w

        fl = math.hypot(fx, fy)

        if fl < 1e-8:

            fx, fy = ux, uy

        else:

            fx /= fl

            fy /= fl

        b.vx = fx * target_sp

        b.vy = fy * target_sp





def apply_flee_from_predators(balls: List[Ball], dt: float) -> None:

    """非捕食者：黄/黑在近距离内时逃离；被追越久逃离倍率越低。"""

    prox_sq = FLEE_PROXIMITY_DIST * FLEE_PROXIMITY_DIST

    for b in balls:

        if ball_is_predator(b):

            continue

        pred_near = False

        ax, ay = 0.0, 0.0

        best_d2 = float("inf")

        threat_sp = BALL_SPEED_MIN

        for pb in balls:

            if not ball_is_predator(pb):

                continue

            if dist_sq(b.x, b.y, pb.x, pb.y) > prox_sq:

                continue

            pred_near = True

            d2 = dist_sq(b.x, b.y, pb.x, pb.y)

            if d2 < best_d2:

                best_d2 = d2

                threat_sp = max(threat_sp, pb.speed() * FLEE_THREAT_SPEED_VS_ENEMY)

            dx, dy = b.x - pb.x, b.y - pb.y

            d = math.hypot(dx, dy) or 1e-8

            ax += dx / d

            ay += dy / d

        if not pred_near:

            b.predator_flee_press_sec = 0.0

            if b.yellow_flee_active:

                b.yellow_flee_active = False

                if not b.threat_flee_active:

                    b.vx, b.vy = b.yellow_saved_vx, b.yellow_saved_vy

            continue

        b.predator_flee_press_sec += dt

        weaken = max(

            0.0,

            1.0 - PREDATOR_FLEE_WEAKEN_PER_SEC * b.predator_flee_press_sec,

        )

        if not b.yellow_flee_active:

            b.yellow_saved_vx, b.yellow_saved_vy = b.vx, b.vy

        b.yellow_flee_active = True

        al = math.hypot(ax, ay)

        if al < 1e-8:

            continue

        ux, uy = ax / al, ay / al

        bx, by = b.vx, b.vy

        target_sp = max(threat_sp * weaken, BALL_SPEED_MIN)

        s0 = math.hypot(bx, by)

        if s0 < 1e-6:

            mx, my = ux, uy

        else:

            mx, my = bx / s0, by / s0

        w = min(1.0, FLEE_HEADING_TURN_RATE * dt)

        fx = mx * (1.0 - w) + ux * w

        fy = my * (1.0 - w) + uy * w

        fl = math.hypot(fx, fy)

        if fl < 1e-8:

            fx, fy = ux, uy

        else:

            fx /= fl

            fy /= fl

        b.vx = fx * target_sp

        b.vy = fy * target_sp





def apply_predator_chase(balls: List[Ball], dt: float) -> None:

    """黄/黑球：转向最近可追目标；互斥期内不追另一捕食者。"""

    now_ms = pygame.time.get_ticks()

    for yb in balls:

        if not ball_is_predator(yb):

            continue

        best: Ball | None = None

        best_d2 = float("inf")

        for o in balls:

            if o is yb:

                continue

            if ball_is_predator(o):

                if now_ms < yb.predator_mutual_ignore_until_ms:

                    continue

            d2 = dist_sq(yb.x, yb.y, o.x, o.y)

            if d2 < best_d2:

                best_d2 = d2

                best = o

        if best is None:

            continue

        dx, dy = best.x - yb.x, best.y - yb.y

        d = math.hypot(dx, dy) or 1e-8

        ux, uy = dx / d, dy / d

        bx, by = yb.vx, yb.vy

        s0 = math.hypot(bx, by)

        if s0 < 1e-6:

            mx, my = ux, uy

        else:

            mx, my = bx / s0, by / s0

        w = min(1.0, FLEE_HEADING_TURN_RATE * dt * 1.15)

        fx = mx * (1.0 - w) + ux * w

        fy = my * (1.0 - w) + uy * w

        fl = math.hypot(fx, fy)

        if fl < 1e-8:

            fx, fy = ux, uy

        else:

            fx /= fl

            fy /= fl

        target_sp = max(BALL_SPEED_MAX * YELLOW_CHASE_SPEED_MULT, BALL_SPEED_MIN)

        yb.vx = fx * target_sp

        yb.vy = fy * target_sp





def update_minority_trails(

    balls: List[Ball],

    minority_is_red: bool | None,

    r: float,

    fx_minor_waves: List[FxWave],

    time_ms: int,

) -> None:

    """少球方记录尾迹；淡出波期间原少球方仍续记尾迹直至波结束。"""

    fade_team = _minority_fadeout_team(fx_minor_waves, time_ms)

    if minority_is_red is None:

        if fade_team is not None:

            for b in balls:

                if ball_is_predator(b):

                    b.trail.clear()

                    continue

                if b.is_red != fade_team:

                    b.trail.clear()

                    continue

                if b.evolved:

                    b.trail.clear()

                    continue

                b.trail.insert(0, (float(b.x), float(b.y)))

                while len(b.trail) > TRAIL_MAX_POINTS:

                    b.trail.pop()

                while len(b.trail) > 1:

                    ox, oy = b.trail[-1]

                    if math.hypot(b.x - ox, b.y - oy) > TRAIL_MAX_DIST:

                        b.trail.pop()

                    else:

                        break

            return

        for b in balls:

            b.trail.clear()

        return

    for b in balls:

        if ball_is_predator(b):

            b.trail.clear()

            continue

        if b.is_red != minority_is_red:

            b.trail.clear()

            continue

        if b.evolved:

            b.trail.clear()

            continue

        b.trail.insert(0, (float(b.x), float(b.y)))

        while len(b.trail) > TRAIL_MAX_POINTS:

            b.trail.pop()

        while len(b.trail) > 1:

            ox, oy = b.trail[-1]

            if math.hypot(b.x - ox, b.y - oy) > TRAIL_MAX_DIST:

                b.trail.pop()

            else:

                break





def spawn_black_predator_near_majority(

    balls: List[Ball],

    cx: float,

    cy: float,

    R: float,

    r: float,

    maj_is_red: bool,

) -> Ball:

    """在多球方重心附近生成黑球（与黄球同规则）。"""

    gx, gy = _centroid_team(balls, maj_is_red)

    x, y = gx, gy

    for _ in range(14):

        jx = random.uniform(-32.0, 32.0)

        jy = random.uniform(-32.0, 32.0)

        tx, ty = gx + jx, gy + jy

        if math.hypot(tx - cx, ty - cy) + r < R - 4.0:

            x, y = tx, ty

            break

    lo = min(BALL_SPEED_MIN + 40.0, BALL_SPEED_MAX - 20.0)

    hi = BALL_SPEED_MAX - 6.0

    sp = random.uniform(lo, max(lo + 6.0, hi))

    va = random.uniform(0, 2 * math.pi)

    vx, vy = math.cos(va) * sp, math.sin(va) * sp

    nb = Ball(

        x,

        y,

        vx,

        vy,

        BLACK_BALL_COLOR,

        maj_is_red,

        is_black=True,

        saved_vx=vx,

        saved_vy=vy,

        threat_flee_active=False,

    )

    reflect_circle(nb, cx, cy, R, r)

    return nb





def initial_balls(cx: float, cy: float, R: float, r: float) -> List[Ball]:

    balls: List[Ball] = []

    for is_red in (True, False):

        ang = random.uniform(0, 2 * math.pi)

        rad = random.uniform(0, R - r - 60)

        x = cx + math.cos(ang) * rad

        y = cy + math.sin(ang) * rad

        lo = min(BALL_SPEED_MIN + 35.0, BALL_SPEED_MAX - 25.0)

        hi = BALL_SPEED_MAX - 8.0

        sp = random.uniform(lo, max(lo + 5.0, hi))

        va = random.uniform(0, 2 * math.pi)

        vx, vy = math.cos(va) * sp, math.sin(va) * sp

        col = THEMES[0].red if is_red else THEMES[0].blue

        balls.append(

            Ball(

                x,

                y,

                vx,

                vy,

                col,

                is_red,

                saved_vx=vx,

                saved_vy=vy,

                threat_flee_active=False,

            )

        )

    return balls





def sync_ball_colors(balls: List[Ball], theme: Theme) -> None:

    for b in balls:

        if b.is_yellow:

            b.color = YELLOW_BALL_COLOR

        elif b.is_black:

            b.color = BLACK_BALL_COLOR

        else:

            b.color = theme.red if b.is_red else theme.blue





def draw_wedge_on_surface(

    surf: pygame.Surface,

    cx: int,

    cy: int,

    base: float,

    half_rad: float,

    reach: int,

    rgba: Tuple[int, int, int, int],

    steps: int,

) -> None:

    surf.fill((0, 0, 0, 0))

    p1 = base - half_rad

    p2 = base + half_rad

    pts: List[Tuple[int, int]] = [(cx, cy)]

    for k in range(steps + 1):

        t = p1 + (p2 - p1) * (k / steps)

        pts.append((int(cx + math.cos(t) * reach), int(cy + math.sin(t) * reach)))

    pygame.draw.polygon(surf, rgba, pts)





def draw_wedge_arrow(

    surf: pygame.Surface,

    cx: int,

    cy: int,

    mx: float,

    my: float,

    reach: int,

    rgba: Tuple[int, int, int, int],

) -> None:

    """球极多时用箭头线代替扇形，成本更低。"""

    surf.fill((0, 0, 0, 0))

    ex = int(cx + mx * reach)

    ey = int(cy + my * reach)

    pygame.draw.line(surf, rgba, (cx, cy), (ex, ey), 2)

    left = math.atan2(my, mx) + math.pi * 0.85

    right = math.atan2(my, mx) - math.pi * 0.85

    ar = max(5, reach // 3)

    pygame.draw.line(

        surf,

        rgba,

        (ex, ey),

        (int(ex + math.cos(left) * ar), int(ey + math.sin(left) * ar)),

        2,

    )

    pygame.draw.line(

        surf,

        rgba,

        (ex, ey),

        (int(ex + math.cos(right) * ar), int(ey + math.sin(right) * ar)),

        2,

    )





def draw_minority_trails(

    screen: pygame.Surface,

    balls: List[Ball],

    theme: Theme,

    minority_is_red: bool | None,

    r: int,

    dot_buf: pygame.Surface,

    fx_minor_waves: List[FxWave],

    time_ms: int,

) -> None:

    fade_team = _minority_fadeout_team(fx_minor_waves, time_ms)

    ds = dot_buf.get_width() // 2

    for b in balls:

        show = (

            not ball_is_predator(b)

            and (

                (minority_is_red is not None and b.is_red == minority_is_red)

                or (fade_team is not None and b.is_red == fade_team)

            )

        )

        if not show or len(b.trail) < 2:

            continue

        if b.evolved:

            continue

        vm = _minority_visual_mult(time_ms, fx_minor_waves, b)

        if vm < 0.02:

            continue

        col_base = theme.red if b.is_red else theme.blue

        n = len(b.trail)

        for k in range(n - 1, 0, -1):

            tx, ty = b.trail[k]

            t = k / max(n - 1, 1)

            alpha = int((28 + 110 * (1.0 - t)) * vm)

            if alpha < 4:

                continue

            rad = max(2, int(r * (0.52 - 0.32 * t)))

            dot_buf.fill((0, 0, 0, 0))

            rgba = (col_base[0], col_base[1], col_base[2], alpha)

            pygame.draw.circle(dot_buf, rgba, (ds, ds), rad)

            screen.blit(dot_buf, (int(tx) - ds, int(ty) - ds))





def draw_majority_star_glow(

    screen: pygame.Surface,

    balls: List[Ball],

    theme: Theme,

    minority_is_red: bool | None,

    r: int,

    star_buf: pygame.Surface,

    time_ms: int,

    fx_major_waves: List[FxWave],

) -> None:

    """多球方：球周径向柔光（背景星场由 draw_arena_starfield 单独绘制）。"""

    hc = star_buf.get_width() // 2

    for b, mm in _majority_light_emitters(balls, minority_is_red, time_ms, fx_major_waves):

        col = theme.red if b.is_red else theme.blue

        star_buf.fill((0, 0, 0, 0))

        for rad, a in ((r + 20, 28), (r + 14, 48), (r + 8, 35)):

            aa = int(a * mm)

            if aa > 2:

                pygame.draw.circle(star_buf, (col[0], col[1], col[2], aa), (hc, hc), rad)

        screen.blit(star_buf, (int(b.x) - hc, int(b.y) - hc))





def draw_minority_hex_frames(

    screen: pygame.Surface,

    balls: List[Ball],

    theme: Theme,

    minority_is_red: bool | None,

    r: int,

    hex_buf: pygame.Surface,

    fx_minor_waves: List[FxWave],

    time_ms: int,

) -> None:

    """少球方：霓虹六边形框（参考图二），球心对齐。"""

    fade_team = _minority_fadeout_team(fx_minor_waves, time_ms)

    R_hex = r + 8

    hw = hex_buf.get_width() // 2

    for b in balls:

        show = (

            not ball_is_predator(b)

            and (

                (minority_is_red is not None and b.is_red == minority_is_red)

                or (fade_team is not None and b.is_red == fade_team)

            )

        )

        if not show:

            continue

        if b.evolved:

            continue

        vm = _minority_visual_mult(time_ms, fx_minor_waves, b)

        if vm < 0.02:

            continue

        mx, my = b.vel_norm()

        rot = math.atan2(my, mx) + math.pi / 6

        hex_buf.fill((0, 0, 0, 0))

        pts = []

        for k in range(6):

            ang = rot + k * math.pi / 3

            pts.append(

                (

                    int(hw + R_hex * math.cos(ang)),

                    int(hw + R_hex * math.sin(ang)),

                )

            )

        cr, cg, cb = theme.red if b.is_red else theme.blue

        br = min(255, cr + 55)

        bg = min(255, cg + 45)

        bb = min(255, cb + 55)

        pygame.draw.polygon(hex_buf, (cr, cg, cb, int(55 * vm)), pts, 12)

        pygame.draw.polygon(hex_buf, (br, bg, bb, int(200 * vm)), pts, 5)

        pygame.draw.polygon(hex_buf, (255, 255, 255, int(255 * vm)), pts, 2)

        screen.blit(hex_buf, (int(b.x) - hw, int(b.y) - hw))





def draw_scene(

    screen: pygame.Surface,

    balls: List[Ball],

    theme: Theme,

    R: int,

    r: int,

    wedge_buf: pygame.Surface,

    wedge_side: int,

    minority_is_red: bool | None,

    star_buf: pygame.Surface,

    dot_buf: pygame.Surface,

    hex_buf: pygame.Surface,

    time_ms: int,

    fx_major_waves: List[FxWave],

    fx_minor_waves: List[FxWave],

    taiji_angle: float,

) -> None:

    screen.fill(theme.bg)

    pygame.draw.circle(screen, theme.arena, CIRCLE_CENTER, R)

    draw_taiji_arena_overlay(screen, theme, R, taiji_angle)

    draw_arena_grid(

        screen,

        theme,

        balls,

        minority_is_red,

        time_ms,

        fx_major_waves,

    )

    draw_arena_starfield(

        screen,

        theme,

        balls,

        minority_is_red,

        time_ms,

        fx_major_waves,

    )

    if theme.ring_glow:

        pygame.draw.circle(screen, theme.ring_glow, CIRCLE_CENTER, R + 2, 8)

    pygame.draw.circle(screen, theme.ring, CIRCLE_CENTER, R, theme.ring_width)



    draw_majority_star_glow(

        screen,

        balls,

        theme,

        minority_is_red,

        r,

        star_buf,

        time_ms,

        fx_major_waves,

    )

    draw_minority_trails(

        screen,

        balls,

        theme,

        minority_is_red,

        r,

        dot_buf,

        fx_minor_waves,

        time_ms,

    )

    for b in balls:

        if (

            b.evolved

            and not ball_is_predator(b)

            and minority_is_red is not None

            and b.is_red == minority_is_red

        ):

            draw_evolved_wake(screen, theme, b, r)



    draw_predator_phantom_trail(screen, balls, r, dot_buf)



    n = len(balls)

    if n > 52:

        wedge_mode = "arrow"

        steps = 0

    elif n > 36:

        wedge_mode = "fan"

        steps = 5

    elif n > 24:

        wedge_mode = "fan"

        steps = 7

    else:

        wedge_mode = "fan"

        steps = 10



    reach = r + 6

    lc = wedge_side // 2

    for b in balls:

        mx, my = b.vel_norm()

        base = math.atan2(my, mx)

        bx_i, by_i = int(b.x), int(b.y)

        if wedge_mode == "fan":

            draw_wedge_on_surface(wedge_buf, lc, lc, base, INVULN_HALF_RAD, reach, theme.wedge, steps)

        else:

            draw_wedge_arrow(wedge_buf, lc, lc, mx, my, reach + 4, theme.wedge)

        screen.blit(wedge_buf, (bx_i - lc, by_i - lc))



    draw_predator_orbit_dots(screen, balls, r)



    for b in balls:

        bx_i, by_i = int(b.x), int(b.y)

        if b.is_black:

            col = BLACK_BALL_COLOR

        elif b.is_yellow:

            col = YELLOW_BALL_COLOR

        else:

            col = theme.red if b.is_red else theme.blue

        show_craft = (

            b.evolved

            and not ball_is_predator(b)

            and minority_is_red is not None

            and b.is_red == minority_is_red

        )

        if show_craft:

            draw_evolved_craft(screen, b, theme, r)

        else:

            pygame.draw.circle(screen, col, (bx_i, by_i), r)

            if theme.ball_shine and not ball_is_predator(b):

                mx, my = b.vel_norm()

                hx = int(bx_i + mx * (r * 0.35))

                hy = int(by_i + my * (r * 0.35))

                shine = tuple(min(255, c + 55) for c in col)

                pygame.draw.circle(screen, shine, (hx, hy), max(3, r // 3))

            elif ball_is_predator(b):

                mx, my = b.vel_norm()

                hx = int(bx_i + mx * (r * 0.32))

                hy = int(by_i + my * (r * 0.32))

                if b.is_black:

                    shine = (70, 70, 82)

                else:

                    shine = (255, 250, 200)

                pygame.draw.circle(screen, shine, (hx, hy), max(3, r // 3))

            pygame.draw.circle(screen, theme.ball_border, (bx_i, by_i), r, 1)



    draw_minority_hex_frames(

        screen,

        balls,

        theme,

        minority_is_red,

        r,

        hex_buf,

        fx_minor_waves,

        time_ms,

    )





def main() -> None:

    pygame.init()

    screen = pygame.display.set_mode((WIDTH, HEIGHT))

    # 避免部分环境下输入法抢占按键，导致 K_r 收不到
    try:
        pygame.key.stop_text_input()
    except (AttributeError, pygame.error):
        pass

    pygame.display.set_caption("太极进化 · 圆内弹球 — 1/2/3 切换主题")

    clock = pygame.time.Clock()

    font = _load_cjk_font(17, bold=False)

    font_big = _load_cjk_font(34, bold=True)

    font_hud_title = _load_cjk_font(18, bold=True)

    font_hud_cell = _load_cjk_font(15, bold=False)



    cx, cy = float(CIRCLE_CENTER[0]), float(CIRCLE_CENTER[1])

    R, r = float(CIRCLE_RADIUS), float(BALL_RADIUS)

    Ri, ri = int(R), int(r)

    cell = _cell_size()



    balls = initial_balls(cx, cy, R, r)

    theme_idx = 0

    theme = THEMES[theme_idx]

    sync_ball_colors(balls, theme)



    wedge_reach = int(BALL_RADIUS + 8)

    wedge_side = 2 * wedge_reach + 6

    wedge_buf = pygame.Surface((wedge_side, wedge_side), pygame.SRCALPHA)

    _star_sz = 2 * (BALL_RADIUS + 24)

    star_buf = pygame.Surface((_star_sz, _star_sz), pygame.SRCALPHA)

    _dot_sz = 2 * (BALL_RADIUS + 8)

    dot_buf = pygame.Surface((_dot_sz, _dot_sz), pygame.SRCALPHA)

    _hex_sz = 2 * (BALL_RADIUS + 22)

    hex_buf = pygame.Surface((_hex_sz, _hex_sz), pygame.SRCALPHA)

    scene_canvas = pygame.Surface((WIDTH, HEIGHT))



    wall_hit_cooldown: dict[int, int] = {}

    game_over = False

    end_message = ""

    prev_majority_key: str | None = None

    fx_minor_waves: List[FxWave] = []

    fx_major_waves: List[FxWave] = []

    _n0, _n1 = count_by_color(balls)

    fx_prev_minority: bool | None = _minority_from_counts(_n0, _n1)

    fx_prev_majority: bool | None = _majority_from_counts(_n0, _n1)

    taiji_angle = 0.0

    majority_dominance_sec = 0.0

    yellow_released = False

    minority_identity_stable_sec = 0.0

    prev_min_identity_for_black: bool | None = _minority_from_counts(_n0, _n1)

    black_released = False

    match_kills_red = 0

    match_kills_blue = 0

    follow_target: FollowTarget = None

    yellow_spawn_ms: int | None = None

    black_spawn_ms: int | None = None



    def reset_match() -> None:
        nonlocal balls, game_over, end_message, prev_majority_key
        nonlocal fx_minor_waves, fx_major_waves, fx_prev_minority, fx_prev_majority
        nonlocal taiji_angle, majority_dominance_sec, yellow_released
        nonlocal minority_identity_stable_sec, prev_min_identity_for_black, black_released
        nonlocal match_kills_red, match_kills_blue, follow_target
        nonlocal yellow_spawn_ms, black_spawn_ms
        balls = initial_balls(cx, cy, R, r)
        sync_ball_colors(balls, theme)
        wall_hit_cooldown.clear()
        game_over = False
        end_message = ""
        prev_majority_key = None
        fx_minor_waves.clear()
        fx_major_waves.clear()
        nr, nb = count_by_color(balls)
        fx_prev_minority = _minority_from_counts(nr, nb)
        fx_prev_majority = _majority_from_counts(nr, nb)
        taiji_angle = 0.0
        majority_dominance_sec = 0.0
        yellow_released = False
        minority_identity_stable_sec = 0.0
        prev_min_identity_for_black = _minority_from_counts(nr, nb)
        black_released = False
        match_kills_red = 0
        match_kills_blue = 0
        follow_target = None
        yellow_spawn_ms = None
        black_spawn_ms = None



    running = True

    while running:

        dt = clock.tick(FPS) / 1000.0

        time_ms_loop = pygame.time.get_ticks()

        fx_minor_waves[:] = [

            w for w in fx_minor_waves if not fx_wave_is_expired(time_ms_loop, w)

        ]

        fx_major_waves[:] = [

            w for w in fx_major_waves if not fx_wave_is_expired(time_ms_loop, w)

        ]

        for event in pygame.event.get():

            if event.type == pygame.QUIT:

                running = False

            elif event.type == pygame.TEXTINPUT:
                # 中文输入法开启时，有时只走 TEXTINPUT 而不产生可用的 KEYDOWN
                if (event.text or "").strip().lower() == "r":
                    reset_match()

            elif event.type == pygame.KEYDOWN:

                if event.key == pygame.K_ESCAPE:

                    running = False

                elif (
                    event.key in (pygame.K_r, pygame.K_F5)
                    or (
                        bool(event.unicode)
                        and len(event.unicode) == 1
                        and event.unicode.lower() == "r"
                    )
                ):

                    reset_match()

                elif event.key == pygame.K_1:

                    theme_idx = 0

                    theme = THEMES[theme_idx]

                    sync_ball_colors(balls, theme)

                elif event.key == pygame.K_2:

                    theme_idx = 1

                    theme = THEMES[theme_idx]

                    sync_ball_colors(balls, theme)

                elif event.key == pygame.K_3:

                    theme_idx = 2

                    theme = THEMES[theme_idx]

                    sync_ball_colors(balls, theme)

                elif event.key == pygame.K_LEFTBRACKET:

                    follow_target = False

                elif event.key == pygame.K_RIGHTBRACKET:

                    follow_target = True

                elif event.key == pygame.K_BACKSLASH:

                    follow_target = None

                elif event.key == pygame.K_0:

                    follow_target = "top"



        if not game_over:

            n_red, n_blue = count_by_color(balls)

            curr_min_spawn = _minority_from_counts(n_red, n_blue)

            if n_red == n_blue:

                majority_dominance_sec = 0.0

            else:

                majority_dominance_sec += dt

            if (

                not yellow_released

                and majority_dominance_sec >= MAJORITY_DOMINANCE_YELLOW_SEC

                and curr_min_spawn is not None

            ):

                cand = [

                    b

                    for b in balls

                    if b.evolved

                    and not ball_is_predator(b)

                    and (

                        (curr_min_spawn is True and b.is_red)

                        or (curr_min_spawn is False and not b.is_red)

                    )

                ]

                if cand:

                    ypick = random.choice(cand)

                    ypick.is_yellow = True

                    ypick.is_black = False

                    ypick.evolved = False

                    ypick.wake_trail.clear()

                    ypick.minority_kills = 0

                    ypick.trail.clear()

                    ypick.color = YELLOW_BALL_COLOR

                    ypick.yellow_flee_active = False

                    ypick.predator_kill_count = 0

                    ypick.predator_mutual_ignore_until_ms = 0

                    ypick.predator_clash_cooldown_ms = 0

                    ypick.predator_flee_press_sec = 0.0

                    ypick.predator_orbit_dots.clear()

                    ypick.predator_phantom_trail.clear()

                    yellow_released = True

                    yellow_spawn_ms = pygame.time.get_ticks()

            prev_majority_key = apply_majority_becomes_slowdown(

                balls, n_red, n_blue, prev_majority_key

            )

            apply_minority_flee(balls, dt)

            apply_flee_from_predators(balls, dt)

            apply_predator_chase(balls, dt)

            for b in balls:

                b.x += b.vx * dt

                b.y += b.vy * dt

                reflect_circle(b, cx, cy, R, r)



            new_spawns: List[Ball] = []

            for b in balls:

                bid = id(b)

                cool = wall_hit_cooldown.get(bid, 0)

                if cool > 0:

                    wall_hit_cooldown[bid] = cool - 1

                    continue

                d = math.hypot(b.x - cx, b.y - cy)

                if (

                    not ball_is_predator(b)

                    and d + r >= R - 1.5

                    and len(balls) + len(new_spawns) < MAX_BALLS

                ):

                    wall_hit_cooldown[bid] = SPLIT_COOLDOWN_FRAMES

                    nb = spawn_same_color(b, cx, cy, R, r)

                    nb.color = theme.red if nb.is_red else theme.blue

                    new_spawns.append(nb)

                    # 新球贴墙生成，也给冷却，避免同一帧或紧接着再次分裂
                    wall_hit_cooldown[id(nb)] = SPLIT_COOLDOWN_FRAMES

            balls.extend(new_spawns)

            to_remove = set()

            kill_pairs: List[Tuple[Ball, Ball]] = []

            kill_credit: List[Tuple[Ball, Ball]] = []

            rr = float(r)

            rr_sq = (2 * rr) ** 2

            nr_coll, nb_coll = count_by_color(balls)

            for i, j in iter_ball_pairs(balls, cell):

                a, b = balls[i], balls[j]

                if dist_sq(a.x, a.y, b.x, b.y) > rr_sq:

                    continue

                resolve_collision(a, b, rr)

                now_pc = pygame.time.get_ticks()

                if ball_is_predator(a) and ball_is_predator(b):

                    _predator_pair_contact(a, b, now_pc)

                if not _balls_hostile(a, b):

                    continue

                a_kills_b = not other_in_my_front(b, a)

                b_kills_a = not other_in_my_front(a, b)

                if a_kills_b and b_kills_a:

                    if (

                        _victim_can_be_eliminated(a)

                        and not _collision_kill_blocked_by_shields(a, b, nr_coll, nb_coll)

                    ):

                        if ball_is_predator(b):

                            _predator_register_orbit_dot(b, a)

                        to_remove.add(id(a))

                        kill_credit.append((b, a))

                    if (

                        _victim_can_be_eliminated(b)

                        and not _collision_kill_blocked_by_shields(b, a, nr_coll, nb_coll)

                    ):

                        if ball_is_predator(a):

                            _predator_register_orbit_dot(a, b)

                        to_remove.add(id(b))

                        kill_credit.append((a, b))

                elif a_kills_b:

                    if (

                        _victim_can_be_eliminated(b)

                        and not _collision_kill_blocked_by_shields(b, a, nr_coll, nb_coll)

                    ):

                        if ball_is_predator(a):

                            _predator_register_orbit_dot(a, b)

                        to_remove.add(id(b))

                        kill_pairs.append((a, b))

                        kill_credit.append((a, b))

                elif b_kills_a:

                    if (

                        _victim_can_be_eliminated(a)

                        and not _collision_kill_blocked_by_shields(a, b, nr_coll, nb_coll)

                    ):

                        if ball_is_predator(b):

                            _predator_register_orbit_dot(b, a)

                        to_remove.add(id(a))

                        kill_pairs.append((b, a))

                        kill_credit.append((b, a))



            mi_kill = _minority_from_counts(nr_coll, nb_coll)

            Rf = float(R)

            for killer, _victim in kill_pairs:

                if mi_kill is None:

                    continue

                if ball_is_predator(killer):

                    continue

                if (mi_kill is True and not killer.is_red) or (

                    mi_kill is False and killer.is_red

                ):

                    continue

                if not taiji_own_color_zone(

                    killer.is_red,

                    killer.x,

                    killer.y,

                    cx,

                    cy,

                    Rf,

                    taiji_angle,

                ):

                    continue

                killer.minority_kills += 1

                killer.evolved = True



            for killer, victim in kill_credit:

                if ball_is_predator(victim):

                    continue

                if killer.is_red == victim.is_red:

                    continue

                if killer.is_red:

                    match_kills_red += 1

                else:

                    match_kills_blue += 1



            if to_remove:

                removed_xy = [(b.x, b.y) for b in balls if id(b) in to_remove]

                balls = [b for b in balls if id(b) not in to_remove]

                alive = {id(b) for b in balls}

                wall_hit_cooldown = {k: v for k, v in wall_hit_cooldown.items() if k in alive}

            else:

                removed_xy = []

            time_ms_fx = pygame.time.get_ticks()

            n_red, n_blue = count_by_color(balls)

            curr_min = _minority_from_counts(n_red, n_blue)

            curr_maj = _majority_from_counts(n_red, n_blue)

            if curr_min is None:

                minority_identity_stable_sec = 0.0

            elif prev_min_identity_for_black != curr_min:

                minority_identity_stable_sec = 0.0

            else:

                minority_identity_stable_sec += dt

            if (

                not black_released

                and minority_identity_stable_sec >= STALE_MINORITY_BLACK_SEC

                and curr_min is not None

                and len(balls) < MAX_BALLS

            ):

                mj = _majority_from_counts(n_red, n_blue)

                if mj is not None:

                    nbk = spawn_black_predator_near_majority(

                        balls, cx, cy, R, float(r), mj is True

                    )

                    balls.append(nbk)

                    wall_hit_cooldown[id(nbk)] = 0

                    black_released = True

                    black_spawn_ms = pygame.time.get_ticks()

            prev_min_identity_for_black = curr_min

            _append_minority_fx_waves(

                fx_minor_waves,

                fx_prev_minority,

                curr_min,

                balls,

                removed_xy,

                time_ms_fx,

            )

            _append_majority_fx_waves(

                fx_major_waves,

                fx_prev_majority,

                curr_maj,

                balls,

                removed_xy,

                time_ms_fx,

            )

            fx_prev_minority = curr_min

            fx_prev_majority = curr_maj

            update_minority_trails(balls, curr_min, float(r), fx_minor_waves, time_ms_fx)

            update_evolved_wake_trails(balls, curr_min)

            update_predator_orbit_dots(balls, dt)

            update_predator_phantom_trails(balls)

            if n_red == 0 and n_blue == 0:

                game_over = True

                end_message = "平局：双方同灭"

            elif n_red == 0:

                game_over = True

                end_message = "游戏结束：蓝方获胜（红球已全灭）"

            elif n_blue == 0:

                game_over = True

                end_message = "游戏结束：红方获胜（蓝球已全灭）"



            for b in balls:

                if b.threat_flee_active or b.yellow_flee_active:

                    continue

                if ball_is_predator(b):

                    s = math.hypot(b.vx, b.vy)

                    if s < 1e-12:

                        continue

                    if s < BALL_SPEED_MIN:

                        k = BALL_SPEED_MIN / s

                        b.vx *= k

                        b.vy *= k

                    continue

                clamp_ball_speed(b)



        taiji_angle = (taiji_angle + TAIJI_SPIN_RAD_PER_SEC * dt) % (2 * math.pi)



        _dr, _db = count_by_color(balls)

        if _dr < _db:

            _mi_draw = True

        elif _db < _dr:

            _mi_draw = False

        else:

            _mi_draw = None

        time_ms_draw = pygame.time.get_ticks()

        draw_scene(

            scene_canvas,

            balls,

            theme,

            Ri,

            ri,

            wedge_buf,

            wedge_side,

            _mi_draw,

            star_buf,

            dot_buf,

            hex_buf,

            time_ms_draw,

            fx_major_waves,

            fx_minor_waves,

            taiji_angle,

        )

        screen.blit(scene_canvas, (0, 0))



        follow_ball = resolve_follow_ball(balls, follow_target)

        draw_match_hud_panels(

            screen,

            font_hud_title,

            font_hud_cell,

            theme,

            balls,

            _dr,

            _db,

            _mi_draw,

            match_kills_red,

            match_kills_blue,

        )

        draw_predator_timers_panels(

            screen,

            font_hud_title,

            font_hud_cell,

            theme,

            time_ms_draw,

            _dr,

            _db,

            _mi_draw,

            majority_dominance_sec,

            minority_identity_stable_sec,

            yellow_released,

            black_released,

            yellow_spawn_ms,

            black_spawn_ms,

            balls,

        )

        draw_follow_pip(screen, scene_canvas, theme, follow_ball, font_hud_cell)

        if follow_ball is not None:

            draw_follow_camera_marker(

                screen,

                follow_ball,

                ri,

                font_hud_cell,

                time_ms_draw,

            )



        hint = font.render(

            f"主题 {theme_idx + 1}/3 · {theme.label}  |  1/2/3 换主题  |  R / F5 重置  ESC  |  [ ] \\ 0 尾随  |  "

            f"撞墙分裂冷却 {SPLIT_COOLDOWN_SEC:g}s  |  "

            f"球速{BALL_SPEED_MIN:.0f}～{BALL_SPEED_MAX:.0f}(逃离不限顶)  |  "

            f"少球威胁时≈最近敌球速×{FLEE_THREAT_SPEED_VS_ENEMY:g}  |  "

            f"多球方刚占多数×{MAJORITY_BECOMES_SPEED_MULT:g}速  |  "

            f"多球优势连续{MAJORITY_DOMINANCE_YELLOW_SEC:.0f}s→随机已进化少球变黄球  |  "

            f"少球身份连续{STALE_MINORITY_BLACK_SEC:.0f}s→多球重心出黑球  |  "

            "扇形/箭头=无敌方向  |  异色可互灭含双灭  |  一色全灭结束",

            True,

            theme.hint,

        )

        screen.blit(hint, (12, HEIGHT - hint.get_height() - 4))

        if game_over and end_message:

            ov = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)

            ov.fill(theme.end_overlay)

            screen.blit(ov, (0, 0))

            msg_surf = font_big.render(end_message, True, theme.end_title)

            sub = font.render("按 R 或 F5 重新开始", True, theme.end_sub)

            mr = msg_surf.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 20))

            sr = sub.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 28))

            screen.blit(msg_surf, mr)

            screen.blit(sub, sr)

        pygame.display.flip()



    pygame.quit()

    sys.exit(0)





if __name__ == "__main__":

    main()


