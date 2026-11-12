"""

圆形弹球小游戏：红蓝两色球在圆内弹跳，撞墙产生同色球；

前进方向约 30% 圆心角（108°）为无敌区；仅异色球相撞时可消灭对方（若对方不在无敌区内）。

少球方人数低于多球方二十分之一时，异色消灭判定下少球方球不会被消灭（双灭时仅多球方可灭）；人数比恢复后取消。

某一颜色球全部消失后游戏结束。

全局球速限制在 BALL_SPEED_MIN～BALL_SPEED_MAX（默认比原先更慢）；少球方威胁逃离中可超过上限。

少球方仅在与某敌球距离约「两个球直径」内、且该敌球处于可击中方位（与消灭判定一致）时加速逃离；被威胁时速率为最近威胁敌球速的 1.3 倍，脱离后恢复保存的速度；会扭转前进方向对准逃离方向。

一方刚成为多球方时现有球会乘一次降速系数；失去多数时对「曾降速」的球乘倒数恢复。多球方在球周径向柔光，并照亮圆内背景星点（星点染成己方主色）；少球方显示六边形霓虹框并保留尾迹；身份变化时对应 UI 与尾迹同步开关。



性能：空间网格碰撞 + 无敌区用小表面绘制；球多时自动降低扇形精度。

UI：按 1 / 2 / 3 切换三种视觉主题。

"""



from __future__ import annotations



import math

import random

import sys

from collections import defaultdict

from dataclasses import dataclass, field

from typing import Dict, Iterator, List, Optional, Tuple



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



# 空间划分单元（略大于球直径，减少跨格漏检）

def _cell_size() -> int:

    return int(2 * BALL_RADIUS) + 4





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

