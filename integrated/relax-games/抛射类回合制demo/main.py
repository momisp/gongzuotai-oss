# -*- coding: utf-8 -*-
"""
抛射类回合制 Demo（参考需求文档优先级1）
PC：←→ 移动，↑↓ 调角度，按住空格蓄力（0~100 到顶后反向），松开发射。
1V1 玩家 vs 简易 AI；可破坏地形、无底坠落；30 秒回合；体力/怒气简化实现。
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from enum import Enum, auto

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


# --- 常量（与需求文档大致对齐，可按手感微调）---
W, H = 960, 600
FPS = 60
TILE = 24
MAP_TILES_X = 36
MAP_TILES_Y = 22
WORLD_W = MAP_TILES_X * TILE
WORLD_H = MAP_TILES_Y * TILE
GRAVITY = 0.38
WIND_RANGE = (-10, 10)
TURN_SEC = 30.0
UI_PWR_H = 26
UI_PWR_BOTTOM_PAD = 8
UI_SKILL_PANEL_W = 54
UI_SKILL_SLOT_H = 42
UI_SKILL_GAP = 5
HP_MAX = 100
ATK_BASE = 10
STAMINA_MAX = 100
STAMINA_PER_TILE = 10
TILE_MOVE = TILE  # 「一格」用一格砖宽度衡量
RAGE_MAX = 100


class TileKind(Enum):
    EMPTY = auto()
    DESTRUCTIBLE = auto()
    SOLID_BASE = auto()


@dataclass
class Player:
    is_human: bool
    name: str
    color: tuple[int, int, int]
    x: float
    y: float
    facing: int  # 1 朝右 -1 朝左
    angle_deg: float  # 0~90，相对水平朝「上」抛
    hp: int = HP_MAX
    stamina: int = STAMINA_MAX
    rage: int = 0
    alive: bool = True
    vx: float = 0.0
    vy: float = 0.0
    on_ground: bool = False
    last_angle: float = 45.0
    last_power: float = 50.0

    def rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x - 14), int(self.y - 28), 28, 28)


@dataclass
class Projectile:
    x: float
    y: float
    vx: float
    vy: float
    owner_is_human: bool
    power_used: float = 50.0
    damage_mul: float = 1.0
    rage_skill: bool = False
    split_done: bool = False


@dataclass
class FloatingText:
    text: str
    x: float
    y: float
    color: tuple[int, int, int]
    ttl: float = 1.2


class Game:
    def __init__(self) -> None:
        pygame.init()
        pygame.display.set_caption("抛射回合制 Demo · 玩家 vs AI")
        self.screen = pygame.display.set_mode((W, H))
        try:
            pygame.key.stop_text_input()
        except (AttributeError, pygame.error):
            pass
        self.clock = pygame.time.Clock()
        self.font = _load_cjk_font(16, bold=True)
        self.font_small = _load_cjk_font(14, bold=False)

        self.camera_x = 0.0
        self.grid: list[list[TileKind]] = [
            [TileKind.EMPTY for _ in range(MAP_TILES_X)] for _ in range(MAP_TILES_Y)
        ]
        self._build_map()
        base_row = MAP_TILES_Y - 2
        plat_row = base_row - 3
        feet_y = float(plat_row * TILE - 14)
        self.p1 = Player(True, "玩家", (255, 120, 80), 10 * TILE, feet_y, 1, 45.0)
        self.p2 = Player(False, "电脑", (80, 160, 255), (MAP_TILES_X - 10) * TILE, feet_y, -1, 45.0)
        self.players = [self.p1, self.p2]
        self.human_turn = True  # True -> p1 回合
        self.turn_timer = TURN_SEC
        self.wind = random.randint(*WIND_RANGE)
        self.prev_wind = self.wind
        self.power_hold = False
        self.power_dir = 1
        self.power = 0.0
        self.projectiles: list[Projectile] = []
        self.float_texts: list[FloatingText] = []
        self.explosions: list[tuple[float, float, float, float]] = []  # x,y,t,radius
        self.game_over = False
        self.winner_text = ""
        self.skip_msg = ""
        self.skip_msg_t = 0.0
        # 道具栏（简化：仅激怒占位 + 增幅弹）
        self.slots_p1: list[str | None] = ["激怒", "增幅弹", None]
        self.slots_p2: list[str | None] = [None, None, None]
        self.props_used_this_turn = False
        self.ai_thinking = 0.0
        self._pending_end_turn = False
        self._next_dmg_mul = 1.0

    def _build_map(self) -> None:
        # 底层不可破坏
        base_y = MAP_TILES_Y - 2
        for x in range(MAP_TILES_X):
            self.grid[base_y][x] = TileKind.SOLID_BASE
            self.grid[base_y + 1][x] = TileKind.SOLID_BASE
        # 中间可破坏平台
        for x in range(8, MAP_TILES_X - 8):
            self.grid[base_y - 3][x] = TileKind.DESTRUCTIBLE
        for x in range(4, 12):
            self.grid[base_y - 6][x] = TileKind.DESTRUCTIBLE
        for x in range(MAP_TILES_X - 12, MAP_TILES_X - 4):
            self.grid[base_y - 6][x] = TileKind.DESTRUCTIBLE

    def current(self) -> Player:
        return self.p1 if self.human_turn else self.p2

    def opponent(self) -> Player:
        return self.p2 if self.human_turn else self.p1

    def world_to_screen(self, wx: float, wy: float) -> tuple[int, int]:
        return int(wx - self.camera_x), int(wy)

    def tile_at_world(self, wx: float, wy: float) -> tuple[int, int]:
        return int(wx // TILE), int(wy // TILE)

    def solid_at(self, tx: int, ty: int) -> bool:
        if tx < 0 or ty < 0 or tx >= MAP_TILES_X or ty >= MAP_TILES_Y:
            return False
        return self.grid[ty][tx] != TileKind.EMPTY

    def destroy_tile(self, tx: int, ty: int) -> None:
        if tx < 0 or ty < 0 or tx >= MAP_TILES_X or ty >= MAP_TILES_Y:
            return
        if self.grid[ty][tx] == TileKind.DESTRUCTIBLE:
            self.grid[ty][tx] = TileKind.EMPTY

    def explode_fixed(self, cx: float, cy: float, radius: float, damage: int, attacker: Player) -> None:
        """爆炸：对敌方造成伤害 + 破坏方块。"""
        self.explosions.append((cx, cy, 0.35, radius))
        victim = self.p2 if attacker is self.p1 else self.p1
        if victim.alive and (victim.x - cx) ** 2 + (victim.y - cy) ** 2 <= (radius + 20) ** 2:
            dmg = max(1, int(damage))
            victim.hp = max(0, victim.hp - dmg)
            victim.rage = min(RAGE_MAX, victim.rage + 20)
            self.float_texts.append(FloatingText(f"-{dmg}", victim.x, victim.y - 40, (255, 90, 90)))
            if victim.hp <= 0:
                victim.alive = False
        r = radius
        for ty in range(MAP_TILES_Y):
            for tx in range(MAP_TILES_X):
                wx = (tx + 0.5) * TILE
                wy = (ty + 0.5) * TILE
                if (wx - cx) ** 2 + (wy - cy) ** 2 <= r * r:
                    self.destroy_tile(tx, ty)

    def apply_physics_player(self, p: Player, dt: float) -> None:
        if not p.alive:
            return
        p.vy += GRAVITY * 1.2
        p.x += p.vx * dt * 60
        p.y += p.vy * dt * 60
        p.vx *= 0.85
        if abs(p.vx) < 0.01:
            p.vx = 0

        # 与地形碰撞（AABB vs 格子）
        rect = p.rect()
        p.on_ground = False
        # 地图边界水平
        p.x = max(14, min(WORLD_W - 14, p.x))
        # 落出世界底部
        if p.y > WORLD_H + 80:
            p.alive = False
            p.hp = 0
            return

        # 脚下检测：简化 — 向下扫描若干格
        feet_y = p.y + 1
        tx = int(p.x // TILE)
        ty = int((feet_y + 14) // TILE)
        if self.solid_at(tx, ty) or self.solid_at(tx, ty + 1):
            tile_top = (ty) * TILE
            p.y = min(p.y, tile_top - 14)
            p.vy = 0
            p.on_ground = True
        else:
            # 左右卡墙
            for ox in (-12, 12):
                txx = int((p.x + ox) // TILE)
                tyy = int((p.y) // TILE)
                if self.solid_at(txx, tyy):
                    p.x -= math.copysign(1, ox) * 2

    def start_turn(self) -> None:
        self.turn_timer = TURN_SEC
        self.props_used_this_turn = False
        self.prev_wind = self.wind
        self.wind = random.randint(*WIND_RANGE)
        for p in self.players:
            p.stamina = STAMINA_MAX
        self.power = 0.0
        self.power_dir = 1
        self.ai_thinking = 0.4 if not self.current().is_human else 0.0

    def end_turn(self) -> None:
        self.human_turn = not self.human_turn
        self.start_turn()

    def skip_turn_timeout(self) -> None:
        c = self.current()
        c.rage = min(RAGE_MAX, c.rage + 20)
        self.skip_msg = "回合超时，自动跳过"
        self.skip_msg_t = 2.0
        self.end_turn()

    def try_move(self, dx: int, dt: float) -> None:
        c = self.current()
        if not c.alive or not c.is_human:
            return
        if c.stamina < STAMINA_PER_TILE:
            return
        # 每帧位移与 dt 挂钩，避免「每帧 3 像素」短按像失灵；dx 仅为 ±1 表示方向
        mag = max(14.0, 380.0 * max(dt, 1.0 / FPS))
        new_x = c.x + float(dx) * mag
        if abs(new_x - c.x) < 0.1:
            return
        # 每 TILE_MOVE 像素耗 10 体力
        tiles_moved = abs((new_x - c.x)) / TILE_MOVE
        cost = int(STAMINA_PER_TILE * max(0.2, tiles_moved))
        if c.stamina < cost:
            return
        c.stamina -= cost
        c.x = max(14, min(WORLD_W - 14, new_x))
        c.facing = 1 if dx > 0 else -1

    def fire(self, owner: Player, power: float, dmg_mul: float = 1.0, rage_skill: bool = False) -> None:
        theta = math.radians(owner.angle_deg)
        # 抛射初速度：力度映射
        v0 = 6.0 + (power / 100.0) * 11.0
        # 需求：射程与 sin2θ 相关 —— 体现在初速分解
        vx = owner.facing * v0 * math.cos(theta) * (1 + self.wind * 0.01)
        vy = -v0 * math.sin(theta)
        owner.last_angle = owner.angle_deg
        owner.last_power = power
        self.projectiles.append(
            Projectile(
                owner.x + owner.facing * 20,
                owner.y - 8,
                vx,
                vy,
                owner is self.p1,
                power,
                dmg_mul,
                rage_skill,
            )
        )
        if rage_skill:
            owner.rage = 0
        else:
            owner.rage = min(RAGE_MAX, owner.rage + 10)
        self._pending_end_turn = True

    def update(self, dt: float) -> None:
        if self.skip_msg_t > 0:
            self.skip_msg_t -= dt
        if self.game_over:
            return

        alive_count = sum(1 for p in self.players if p.alive)
        if alive_count <= 1:
            self.game_over = True
            if self.p1.alive:
                self.winner_text = "玩家胜利"
            elif self.p2.alive:
                self.winner_text = "电脑胜利"
            else:
                self.winner_text = "平局"
            return

        # 回合计时（仅无弹飞行、且未刚发射待切换时仍算当前回合等待弹着）
        if not self.projectiles and not self._pending_end_turn:
            self.turn_timer -= dt
            if self.turn_timer <= 0 and self.current().is_human:
                self.skip_turn_timeout()
            elif self.turn_timer <= 0 and not self.current().is_human:
                self.skip_turn_timeout()

        for p in self.players:
            self.apply_physics_player(p, dt)

        # AI
        if not self.projectiles and not self.current().is_human and self.p2.alive:
            self.ai_thinking -= dt
            if self.ai_thinking <= 0:
                self.p2.angle_deg = max(15, min(85, self.p2.angle_deg + random.uniform(-4, 4)))
                self.power += 2.2 * self.power_dir
                if self.power >= 100:
                    self.power = 100
                    self.power_dir = -1
                elif self.power <= 30 and self.power_dir < 0:
                    self.power_dir = 1
                if random.random() < 0.04 * dt * 60:
                    if self.p2.rage >= RAGE_MAX and random.random() < 0.35:
                        self.fire(self.p2, self.power, 2.0, True)
                    else:
                        self.fire(self.p2, self.power, 1.0, False)

        new_explosions: list[tuple[float, float, float, float]] = []
        for ex in self.explosions:
            x, y, t, r = ex
            t -= dt
            if t > 0:
                new_explosions.append((x, y, t, r))
        self.explosions = new_explosions

        # 炮弹
        still: list[Projectile] = []
        for pr in self.projectiles:
            pr.vy += GRAVITY
            pr.vx += self.wind * 0.004  # 风力持续推横向
            pr.x += pr.vx
            pr.y += pr.vy
            hit = False
            if pr.x < 0 or pr.x > WORLD_W or pr.y < -200 or pr.y > WORLD_H + 50:
                hit = True
            if not hit:
                tx, ty = self.tile_at_world(pr.x, pr.y)
                if self.solid_at(tx, ty):
                    cx, cy = pr.x, pr.y
                    base_r = 46 if pr.rage_skill else 32
                    atk_owner = self.p1 if pr.owner_is_human else self.p2
                    dmg = ATK_BASE * (1 + pr.power_used * 0.01) * pr.damage_mul
                    self.explode_fixed(cx, cy, base_r, int(dmg), atk_owner)
                    hit = True
            if hit:
                continue
            still.append(pr)
        self.projectiles = still

        # 飘字
        ft2: list[FloatingText] = []
        for ft in self.float_texts:
            ft.y -= 40 * dt
            ft.ttl -= dt
            if ft.ttl > 0:
                ft2.append(ft)
        self.float_texts = ft2

        if not self.projectiles and self._pending_end_turn:
            self._pending_end_turn = False
            self.end_turn()

        # 相机跟随当前行动方
        target = self.current().x - W * 0.35
        self.camera_x += (target - self.camera_x) * min(1.0, dt * 4)

    def _draw_launch_angle_arrow(self, surf: pygame.Surface, p: Player) -> None:
        """从角色身前指向发射方向的红色粗箭头（仅角度与左右朝向，与蓄力力度无关）。"""
        length = 96.0
        theta = math.radians(p.angle_deg)
        dx = p.facing * math.cos(theta)
        dy = -math.sin(theta)
        sx, sy = p.x, p.y - 14
        ex = sx + dx * length
        ey = sy + dy * length
        pygame.draw.line(
            surf,
            (228, 32, 38),
            (int(sx), int(sy)),
            (int(ex), int(ey)),
            6,
        )
        ah = 16.0
        bx = ex - dx * ah
        by = ey - dy * ah
        px, py = -dy * 11.0, dx * 11.0
        tip = (int(ex), int(ey))
        left = (int(bx + px), int(by + py))
        right = (int(bx - px), int(by - py))
        pygame.draw.polygon(surf, (228, 32, 38), (tip, left, right))

    def draw_world(self) -> None:
        surf = pygame.Surface((WORLD_W, WORLD_H))
        surf.fill((120, 185, 230))
        for ty in range(MAP_TILES_Y):
            for tx in range(MAP_TILES_X):
                k = self.grid[ty][tx]
                if k == TileKind.EMPTY:
                    continue
                rect = pygame.Rect(tx * TILE, ty * TILE, TILE, TILE)
                if k == TileKind.SOLID_BASE:
                    pygame.draw.rect(surf, (90, 88, 86), rect)
                    pygame.draw.rect(surf, (60, 58, 55), rect, 1)
                else:
                    pygame.draw.rect(surf, (180, 140, 90), rect)
                    pygame.draw.rect(surf, (120, 90, 50), rect, 1)
        for p in self.players:
            if not p.alive:
                continue
            sx, sy = int(p.x), int(p.y)
            pygame.draw.ellipse(surf, p.color, (sx - 16, sy - 30, 32, 32))
            pygame.draw.circle(surf, (40, 40, 40), (sx - 5, sy - 18), 3)
            pygame.draw.circle(surf, (40, 40, 40), (sx + 5, sy - 18), 3)
        if not self.game_over:
            cur = self.current()
            if cur.alive:
                self._draw_launch_angle_arrow(surf, cur)
        for pr in self.projectiles:
            pygame.draw.circle(surf, (40, 40, 40), (int(pr.x), int(pr.y)), 5)
        for ex in self.explosions:
            x, y, t, r = ex
            alpha = int(255 * min(1.0, t / 0.35))
            s = pygame.Surface((int(r * 2.4), int(r * 2.4)), pygame.SRCALPHA)
            pygame.draw.circle(s, (255, 200, 80, alpha), (int(r * 1.2), int(r * 1.2)), int(r * 1.1))
            surf.blit(s, (int(x - r * 1.2), int(y - r * 1.2)))
        for ft in self.float_texts:
            te = self.font.render(ft.text, True, ft.color)
            surf.blit(te, (int(ft.x - te.get_width() // 2), int(ft.y)))
        self.screen.blit(surf, (-int(self.camera_x), 0))

    def draw_ui(self) -> None:
        pad = 8
        c = self.current()
        skill_x = W - UI_SKILL_PANEL_W - pad
        # 风力
        t = self.font.render(f"风力 本回合: {self.wind:+d}   上回合: {self.prev_wind:+d}", True, (20, 20, 20))
        self.screen.blit(t, (pad, pad))
        # 血量 / 怒气 / 体力
        y0 = 30
        for i, p in enumerate(self.players):
            label = "玩家" if p is self.p1 else "电脑"
            col = (200, 60, 60) if p is self.p1 else (60, 90, 200)
            hp_t = self.font.render(f"{label} HP {p.hp}/{HP_MAX}  怒 {p.rage}/{RAGE_MAX}  体 {p.stamina}", True, col)
            self.screen.blit(hp_t, (pad, y0 + i * 22))
        # 角度刻度条（左上，与场景内红箭头互补）
        yb = 78
        pygame.draw.rect(self.screen, (230, 230, 230), (pad, yb, 200, 14))
        la = int((c.last_angle / 90.0) * 200)
        pygame.draw.line(self.screen, (200, 200, 200), (pad + la, yb), (pad + la, yb + 14), 2)
        ca = int((c.angle_deg / 90.0) * 200)
        pygame.draw.line(self.screen, (255, 120, 40), (pad + ca, yb), (pad + ca, yb + 14), 3)
        self.screen.blit(self.font_small.render("角度刻度（灰=上回合，橙=当前；场景中红箭头为瞄准方向）", True, (60, 60, 60)), (pad, yb + 16))
        # 回合与操作提示
        turn_who = "你的回合" if self.human_turn else "电脑回合"
        tr = self.font.render(f"{turn_who}  剩余 {self.turn_timer:.1f}s", True, (10, 80, 10))
        self.screen.blit(tr, (W - 260, pad))
        hint_y = min(yb + 34, H - UI_PWR_H - UI_PWR_BOTTOM_PAD - 44)
        hint = self.font_small.render("←→或 A D 移动  ↑↓或 W S 调角度  空格蓄力松开射击", True, (50, 50, 50))
        self.screen.blit(hint, (pad, hint_y))
        # 小地图（右上，给右侧竖排技能让位）
        mm_w, mm_h = 120, 72
        mm_x, mm_y = W - mm_w - pad - UI_SKILL_PANEL_W - 4, 86
        pygame.draw.rect(self.screen, (255, 255, 255), (mm_x, mm_y, mm_w, mm_h))
        pygame.draw.rect(self.screen, (0, 0, 0), (mm_x, mm_y, mm_w, mm_h), 1)
        sx = mm_w / WORLD_W
        sy = mm_h / WORLD_H
        if self.p1.alive:
            pygame.draw.circle(self.screen, (255, 0, 0), (int(mm_x + self.p1.x * sx), int(mm_y + self.p1.y * sy)), 4)
        if self.p2.alive:
            pygame.draw.circle(self.screen, (0, 0, 255), (int(mm_x + self.p2.x * sx), int(mm_y + self.p2.y * sy)), 4)
        self.screen.blit(self.font_small.render("小地图", True, (30, 30, 30)), (mm_x + 4, mm_y + mm_h - 16))
        # 右侧竖排：技能 / 必杀 / 道具槽
        col_y = mm_y + mm_h + 8
        self.screen.blit(self.font_small.render("技能", True, (30, 30, 30)), (skill_x + 8, col_y - 18))
        slot_x = skill_x + 3
        sy0 = col_y

        def draw_skill_slot(y: int, title: str, sub: str, hotkey: str, bright: bool) -> None:
            bg = (248, 248, 252) if bright else (200, 200, 208)
            br = (120, 120, 130) if bright else (160, 160, 170)
            pygame.draw.rect(self.screen, bg, (slot_x, y, UI_SKILL_PANEL_W - 6, UI_SKILL_SLOT_H))
            pygame.draw.rect(self.screen, br, (slot_x, y, UI_SKILL_PANEL_W - 6, UI_SKILL_SLOT_H), 1)
            tc = (30, 30, 36) if bright else (110, 110, 118)
            self.screen.blit(self.font_small.render(title, True, tc), (slot_x + 4, y + 4))
            self.screen.blit(self.font_small.render(sub, True, tc), (slot_x + 4, y + 22))
            hk = self.font_small.render(hotkey, True, (90, 90, 100))
            self.screen.blit(hk, (slot_x + UI_SKILL_PANEL_W - 22, y + 4))

        rage_ready = self.p1.rage >= RAGE_MAX and self.human_turn and self.p1.alive
        draw_skill_slot(sy0, "必杀", "怒满释放", "B", rage_ready)
        sy0 += UI_SKILL_SLOT_H + UI_SKILL_GAP
        for i in range(3):
            s = self.slots_p1[i]
            has = s is not None
            draw_skill_slot(
                sy0,
                (s or "空")[:4] if s else "空槽",
                f"键 {i + 1}",
                str(i + 1),
                bool(has and self.human_turn and self.p1.alive),
            )
            sy0 += UI_SKILL_SLOT_H + UI_SKILL_GAP
        # 力度条：界面最下方通栏
        bar_top = H - UI_PWR_H - UI_PWR_BOTTOM_PAD
        bar_w = W - 2 * pad
        pygame.draw.rect(self.screen, (240, 236, 236), (pad, bar_top, bar_w, UI_PWR_H))
        pygame.draw.rect(self.screen, (100, 100, 110), (pad, bar_top, bar_w, UI_PWR_H), 1)
        lp_x = pad + int((c.last_power / 100.0) * bar_w)
        pygame.draw.line(self.screen, (255, 170, 170), (lp_x, bar_top + 3), (lp_x, bar_top + UI_PWR_H - 3), 3)
        cpow = self.power if c.is_human else c.last_power
        cp_x = pad + int((cpow / 100.0) * bar_w)
        pygame.draw.line(self.screen, (255, 90, 30), (cp_x, bar_top + 2), (cp_x, bar_top + UI_PWR_H - 2), 4)
        self.screen.blit(
            self.font_small.render("力度（浅竖线=上回合，橙=当前蓄力）按住空格蓄力，松开发射", True, (45, 45, 50)),
            (pad, bar_top - 16),
        )
        if self.skip_msg_t > 0 and self.skip_msg:
            overlay = self.font.render(self.skip_msg, True, (180, 30, 30))
            self.screen.blit(overlay, (W // 2 - overlay.get_width() // 2, H // 2 - 80))
        if self.game_over:
            box = pygame.Surface((420, 120), pygame.SRCALPHA)
            box.fill((0, 0, 0, 160))
            self.screen.blit(box, (W // 2 - 210, H // 2 - 60))
            go = self.font.render(self.winner_text, True, (255, 255, 200))
            self.screen.blit(go, (W // 2 - go.get_width() // 2, H // 2 - 40))
            self.screen.blit(self.font_small.render("R 重新开始  ESC 退出", True, (220, 220, 220)), (W // 2 - 100, H // 2 + 10))

    def handle_input(self, keys, events, dt: float) -> None:
        if self.game_over:
            for e in events:
                if e.type == pygame.KEYDOWN and e.key == pygame.K_r:
                    self.__init__()
            return
        # 仅玩家回合、无弹道时可移动/调角；用 human_turn 与 p1 明确判定
        if not self.projectiles and self.human_turn and self.p1.alive:
            c = self.p1
            ad = 88.0 * max(dt, 1.0 / FPS)
            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                self.try_move(-1, dt)
            if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                self.try_move(1, dt)
            if keys[pygame.K_UP] or keys[pygame.K_w]:
                c.angle_deg = max(0.0, c.angle_deg - ad)
            if keys[pygame.K_DOWN] or keys[pygame.K_s]:
                c.angle_deg = min(90.0, c.angle_deg + ad)
            for e in events:
                if e.type == pygame.KEYDOWN:
                    if e.key in (pygame.K_UP, pygame.K_w):
                        c.angle_deg = max(0.0, c.angle_deg - 12.0)
                    elif e.key in (pygame.K_DOWN, pygame.K_s):
                        c.angle_deg = min(90.0, c.angle_deg + 12.0)
                    elif e.key == pygame.K_b and c.rage >= RAGE_MAX:
                        self.fire(c, self.power if self.power > 5 else 60.0, 2.0, True)
                    elif e.key == pygame.K_1:
                        self.use_slot(0)
                    elif e.key == pygame.K_2:
                        self.use_slot(1)
                    elif e.key == pygame.K_3:
                        self.use_slot(2)
                    elif e.key == pygame.K_SPACE:
                        self.power_hold = True
                elif e.type == pygame.KEYUP and e.key == pygame.K_SPACE and self.power_hold:
                    self.power_hold = False
                    if self.human_turn:
                        mul = self._next_dmg_mul
                        self._next_dmg_mul = 1.0
                        self.fire(c, max(5.0, self.power), mul, False)
            if self.power_hold:
                self.power += 2.8 * self.power_dir
                if self.power >= 100:
                    self.power = 100
                    self.power_dir = -1
                elif self.power <= 0:
                    self.power = 0
                    self.power_dir = 1

    def use_slot(self, idx: int) -> None:
        if not self.human_turn or self.props_used_this_turn or self.projectiles:
            return
        s = self.slots_p1[idx] if 0 <= idx < 3 else None
        if not s:
            return
        c = self.p1
        if s == "激怒":
            c.rage = min(RAGE_MAX, c.rage + 50)
            self.slots_p1[idx] = None
            self.props_used_this_turn = True
        elif s == "增幅弹":
            # 下一发伤害 *1.5：用临时标记
            self._next_dmg_mul = 1.5
            self.slots_p1[idx] = None
            self.props_used_this_turn = True

    def run(self) -> None:
        self.start_turn()
        running = True
        while running:
            dt = self.clock.tick(FPS) / 1000.0
            events = pygame.event.get()
            for e in events:
                if e.type == pygame.QUIT:
                    running = False
                if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
                    running = False
            keys = pygame.key.get_pressed()
            self.handle_input(keys, events, dt)
            self.update(dt)
            self.screen.fill((200, 210, 220))
            self.draw_world()
            self.draw_ui()
            pygame.display.flip()
        pygame.quit()


def main() -> None:
    Game().run()


if __name__ == "__main__":
    main()