class Ball:

    x: float

    y: float

    vx: float

    vy: float

    color: Tuple[int, int, int]

    is_red: bool

    # 非逃离状态下的速度快照；脱离威胁时恢复
    saved_vx: float = 0.0

    saved_vy: float = 0.0

    # 上一帧是否在威胁逃离中（用于刚脱离威胁时恢复 saved 速度）
    threat_flee_active: bool = False

    # 少球方尾迹：[最新位置, ..., 最旧]
    trail: List[Tuple[float, float]] = field(default_factory=list)

    # 是否仍带「成为多球方时」的一次性降速（用于失去多数时只恢复这类球）
    has_majority_speed_penalty: bool = False



    def pos(self) -> Tuple[float, float]:

        return self.x, self.y



    def speed(self) -> float:

        return math.hypot(self.vx, self.vy)



    def vel_norm(self) -> Tuple[float, float]:

        s = self.speed()

        if s < 1e-6:

            return 1.0, 0.0

        return self.vx / s, self.vy / s





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

        is_major = minority_is_red is not None and (

            (minority_is_red is True and not b.is_red)

            or (minority_is_red is False and b.is_red)

        )

        fade_maj = False

        for w in fx_major_waves:

            if (

                w.category == "majority"

                and not w.appearing

                and not fx_wave_is_expired(time_ms, w)

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





def draw_arena_starfield(

    screen: pygame.Surface,

    theme: Theme,

    balls: List[Ball],

    minority_is_red: bool | None,

    time_ms: int,

    fx_major_waves: List[FxWave],

) -> None:

    """圆内固定星场：仅多球方光晕范围内提亮，颜色向照亮方红/蓝偏移。"""

    emitters = _majority_light_emitters(balls, minority_is_red, time_ms, fx_major_waves)

    cx, cy = float(CIRCLE_CENTER[0]), float(CIRCLE_CENTER[1])

    ar, ag, ab = theme.arena

    r_lim_sq = (float(CIRCLE_RADIUS) - 4.0) ** 2

    light_r = float(MAJORITY_STARLIGHT_RADIUS)

    for sx, sy, seed in _arena_star_field():

        dx, dy = sx - cx, sy - cy

        if dx * dx + dy * dy > r_lim_sq:

            continue

        sr = sg = sb = 0.0

        sw = 0.0

        for b, mm in emitters:

            d = math.hypot(sx - b.x, sy - b.y)

            if d >= light_r:

                continue

            u = (1.0 - d / light_r) ** 2 * mm

            c = theme.red if b.is_red else theme.blue

            sr += u * c[0]

            sg += u * c[1]

            sb += u * c[2]

            sw += u

        tw = 0.88 + 0.12 * math.sin(time_ms * 0.0033 + seed * 6.28318)

        if sw > 0.008:

            lr = sr / sw

            lg = sg / sw

            lb = sb / sw

            bright = min(1.0, (0.22 + sw * 1.25) * tw)

            cr = int(ar + (lr - ar) * bright)

            cg = int(ag + (lg - ag) * bright)

            cb = int(ab + (lb - ab) * bright)

            pr = 2 if bright > 0.68 else 1

            pygame.draw.circle(screen, (cr, cg, cb), (int(sx), int(sy)), pr)

        else:

            dk = 0.06 + 0.035 * math.sin(time_ms * 0.002 + seed * 5.0)

            cr = max(0, int(ar * (1.0 - dk)))

            cg = max(0, int(ag * (1.0 - dk)))

            cb = max(0, int(ab * (1.0 - dk)))

            pygame.draw.circle(screen, (cr, cg, cb), (int(sx), int(sy)), 1)





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

    reds = sum(1 for b in balls if b.is_red)

    return reds, len(balls) - reds





def minority_ultra_shield_active(n_red: int, n_blue: int, ball: Ball) -> bool:

    """少球方人数严格低于多球方 1/MINORITY_ULTRA_SHIELD_DENOM 时，该方球本帧内免疫异色消灭。"""

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

            was_prev_major = (prev == "red" and b.is_red) or (prev == "blue" and not b.is_red)

            if was_prev_major and b.has_majority_speed_penalty:

                b.vx *= inv

                b.vy *= inv

                b.has_majority_speed_penalty = False

    if cur is not None and cur != prev:

        for b in balls:

            is_new_major = (cur == "red" and b.is_red) or (cur == "blue" and not b.is_red)

            if not is_new_major:

                continue

            if b.threat_flee_active:

                b.vx, b.vy = b.saved_vx, b.saved_vy

                b.threat_flee_active = False

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

            if e.is_red == b.is_red:

                continue

            if dist_sq(b.x, b.y, e.x, e.y) > prox_sq:

                continue

            # 敌球在我无敌扇形内 → 不构成「要被撞到」的威胁
            if other_in_my_front(b, e):

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

                if b.is_red != fade_team:

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

        if b.is_red != minority_is_red:

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

            minority_is_red is not None and b.is_red == minority_is_red

        ) or (fade_team is not None and b.is_red == fade_team)

        if not show or len(b.trail) < 2:

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

            minority_is_red is not None and b.is_red == minority_is_red

        ) or (fade_team is not None and b.is_red == fade_team)

        if not show:

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

) -> None:

    screen.fill(theme.bg)

    pygame.draw.circle(screen, theme.arena, CIRCLE_CENTER, R)

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



    for b in balls:

        bx_i, by_i = int(b.x), int(b.y)

        col = theme.red if b.is_red else theme.blue

        pygame.draw.circle(screen, col, (bx_i, by_i), r)

        if theme.ball_shine:

            mx, my = b.vel_norm()

            hx = int(bx_i + mx * (r * 0.35))

            hy = int(by_i + my * (r * 0.35))

            shine = tuple(min(255, c + 55) for c in col)

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

    pygame.display.set_caption("圆内弹球 — 1/2/3 切换主题")

    clock = pygame.time.Clock()

    font = _load_cjk_font(17, bold=False)

    font_big = _load_cjk_font(34, bold=True)



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



    wall_hit_cooldown: dict[int, int] = {}

    game_over = False

    end_message = ""

    prev_majority_key: str | None = None

    fx_minor_waves: List[FxWave] = []

    fx_major_waves: List[FxWave] = []

    _n0, _n1 = count_by_color(balls)

    fx_prev_minority: bool | None = _minority_from_counts(_n0, _n1)

    fx_prev_majority: bool | None = _majority_from_counts(_n0, _n1)



    def reset_match() -> None:
        nonlocal balls, game_over, end_message, prev_majority_key
        nonlocal fx_minor_waves, fx_major_waves, fx_prev_minority, fx_prev_majority
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



        if not game_over:

            n_red, n_blue = count_by_color(balls)

            prev_majority_key = apply_majority_becomes_slowdown(

                balls, n_red, n_blue, prev_majority_key

            )

            apply_minority_flee(balls, dt)

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

                if d + r >= R - 1.5 and len(balls) + len(new_spawns) < MAX_BALLS:

                    wall_hit_cooldown[bid] = SPLIT_COOLDOWN_FRAMES

                    nb = spawn_same_color(b, cx, cy, R, r)

                    nb.color = theme.red if nb.is_red else theme.blue

                    new_spawns.append(nb)

                    # 新球贴墙生成，也给冷却，避免同一帧或紧接着再次分裂
                    wall_hit_cooldown[id(nb)] = SPLIT_COOLDOWN_FRAMES

            balls.extend(new_spawns)

            to_remove = set()

            rr = float(r)

            rr_sq = (2 * rr) ** 2

            nr_coll, nb_coll = count_by_color(balls)

            for i, j in iter_ball_pairs(balls, cell):

                a, b = balls[i], balls[j]

                if dist_sq(a.x, a.y, b.x, b.y) > rr_sq:

                    continue

                resolve_collision(a, b, rr)

                if a.is_red == b.is_red:

                    continue

                a_kills_b = not other_in_my_front(b, a)

                b_kills_a = not other_in_my_front(a, b)

                if a_kills_b and b_kills_a:

                    if not minority_ultra_shield_active(nr_coll, nb_coll, a):

                        to_remove.add(id(a))

                    if not minority_ultra_shield_active(nr_coll, nb_coll, b):

                        to_remove.add(id(b))

                elif a_kills_b:

                    if not minority_ultra_shield_active(nr_coll, nb_coll, b):

                        to_remove.add(id(b))

                elif b_kills_a:

                    if not minority_ultra_shield_active(nr_coll, nb_coll, a):

                        to_remove.add(id(a))



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

                if b.threat_flee_active:

                    continue

                clamp_ball_speed(b)



        _dr, _db = count_by_color(balls)

        if _dr < _db:

            _mi_draw = True

        elif _db < _dr:

            _mi_draw = False

        else:

            _mi_draw = None

        draw_scene(

            screen,

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

            pygame.time.get_ticks(),

            fx_major_waves,

            fx_minor_waves,

        )



        hint = font.render(

            f"主题 {theme_idx + 1}/3 · {theme.label}  |  1/2/3 换主题  |  R / F5 重置  ESC 退出  |  "

            f"撞墙分裂冷却 {SPLIT_COOLDOWN_SEC:g}s  |  "

            f"球速{BALL_SPEED_MIN:.0f}～{BALL_SPEED_MAX:.0f}(逃离不限顶)  |  "

            f"少球威胁时≈最近敌球速×{FLEE_THREAT_SPEED_VS_ENEMY:g}  |  "

            f"多球方刚占多数×{MAJORITY_BECOMES_SPEED_MULT:g}速  |  "

            "扇形/箭头=无敌方向  |  异色可互灭含双灭  |  一色全灭结束",

            True,

            theme.hint,

        )

        screen.blit(hint, (12, 10))

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


