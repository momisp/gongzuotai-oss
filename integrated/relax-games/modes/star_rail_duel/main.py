# -*- coding: utf-8 -*-
"""
模式四 · 星铁双球对决

方形场地内仅两球，各自覆盖一名星穹铁道角色。开局向不同方向弹跳，
对手进入前方攻击范围时按角色攻防/技能/被动结算伤害；一方 HP 归零则结束。

数据来源：Mar-7th/StarRailRes（本地 data/characters.json）。
操作：菜单选人开打；C 或「角色图鉴」查看技能/被动/命座；对战中 R 重置 ESC 回菜单。
"""

from __future__ import annotations

import json
import math
import random
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import pygame

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "characters.json"
MATCH_HISTORY_PATH = ROOT / "data" / "match_history.json"
PORTRAIT_DIR = ROOT / "assets" / "portraits"
FX_PARTICLE_DIR = ROOT / "assets" / "fx" / "kenney_particles" / "PNG (Transparent)"
FX_SHEET_DIR = ROOT / "assets" / "fx" / "pixel_effects"
UI_SCIFI_DIR = ROOT / "assets" / "ui" / "kenney_scifi" / "PNG" / "Blue" / "Default"
SFX_DIR = ROOT / "assets" / "sfx"
PIXEL_FX_FRAME = 100
SFX_VOLUME = 0.42

WIDTH, HEIGHT = 980, 720
FPS = 60
ARENA_SIZE = 440
ARENA_RECT = pygame.Rect((WIDTH - ARENA_SIZE) // 2, 168, ARENA_SIZE, ARENA_SIZE)
BALL_RADIUS = 36
HUD_PANEL_Y = 6
HUD_PANEL_H = 128
LOG_PANEL_H = 72
HINT_Y = HEIGHT - 28
BALL_SPEED_MIN = 110.0
BALL_SPEED_MAX = 190.0
SPEED_STAT_SCALE = 2.0
SPEED_STAT_OFFSET = -45.0
HIT_COOLDOWN_MS = 1000
ATTACK_CONE_DEG = 90.0
ATTACK_CONE_RANGE = 150
HIT_STOP_MS = 2000
ATTACK_POSE_MS = 2000
PORTRAIT_SHOWCASE_MS = 2000
PORTRAIT_SHOWCASE_SIZE = 160
ULTIMATE_HIT_STOP_MS = 2000
IDLE_SPEEDUP_SEC = 15.0
IDLE_STEER_SEC = 25.0
DECISIVE_SEC = 120.0
DECISIVE_DAMAGE_MULT = 1.5
DAMAGE_SCALE = 0.15
ATTACK_TRAVEL_RATIO = 0.5
MATCH_HISTORY_LIMIT = 30
HOOK_RADIUS = 12
HOOK_SPEED = 240.0
HOOK_REEL_SPEED = 300.0
HOOK_SKILL_SEC = 4.0
HOOK_ULT_SEC = 8.0
HOOK_DAMAGE_PER_SEC_MULT = 1.8
HOOK_DAMAGE_TICK_SEC = 0.25
HOOK_INFINITE_AFTER = 3
HOOK_INFINITE_CHANCE = 0.02

COL_BG = (16, 18, 28)
COL_ARENA = (28, 32, 48)
COL_RING = (140, 200, 230)
COL_PANEL = (246, 246, 250)
COL_TEXT = (22, 22, 28)
COL_SUB = (90, 92, 100)
COL_HINT = (170, 180, 200)
COL_DMG = (255, 120, 100)
COL_HEAL = (120, 220, 160)


def _load_cjk_font(size: int, bold: bool = False) -> pygame.font.Font:
    import os
    from pathlib import Path as _P

    wind = _P(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    files = (
        [wind / "msyhbd.ttc", wind / "msyh.ttc", wind / "simhei.ttf", wind / "arialbd.ttf"]
        if bold
        else [wind / "msyh.ttc", wind / "simhei.ttf", wind / "arial.ttf", wind / "simsun.ttc"]
    )
    for p in files:
        try:
            if p.is_file():
                return pygame.font.Font(str(p), size)
        except Exception:
            pass
    for name in ("microsoftyahei", "微软雅黑", "simhei", "arial"):
        try:
            return pygame.font.SysFont(name, size, bold=bold)
        except Exception:
            pass
    return pygame.font.Font(None, size)


def load_game_data() -> Tuple[List[dict], dict]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    characters = list(data.get("characters") or [])
    progression = dict(data.get("progression") or {})
    stages = list(progression.get("stages") or [])
    if len(characters) < 2:
        raise ValueError("characters.json 至少需要两名角色")
    if not stages or float(stages[0].get("threshold", -1)) != 0:
        raise ValueError("progression.stages 必须从 threshold=0 开始")
    progression["stages"] = sorted(stages, key=lambda item: float(item["threshold"]))
    return characters, progression


def append_match_history(record: dict) -> None:
    """保存最近对局；记录失败不影响游戏。"""
    try:
        if MATCH_HISTORY_PATH.is_file():
            payload = json.loads(MATCH_HISTORY_PATH.read_text(encoding="utf-8"))
        else:
            payload = {"version": 1, "matches": []}
        matches = list(payload.get("matches") or [])
        matches.append(record)
        payload["version"] = 2
        payload["matches"] = matches[-MATCH_HISTORY_LIMIT:]
        temp_path = MATCH_HISTORY_PATH.with_suffix(".tmp")
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temp_path.replace(MATCH_HISTORY_PATH)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass


def kit_color(ch: dict) -> Tuple[int, int, int]:
    c = (ch.get("kit") or {}).get("color") or [180, 180, 200]
    return int(c[0]), int(c[1]), int(c[2])


@dataclass
class FloatingText:
    x: float
    y: float
    text: str
    color: Tuple[int, int, int]
    life: float = 2.0
    vy: float = -40.0


@dataclass
class Particle:
    x: float
    y: float
    vx: float
    vy: float
    color: Tuple[int, int, int]
    life: float
    max_life: float
    size: float


@dataclass
class CombatEffect:
    kind: str
    x: float
    y: float
    tx: float
    ty: float
    color: Tuple[int, int, int]
    life: float
    max_life: float
    power: float = 1.0
    seed: int = 0
    delay: float = 0.0


@dataclass
class SkillBanner:
    text: str
    color: Tuple[int, int, int]
    x: int
    life: float = 2.0
    max_life: float = 2.0


@dataclass
class Fighter:
    char: dict
    progression: dict
    x: float
    y: float
    vx: float
    vy: float
    hp: float
    max_hp: float
    atk: float
    base_max_hp: float
    base_atk: float
    base_move_speed: float
    energy: float = 0.0
    skill_points: int = 0
    max_skill_points: int = 3
    hit_cd_until: int = 0
    collide_count: int = 0
    evolution: float = 0.0
    stage_index: int = 0
    speed_mult: float = 1.0
    idle_speed_mult: float = 1.0
    damage_mult: float = 1.0
    unlocked_eidolon: Optional[int] = None
    unlocked_light_cone: Optional[str] = None
    attack_until_ms: int = 0
    portrait_showcase_until_ms: int = 0
    seele_speed_attacks_left: int = 0
    seele_amplified_attacks_left: int = 0
    seele_resurgence_used: bool = False
    clara_counter_charges: int = 0
    counter_marked: bool = False
    lightning_lord_hits: int = 3
    lightning_lord_progress: float = 0.0
    hook_release_count: int = 0
    shield_hp: float = 0.0
    shield_fortify_stacks: int = 0
    petrified_until_ms: int = 0
    raiden_resolve: float = 0.0
    raiden_eye_attacks_left: int = 0
    raiden_burst_attacks_left: int = 0
    ellen_flash_freeze: int = 0
    jane_passion: float = 0.0
    jane_fanatic_attacks_left: int = 0
    jane_salchow_ready: bool = False
    panacea_feather: int = 0
    panacea_weapon_hits_left: int = 0
    xentinel_spirit: int = 0
    damage_dealt: float = 0.0
    damage_taken: float = 0.0
    action_counts: dict[str, int] = field(default_factory=dict)
    trail: List[Tuple[float, float]] = field(default_factory=list)

    @property
    def name(self) -> str:
        return str(self.char.get("name") or "?")

    @property
    def color(self) -> Tuple[int, int, int]:
        return kit_color(self.char)

    def kit(self) -> dict:
        return self.char.get("kit") or {}

    def stages(self) -> List[dict]:
        return list(self.progression.get("stages") or [])

    def state_name(self) -> str:
        names = list(self.char.get("state_names") or [])
        if self.stage_index < len(names):
            return str(names[self.stage_index])
        return f"阶段 {self.stage_index + 1}"

    def next_threshold(self) -> Optional[float]:
        stages = self.stages()
        if self.stage_index + 1 >= len(stages):
            return None
        return float(stages[self.stage_index + 1]["threshold"])

    def is_attacking(self, now_ms: int) -> bool:
        return now_ms < self.attack_until_ms

    def combat_speed_mult(self) -> float:
        if self.char.get("tag") == "seele" and self.seele_speed_attacks_left > 0:
            return 1.25
        if self.char.get("tag") == "ellen" and self.ellen_flash_freeze > 0:
            return 1.12
        if self.char.get("tag") == "jane" and self.jane_fanatic_attacks_left > 0:
            return 1.18
        return 1.0


@dataclass
class HookProjectile:
    owner: Fighter
    target: Fighter
    x: float
    y: float
    vx: float
    vy: float
    outbound_left: float
    infinite: bool
    saved_owner_vx: float
    saved_owner_vy: float
    phase: str = "outbound"
    attached: bool = False
    path: List[Tuple[float, float]] = field(default_factory=list)
    reel_index: int = -1
    damage_tick_accum: float = 0.0
    damage_total: float = 0.0
    damage_reduction: float = 1.0
    damage_started: bool = False
    finished: bool = False


def clamp_speed(f: Fighter) -> None:
    s = math.hypot(f.vx, f.vy)
    target_speed = (
        f.base_move_speed * f.speed_mult * f.idle_speed_mult * f.combat_speed_mult()
    )
    if s < 1e-9:
        ang = random.uniform(0, 2 * math.pi)
        f.vx = math.cos(ang) * target_speed
        f.vy = math.sin(ang) * target_speed
        return
    k = target_speed / s
    f.vx *= k
    f.vy *= k


def advance_evolution(f: Fighter, amount: float) -> List[str]:
    """增加进化值并应用跨过的阶段，返回本次解锁的状态名。"""
    f.evolution = max(0.0, f.evolution + amount)
    stages = f.stages()
    unlocked: List[str] = []
    while f.stage_index + 1 < len(stages):
        next_index = f.stage_index + 1
        stage = stages[next_index]
        if f.evolution < float(stage["threshold"]):
            break

        old_max_hp = f.max_hp
        old_speed_mult = f.speed_mult
        f.stage_index = next_index
        f.max_hp = f.base_max_hp * float(stage.get("hp_mult", 1.0))
        f.hp = min(f.max_hp, f.hp + max(0.0, f.max_hp - old_max_hp))
        f.atk = f.base_atk * float(stage.get("attack_mult", 1.0))
        f.speed_mult = float(stage.get("speed_mult", 1.0))
        f.damage_mult = float(stage.get("damage_mult", 1.0))

        if old_speed_mult > 0:
            speed_scale = f.speed_mult / old_speed_mult
            f.vx *= speed_scale
            f.vy *= speed_scale

        ult_need = float(f.kit().get("ult_need") or 100)
        f.energy = min(ult_need, f.energy + float(stage.get("energy_bonus", 0)))
        slots = dict(stage.get("unlock_slots") or {})
        if slots.get("eidolon") is not None:
            f.unlocked_eidolon = int(slots["eidolon"])
        if slots.get("light_cone") is not None:
            f.unlocked_light_cone = str(slots["light_cone"])
        unlocked.append(f.state_name())
    return unlocked


def apply_idle_motion(f: Fighter, target: Fighter, idle_sec: float, dt: float) -> None:
    """长时间未碰撞时提速，并逐步引导双方在场地中心汇合。"""
    if idle_sec <= IDLE_SPEEDUP_SEC:
        f.idle_speed_mult = 1.0
        return
    speed = math.hypot(f.vx, f.vy) or 1.0
    f.idle_speed_mult = min(1.3, 1.0 + (idle_sec - IDLE_SPEEDUP_SEC) * 0.012)
    target_speed = (
        f.base_move_speed * f.speed_mult * f.idle_speed_mult * f.combat_speed_mult()
    )
    f.vx *= target_speed / speed
    f.vy *= target_speed / speed

    if idle_sec <= IDLE_STEER_SEC:
        return
    # 从追当前位置逐渐切换为汇合中心，避免速度较慢的一方长期尾追。
    center_weight = min(0.82, (idle_sec - IDLE_STEER_SEC) / 18.0)
    aim_x = target.x * (1.0 - center_weight) + ARENA_RECT.centerx * center_weight
    aim_y = target.y * (1.0 - center_weight) + ARENA_RECT.centery * center_weight
    dx, dy = aim_x - f.x, aim_y - f.y
    current_angle = math.atan2(f.vy, f.vx)
    target_angle = math.atan2(dy, dx)
    angle_delta = (target_angle - current_angle + math.pi) % (2 * math.pi) - math.pi
    max_turn = (0.55 + center_weight * 0.9) * dt
    turn = max(-max_turn, min(max_turn, angle_delta))
    new_angle = current_angle + turn
    f.vx = math.cos(new_angle) * target_speed
    f.vy = math.sin(new_angle) * target_speed


def reflect_square(f: Fighter, arena: pygame.Rect, r: float) -> None:
    """在正方形内反射，角落同时处理水平和垂直方向。"""
    left = arena.left + r
    right = arena.right - r
    top = arena.top + r
    bottom = arena.bottom - r
    if f.x < left:
        f.x = left
        f.vx = abs(f.vx)
    elif f.x > right:
        f.x = right
        f.vx = -abs(f.vx)
    if f.y < top:
        f.y = top
        f.vy = abs(f.vy)
    elif f.y > bottom:
        f.y = bottom
        f.vy = -abs(f.vy)


def resolve_bounce(a: Fighter, b: Fighter, r: float) -> bool:
    """弹性分离；返回是否真正发生相对接近碰撞。"""
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
        return False
    j = -rel_n
    a.vx -= j * nx
    a.vy -= j * ny
    b.vx += j * nx
    b.vy += j * ny
    return True


def target_in_attack_cone(
    attacker: Fighter,
    target: Fighter,
    cone_deg: float = ATTACK_CONE_DEG,
    attack_range: float = ATTACK_CONE_RANGE,
) -> bool:
    """目标球体是否进入攻击者前方指定扇区。"""
    speed = math.hypot(attacker.vx, attacker.vy)
    distance = math.hypot(target.x - attacker.x, target.y - attacker.y)
    if distance > attack_range + BALL_RADIUS:
        return False
    if speed < 1e-9 or distance < 1e-9:
        return True
    facing_x, facing_y = attacker.vx / speed, attacker.vy / speed
    target_x = (target.x - attacker.x) / distance
    target_y = (target.y - attacker.y) / distance
    threshold = math.cos(math.radians(cone_deg / 2.0))
    return facing_x * target_x + facing_y * target_y >= threshold


def attack_center_offset_deg(attacker: Fighter, target: Fighter) -> float:
    """目标越靠近前进方向中心线，返回的夹角越小。"""
    speed = math.hypot(attacker.vx, attacker.vy)
    distance = math.hypot(target.x - attacker.x, target.y - attacker.y)
    if speed < 1e-9 or distance < 1e-9:
        return 180.0
    dot = (
        attacker.vx * (target.x - attacker.x)
        + attacker.vy * (target.y - attacker.y)
    ) / (speed * distance)
    return math.degrees(math.acos(max(-1.0, min(1.0, dot))))


def movement_speed_from_stat(speed_stat: float) -> float:
    """将角色速度面板映射为像素/秒，保持角色之间的固定速度差。"""
    return max(BALL_SPEED_MIN, min(BALL_SPEED_MAX, speed_stat * SPEED_STAT_SCALE + SPEED_STAT_OFFSET))


def make_fighter(ch: dict, progression: dict, x: float, y: float, angle: float) -> Fighter:
    spd = movement_speed_from_stat(float(ch.get("base_spd") or 100))
    return Fighter(
        char=ch,
        progression=progression,
        x=x,
        y=y,
        vx=math.cos(angle) * spd,
        vy=math.sin(angle) * spd,
        hp=float(ch["base_hp"]),
        max_hp=float(ch["base_hp"]),
        atk=float(ch["base_atk"]),
        base_max_hp=float(ch["base_hp"]),
        base_atk=float(ch["base_atk"]),
        base_move_speed=spd,
        energy=0.0,
    )


def gain_energy(fighter: Fighter, amount: float) -> None:
    limit = float(fighter.kit().get("ult_need") or 100)
    fighter.energy = min(limit, fighter.energy + amount)


def perform_action(
    attacker: Fighter,
    defender: Fighter,
    decisive_mult: float = 1.0,
) -> Tuple[float, str, str]:
    """选择并执行普攻/战技/攻击型终结技，返回伤害、名称、类型。"""
    tag = str(attacker.char.get("tag") or "")
    ult_ready = attacker.energy >= float(attacker.kit().get("ult_need") or 100)
    had_speed_buff = attacker.seele_speed_attacks_left > 0
    had_amp = attacker.seele_amplified_attacks_left > 0
    jane_was_fanatic = attacker.jane_fanatic_attacks_left > 0
    action = "basic"
    label = "普攻"
    mult = 1.0

    if tag == "seele":
        if ult_ready:
            action, label, mult = "ultimate", "乱蝶", 4.25
            attacker.energy = 0.0
            attacker.seele_amplified_attacks_left = 2
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "归刃", 2.2
            attacker.skill_points -= 1
            attacker.seele_speed_attacks_left = 2
            gain_energy(attacker, 30)
        else:
            label = "强袭"
    elif tag == "clara":
        marked = defender.counter_marked
        if attacker.skill_points > 0 and (marked or attacker.skill_points >= 3):
            action, label, mult = "skill", "史瓦罗在看着你", 1.2
            attacker.skill_points -= 1
            gain_energy(attacker, 30)
            if marked:
                mult += 1.2
                label += "+反击标记"
                defender.counter_marked = False
        else:
            label = "我也想帮上忙"
    elif tag == "jingyuan":
        if ult_ready:
            action, label, mult = "ultimate", "吾身光明", 2.4
            attacker.energy = 0.0
            attacker.lightning_lord_hits = min(10, attacker.lightning_lord_hits + 3)
        elif attacker.skill_points > 0 and attacker.lightning_lord_hits < 10:
            action, label, mult = "skill", "紫霄震曜", 1.2
            attacker.skill_points -= 1
            attacker.lightning_lord_hits = min(10, attacker.lightning_lord_hits + 2)
            gain_energy(attacker, 30)
        else:
            label = "石火流光"
    elif tag == "hook":
        if ult_ready:
            action, label, mult = "ultimate", "深海长线", 0.0
            attacker.energy = 0.0
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "弹跳鱼线", 0.0
            attacker.skill_points -= 1
            gain_energy(attacker, 30)
        else:
            label = "甩钩"
    elif tag == "zhongli":
        if ult_ready:
            action, label, mult = "ultimate", "天星", 3.3
            attacker.energy = 0.0
            attacker.shield_hp = max(
                attacker.shield_hp,
                attacker.max_hp * 0.28 + attacker.atk * 0.45,
            )
            attacker.shield_fortify_stacks = 0
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "地心·玉璋护盾", 0.8
            attacker.skill_points -= 1
            attacker.shield_hp = max(
                attacker.shield_hp,
                attacker.max_hp * 0.28 + attacker.atk * 0.45,
            )
            attacker.shield_fortify_stacks = 0
            gain_energy(attacker, 30)
        else:
            label = "岩雨"
    elif tag == "raiden":
        had_eye = attacker.raiden_eye_attacks_left > 0
        if ult_ready:
            action, label = "ultimate", "奥义·梦想真说"
            mult = 2.8 + attacker.raiden_resolve * 0.25
            attacker.energy = 0.0
            attacker.raiden_resolve = 0.0
            attacker.raiden_burst_attacks_left = 3
        elif attacker.skill_points > 0 and attacker.raiden_eye_attacks_left <= 1:
            action, label, mult = "skill", "神变·恶曜开眼", 1.2
            attacker.skill_points -= 1
            attacker.raiden_eye_attacks_left = 4
            attacker.raiden_resolve = min(6.0, attacker.raiden_resolve + 1.5)
            gain_energy(attacker, 30)
        else:
            label = "源流"
            attacker.raiden_resolve = min(6.0, attacker.raiden_resolve + 0.75)
        if had_eye:
            mult += 0.45
            label += "+雷眼"
            attacker.raiden_eye_attacks_left -= 1
        if action != "ultimate" and attacker.raiden_burst_attacks_left > 0:
            mult += 0.6
            label += "+梦想一心"
            attacker.raiden_burst_attacks_left -= 1
            gain_energy(attacker, 8)
    elif tag == "ellen":
        if ult_ready:
            action, label, mult = "ultimate", "永冬狂宴", 4.0
            attacker.energy = 0.0
            attacker.ellen_flash_freeze = 6
        elif attacker.skill_points > 0 and attacker.ellen_flash_freeze <= 3:
            action, label, mult = "skill", "强化特殊技·鲨卷风", 1.75
            attacker.skill_points -= 1
            attacker.ellen_flash_freeze = min(6, attacker.ellen_flash_freeze + 3)
            gain_energy(attacker, 30)
        elif attacker.ellen_flash_freeze > 0:
            label, mult = "急冻修剪法", 1.45
            attacker.ellen_flash_freeze -= 1
        else:
            label = "利齿修剪法"
    elif tag == "jane":
        if ult_ready:
            action, label, mult = "ultimate", "终幕演出", 3.6
            attacker.energy = 0.0
            attacker.jane_passion = 100.0
            attacker.jane_fanatic_attacks_left = 4
            attacker.jane_salchow_ready = True
        elif attacker.jane_salchow_ready:
            action, label, mult = "passive", "萨霍夫跳", 2.2
            attacker.jane_salchow_ready = False
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "强化特殊技·空翻", 1.6
            attacker.skill_points -= 1
            if not jane_was_fanatic:
                attacker.jane_passion = min(100.0, attacker.jane_passion + 35.0)
            gain_energy(attacker, 30)
        else:
            label = "跳步刃舞"
            if not jane_was_fanatic:
                attacker.jane_passion = min(100.0, attacker.jane_passion + 20.0)
        if (
            action != "ultimate"
            and attacker.jane_passion >= 100.0
            and attacker.jane_fanatic_attacks_left <= 0
        ):
            attacker.jane_fanatic_attacks_left = 4
            attacker.jane_salchow_ready = True
    elif tag == "panacea_seele":
        if ult_ready:
            action, label, mult = "ultimate", "蕊海新生", 3.6
            attacker.energy = 0.0
            attacker.panacea_feather = min(300, attacker.panacea_feather + 150)
        elif attacker.panacea_weapon_hits_left > 0:
            sequence = (
                ("飞漾涤痕", 1.65),
                ("抚羽归巢", 1.35),
                ("翩落流影", 1.15),
            )
            label, mult = sequence[attacker.panacea_weapon_hits_left - 1]
            action = "passive"
            attacker.panacea_weapon_hits_left -= 1
            if attacker.panacea_weapon_hits_left == 0:
                attacker.hp = min(attacker.max_hp, attacker.hp + attacker.max_hp * 0.08)
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "羽落云坠", 1.7
            attacker.skill_points -= 1
            attacker.panacea_feather = min(300, attacker.panacea_feather + 150)
            gain_energy(attacker, 30)
        else:
            label = "澈羽连击"
            attacker.panacea_feather = min(300, attacker.panacea_feather + 75)
        if attacker.panacea_feather >= 300:
            attacker.panacea_feather = 0
            attacker.panacea_weapon_hits_left = 3
    elif tag == "xentinel_mei":
        if attacker.xentinel_spirit >= 2:
            action, label, mult = "passive", "镇岁斩", 3.5
            attacker.xentinel_spirit = 0
        elif ult_ready:
            action = "ultimate"
            if attacker.xentinel_spirit == 0:
                label, mult = "恒佑之刃", 2.2
            else:
                label, mult = "逐光之刃", 2.8
            attacker.energy = 0.0
            attacker.xentinel_spirit = min(2, attacker.xentinel_spirit + 1)
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "晦夜麟光", 1.45
            attacker.skill_points -= 1
            gain_energy(attacker, 35)
        else:
            label = "偃月三连"
            gain_energy(attacker, 10)
    else:
        if ult_ready:
            action, label, mult = "ultimate", "终结技", 3.0
            attacker.energy = 0.0
        elif attacker.skill_points > 0:
            action, label, mult = "skill", "战技", 2.0
            attacker.skill_points -= 1
            gain_energy(attacker, 30)

    if action == "basic":
        attacker.skill_points = min(attacker.max_skill_points, attacker.skill_points + 1)
        gain_energy(attacker, 20)

    final_mult = decisive_mult
    if tag == "seele":
        if action == "ultimate":
            final_mult *= 1.4
        elif had_amp:
            final_mult *= 1.4
            attacker.seele_amplified_attacks_left -= 1
        if had_speed_buff and action != "skill":
            attacker.seele_speed_attacks_left -= 1
    elif tag == "zhongli" and attacker.shield_hp > 0:
        final_mult *= 1.10
    elif tag == "jane" and jane_was_fanatic and action != "ultimate":
        final_mult *= 1.25
        attacker.jane_fanatic_attacks_left -= 1
        attacker.jane_passion = max(0.0, attacker.jane_passion - 25.0)
        if attacker.jane_fanatic_attacks_left <= 0:
            attacker.jane_passion = 0.0
            attacker.jane_salchow_ready = False

    damage = attacker.atk * mult * DAMAGE_SCALE * attacker.damage_mult * final_mult
    if tag == "hook" and action != "basic":
        return 0.0, label, action
    return max(1.0, damage), label, action


def resolve_clara_response(
    defender: Fighter,
    attacker: Fighter,
    direct_damage: float,
    decisive_mult: float = 1.0,
) -> Tuple[float, float, str]:
    """克拉拉仅在被直接攻击时减伤并反击。"""
    if defender.char.get("tag") != "clara" or direct_damage <= 0:
        return direct_damage, 0.0, ""
    if defender.clara_counter_charges > 0:
        defender.clara_counter_charges -= 1
        direct_damage *= 0.70
        counter_mult = 1.60
        label = "强化反击"
    else:
        direct_damage *= 0.90
        counter_mult = 0.60
        label = "史瓦罗反击"
    attacker.counter_marked = True
    counter_damage = (
        defender.atk * counter_mult * DAMAGE_SCALE * defender.damage_mult * decisive_mult
    )
    return direct_damage, counter_damage, label


def absorb_shield_damage(defender: Fighter, direct_damage: float) -> Tuple[float, float]:
    """玉璋护盾优先吸收直接伤害，并在受击后强化。"""
    if defender.shield_hp <= 0 or direct_damage <= 0:
        return direct_damage, 0.0
    strength = 1.0 + defender.shield_fortify_stacks * 0.05
    absorbed = min(direct_damage, defender.shield_hp * strength)
    defender.shield_hp = max(0.0, defender.shield_hp - absorbed / strength)
    if defender.shield_hp > 0:
        defender.shield_fortify_stacks = min(5, defender.shield_fortify_stacks + 1)
    else:
        defender.shield_fortify_stacks = 0
    return direct_damage - absorbed, absorbed


# ---------- UI helpers ----------

def load_alpha_image(path: Path) -> Optional[pygame.Surface]:
    try:
        if path.is_file():
            return pygame.image.load(str(path)).convert_alpha()
    except (OSError, pygame.error):
        return None
    return None


def slice_spritesheet(
    sheet: pygame.Surface,
    frame: int = PIXEL_FX_FRAME,
) -> List[pygame.Surface]:
    frames: List[pygame.Surface] = []
    w, h = sheet.get_size()
    cols, rows = max(1, w // frame), max(1, h // frame)
    for row in range(rows):
        for col in range(cols):
            rect = pygame.Rect(col * frame, row * frame, frame, frame)
            cell = sheet.subsurface(rect).copy()
            if cell.get_bounding_rect().width <= 2:
                continue
            frames.append(cell)
    return frames


def tint_surface(
    source: pygame.Surface,
    color: Tuple[int, int, int],
    alpha: int = 255,
) -> pygame.Surface:
    tinted = source.copy()
    tinted.fill((*color, 255), special_flags=pygame.BLEND_RGBA_MULT)
    if alpha < 255:
        tinted.set_alpha(max(0, min(255, alpha)))
    return tinted


def blit_centered(
    dest: pygame.Surface,
    source: pygame.Surface,
    x: float,
    y: float,
    scale: float = 1.0,
    angle_deg: float = 0.0,
) -> None:
    img = source
    if abs(scale - 1.0) > 1e-3:
        size = (
            max(1, int(source.get_width() * scale)),
            max(1, int(source.get_height() * scale)),
        )
        img = pygame.transform.smoothscale(source, size)
    if abs(angle_deg) > 1e-3:
        img = pygame.transform.rotate(img, -angle_deg)
    dest.blit(img, img.get_rect(center=(int(x), int(y))))


class SfxBank:
    """Kenney CC0 音效库；无设备或缺文件时静默降级。"""

    def __init__(self) -> None:
        self.enabled = False
        self.muted = False
        self.sounds: dict[str, List[pygame.mixer.Sound]] = {}
        try:
            if pygame.mixer.get_init() is None:
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            pygame.mixer.set_num_channels(16)
            self.enabled = True
        except pygame.error:
            self.enabled = False
            return
        packs = {
            "attack_basic": [
                "kenney_digital/Audio/laser1.ogg",
                "kenney_digital/Audio/laser2.ogg",
                "kenney_digital/Audio/laser3.ogg",
            ],
            "attack_skill": [
                "kenney_digital/Audio/laser5.ogg",
                "kenney_digital/Audio/phaseJump1.ogg",
                "kenney_digital/Audio/phaseJump2.ogg",
            ],
            "attack_ultimate": [
                "kenney_digital/Audio/laser9.ogg",
                "kenney_digital/Audio/powerUp7.ogg",
                "kenney_digital/Audio/powerUp8.ogg",
            ],
            "hit": [
                "kenney_impact/Audio/impactPunch_medium_000.ogg",
                "kenney_impact/Audio/impactPunch_medium_001.ogg",
                "kenney_impact/Audio/impactGeneric_light_000.ogg",
            ],
            "hit_heavy": [
                "kenney_impact/Audio/impactPunch_heavy_000.ogg",
                "kenney_impact/Audio/impactMetal_heavy_000.ogg",
                "kenney_impact/Audio/impactPlate_heavy_000.ogg",
            ],
            "counter": [
                "kenney_impact/Audio/impactMetal_light_000.ogg",
                "kenney_impact/Audio/impactMetal_light_001.ogg",
                "kenney_impact/Audio/impactPlate_light_000.ogg",
            ],
            "skill": [
                "kenney_interface/Audio/select_002.ogg",
                "kenney_interface/Audio/glass_002.ogg",
            ],
            "evolve": [
                "kenney_digital/Audio/powerUp4.ogg",
                "kenney_interface/Audio/maximize_002.ogg",
            ],
            "victory": [
                "kenney_interface/Audio/confirmation_001.ogg",
                "kenney_digital/Audio/highUp.ogg",
            ],
            "defeat": [
                "kenney_digital/Audio/lowThreeTone.ogg",
                "kenney_interface/Audio/minimize_002.ogg",
            ],
            "ui": [
                "kenney_interface/Audio/click_002.ogg",
                "kenney_interface/Audio/click_003.ogg",
            ],
            "start": [
                "kenney_interface/Audio/open_001.ogg",
                "kenney_interface/Audio/maximize_001.ogg",
            ],
        }
        for key, rels in packs.items():
            loaded: List[pygame.mixer.Sound] = []
            for rel in rels:
                path = SFX_DIR / rel
                if not path.is_file():
                    continue
                try:
                    sound = pygame.mixer.Sound(str(path))
                    sound.set_volume(SFX_VOLUME)
                    loaded.append(sound)
                except pygame.error:
                    continue
            if loaded:
                self.sounds[key] = loaded

    def play(self, key: str, volume: Optional[float] = None) -> None:
        if not self.enabled or self.muted:
            return
        bank = self.sounds.get(key)
        if not bank:
            return
        sound = random.choice(bank)
        if volume is not None:
            sound.set_volume(max(0.0, min(1.0, volume)))
        try:
            sound.play()
        except pygame.error:
            pass

    def toggle_mute(self) -> bool:
        self.muted = not self.muted
        return self.muted


def make_space_background(width: int, height: int) -> pygame.Surface:
    surf = pygame.Surface((width, height))
    top, bottom = (10, 14, 30), (24, 31, 55)
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        pygame.draw.line(surf, color, (0, y), (width, y))
    glow = pygame.Surface((width, height), pygame.SRCALPHA)
    pygame.draw.circle(glow, (55, 100, 180, 28), (width // 5, height // 3), 260)
    pygame.draw.circle(glow, (150, 70, 180, 20), (width * 4 // 5, height // 2), 230)
    surf.blit(glow, (0, 0))
    rng = random.Random(404)
    for _ in range(95):
        x, y = rng.randrange(width), rng.randrange(height)
        light = rng.randrange(90, 190)
        pygame.draw.circle(surf, (light, light + 20, min(255, light + 50)), (x, y), rng.choice((1, 1, 1, 2)))
    return surf


def draw_glass_panel(
    surf: pygame.Surface,
    rect: pygame.Rect,
    accent: Tuple[int, int, int],
    light: bool = False,
    corners: str = "all",
) -> None:
    shadow = pygame.Surface((rect.w + 16, rect.h + 16), pygame.SRCALPHA)
    pygame.draw.rect(shadow, (0, 0, 0, 80), shadow.get_rect(), border_radius=12)
    surf.blit(shadow, (rect.x - 4, rect.y + 4))
    panel = pygame.Surface(rect.size, pygame.SRCALPHA)
    fill = (247, 249, 255, 238) if light else (15, 21, 40, 220)
    pygame.draw.rect(panel, fill, panel.get_rect(), border_radius=9)
    pygame.draw.rect(panel, (*accent, 180), panel.get_rect(), 2, border_radius=9)
    pygame.draw.line(panel, (*accent, 230), (18, 1), (rect.w - 18, 1), 3)
    surf.blit(panel, rect.topleft)
    cut = 13
    corner_defs = {
        "tl": (rect.left, rect.top, 1, 1),
        "tr": (rect.right, rect.top, -1, 1),
        "bl": (rect.left, rect.bottom, 1, -1),
        "br": (rect.right, rect.bottom, -1, -1),
    }
    if corners == "all":
        chosen = corner_defs.values()
    elif corners == "top":
        chosen = (corner_defs["tl"], corner_defs["tr"])
    else:
        chosen = (corner_defs[name] for name in corners.split(",") if name in corner_defs)
    for x, y, sx, sy in chosen:
        pygame.draw.line(surf, accent, (x, y), (x + sx * cut, y), 3)
        pygame.draw.line(surf, accent, (x, y), (x, y + sy * cut), 3)


def draw_hp_bar(
    surf: pygame.Surface,
    x: int,
    y: int,
    w: int,
    h: int,
    ratio: float,
    color: Tuple[int, int, int],
) -> None:
    pygame.draw.rect(surf, (28, 32, 44), (x, y, w, h), border_radius=5)
    fill = max(0, int(w * max(0.0, min(1.0, ratio))))
    if fill > 0:
        pygame.draw.rect(surf, color, (x, y, fill, h), border_radius=5)
        # 上沿高光，让血条更有体积感（玩家一眼能分清空槽/已填）
        shine_h = max(1, h // 3)
        shine = pygame.Surface((fill, shine_h), pygame.SRCALPHA)
        shine.fill((255, 255, 255, 55))
        surf.blit(shine, (x, y + 1))
        # 低血量时偏暖警示
        if ratio <= 0.25:
            warn = pygame.Surface((fill, h), pygame.SRCALPHA)
            warn.fill((255, 70, 70, 50))
            surf.blit(warn, (x, y))
    pygame.draw.rect(surf, (210, 220, 235), (x, y, w, h), 1, border_radius=5)


def blit_outlined_text(
    surf: pygame.Surface,
    font: pygame.font.Font,
    text: str,
    color: Tuple[int, int, int],
    x: float,
    y: float,
    alpha: int = 255,
    outline: Tuple[int, int, int] = (8, 10, 18),
) -> None:
    """描边文字，保证在场地特效上仍可读。"""
    base = font.render(text, True, color)
    edge = font.render(text, True, outline)
    if alpha < 255:
        base.set_alpha(alpha)
        edge.set_alpha(alpha)
    ox, oy = int(x), int(y)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        surf.blit(edge, (ox + dx, oy + dy))
    surf.blit(base, (ox, oy))


def wrap_text(font: pygame.font.Font, text: str, max_w: int) -> List[str]:
    lines: List[str] = []
    for para in (text or "").replace("\n", " ").split(" "):
        # CJK：按字符硬折
        pass
    # 按字符折行更稳
    cur = ""
    for ch in text.replace("\n", " "):
        test = cur + ch
        if font.size(test)[0] <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines or [""]


def make_circle_portrait(source: pygame.Surface, size: int) -> pygame.Surface:
    scaled = pygame.transform.smoothscale(source, (size, size))
    mask = pygame.Surface((size, size), pygame.SRCALPHA)
    pygame.draw.circle(mask, (255, 255, 255, 255), (size // 2, size // 2), size // 2)
    scaled.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
    return scaled


def make_hook_art(size: int = 256) -> pygame.Surface:
    surf = pygame.Surface((size, size), pygame.SRCALPHA)
    center = size // 2
    pygame.draw.circle(surf, (20, 75, 95, 235), (center, center), center - 8)
    pygame.draw.circle(surf, (90, 220, 235, 255), (center, center), center - 10, 8)
    pygame.draw.line(
        surf,
        (225, 245, 245),
        (center - 58, center - 75),
        (center + 25, center + 5),
        10,
    )
    hook_box = pygame.Rect(center - 12, center - 5, 92, 105)
    pygame.draw.arc(surf, (235, 240, 245), hook_box, 0.15, math.pi * 1.6, 14)
    pygame.draw.polygon(
        surf,
        (235, 240, 245),
        [
            (center + 58, center + 42),
            (center + 86, center + 29),
            (center + 67, center + 62),
        ],
    )
    return surf


class App:
    def __init__(self) -> None:
        pygame.init()
        try:
            pygame.key.stop_text_input()
        except (AttributeError, pygame.error):
            pass
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("次元双球对决 · 模式四")
        self.clock = pygame.time.Clock()
        self.background = make_space_background(WIDTH, HEIGHT)
        self.sfx = SfxBank()
        self.font = _load_cjk_font(18, False)
        self.font_sm = _load_cjk_font(14, False)
        self.font_md = _load_cjk_font(22, True)
        self.font_lg = _load_cjk_font(32, True)
        self.chars, self.progression = load_game_data()
        self.portrait_sources: dict[str, pygame.Surface] = {}
        self.portraits: dict[str, pygame.Surface] = {}
        self.portrait_cards: dict[str, pygame.Surface] = {}
        self.portrait_codex: dict[str, pygame.Surface] = {}
        self.portrait_showcases: dict[str, pygame.Surface] = {}
        for ch in self.chars:
            char_id = str(ch.get("id") or "")
            path = PORTRAIT_DIR / f"{char_id}.png"
            try:
                if path.is_file():
                    source = pygame.image.load(str(path)).convert_alpha()
                elif ch.get("tag") == "hook":
                    source = make_hook_art()
                else:
                    continue
                self.portrait_sources[char_id] = source
                self.portraits[char_id] = make_circle_portrait(source, BALL_RADIUS * 2 - 6)
                self.portrait_cards[char_id] = make_circle_portrait(source, 42)
                self.portrait_codex[char_id] = pygame.transform.smoothscale(source, (112, 112))
                self.portrait_showcases[char_id] = pygame.transform.smoothscale(
                    source, (PORTRAIT_SHOWCASE_SIZE, PORTRAIT_SHOWCASE_SIZE)
                )
            except (OSError, pygame.error):
                continue

        self.fx_particles: dict[str, pygame.Surface] = {}
        for key in (
            "slash_01",
            "slash_02",
            "muzzle_01",
            "muzzle_03",
            "magic_01",
            "magic_03",
            "spark_01",
            "light_01",
            "flare_01",
            "circle_03",
            "trace_01",
        ):
            img = load_alpha_image(FX_PARTICLE_DIR / f"{key}.png")
            if img is not None:
                self.fx_particles[key] = img

        self.fx_sheets: dict[str, List[pygame.Surface]] = {}
        sheet_files = {
            "weaponhit": "10_weaponhit_spritesheet.png",
            "magickahit": "5_magickahit_spritesheet.png",
            "bluefire": "3_bluefire_spritesheet.png",
            "freezing": "19_freezing_spritesheet.png",
            "flamelash": "6_flamelash_spritesheet.png",
            "phantom": "14_phantom_spritesheet.png",
            "sunburn": "16_sunburn_spritesheet.png",
            "magicbubbles": "20_magicbubbles_spritesheet.png",
        }
        for key, filename in sheet_files.items():
            sheet = load_alpha_image(FX_SHEET_DIR / filename)
            if sheet is not None:
                frames = slice_spritesheet(sheet)
                if frames:
                    self.fx_sheets[key] = frames

        self.ui_header = load_alpha_image(
            UI_SCIFI_DIR / "button_square_header_notch_rectangle.png"
        )
        self.ui_bar_l = load_alpha_image(UI_SCIFI_DIR / "bar_round_small_l.png")
        self.ui_bar_m = load_alpha_image(UI_SCIFI_DIR / "bar_round_small_m.png")
        self.ui_bar_r = load_alpha_image(UI_SCIFI_DIR / "bar_round_small_r.png")

        self.state = "menu"  # menu | codex | duel | over
        self.pick_a = 0
        self.pick_b = 1 if len(self.chars) > 1 else 0
        self.drag_char_idx: Optional[int] = None
        self.drag_pos: Tuple[int, int] = (0, 0)
        self.codex_idx = 0
        self.fighters: List[Fighter] = []
        self.floats: List[FloatingText] = []
        self.particles: List[Particle] = []
        self.effects: List[CombatEffect] = []
        self.banners: List[SkillBanner] = []
        self.hooks: List[HookProjectile] = []
        self.end_msg = ""
        self.logs: List[str] = []
        self.match_elapsed = 0.0
        self.match_real_elapsed = 0.0
        self.last_collision_ms = 0
        self.decisive_announced = False
        self.hit_stop_until_ms = 0
        self.pending_attack_slot: Optional[int] = None
        self.initiative_tiebreak = random.randint(0, 1)
        self.match_record: Optional[dict] = None

    def push_log(self, msg: str) -> None:
        self.logs.append(msg)
        self.logs = self.logs[-5:]
        if self.match_record is not None:
            events = self.match_record["events"]
            events.append(
                {
                    "time_sec": round(self.match_real_elapsed, 2),
                    "active_time_sec": round(self.match_elapsed, 2),
                    "message": msg,
                }
            )
            self.match_record["events"] = events[-1000:]

    def finish_match(self, reason: str, winner: str = "") -> None:
        if self.match_record is None:
            return
        record = self.match_record
        record["ended_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        record["duration_sec"] = round(self.match_real_elapsed, 2)
        record["active_duration_sec"] = round(self.match_elapsed, 2)
        record["reason"] = reason
        record["winner"] = winner
        record["final"] = [
            {
                "name": f.name,
                "hp": round(f.hp, 1),
                "max_hp": round(f.max_hp, 1),
                "skill_points": f.skill_points,
                "energy": round(f.energy, 1),
                "stage": f.state_name(),
                "hook_releases": f.hook_release_count,
                "shield_hp": round(f.shield_hp, 1),
                "raiden_resolve": round(f.raiden_resolve, 1),
                "ellen_flash_freeze": f.ellen_flash_freeze,
                "jane_passion": round(f.jane_passion, 1),
                "panacea_feather": f.panacea_feather,
                "panacea_weapon_hits_left": f.panacea_weapon_hits_left,
                "xentinel_spirit": f.xentinel_spirit,
                "damage_dealt": round(f.damage_dealt, 1),
                "damage_taken": round(f.damage_taken, 1),
                "action_counts": dict(f.action_counts),
            }
            for f in self.fighters
        ]
        append_match_history(record)
        self.match_record = None
        if reason == "completed":
            if winner in ("同归于尽", ""):
                self.sfx.play("defeat", 0.5)
            else:
                self.sfx.play("victory", 0.55)

    def start_duel(self) -> None:
        if self.pick_a == self.pick_b:
            return
        self.finish_match("restart")
        cx, cy = float(ARENA_RECT.centerx), float(ARENA_RECT.centery)
        r = float(BALL_RADIUS)
        a = make_fighter(
            self.chars[self.pick_a], self.progression, cx - ARENA_SIZE * 0.3, cy, math.radians(25)
        )
        b = make_fighter(
            self.chars[self.pick_b], self.progression, cx + ARENA_SIZE * 0.3, cy, math.radians(205)
        )
        # 保证初始不相交
        a.x = ARENA_RECT.left + r + 44
        b.x = ARENA_RECT.right - r - 44
        a.y = cy
        b.y = cy
        self.fighters = [a, b]
        self.floats.clear()
        self.particles.clear()
        self.effects.clear()
        self.banners.clear()
        self.hooks.clear()
        self.logs.clear()
        self.end_msg = ""
        self.match_elapsed = 0.0
        self.match_real_elapsed = 0.0
        self.last_collision_ms = pygame.time.get_ticks()
        self.decisive_announced = False
        self.hit_stop_until_ms = 0
        self.pending_attack_slot = None
        self.state = "duel"
        self.sfx.play("start", 0.45)
        self.match_record = {
            "started_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "settings": {
                "damage_scale": DAMAGE_SCALE,
                "attack_angle_deg": ATTACK_CONE_DEG,
                "attack_range": ATTACK_CONE_RANGE,
                "attack_cooldown_ms": HIT_COOLDOWN_MS,
                "attack_pose_ms": ATTACK_POSE_MS,
                "initiative_rule": "smaller_center_offset_then_alternate_tie",
                "timing_model": "wall_and_active_v2",
                "hook_skill_sec": HOOK_SKILL_SEC,
                "hook_ult_sec": HOOK_ULT_SEC,
                "hook_infinite_chance": HOOK_INFINITE_CHANCE,
            },
            "fighters": [
                {
                    "name": f.name,
                    "tag": f.char.get("tag"),
                    "base_hp": f.base_max_hp,
                    "base_atk": f.base_atk,
                    "move_speed": round(f.base_move_speed, 1),
                }
                for f in self.fighters
            ],
            "events": [],
        }
        self.push_log(f"{a.name} VS {b.name} 开战")

    def menu_rects(self) -> dict:
        pw, ph = 840, 620
        px, py = (WIDTH - pw) // 2, (HEIGHT - ph) // 2
        rects = {"panel": pygame.Rect(px, py, pw, ph)}
        cards_x, cards_y = px + 30, py + 112
        card_w, card_h = 245, 60
        for i in range(len(self.chars)):
            col, row = i % 2, i // 2
            rects[f"char{i}"] = pygame.Rect(
                cards_x + col * (card_w + 14),
                cards_y + row * (card_h + 14),
                card_w,
                card_h,
            )
        slot_x = px + 570
        rects["p1_slot"] = pygame.Rect(slot_x, py + 142, 235, 104)
        rects["p2_slot"] = pygame.Rect(slot_x, py + 264, 235, 104)
        rects["start"] = pygame.Rect(slot_x, py + 402, 235, 46)
        rects["codex"] = pygame.Rect(slot_x, py + 462, 235, 42)
        rects["quit"] = pygame.Rect(slot_x, py + 518, 235, 38)
        return rects

    def draw_menu(self) -> None:
        self.screen.blit(self.background, (0, 0))
        rects = self.menu_rects()
        p = rects["panel"]
        draw_glass_panel(self.screen, p, (90, 205, 235), light=True)
        self.screen.blit(
            self.font_sm.render("MODE 04  //  AUTO COMBAT", True, (30, 145, 180)),
            (p.right - 250, p.y + 30),
        )
        self.screen.blit(self.font_lg.render("次元双球对决", True, COL_TEXT), (p.x + 28, p.y + 24))
        self.screen.blit(
            self.font_sm.render("拖动角色卡到右侧 P1 / P2 槽位，再开始对决", True, COL_SUB),
            (p.x + 28, p.y + 64),
        )
        self.screen.blit(self.font.render("角色列表", True, COL_TEXT), (p.x + 30, p.y + 88))
        for i, ch in enumerate(self.chars):
            r = rects[f"char{i}"]
            col = kit_color(ch)
            bg = (255, 255, 255) if i in (self.pick_a, self.pick_b) else (236, 236, 242)
            if i in (self.pick_a, self.pick_b):
                glow = r.inflate(6, 6)
                pygame.draw.rect(self.screen, (*col, 70), glow, border_radius=8)
            pygame.draw.rect(self.screen, bg, r, border_radius=6)
            pygame.draw.rect(self.screen, col, r, 2, border_radius=6)
            char_id = str(ch.get("id") or "")
            portrait = self.portrait_cards.get(char_id)
            if portrait:
                self.screen.blit(portrait, (r.x + 8, r.y + 9))
            move_speed = movement_speed_from_stat(float(ch.get("base_spd") or 100))
            self.screen.blit(
                self.font.render(str(ch["name"]), True, COL_TEXT),
                (r.x + 58, r.y + 8),
            )
            detail = (
                f"{ch.get('path')}/{ch.get('element')}  "
                f"HP{ch['base_hp']} ATK{ch['base_atk']} S{int(move_speed)}"
            )
            self.screen.blit(self.font_sm.render(detail, True, COL_SUB), (r.x + 58, r.y + 34))
            badges = []
            if i == self.pick_a:
                badges.append("P1")
            if i == self.pick_b:
                badges.append("P2")
            if badges:
                badge = self.font_sm.render("/".join(badges), True, col)
                self.screen.blit(badge, (r.right - badge.get_width() - 8, r.y + 8))

        for key, label, index, color in (
            ("p1_slot", "P1", self.pick_a, (80, 155, 245)),
            ("p2_slot", "P2", self.pick_b, (245, 110, 95)),
        ):
            r = rects[key]
            ch = self.chars[index]
            hovering = self.drag_char_idx is not None and r.collidepoint(self.drag_pos)
            fill = (255, 250, 218) if hovering else (245, 247, 252)
            pygame.draw.rect(self.screen, fill, r, border_radius=8)
            pygame.draw.rect(self.screen, color, r, 3, border_radius=8)
            self.screen.blit(self.font_md.render(label, True, color), (r.x + 12, r.y + 10))
            portrait = self.portrait_cards.get(str(ch.get("id") or ""))
            if portrait:
                shown = pygame.transform.smoothscale(portrait, (58, 58))
                self.screen.blit(shown, (r.x + 52, r.y + 22))
            self.screen.blit(
                self.font.render(str(ch["name"]), True, COL_TEXT),
                (r.x + 120, r.y + 30),
            )
            self.screen.blit(
                self.font_sm.render("拖到这里替换", True, COL_SUB),
                (r.x + 120, r.y + 57),
            )

        for key, label, fill in (
            ("start", "开始对决", (0, 170, 200)),
            ("codex", "角色图鉴", (90, 100, 140)),
            ("quit", "退出", (200, 202, 210)),
        ):
            r = rects[key]
            pygame.draw.rect(self.screen, fill, r, border_radius=6)
            pygame.draw.rect(self.screen, (255, 255, 255), r, 1, border_radius=6)
            tc = (255, 255, 255) if key != "quit" else COL_TEXT
            self.screen.blit(self.font.render(label, True, tc), (r.x + 16, r.y + 10))

        if self.drag_char_idx is not None:
            ch = self.chars[self.drag_char_idx]
            ghost = pygame.Surface((210, 54), pygame.SRCALPHA)
            ghost.fill((*kit_color(ch), 210))
            text = self.font.render(f"拖动 · {ch['name']}", True, (255, 255, 255))
            ghost.blit(text, (16, 15))
            self.screen.blit(
                ghost,
                ghost.get_rect(center=self.drag_pos),
            )

        tip = self.font_sm.render(
            f"P1={self.chars[self.pick_a]['name']}  vs  P2={self.chars[self.pick_b]['name']}  |  同角色不可开战",
            True,
            COL_HINT,
        )
        self.screen.blit(tip, (24, HEIGHT - 28))

    def draw_codex(self) -> None:
        self.screen.blit(self.background, (0, 0))
        ch = self.chars[self.codex_idx]
        col = kit_color(ch)
        panel = pygame.Rect(40, 40, WIDTH - 80, HEIGHT - 80)
        draw_glass_panel(self.screen, panel, col, light=True)

        title = f"{ch['name']} · {ch.get('path')} · {ch.get('element')} · {ch.get('rarity')}星"
        self.screen.blit(self.font_lg.render(title, True, COL_TEXT), (panel.x + 24, panel.y + 20))
        stats = (
            f"生命 {ch['base_hp']}   攻击 {ch['base_atk']}   原始速度 {ch['base_spd']}   "
            f"球体移速 {int(movement_speed_from_stat(float(ch['base_spd'])))}   能量上限 {ch.get('max_sp')}"
        )
        self.screen.blit(self.font.render(stats, True, COL_SUB), (panel.x + 24, panel.y + 64))
        codex_portrait = self.portrait_codex.get(str(ch.get("id") or ""))
        if codex_portrait:
            self.screen.blit(codex_portrait, (panel.right - 138, panel.y + 12))
        self.screen.blit(
            self.font_sm.render(str(ch.get("summary") or ""), True, COL_TEXT),
            (panel.x + 24, panel.y + 92),
        )
        kit = ch.get("kit") or {}
        passive = f"对战被动：{kit.get('passive') or '无'}"
        self.screen.blit(self.font.render(passive, True, col), (panel.x + 24, panel.y + 118))
        mults = (
            f"倍率 普攻×{kit.get('basic_mult')}  战技×{kit.get('skill_mult')}  "
            f"终结技×{kit.get('ult_mult')}  战技点上限3  终结需能{kit.get('ult_need')}"
        )
        self.screen.blit(self.font_sm.render(mults, True, COL_SUB), (panel.x + 24, panel.y + 146))
        states = " → ".join(str(x) for x in (ch.get("state_names") or []))
        growth = f"成长路线：{states}（星魂/专武槽位已预留，当前未启用）"
        self.screen.blit(self.font_sm.render(growth, True, col), (panel.x + 24, panel.y + 168))

        y = panel.y + 198
        self.screen.blit(self.font_md.render("技能", True, COL_TEXT), (panel.x + 24, y))
        y += 32
        for sk in (ch.get("skills") or [])[:5]:
            if sk.get("type") in ("MazeNormal",):
                continue
            head = f"[{sk.get('type') or '?'}] {sk.get('name')}"
            self.screen.blit(self.font.render(head, True, COL_TEXT), (panel.x + 28, y))
            y += 24
            for line in wrap_text(self.font_sm, str(sk.get("desc") or ""), panel.w - 70)[:3]:
                self.screen.blit(self.font_sm.render(line, True, COL_SUB), (panel.x + 36, y))
                y += 18
            y += 8
            if y > panel.bottom - 160:
                break

        is_hi3 = ch.get("tag") in ("panacea_seele", "xentinel_mei")
        rank_title = "晋升（摘要）" if is_hi3 else "命座（摘要）"
        self.screen.blit(self.font_md.render(rank_title, True, COL_TEXT), (panel.x + 24, y))
        y += 28
        for ei, ed in enumerate((ch.get("eidolons") or [])[:4], 1):
            prefix = "" if is_hi3 else f"E{ei} "
            line = f"{prefix}{ed.get('name')}：{(ed.get('desc') or '')[:60]}"
            for wl in wrap_text(self.font_sm, line, panel.w - 70)[:2]:
                self.screen.blit(self.font_sm.render(wl, True, COL_SUB), (panel.x + 28, y))
                y += 18
            y += 4

        nav = self.font_sm.render(
            "← → 切换角色   ESC / B 返回菜单   资料源：HoYoverse / 社区公开资料",
            True,
            COL_HINT,
        )
        self.screen.blit(nav, (panel.x + 24, panel.bottom - 36))

    def emit_particles(
        self,
        x: float,
        y: float,
        color: Tuple[int, int, int],
        count: int,
        speed: float,
    ) -> None:
        # 粒子略减并掺少量高光点，观感干净但仍有爆点
        spawn = max(4, int(count * 0.72))
        for i in range(spawn):
            angle = random.uniform(0, 2 * math.pi)
            velocity = random.uniform(speed * 0.4, speed * 0.92)
            life = random.uniform(0.28, 0.62)
            spark = i % 4 == 0
            particle_color = (245, 248, 255) if spark else color
            self.particles.append(
                Particle(
                    x,
                    y,
                    math.cos(angle) * velocity,
                    math.sin(angle) * velocity,
                    particle_color,
                    life,
                    life,
                    random.uniform(1.6, 4.2) if not spark else random.uniform(1.2, 2.6),
                )
            )

    def spawn_attack_effect(
        self,
        attacker: Fighter,
        defender: Fighter,
        label: str,
        action: str = "skill",
    ) -> None:
        tag = str(attacker.char.get("tag") or "")
        kind = {
            "seele": "quantum",
            "clara": "physical",
            "jingyuan": "lightning",
            "zhongli": "geo",
            "raiden": "lightning",
            "ellen": "ice",
            "jane": "physical",
            "panacea_seele": "feather",
            "xentinel_mei": "crescent",
        }.get(tag, "impact")
        if "神君" in label:
            kind = "thunderlord"
        power = 1.55 if action == "ultimate" else (1.2 if action != "basic" else 1.0)
        effect_life = 1.15 * power
        travel_delay = effect_life * ATTACK_TRAVEL_RATIO
        self.effects.append(
            CombatEffect(
                kind,
                attacker.x,
                attacker.y,
                defender.x,
                defender.y,
                attacker.color,
                effect_life,
                effect_life,
                power,
                random.randint(0, 999999),
            )
        )
        self.effects.append(
            CombatEffect(
                "impact",
                defender.x,
                defender.y,
                defender.x,
                defender.y,
                attacker.color,
                effect_life * 0.7,
                effect_life * 0.7,
                power,
                delay=travel_delay,
            )
        )
        if action != "basic":
            banner_x = WIDTH // 4 if attacker is self.fighters[0] else WIDTH * 3 // 4
            self.banners.append(SkillBanner(f"{attacker.name} · {label}", attacker.color, banner_x))
            self.sfx.play("skill", 0.35)
        if action == "ultimate":
            self.sfx.play("attack_ultimate", 0.55)
        elif action == "skill":
            self.sfx.play("attack_skill", 0.42)
        elif action == "passive":
            self.sfx.play("attack_skill", 0.38)
        else:
            self.sfx.play("attack_basic", 0.34)

    def spawn_counter_effect(
        self,
        defender: Fighter,
        attacker: Fighter,
        label: str = "史瓦罗反击",
    ) -> None:
        self.effects.append(
            CombatEffect(
                "counter",
                defender.x,
                defender.y,
                attacker.x,
                attacker.y,
                defender.color,
                1.15,
                1.15,
                1.25,
                random.randint(0, 999999),
            )
        )
        self.effects.append(
            CombatEffect(
                "impact",
                attacker.x,
                attacker.y,
                attacker.x,
                attacker.y,
                defender.color,
                0.8,
                0.8,
                1.15,
                delay=1.15 * ATTACK_TRAVEL_RATIO,
            )
        )
        banner_x = WIDTH // 4 if defender is self.fighters[0] else WIDTH * 3 // 4
        self.banners.append(SkillBanner(f"{defender.name} · {label}", defender.color, banner_x))
        self.sfx.play("counter", 0.48)
        self.sfx.play("skill", 0.3)

    def update_combat_effects(self, dt: float) -> None:
        for particle in self.particles:
            particle.life -= dt
            particle.x += particle.vx * dt
            particle.y += particle.vy * dt
            particle.vx *= max(0.0, 1.0 - 2.4 * dt)
            particle.vy *= max(0.0, 1.0 - 2.4 * dt)
        self.particles = [p for p in self.particles if p.life > 0]
        for effect in self.effects:
            if effect.delay > 0:
                prev = effect.delay
                effect.delay = max(0.0, effect.delay - dt)
                if prev > 0 and effect.delay <= 0 and effect.kind == "impact":
                    self.emit_particles(
                        effect.x,
                        effect.y,
                        effect.color,
                        int(14 * effect.power),
                        170 * effect.power,
                    )
                    hit_key = "hit_heavy" if effect.power >= 1.2 else "hit"
                    self.sfx.play(hit_key, min(0.62, 0.32 + 0.18 * effect.power))
            else:
                effect.life -= dt
        self.effects = [effect for effect in self.effects if effect.life > 0]
        for banner in self.banners:
            banner.life -= dt
        self.banners = [banner for banner in self.banners if banner.life > 0]

    def _draw_lightning(
        self,
        surf: pygame.Surface,
        start: Tuple[float, float],
        end: Tuple[float, float],
        color: Tuple[int, int, int],
        alpha: int,
        seed: int,
        width: int,
    ) -> None:
        rng = random.Random(seed)
        x1, y1 = start
        x2, y2 = end
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1.0
        px, py = -dy / length, dx / length
        points = [(int(x1), int(y1))]
        for i in range(1, 7):
            t = i / 7
            jitter = rng.uniform(-15, 15)
            points.append((int(x1 + dx * t + px * jitter), int(y1 + dy * t + py * jitter)))
        points.append((int(x2), int(y2)))
        pygame.draw.lines(surf, (*color, alpha // 2), False, points, width + 5)
        pygame.draw.lines(surf, (245, 250, 255, alpha), False, points, width)

    def _sheet_for_kind(self, kind: str) -> List[pygame.Surface]:
        mapping = {
            "quantum": "phantom",
            "physical": "weaponhit",
            "lightning": "bluefire",
            "thunderlord": "bluefire",
            "ice": "freezing",
            "geo": "sunburn",
            "feather": "magicbubbles",
            "crescent": "flamelash",
            "counter": "weaponhit",
            "impact": "magickahit",
        }
        key = mapping.get(kind, "magickahit")
        return self.fx_sheets.get(key) or self.fx_sheets.get("weaponhit") or []

    def _blit_fx_particle(
        self,
        surf: pygame.Surface,
        key: str,
        x: float,
        y: float,
        color: Tuple[int, int, int],
        alpha: int,
        scale: float,
        angle_deg: float = 0.0,
    ) -> None:
        src = self.fx_particles.get(key)
        if src is None:
            return
        blit_centered(surf, tint_surface(src, color, alpha), x, y, scale, angle_deg)

    def _draw_launch_arrow(
        self,
        surf: pygame.Surface,
        effect: CombatEffect,
        travel: float,
        alpha: int,
    ) -> None:
        """出手瞬间短促指向箭头；避免与弹道叠成一团。"""
        if travel > 0.28:
            return
        dx, dy = effect.tx - effect.x, effect.ty - effect.y
        length = math.hypot(dx, dy) or 1.0
        nx, ny = dx / length, dy / length
        px, py = -ny, nx
        fade = max(0.0, 1.0 - travel / 0.28)
        a = max(30, int(alpha * fade * 0.85))
        span = 56 + 22 * effect.power
        sx, sy = effect.x, effect.y
        ex, ey = sx + nx * span, sy + ny * span
        pygame.draw.line(
            surf,
            (*effect.color, a),
            (int(sx), int(sy)),
            (int(ex), int(ey)),
            max(3, int(4 * effect.power)),
        )
        tip = (int(ex + nx * 8), int(ey + ny * 8))
        left = (int(ex - nx * 7 + px * 9), int(ey - ny * 7 + py * 9))
        right = (int(ex - nx * 7 - px * 9), int(ey - ny * 7 - py * 9))
        pygame.draw.polygon(surf, (255, 245, 230, a), (tip, left, right))

    def _draw_impact_burst(
        self,
        surf: pygame.Surface,
        effect: CombatEffect,
        progress: float,
        alpha: int,
        x: float,
        y: float,
    ) -> None:
        """命中：两层扩散 + 核心光晕 + 一帧命中序列，避免过载。"""
        ease = 1.0 - (1.0 - progress) ** 2
        for ring in range(2):
            radius = int((14 + 52 * ease + ring * 18) * min(1.35, effect.power))
            ring_alpha = max(22, int(alpha * (0.85 - ring * 0.28)))
            pygame.draw.circle(
                surf,
                (*effect.color, ring_alpha),
                (int(x), int(y)),
                radius,
                3 if ring == 0 else 2,
            )
        soft = pygame.Surface((120, 120), pygame.SRCALPHA)
        soft_r = int((14 + 34 * ease) * min(1.3, effect.power))
        pygame.draw.circle(soft, (*effect.color, max(18, alpha // 4)), (60, 60), soft_r)
        pygame.draw.circle(soft, (255, 255, 255, max(18, alpha // 5)), (60, 60), max(6, soft_r // 3))
        surf.blit(soft, (int(x) - 60, int(y) - 60))
        self._blit_fx_particle(
            surf,
            "flare_01",
            x,
            y,
            effect.color,
            max(45, int(alpha * 0.9)),
            0.16 + 0.12 * (1.0 - ease),
        )
        frames = self._sheet_for_kind(effect.kind if effect.kind != "impact" else "impact")
        if frames:
            idx = min(len(frames) - 1, int(ease * len(frames)))
            frame = tint_surface(frames[idx], effect.color, max(70, alpha))
            blit_centered(surf, frame, x, y, 0.72 + 0.18 * min(1.3, effect.power))

    def _draw_cone_blast(
        self,
        surf: pygame.Surface,
        effect: CombatEffect,
        travel: float,
        alpha: int,
    ) -> None:
        """可攻击锥形收束成攻击束；透明度压低，不挡角色。"""
        morph = max(0.0, 1.0 - travel / 0.5)
        if morph <= 0.02:
            return
        dx, dy = effect.tx - effect.x, effect.ty - effect.y
        length = math.hypot(dx, dy) or 1.0
        base = math.atan2(dy, dx)
        half = math.radians(ATTACK_CONE_DEG / 2.0) * morph
        reach = ATTACK_CONE_RANGE * (0.5 + 0.4 * morph) + length * travel * 0.35
        points = [(int(effect.x), int(effect.y))]
        for i in range(9):
            angle = base - half + (2 * half * i / 8)
            points.append(
                (
                    int(effect.x + math.cos(angle) * reach),
                    int(effect.y + math.sin(angle) * reach),
                )
            )
        cone_alpha = max(16, int(alpha * (0.18 + 0.35 * morph)))
        pygame.draw.polygon(surf, (*effect.color, cone_alpha), points)
        pygame.draw.lines(
            surf,
            (*effect.color, min(180, cone_alpha + 70)),
            False,
            points[1:],
            2,
        )

    def _draw_attack_travel(
        self,
        surf: pygame.Surface,
        effect: CombatEffect,
        progress: float,
        alpha: int,
    ) -> None:
        """弹道从进攻方飞向受击方，到达后再播放命中特效。"""
        dx, dy = effect.tx - effect.x, effect.ty - effect.y
        length = math.hypot(dx, dy)
        if length < 1:
            return
        nx, ny = dx / length, dy / length
        px, py = -ny, nx
        travel = min(1.0, progress / ATTACK_TRAVEL_RATIO)
        travel = 1.0 - (1.0 - travel) ** 2
        self._draw_cone_blast(surf, effect, travel, alpha)
        self._draw_launch_arrow(surf, effect, travel, alpha)
        hx = effect.x + dx * travel
        hy = effect.y + dy * travel
        tail_x = effect.x + dx * max(0.0, travel - 0.28)
        tail_y = effect.y + dy * max(0.0, travel - 0.28)
        width = 5.5 * effect.power
        beam = [
            (int(tail_x + px * width * 0.25), int(tail_y + py * width * 0.25)),
            (int(tail_x - px * width * 0.25), int(tail_y - py * width * 0.25)),
            (int(hx - px * width), int(hy - py * width)),
            (int(hx + nx * 14), int(hy + ny * 14)),
            (int(hx + px * width), int(hy + py * width)),
        ]
        pygame.draw.polygon(surf, (*effect.color, max(30, alpha // 4)), beam)
        pygame.draw.line(
            surf,
            (*effect.color, max(80, min(245, alpha))),
            (int(effect.x), int(effect.y)),
            (int(hx), int(hy)),
            max(3, int(5 * effect.power)),
        )
        pygame.draw.line(
            surf,
            (255, 255, 255, max(60, alpha // 2)),
            (int(effect.x), int(effect.y)),
            (int(hx), int(hy)),
            2,
        )
        for index in range(5):
            back = min(travel, index * 0.05)
            bx = effect.x + dx * (travel - back)
            by = effect.y + dy * (travel - back)
            trail_alpha = max(24, int(alpha * (1.0 - index / 6.0) * 0.75))
            radius = max(2, int((9 - index) * effect.power * 0.65))
            pygame.draw.circle(surf, (*effect.color, trail_alpha), (int(bx), int(by)), radius)
        head = max(8, int(13 * effect.power))
        kind = effect.kind
        cx, cy = int(hx), int(hy)
        if kind == "quantum":
            diamond = [
                (cx, cy - head - 4),
                (cx + head, cy),
                (cx, cy + head + 4),
                (cx - head, cy),
            ]
            pygame.draw.polygon(surf, (245, 230, 255, alpha), diamond)
        elif kind in ("lightning", "thunderlord"):
            self._draw_lightning(
                surf,
                (effect.x, effect.y),
                (hx, hy),
                effect.color,
                alpha,
                effect.seed,
                4 if kind == "lightning" else 6,
            )
            pygame.draw.circle(surf, (255, 245, 170, alpha), (cx, cy), head)
        elif kind == "ice":
            shard = [
                (int(hx + nx * 20), int(hy + ny * 20)),
                (int(hx - nx * 10 + px * 9), int(hy - ny * 10 + py * 9)),
                (int(hx - nx * 10 - px * 9), int(hy - ny * 10 - py * 9)),
            ]
            pygame.draw.polygon(surf, (220, 245, 255, alpha), shard)
        elif kind == "geo":
            hexagon = [
                (int(hx + math.cos(i * math.pi / 3) * head), int(hy + math.sin(i * math.pi / 3) * head))
                for i in range(6)
            ]
            pygame.draw.polygon(surf, (255, 230, 150, alpha), hexagon)
        elif kind == "feather":
            pygame.draw.ellipse(
                surf,
                (235, 210, 255, alpha),
                pygame.Rect(cx - 6, cy - head - 2, 12, head * 2 + 4),
            )
        elif kind == "crescent":
            box = pygame.Rect(cx - head - 4, cy - head - 4, (head + 4) * 2, (head + 4) * 2)
            pygame.draw.arc(surf, (190, 235, 255, alpha), box, -1.2, 1.3, 6)
        else:
            pygame.draw.circle(surf, (245, 250, 255, alpha), (cx, cy), head)
        pygame.draw.circle(surf, (*effect.color, alpha), (cx, cy), head + 7, 3)
        # 弹头白箭头只保留到中段，后半交给素材枪口焰，减少叠层
        if travel < 0.72:
            arrow = [
                (int(hx + nx * 18), int(hy + ny * 18)),
                (int(hx - nx * 7 + px * 8), int(hy - ny * 7 + py * 8)),
                (int(hx - nx * 7 - px * 8), int(hy - ny * 7 - py * 8)),
            ]
            pygame.draw.polygon(surf, (255, 255, 255, max(50, alpha // 2)), arrow)
        angle_deg = math.degrees(math.atan2(ny, nx))
        muzzle_key = "muzzle_03" if effect.power > 1.15 else "muzzle_01"
        self._blit_fx_particle(
            surf,
            muzzle_key,
            hx,
            hy,
            effect.color,
            max(65, int(alpha * 0.9)),
            0.14 + 0.07 * effect.power,
            angle_deg,
        )
        # 斩击只在中段闪一下，避免全程贴脸
        if 0.28 <= travel <= 0.78:
            slash_key = "slash_02" if kind in ("quantum", "crescent", "physical") else "slash_01"
            self._blit_fx_particle(
                surf,
                slash_key,
                hx,
                hy,
                effect.color,
                max(45, int(alpha * 0.7)),
                0.18 + 0.08 * effect.power,
                angle_deg,
            )

    def draw_combat_effects(self) -> None:
        fx = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        for effect in self.effects:
            if effect.delay > 0:
                continue
            progress = 1.0 - effect.life / effect.max_life
            alpha = max(0, min(255, int(255 * effect.life / effect.max_life)))
            x, y, tx, ty = effect.x, effect.y, effect.tx, effect.ty
            if effect.kind not in ("impact", "guard"):
                self._draw_attack_travel(fx, effect, progress, alpha)
                if progress < ATTACK_TRAVEL_RATIO:
                    continue
                progress = min(1.0, (progress - ATTACK_TRAVEL_RATIO) / max(0.01, 1.0 - ATTACK_TRAVEL_RATIO))
            if effect.kind == "impact":
                self._draw_impact_burst(fx, effect, progress, alpha, x, y)
            elif effect.kind == "quantum":
                angle = math.atan2(ty - y, tx - x) + math.pi / 4
                for offset in (-20, 0, 20):
                    length = 70 * effect.power
                    ox = math.cos(angle + math.pi / 2) * offset
                    oy = math.sin(angle + math.pi / 2) * offset
                    dx, dy = math.cos(angle) * length, math.sin(angle) * length
                    pygame.draw.line(
                        fx,
                        (225, 170, 255, alpha),
                        (int(tx + ox - dx), int(ty + oy - dy)),
                        (int(tx + ox + dx), int(ty + oy + dy)),
                        5,
                    )
                radius = int(25 + 45 * progress)
                diamond = [
                    (int(tx), int(ty - radius)),
                    (int(tx + radius * 0.55), int(ty)),
                    (int(tx), int(ty + radius)),
                    (int(tx - radius * 0.55), int(ty)),
                ]
                pygame.draw.polygon(fx, (175, 90, 255, alpha // 2), diamond, 3)
            elif effect.kind == "physical":
                radius = int(30 + 58 * progress)
                box = pygame.Rect(int(tx - radius), int(ty - radius), radius * 2, radius * 2)
                for i in range(3):
                    pygame.draw.arc(
                        fx,
                        (255, 150 + i * 25, 100, alpha),
                        box.inflate(i * 10, i * 10),
                        -1.0 + i * 0.65,
                        1.5 + i * 0.65,
                        4,
                    )
            elif effect.kind == "geo":
                radius = int(26 + 70 * progress)
                points = [
                    (
                        int(tx + math.cos(i * math.pi / 3) * radius),
                        int(ty + math.sin(i * math.pi / 3) * radius),
                    )
                    for i in range(6)
                ]
                pygame.draw.polygon(fx, (*effect.color, alpha), points, 5)
                pygame.draw.line(
                    fx,
                    (255, 235, 170, alpha),
                    (int(tx), int(ARENA_RECT.top)),
                    (int(tx), int(ty)),
                    max(3, int(8 * effect.power)),
                )
            elif effect.kind == "ice":
                radius = int(22 + 58 * progress)
                for angle_offset in (0.0, math.pi / 3, math.pi * 2 / 3):
                    dx = math.cos(angle_offset) * radius
                    dy = math.sin(angle_offset) * radius
                    pygame.draw.line(
                        fx,
                        (*effect.color, alpha),
                        (int(tx - dx), int(ty - dy)),
                        (int(tx + dx), int(ty + dy)),
                        4,
                    )
                pygame.draw.circle(
                    fx,
                    (220, 250, 255, alpha),
                    (int(tx), int(ty)),
                    max(8, radius // 3),
                    3,
                )
            elif effect.kind == "feather":
                angle = math.atan2(ty - y, tx - x)
                for i in range(5):
                    offset = (i - 2) * 16
                    px = tx + math.cos(angle + math.pi / 2) * offset
                    py = ty + math.sin(angle + math.pi / 2) * offset
                    length = (42 + i * 7) * effect.power
                    pygame.draw.arc(
                        fx,
                        (235, 205, 255, alpha),
                        pygame.Rect(
                            int(px - length),
                            int(py - length * 0.45),
                            int(length * 2),
                            int(length * 0.9),
                        ),
                        angle - 0.7,
                        angle + 0.7,
                        4,
                    )
                pygame.draw.circle(
                    fx,
                    (*effect.color, alpha // 2),
                    (int(tx), int(ty)),
                    int(22 + 55 * progress),
                    4,
                )
            elif effect.kind == "crescent":
                radius = int((40 + 70 * progress) * effect.power)
                box = pygame.Rect(int(tx - radius), int(ty - radius), radius * 2, radius * 2)
                pygame.draw.arc(fx, (190, 235, 255, alpha), box, -1.15, 1.25, 8)
                pygame.draw.arc(
                    fx,
                    (*effect.color, alpha // 2),
                    box.inflate(18, 18),
                    2.0,
                    4.5,
                    5,
                )
            elif effect.kind in ("lightning", "thunderlord"):
                self._draw_lightning(
                    fx,
                    (x, y),
                    (tx, ty),
                    effect.color,
                    alpha,
                    effect.seed + int(progress * 12),
                    3 if effect.kind == "lightning" else 5,
                )
                if effect.kind == "thunderlord":
                    self._draw_lightning(
                        fx,
                        (tx, ARENA_RECT.top),
                        (tx, ty),
                        (255, 225, 100),
                        alpha,
                        effect.seed + 77 + int(progress * 15),
                        5,
                    )
                    pygame.draw.circle(
                        fx,
                        (255, 220, 90, alpha),
                        (int(tx), int(ty)),
                        int(38 + 68 * progress),
                        4,
                    )
            elif effect.kind in ("counter", "guard"):
                radius = int(48 + 20 * math.sin(progress * math.pi))
                points = [
                    (
                        int(x + math.cos(i * math.pi / 3) * radius),
                        int(y + math.sin(i * math.pi / 3) * radius),
                    )
                    for i in range(6)
                ]
                pygame.draw.polygon(fx, (255, 195, 115, alpha), points, 5)
                if effect.kind == "counter":
                    pygame.draw.line(
                        fx,
                        (255, 235, 200, alpha),
                        (int(x), int(y)),
                        (int(tx), int(ty)),
                        6,
                    )

        for particle in self.particles:
            alpha = max(0, min(255, int(255 * particle.life / particle.max_life)))
            pygame.draw.circle(
                fx,
                (*particle.color, alpha),
                (int(particle.x), int(particle.y)),
                max(1, int(particle.size * particle.life / particle.max_life)),
            )
        self.screen.blit(fx, (0, 0))

        for banner in self.banners:
            fade = max(0.0, min(1.0, banner.life / banner.max_life))
            # 后半程更快淡出，避免技能名长时间挡视野
            alpha = max(0, min(255, int(255 * (fade ** 0.7))))
            text = self.font.render(banner.text, True, (245, 248, 255))
            pad_x, pad_y = 18, 8
            bg = pygame.Surface(
                (text.get_width() + pad_x * 2, text.get_height() + pad_y * 2),
                pygame.SRCALPHA,
            )
            pygame.draw.rect(bg, (10, 14, 28, min(200, alpha)), bg.get_rect(), border_radius=8)
            pygame.draw.rect(bg, (*banner.color, min(220, alpha)), bg.get_rect(), 2, border_radius=8)
            pygame.draw.line(
                bg,
                (*banner.color, min(255, alpha)),
                (10, 2),
                (bg.get_width() - 10, 2),
                3,
            )
            rect = bg.get_rect(center=(banner.x, ARENA_RECT.top + 28))
            self.screen.blit(bg, rect)
            labeled = text.copy()
            labeled.set_alpha(alpha)
            self.screen.blit(labeled, labeled.get_rect(center=rect.center))

    def draw_attack_cone(self, fighter: Fighter, now_ms: int) -> None:
        # 仅可攻击时显示静止锥形；进攻瞬间由 _draw_cone_blast 收束成攻击特效。
        if (
            self.state != "duel"
            or fighter.hp <= 0
            or fighter.is_attacking(now_ms)
            or now_ms < self.hit_stop_until_ms
            or now_ms < fighter.hit_cd_until
            or now_ms < fighter.petrified_until_ms
        ):
            return
        speed = math.hypot(fighter.vx, fighter.vy)
        if speed < 1e-9:
            return
        base = math.atan2(fighter.vy, fighter.vx)
        half_angle = math.radians(ATTACK_CONE_DEG / 2.0)
        reach = ATTACK_CONE_RANGE
        alpha = 30
        points = [(int(fighter.x), int(fighter.y))]
        for i in range(9):
            angle = base - half_angle + (2 * half_angle * i / 8)
            points.append(
                (
                    int(fighter.x + math.cos(angle) * reach),
                    int(fighter.y + math.sin(angle) * reach),
                )
            )
        cone = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        pygame.draw.polygon(cone, (*fighter.color, alpha), points)
        pygame.draw.lines(cone, (*fighter.color, min(160, alpha + 55)), False, points[1:], 2)
        # 中心线提示朝向，比整片实心锥更易读
        tip_x = fighter.x + math.cos(base) * reach
        tip_y = fighter.y + math.sin(base) * reach
        pygame.draw.line(
            cone,
            (*fighter.color, min(150, alpha + 70)),
            (int(fighter.x), int(fighter.y)),
            (int(tip_x), int(tip_y)),
            1,
        )
        self.screen.blit(cone, (0, 0))

    def draw_hooks(self) -> None:
        for hook in self.hooks:
            if hook.phase == "outbound":
                rope = hook.path + [(hook.x, hook.y)]
            else:
                rope = hook.path[: hook.reel_index + 1] + [(hook.x, hook.y)]
            points = [(int(x), int(y)) for x, y in rope]
            if len(points) >= 2:
                pygame.draw.lines(self.screen, (18, 45, 55), False, points, 7)
                pygame.draw.lines(self.screen, (170, 235, 240), False, points, 3)
            hx, hy = int(hook.x), int(hook.y)
            pygame.draw.circle(
                self.screen,
                (255, 225, 110) if hook.infinite else hook.owner.color,
                (hx, hy),
                HOOK_RADIUS,
                3,
            )
            hook_box = pygame.Rect(hx - 5, hy - 4, 20, 24)
            pygame.draw.arc(self.screen, (235, 245, 245), hook_box, 0.1, math.pi * 1.6, 4)
            if hook.attached:
                pygame.draw.circle(self.screen, (255, 110, 85), (hx, hy), HOOK_RADIUS + 5, 2)

    def draw_duel(self, game_over: bool = False) -> None:
        self.screen.blit(self.background, (0, 0))
        pygame.draw.rect(self.screen, COL_ARENA, ARENA_RECT)
        grid = pygame.Surface(ARENA_RECT.size, pygame.SRCALPHA)
        for pos in range(0, ARENA_SIZE + 1, 52):
            pygame.draw.line(grid, (120, 150, 180, 16), (pos, 0), (pos, ARENA_SIZE), 1)
            pygame.draw.line(grid, (120, 150, 180, 16), (0, pos), (ARENA_SIZE, pos), 1)
        pygame.draw.line(grid, (160, 190, 220, 14), (0, 0), (ARENA_SIZE, ARENA_SIZE), 1)
        pygame.draw.line(grid, (160, 190, 220, 14), (ARENA_SIZE, 0), (0, ARENA_SIZE), 1)
        pygame.draw.circle(
            grid,
            (120, 190, 225, 26),
            (ARENA_SIZE // 2, ARENA_SIZE // 2),
            ARENA_SIZE // 5,
            2,
        )
        pygame.draw.line(
            grid,
            (120, 190, 225, 22),
            (ARENA_SIZE // 2, 0),
            (ARENA_SIZE // 2, ARENA_SIZE),
            1,
        )
        self.screen.blit(grid, ARENA_RECT.topleft)
        pygame.draw.rect(self.screen, COL_RING, ARENA_RECT, 3)
        if any(
            f.char.get("tag") == "jingyuan" and f.lightning_lord_progress >= 0.85
            for f in self.fighters
        ):
            pygame.draw.line(
                self.screen,
                (255, 220, 90),
                ARENA_RECT.topleft,
                ARENA_RECT.topright,
                7,
            )
        corner = 24
        for x, y, sx, sy in (
            (ARENA_RECT.left, ARENA_RECT.top, 1, 1),
            (ARENA_RECT.right, ARENA_RECT.top, -1, 1),
            (ARENA_RECT.left, ARENA_RECT.bottom, 1, -1),
            (ARENA_RECT.right, ARENA_RECT.bottom, -1, -1),
        ):
            pygame.draw.line(self.screen, (220, 245, 255), (x, y), (x + sx * corner, y), 5)
            pygame.draw.line(self.screen, (220, 245, 255), (x, y), (x, y + sy * corner), 5)

        battle_title = self.font_sm.render("BATTLE // AUTO DUEL", True, (170, 225, 245))
        title_bg = pygame.Surface((battle_title.get_width() + 28, 26), pygame.SRCALPHA)
        title_bg.fill((10, 18, 35, 205))
        title_rect = title_bg.get_rect(center=(WIDTH // 2, 24))
        if self.ui_header is not None:
            header = pygame.transform.smoothscale(
                self.ui_header,
                (max(180, battle_title.get_width() + 80), 34),
            )
            self.screen.blit(header, header.get_rect(center=(WIDTH // 2, 24)))
        self.screen.blit(title_bg, title_rect)
        self.screen.blit(battle_title, battle_title.get_rect(center=title_rect.center))

        # HUD
        if len(self.fighters) == 2:
            vs = self.font_md.render("VS", True, (255, 220, 150))
            vs_bg = pygame.Surface((vs.get_width() + 24, 32), pygame.SRCALPHA)
            vs_bg.fill((10, 16, 32, 210))
            vs_rect = vs_bg.get_rect(center=(WIDTH // 2, 58))
            self.screen.blit(vs_bg, vs_rect)
            self.screen.blit(vs, vs.get_rect(center=vs_rect.center))
        for i, fighter in enumerate(self.fighters):
            side = 20 if i == 0 else WIDTH - 292
            draw_glass_panel(
                self.screen,
                pygame.Rect(side - 10, HUD_PANEL_Y, 272, HUD_PANEL_H),
                fighter.color,
                corners="top",
            )
        for i, f in enumerate(self.fighters):
            side = 20 if i == 0 else WIDTH - 292
            char_id = str(f.char.get("id") or "")
            portrait = self.portrait_cards.get(char_id)
            text_x = side
            if portrait:
                shown = pygame.transform.smoothscale(portrait, (44, 44))
                ring = shown.get_rect(topleft=(side, 12))
                pygame.draw.circle(self.screen, f.color, ring.center, 25, 2)
                self.screen.blit(shown, ring)
                text_x = side + 52
            danger = f.hp / max(1.0, f.max_hp) <= 0.25
            name_color = (255, 120, 110) if danger else f.color
            self.screen.blit(self.font_md.render(f.name, True, name_color), (text_x, 12))
            draw_hp_bar(self.screen, text_x, 42, 206, 14, f.hp / max(1.0, f.max_hp), f.color)
            hp_label = f"HP {int(f.hp)}/{int(f.max_hp)}"
            if danger:
                hp_label += "  危险"
            hp_t = self.font_sm.render(hp_label, True, (255, 150, 140) if danger else COL_HINT)
            self.screen.blit(hp_t, (text_x, 60))
            kit = f.kit()
            en_need = float(kit.get("ult_need") or 100)
            draw_hp_bar(self.screen, side, 80, 252, 9, f.energy / en_need, (240, 200, 80))
            energy_text = f"能量 {int(f.energy)}/{int(en_need)}"
            self.screen.blit(self.font_sm.render(energy_text, True, COL_HINT), (side, 92))
            self.screen.blit(self.font_sm.render("战技点", True, COL_HINT), (side, 108))
            for point in range(f.max_skill_points):
                cx = side + 58 + point * 18
                cy = 116
                color = f.color if point < f.skill_points else (62, 66, 82)
                pygame.draw.polygon(
                    self.screen,
                    color,
                    [(cx, cy - 6), (cx + 6, cy), (cx, cy + 6), (cx - 6, cy)],
                )

            enemy = self.fighters[1 - i]
            tag = f.char.get("tag")
            if tag == "seele":
                role_text = (
                    f"加速×{f.seele_speed_attacks_left} 增幅×{f.seele_amplified_attacks_left}"
                )
            elif tag == "clara":
                mark = "有标记" if enemy.counter_marked else "无标记"
                role_text = f"强化反击×{f.clara_counter_charges} {mark}"
            elif tag == "jingyuan":
                role_text = (
                    f"神君{f.lightning_lord_hits}段 "
                    f"{int(f.lightning_lord_progress * 100)}%"
                )
            elif tag == "hook":
                active_hook = self.hook_for_fighter(f)
                if active_hook and active_hook.owner is f:
                    if active_hook.phase == "reeling":
                        hook_state = "回收中"
                    elif active_hook.infinite:
                        hook_state = "无限放线"
                    else:
                        hook_state = f"放线{active_hook.outbound_left:.1f}s"
                    role_text = f"{hook_state} 第{f.hook_release_count}次"
                else:
                    role_text = f"已放钩{f.hook_release_count}次"
            elif tag == "zhongli":
                role_text = (
                    f"玉璋{int(f.shield_hp)} "
                    f"强效{f.shield_fortify_stacks}/5"
                )
            elif tag == "raiden":
                role_text = (
                    f"愿力{f.raiden_resolve:.1f}/6 "
                    f"雷眼×{f.raiden_eye_attacks_left} 一心×{f.raiden_burst_attacks_left}"
                )
            elif tag == "ellen":
                role_text = f"急冻充能 {f.ellen_flash_freeze}/6"
            elif tag == "jane":
                role_text = (
                    f"心流{int(f.jane_passion)}/100 "
                    f"狂热×{f.jane_fanatic_attacks_left}"
                )
            elif tag == "panacea_seele":
                role_text = (
                    f"羽集{f.panacea_feather}/300 "
                    f"武器技×{f.panacea_weapon_hits_left}"
                )
            elif tag == "xentinel_mei":
                role_text = f"战意 {f.xentinel_spirit}/2"
            else:
                role_text = ""
            self.screen.blit(self.font_sm.render(role_text, True, f.color), (side + 116, 108))
            if tag == "jingyuan":
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.lightning_lord_progress,
                    f.color,
                )
            elif tag == "zhongli":
                shield_max = f.max_hp * 0.28 + f.atk * 0.45
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.shield_hp / max(1.0, shield_max),
                    f.color,
                )
            elif tag == "raiden":
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.raiden_resolve / 6.0,
                    f.color,
                )
            elif tag == "ellen":
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.ellen_flash_freeze / 6.0,
                    f.color,
                )
            elif tag == "jane":
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.jane_passion / 100.0,
                    f.color,
                )
            elif tag == "panacea_seele":
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.panacea_feather / 300.0,
                    f.color,
                )
            elif tag == "xentinel_mei":
                draw_hp_bar(
                    self.screen,
                    side + 116,
                    122,
                    120,
                    4,
                    f.xentinel_spirit / 2.0,
                    f.color,
                )
            next_threshold = f.next_threshold()
            progress_text = (
                "最终"
                if next_threshold is None
                else f"进化{int(f.evolution)}/{int(next_threshold)}"
            )
            move_speed = int(round(math.hypot(f.vx, f.vy)))
            state_text = (
                f"{f.state_name()} {f.stage_index + 1}/{len(f.stages())} "
                f"{progress_text} 速{move_speed}"
            )
            self.screen.blit(self.font_sm.render(state_text, True, f.color), (side, 124))

        now_ms = pygame.time.get_ticks()
        for fighter in self.fighters:
            if not self.hook_for_fighter(fighter):
                self.draw_attack_cone(fighter, now_ms)

        # balls + trail
        for f in self.fighters:
            for ti, (tx, ty) in enumerate(reversed(f.trail)):
                fade = 0.25 + 0.08 * ti
                dim = tuple(max(0, min(255, int(c * fade))) for c in f.color)
                s = max(6, BALL_RADIUS - (len(f.trail) - 1 - ti) * 3)
                pygame.draw.circle(self.screen, dim, (int(tx), int(ty)), s)
        self.draw_hooks()
        self.draw_combat_effects()
        for f in self.fighters:
            attacking = f.is_attacking(now_ms)
            visual_radius = BALL_RADIUS + (6 if attacking else 0)
            pygame.draw.circle(self.screen, f.color, (int(f.x), int(f.y)), visual_radius)
            char_id = str(f.char.get("id") or "")
            portrait = self.portraits.get(char_id)
            if portrait:
                shown_portrait = (
                    pygame.transform.smoothscale(
                        portrait, (visual_radius * 2 - 6, visual_radius * 2 - 6)
                    )
                    if attacking
                    else portrait
                )
                self.screen.blit(
                    shown_portrait, shown_portrait.get_rect(center=(int(f.x), int(f.y)))
                )
            if now_ms < f.portrait_showcase_until_ms:
                showcase = self.portrait_showcases.get(char_id)
                if showcase:
                    aura_size = PORTRAIT_SHOWCASE_SIZE + 28
                    aura = pygame.Surface((aura_size, aura_size), pygame.SRCALPHA)
                    pygame.draw.circle(
                        aura,
                        (*f.color, 105),
                        (aura_size // 2, aura_size // 2),
                        aura_size // 2 - 3,
                    )
                    pygame.draw.circle(
                        aura,
                        (255, 245, 205, 230),
                        (aura_size // 2, aura_size // 2),
                        aura_size // 2 - 4,
                        5,
                    )
                    self.screen.blit(
                        aura,
                        aura.get_rect(center=(int(f.x), int(f.y))),
                    )
                    pygame.draw.circle(
                        self.screen,
                        (255, 245, 205),
                        (int(f.x), int(f.y)),
                        PORTRAIT_SHOWCASE_SIZE // 2 + 4,
                        4,
                    )
                    self.screen.blit(
                        showcase,
                        showcase.get_rect(center=(int(f.x), int(f.y))),
                    )
            for ring in range(f.stage_index):
                pygame.draw.circle(
                    self.screen,
                    f.color,
                    (int(f.x), int(f.y)),
                    visual_radius + 5 + ring * 4,
                    2,
                )
            if f.counter_marked:
                pygame.draw.circle(
                    self.screen,
                    (255, 80, 70),
                    (int(f.x), int(f.y)),
                    visual_radius + 8,
                    3,
                )
            if f.char.get("tag") == "clara" and f.clara_counter_charges > 0:
                shield_radius = visual_radius + 12
                shield = [
                    (
                        int(f.x + math.cos(i * math.pi / 3) * shield_radius),
                        int(f.y + math.sin(i * math.pi / 3) * shield_radius),
                    )
                    for i in range(6)
                ]
                pygame.draw.polygon(self.screen, (255, 195, 115), shield, 3)
            if f.char.get("tag") == "zhongli" and f.shield_hp > 0:
                shield_radius = visual_radius + 13
                shield = [
                    (
                        int(f.x + math.cos(i * math.pi / 3) * shield_radius),
                        int(f.y + math.sin(i * math.pi / 3) * shield_radius),
                    )
                    for i in range(6)
                ]
                pygame.draw.polygon(self.screen, (245, 205, 105), shield, 4)
            if f.char.get("tag") == "raiden" and f.raiden_eye_attacks_left > 0:
                eye_box = pygame.Rect(
                    int(f.x - visual_radius - 10),
                    int(f.y - visual_radius - 10),
                    (visual_radius + 10) * 2,
                    (visual_radius + 10) * 2,
                )
                pygame.draw.arc(self.screen, (195, 135, 255), eye_box, 0.2, 2.9, 3)
                pygame.draw.arc(self.screen, (195, 135, 255), eye_box, 3.35, 6.0, 3)
            if f.char.get("tag") == "ellen" and f.ellen_flash_freeze > 0:
                for shard in range(3):
                    angle = shard * math.pi * 2 / 3 - math.pi / 2
                    sx = int(f.x + math.cos(angle) * (visual_radius + 10))
                    sy = int(f.y + math.sin(angle) * (visual_radius + 10))
                    pygame.draw.line(
                        self.screen,
                        (185, 240, 255),
                        (sx - 4, sy + 5),
                        (sx + 4, sy - 5),
                        3,
                    )
            if f.char.get("tag") == "jane" and f.jane_fanatic_attacks_left > 0:
                pygame.draw.arc(
                    self.screen,
                    (245, 80, 115),
                    pygame.Rect(
                        int(f.x - visual_radius - 11),
                        int(f.y - visual_radius - 11),
                        (visual_radius + 11) * 2,
                        (visual_radius + 11) * 2,
                    ),
                    -0.7,
                    4.9,
                    4,
                )
            if f.char.get("tag") == "panacea_seele":
                feather_count = max(
                    f.panacea_weapon_hits_left,
                    int(math.ceil(f.panacea_feather / 100.0)),
                )
                for feather in range(feather_count):
                    angle = now_ms * 0.003 + feather * math.pi * 2 / max(1, feather_count)
                    px = int(f.x + math.cos(angle) * (visual_radius + 12))
                    py = int(f.y + math.sin(angle) * (visual_radius + 12))
                    pygame.draw.ellipse(
                        self.screen,
                        (230, 205, 255),
                        pygame.Rect(px - 3, py - 7, 6, 14),
                        2,
                    )
            if f.char.get("tag") == "xentinel_mei" and f.xentinel_spirit > 0:
                for spirit in range(f.xentinel_spirit):
                    box = pygame.Rect(
                        int(f.x - visual_radius - 10 - spirit * 4),
                        int(f.y - visual_radius - 10 - spirit * 4),
                        (visual_radius + 10 + spirit * 4) * 2,
                        (visual_radius + 10 + spirit * 4) * 2,
                    )
                    pygame.draw.arc(self.screen, (160, 225, 255), box, -1.0, 1.1, 4)
            if now_ms < f.petrified_until_ms:
                stone_radius = visual_radius + 9
                pygame.draw.circle(
                    self.screen,
                    (180, 155, 105),
                    (int(f.x), int(f.y)),
                    stone_radius,
                    6,
                )
                petrified = self.font_sm.render("石化", True, (245, 220, 145))
                self.screen.blit(
                    petrified,
                    petrified.get_rect(center=(int(f.x), int(f.y - stone_radius - 12))),
                )
            if f.char.get("tag") == "seele" and (
                f.seele_speed_attacks_left > 0 or f.seele_amplified_attacks_left > 0
            ):
                pygame.draw.arc(
                    self.screen,
                    (210, 135, 255),
                    pygame.Rect(
                        int(f.x - visual_radius - 11),
                        int(f.y - visual_radius - 11),
                        (visual_radius + 11) * 2,
                        (visual_radius + 11) * 2,
                    ),
                    -0.8,
                    4.8,
                    4,
                )
            if attacking:
                for angle in (0, math.pi / 2, math.pi, math.pi * 1.5):
                    inner = visual_radius + 4
                    outer = visual_radius + 13
                    pygame.draw.line(
                        self.screen,
                        (255, 245, 205),
                        (int(f.x + math.cos(angle) * inner), int(f.y + math.sin(angle) * inner)),
                        (int(f.x + math.cos(angle) * outer), int(f.y + math.sin(angle) * outer)),
                        3,
                    )
            pygame.draw.circle(
                self.screen, (255, 245, 210) if attacking else (255, 255, 255),
                (int(f.x), int(f.y)), visual_radius, 3 if attacking else 2
            )
            if not portrait:
                nm = self.font_sm.render(f.name[:2], True, (255, 255, 255))
                self.screen.blit(nm, nm.get_rect(center=(int(f.x), int(f.y))))

            bar_w, bar_h = 86, 8
            bar_x = int(f.x - bar_w / 2)
            bar_y = max(ARENA_RECT.top + 5, int(f.y - visual_radius - 24))
            active_hook = self.hook_for_fighter(f)
            if active_hook and active_hook.owner is f:
                motion_state = "回收" if active_hook.phase == "reeling" else "放线"
            elif active_hook and active_hook.attached and active_hook.target is f:
                motion_state = "被拖拽"
            elif now_ms < f.hit_cd_until:
                cooldown_left = max(0.0, (f.hit_cd_until - now_ms) / 1000.0)
                motion_state = f"冷却 {cooldown_left:.1f}s"
            else:
                motion_state = "攻击" if attacking else "移动"
            state_text = motion_state + f" · SP {f.skill_points}/3"
            state_color = (255, 220, 120) if attacking else (205, 215, 230)
            state = self.font_sm.render(state_text, True, state_color)
            self.screen.blit(state, state.get_rect(center=(int(f.x), bar_y - 9)))
            draw_hp_bar(
                self.screen,
                bar_x,
                bar_y,
                bar_w,
                bar_h,
                f.hp / max(1.0, f.max_hp),
                f.color,
            )

        for ft in self.floats:
            alpha = 255 if ft.life >= 0.55 else max(40, int(255 * (ft.life / 0.55)))
            font = self.font_md if ft.text.startswith("-") else self.font
            blit_outlined_text(
                self.screen,
                font,
                ft.text,
                ft.color,
                ft.x,
                ft.y,
                alpha,
            )

        log_top = ARENA_RECT.bottom + 8
        log_h = min(LOG_PANEL_H, max(48, HINT_Y - 8 - log_top))
        y = log_top + 8
        log_w = min(520, WIDTH - 32)
        log_bg = pygame.Surface((log_w, log_h), pygame.SRCALPHA)
        pygame.draw.rect(log_bg, (8, 12, 24, 185), log_bg.get_rect(), border_radius=8)
        pygame.draw.rect(log_bg, (70, 120, 160, 90), log_bg.get_rect(), 1, border_radius=8)
        pygame.draw.line(log_bg, (120, 190, 230, 180), (0, 6), (0, log_h - 6), 4)
        self.screen.blit(log_bg, (16, log_top))
        for line in self.logs[-4:]:
            self.screen.blit(self.font_sm.render(line, True, (210, 225, 240)), (28, y))
            y += 16

        self.screen.blit(
            self.font_sm.render(
                f"前方{ATTACK_CONE_DEG:.0f}°范围内自动攻击  |  观战 {self.match_real_elapsed:.1f}s  |  "
                f"{'静音' if self.sfx.muted else '有声'}  |  "
                "R 再开  |  ESC 回菜单  |  C 图鉴  |  M 静音",
                True,
                COL_HINT,
            ),
            (24, HINT_Y),
        )

        if game_over and self.end_msg:
            ov = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            ov.fill((8, 10, 20, 180))
            self.screen.blit(ov, (0, 0))
            result_panel = pygame.Rect(WIDTH // 2 - 280, HEIGHT // 2 - 115, 560, 230)
            accent = self.fighters[0].color if self.fighters else COL_RING
            draw_glass_panel(self.screen, result_panel, accent)
            msg = self.font_lg.render(self.end_msg, True, (255, 245, 230))
            sub = self.font.render("R 再开同阵容 · ESC 回菜单换人", True, COL_HINT)
            self.screen.blit(msg, msg.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 72)))
            if len(self.fighters) == 2:
                for index, fighter in enumerate(self.fighters):
                    hits = sum(fighter.action_counts.values())
                    line = (
                        f"{fighter.name}  伤害 {int(fighter.damage_dealt)}  "
                        f"承伤 {int(fighter.damage_taken)}  出手 {hits}"
                    )
                    text = self.font.render(line, True, fighter.color)
                    self.screen.blit(
                        text,
                        text.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 20 + index * 34)),
                    )
            duration = self.font_sm.render(
                f"观战时长 {self.match_real_elapsed:.1f}s · 有效运动 {self.match_elapsed:.1f}s",
                True,
                (170, 205, 225),
            )
            self.screen.blit(duration, duration.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 60)))
            self.screen.blit(sub, sub.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 92)))

    def hook_for_fighter(self, fighter: Fighter) -> Optional[HookProjectile]:
        return next(
            (
                hook
                for hook in self.hooks
                if not hook.finished
                and (hook.owner is fighter or (hook.attached and hook.target is fighter))
            ),
            None,
        )

    def launch_hook(
        self,
        owner: Fighter,
        target: Fighter,
        now_ms: int,
        is_ultimate: bool,
    ) -> bool:
        if self.hook_for_fighter(owner):
            return False
        speed = math.hypot(owner.vx, owner.vy)
        if speed < 1e-9:
            angle = random.uniform(0, math.pi * 2)
            direction_x, direction_y = math.cos(angle), math.sin(angle)
            saved_vx = direction_x * owner.base_move_speed
            saved_vy = direction_y * owner.base_move_speed
        else:
            direction_x, direction_y = owner.vx / speed, owner.vy / speed
            saved_vx, saved_vy = owner.vx, owner.vy

        owner.hook_release_count += 1
        infinite = (
            owner.hook_release_count >= HOOK_INFINITE_AFTER
            and random.random() < HOOK_INFINITE_CHANCE
        )
        start_distance = BALL_RADIUS + HOOK_RADIUS + 4
        hook = HookProjectile(
            owner=owner,
            target=target,
            x=owner.x + direction_x * start_distance,
            y=owner.y + direction_y * start_distance,
            vx=direction_x * HOOK_SPEED,
            vy=direction_y * HOOK_SPEED,
            outbound_left=HOOK_ULT_SEC if is_ultimate else HOOK_SKILL_SEC,
            infinite=infinite,
            saved_owner_vx=saved_vx,
            saved_owner_vy=saved_vy,
            path=[(owner.x, owner.y)],
        )
        owner.vx = 0.0
        owner.vy = 0.0
        owner.attack_until_ms = now_ms + ATTACK_POSE_MS
        if is_ultimate or infinite:
            owner.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        self.hooks.append(hook)
        banner_x = WIDTH // 4 if owner is self.fighters[0] else WIDTH * 3 // 4
        title = "无限鱼钩" if infinite else ("深海长线" if is_ultimate else "弹跳鱼线")
        self.banners.append(SkillBanner(f"{owner.name} · {title}", owner.color, banner_x))
        self.emit_particles(owner.x, owner.y, owner.color, 18, 145)
        self.push_log(
            f"{owner.name} 释放{title}（第{owner.hook_release_count}次，"
            f"{'不限时' if infinite else f'{hook.outbound_left:.0f}秒'}）"
        )
        return True

    def begin_hook_reel(
        self,
        hook: HookProjectile,
        attached: bool,
        now_ms: int,
    ) -> None:
        if hook.phase == "reeling":
            if attached and not hook.attached:
                hook.attached = True
                self.push_log(f"{hook.owner.name} 回收途中勾住 {hook.target.name}")
                self.apply_hook_drag_damage(hook, HOOK_DAMAGE_TICK_SEC, now_ms, True)
            return
        hook.phase = "reeling"
        hook.attached = attached
        hook.path.append((hook.x, hook.y))
        hook.reel_index = len(hook.path) - 2
        if attached:
            self.push_log(f"{hook.owner.name} 的鱼钩勾住 {hook.target.name}，开始回收")
            self.apply_hook_drag_damage(hook, HOOK_DAMAGE_TICK_SEC, now_ms, True)
        else:
            self.push_log(f"{hook.owner.name} 放线超时，开始空钩回收")

    def apply_hook_drag_damage(
        self,
        hook: HookProjectile,
        duration: float,
        now_ms: int,
        first_tick: bool = False,
    ) -> None:
        owner, target = hook.owner, hook.target
        if owner.hp <= 0 or target.hp <= 0:
            return
        decisive_mult = (
            DECISIVE_DAMAGE_MULT if self.match_elapsed >= DECISIVE_SEC else 1.0
        )
        raw_damage = (
            owner.atk
            * HOOK_DAMAGE_PER_SEC_MULT
            * duration
            * DAMAGE_SCALE
            * owner.damage_mult
            * decisive_mult
        )
        counter = 0.0
        counter_label = ""
        if not hook.damage_started:
            direct, counter, counter_label = resolve_clara_response(
                target, owner, raw_damage, decisive_mult
            )
            hook.damage_reduction = direct / raw_damage if raw_damage > 0 else 1.0
            hook.damage_started = True
            gain_energy(target, 10)
        else:
            direct = raw_damage * hook.damage_reduction

        direct, shield_absorbed = absorb_shield_damage(target, direct)
        target.hp = max(0.0, target.hp - direct)
        owner.hp = max(0.0, owner.hp - counter)
        owner.damage_dealt += direct
        target.damage_taken += direct
        target.damage_dealt += counter
        owner.damage_taken += counter
        hook.damage_total += direct
        owner.attack_until_ms = now_ms + ATTACK_POSE_MS
        self.floats.append(
            FloatingText(target.x - 22, target.y - 28, f"-{int(direct)} 拖拽", COL_DMG)
        )
        self.push_log(f"{owner.name} 鱼钩拖拽 → {target.name} -{int(direct)}")
        self.emit_particles(target.x, target.y, owner.color, 5, 80)
        if shield_absorbed > 0:
            self.floats.append(
                FloatingText(target.x - 22, target.y - 48, f"护盾-{int(shield_absorbed)}", target.color)
            )

        if first_tick:
            self.spawn_attack_effect(owner, target, "鱼钩拖拽", "skill")
            self.hit_stop_until_ms = max(self.hit_stop_until_ms, now_ms + HIT_STOP_MS)
        if counter > 0:
            self.floats.append(
                FloatingText(
                    owner.x,
                    owner.y - 22,
                    f"-{int(counter)} {counter_label}",
                    (255, 180, 100),
                )
            )
            self.push_log(f"{target.name} {counter_label} → {owner.name} -{int(counter)}")
            self.spawn_counter_effect(target, owner, counter_label)
        self.last_collision_ms = now_ms

    def finish_hook(self, hook: HookProjectile, now_ms: int) -> None:
        owner = hook.owner
        owner.vx = hook.saved_owner_vx
        owner.vy = hook.saved_owner_vy
        clamp_speed(owner)
        if hook.attached:
            self.push_log(
                f"{owner.name} 完成鱼钩回收，拖拽累计造成 {int(hook.damage_total)} 伤害"
            )
        else:
            self.push_log(f"{owner.name} 收回鱼钩，本次未命中")
        hook.finished = True

    def update_hooks(self, dt: float, now_ms: int) -> None:
        for hook in self.hooks:
            if hook.finished:
                continue
            if hook.owner.hp <= 0 or hook.target.hp <= 0:
                hook.owner.vx = hook.saved_owner_vx
                hook.owner.vy = hook.saved_owner_vy
                hook.finished = True
                continue

            if hook.phase == "outbound":
                hook.x += hook.vx * dt
                hook.y += hook.vy * dt
                left = ARENA_RECT.left + HOOK_RADIUS
                right = ARENA_RECT.right - HOOK_RADIUS
                top = ARENA_RECT.top + HOOK_RADIUS
                bottom = ARENA_RECT.bottom - HOOK_RADIUS
                bounced = False
                if hook.x < left:
                    hook.x, hook.vx, bounced = left, abs(hook.vx), True
                elif hook.x > right:
                    hook.x, hook.vx, bounced = right, -abs(hook.vx), True
                if hook.y < top:
                    hook.y, hook.vy, bounced = top, abs(hook.vy), True
                elif hook.y > bottom:
                    hook.y, hook.vy, bounced = bottom, -abs(hook.vy), True
                if bounced:
                    hook.path.append((hook.x, hook.y))

                if math.hypot(hook.x - hook.target.x, hook.y - hook.target.y) <= (
                    HOOK_RADIUS + BALL_RADIUS
                ):
                    self.begin_hook_reel(hook, True, now_ms)
                elif not hook.infinite:
                    hook.outbound_left -= dt
                    if hook.outbound_left <= 0:
                        self.begin_hook_reel(hook, False, now_ms)
            else:
                remaining = HOOK_REEL_SPEED * dt
                while remaining > 0 and hook.reel_index >= 0:
                    tx, ty = hook.path[hook.reel_index]
                    dx, dy = tx - hook.x, ty - hook.y
                    distance = math.hypot(dx, dy)
                    if distance <= remaining:
                        hook.x, hook.y = tx, ty
                        remaining -= distance
                        hook.reel_index -= 1
                    elif distance > 0:
                        hook.x += dx / distance * remaining
                        hook.y += dy / distance * remaining
                        remaining = 0

                if not hook.attached and math.hypot(
                    hook.x - hook.target.x, hook.y - hook.target.y
                ) <= (HOOK_RADIUS + BALL_RADIUS):
                    self.begin_hook_reel(hook, True, now_ms)
                if hook.attached:
                    hook.target.x = hook.x
                    hook.target.y = hook.y
                    hook.damage_tick_accum += dt
                    while (
                        hook.damage_tick_accum >= HOOK_DAMAGE_TICK_SEC
                        and hook.owner.hp > 0
                        and hook.target.hp > 0
                    ):
                        hook.damage_tick_accum -= HOOK_DAMAGE_TICK_SEC
                        self.apply_hook_drag_damage(
                            hook,
                            HOOK_DAMAGE_TICK_SEC,
                            now_ms,
                        )
                if hook.reel_index < 0:
                    self.finish_hook(hook, now_ms)

        self.hooks = [hook for hook in self.hooks if not hook.finished]

    def activate_clara_ultimate(self, fighter: Fighter, now_ms: int) -> bool:
        need = float(fighter.kit().get("ult_need") or 100)
        if fighter.char.get("tag") != "clara" or fighter.energy < need:
            return False
        fighter.energy = 0.0
        fighter.clara_counter_charges = 2
        fighter.action_counts["ultimate"] = fighter.action_counts.get("ultimate", 0) + 1
        fighter.attack_until_ms = now_ms + ATTACK_POSE_MS
        fighter.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        self.effects.append(
            CombatEffect(
                "guard",
                fighter.x,
                fighter.y,
                fighter.x,
                fighter.y,
                fighter.color,
                1.0,
                1.0,
                1.55,
            )
        )
        self.emit_particles(fighter.x, fighter.y, (255, 195, 115), 28, 175)
        banner_x = WIDTH // 4 if fighter is self.fighters[0] else WIDTH * 3 // 4
        self.banners.append(
            SkillBanner(f"{fighter.name} · 是约定不是命令", fighter.color, banner_x)
        )
        self.push_log(f"{fighter.name} 发动终结技，获得 2 次强化反击")
        self.hit_stop_until_ms = max(self.hit_stop_until_ms, now_ms + ULTIMATE_HIT_STOP_MS)
        return True

    def trigger_lightning_lord(
        self,
        fighter: Fighter,
        target: Fighter,
        now_ms: int,
        decisive_mult: float,
    ) -> None:
        hits = fighter.lightning_lord_hits
        damage = (
            fighter.atk
            * 0.28
            * hits
            * DAMAGE_SCALE
            * fighter.damage_mult
            * decisive_mult
        )
        target.hp = max(0.0, target.hp - damage)
        fighter.damage_dealt += damage
        target.damage_taken += damage
        fighter.action_counts["passive"] = fighter.action_counts.get("passive", 0) + 1
        fighter.lightning_lord_hits = 3
        fighter.lightning_lord_progress = 0.0
        fighter.attack_until_ms = now_ms + ATTACK_POSE_MS
        fighter.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        label = f"神君·{hits}段"
        self.floats.append(
            FloatingText(target.x - 28, target.y - 34, f"-{int(damage)} {label}", COL_DMG)
        )
        self.push_log(f"{fighter.name} {label} → {target.name} -{int(damage)}")
        self.spawn_attack_effect(fighter, target, label, "passive")
        self.hit_stop_until_ms = max(self.hit_stop_until_ms, now_ms + HIT_STOP_MS)

    def trigger_seele_resurgence(
        self,
        fighter: Fighter,
        target: Fighter,
        hp_before: float,
        decisive_mult: float,
        now_ms: int,
    ) -> None:
        threshold = target.max_hp * 0.30
        if (
            fighter.char.get("tag") != "seele"
            or fighter.seele_resurgence_used
            or hp_before <= threshold
            or target.hp > threshold
            or target.hp <= 0
        ):
            return
        damage = (
            fighter.atk
            * 0.50
            * DAMAGE_SCALE
            * fighter.damage_mult
            * decisive_mult
        )
        target.hp = max(0.0, target.hp - damage)
        fighter.damage_dealt += damage
        target.damage_taken += damage
        fighter.action_counts["passive"] = fighter.action_counts.get("passive", 0) + 1
        fighter.seele_resurgence_used = True
        fighter.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        fighter.seele_amplified_attacks_left = min(
            3, fighter.seele_amplified_attacks_left + 1
        )
        self.floats.append(
            FloatingText(target.x - 20, target.y - 40, f"-{int(damage)} 再现", (225, 170, 255))
        )
        self.push_log(f"{fighter.name} 触发再现 → {target.name} -{int(damage)}")
        self.spawn_attack_effect(fighter, target, "再现", "passive")

    def announce_evolution(self, fighter: Fighter, states: List[str]) -> None:
        for state in states:
            self.floats.append(
                FloatingText(fighter.x - 42, fighter.y - 52, f"升级 · {state}", COL_HEAL, 1.4, -28)
            )
            self.effects.append(
                CombatEffect(
                    "impact",
                    fighter.x,
                    fighter.y,
                    fighter.x,
                    fighter.y,
                    fighter.color,
                    0.85,
                    0.85,
                    1.65,
                )
            )
            self.emit_particles(fighter.x, fighter.y, fighter.color, 24, 175)
            self.push_log(f"{fighter.name} 进化为「{state}」")
            self.sfx.play("evolve", 0.4)

    def handle_hit(
        self,
        a: Fighter,
        b: Fighter,
        now_ms: int,
        a_can_attack: bool = True,
        b_can_attack: bool = True,
        grant_collision_progress: bool = True,
    ) -> bool:
        if not a_can_attack and not b_can_attack:
            return False
        if a_can_attack and now_ms < a.hit_cd_until:
            a_can_attack = False
        if b_can_attack and now_ms < b.hit_cd_until:
            b_can_attack = False
        if not a_can_attack and not b_can_attack:
            return False
        queued_slot: Optional[int] = None
        if a_can_attack and b_can_attack:
            a_offset = attack_center_offset_deg(a, b)
            b_offset = attack_center_offset_deg(b, a)
            if abs(a_offset - b_offset) <= 0.05:
                first_slot = self.initiative_tiebreak
                self.initiative_tiebreak = 1 - self.initiative_tiebreak
            else:
                first_slot = 0 if a_offset < b_offset else 1
            queued_slot = 1 - first_slot
            if first_slot == 0:
                b_can_attack = False
                first, second, first_offset = a, b, a_offset
            else:
                a_can_attack = False
                first, second, first_offset = b, a, b_offset
            self.push_log(
                f"{first.name} 抢先手（中心偏角 {first_offset:.1f}°），"
                f"{second.name} 延后攻击"
            )
        # 冷却从攻击展示结束再算 1 秒，避免 2 秒暂停一结束立刻连打。
        cooldown_until = now_ms + ATTACK_POSE_MS + HIT_COOLDOWN_MS
        if a_can_attack:
            a.hit_cd_until = max(a.hit_cd_until, cooldown_until)
        if b_can_attack:
            b.hit_cd_until = max(b.hit_cd_until, cooldown_until)
        if queued_slot is None:
            a.hit_cd_until = max(a.hit_cd_until, cooldown_until)
            b.hit_cd_until = max(b.hit_cd_until, cooldown_until)

        # 互攻时这里只结算中心偏角更小的先手，后手在暂停结束后另行结算。
        decisive_mult = DECISIVE_DAMAGE_MULT if self.match_elapsed >= DECISIVE_SEC else 1.0
        sp_a_before, sp_b_before = a.skill_points, b.skill_points
        dmg_a, label_a, action_a = (
            perform_action(a, b, decisive_mult)
            if a_can_attack
            else (0.0, "", "")
        )
        dmg_b, label_b, action_b = (
            perform_action(b, a, decisive_mult)
            if b_can_attack
            else (0.0, "", "")
        )
        if a_can_attack and action_a:
            a.action_counts[action_a] = a.action_counts.get(action_a, 0) + 1
        if b_can_attack and action_b:
            b.action_counts[action_b] = b.action_counts.get(action_b, 0) + 1
        hook_action_a = a.char.get("tag") == "hook" and action_a in ("skill", "ultimate")
        hook_action_b = b.char.get("tag") == "hook" and action_b in ("skill", "ultimate")
        if hook_action_a:
            self.launch_hook(a, b, now_ms, action_a == "ultimate")
        if hook_action_b:
            self.launch_hook(b, a, now_ms, action_b == "ultimate")
        if action_a == "ultimate":
            a.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        if action_b == "ultimate":
            b.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        if action_a == "passive":
            a.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        if action_b == "passive":
            b.portrait_showcase_until_ms = now_ms + PORTRAIT_SHOWCASE_MS
        if dmg_b > 0:
            gain_energy(a, 10)
        if dmg_a > 0:
            gain_energy(b, 10)

        direct_to_a, counter_a, counter_label_a = (
            resolve_clara_response(a, b, dmg_b, decisive_mult)
            if b_can_attack
            else (0.0, 0.0, "")
        )
        direct_to_b, counter_b, counter_label_b = (
            resolve_clara_response(b, a, dmg_a, decisive_mult)
            if a_can_attack
            else (0.0, 0.0, "")
        )
        direct_to_a, shield_absorbed_a = absorb_shield_damage(a, direct_to_a)
        direct_to_b, shield_absorbed_b = absorb_shield_damage(b, direct_to_b)

        if a_can_attack and a.char.get("tag") == "zhongli" and action_a == "ultimate":
            b.petrified_until_ms = max(b.petrified_until_ms, now_ms + 1600)
        if b_can_attack and b.char.get("tag") == "zhongli" and action_b == "ultimate":
            a.petrified_until_ms = max(a.petrified_until_ms, now_ms + 1600)

        hp_a_before, hp_b_before = a.hp, b.hp
        incoming_a = direct_to_a + counter_b
        incoming_b = direct_to_b + counter_a
        a.hp = max(0.0, a.hp - incoming_a)
        b.hp = max(0.0, b.hp - incoming_b)
        a.damage_dealt += direct_to_b + counter_a
        b.damage_dealt += direct_to_a + counter_b
        a.damage_taken += incoming_a
        b.damage_taken += incoming_b
        if shield_absorbed_a > 0:
            self.floats.append(
                FloatingText(a.x - 25, a.y - 48, f"护盾-{int(shield_absorbed_a)}", a.color)
            )
        if shield_absorbed_b > 0:
            self.floats.append(
                FloatingText(b.x - 25, b.y - 48, f"护盾-{int(shield_absorbed_b)}", b.color)
            )

        mx, my = (a.x + b.x) / 2, (a.y + b.y) / 2
        if a_can_attack:
            a.attack_until_ms = now_ms + ATTACK_POSE_MS
            sp_delta = a.skill_points - sp_a_before
            if sp_delta:
                self.floats.append(
                    FloatingText(
                        a.x - 24,
                        a.y + 34,
                        f"SP {sp_delta:+d}",
                        COL_HEAL if sp_delta > 0 else (255, 205, 90),
                    )
                )
            if not hook_action_a:
                self.floats.append(
                    FloatingText(mx + 15, my - 25, f"-{int(direct_to_b)} {label_a}", COL_DMG)
                )
                self.push_log(f"{a.name} {label_a} → {b.name} -{int(direct_to_b)}")
                self.spawn_attack_effect(a, b, label_a, action_a)
        if b_can_attack:
            b.attack_until_ms = now_ms + ATTACK_POSE_MS
            sp_delta = b.skill_points - sp_b_before
            if sp_delta:
                self.floats.append(
                    FloatingText(
                        b.x - 24,
                        b.y + 34,
                        f"SP {sp_delta:+d}",
                        COL_HEAL if sp_delta > 0 else (255, 205, 90),
                    )
                )
            if not hook_action_b:
                self.floats.append(
                    FloatingText(mx - 55, my, f"-{int(direct_to_a)} {label_b}", COL_DMG)
                )
                self.push_log(f"{b.name} {label_b} → {a.name} -{int(direct_to_a)}")
                self.spawn_attack_effect(b, a, label_b, action_b)

        if counter_a > 0:
            a.attack_until_ms = now_ms + ATTACK_POSE_MS
            self.floats.append(
                FloatingText(
                    b.x,
                    b.y - 20,
                    f"-{int(counter_a)} {counter_label_a}",
                    (255, 180, 100),
                )
            )
            self.push_log(f"{a.name} {counter_label_a} → {b.name} -{int(counter_a)}")
            self.spawn_counter_effect(a, b, counter_label_a)
        if counter_b > 0:
            b.attack_until_ms = now_ms + ATTACK_POSE_MS
            self.floats.append(
                FloatingText(
                    a.x,
                    a.y - 20,
                    f"-{int(counter_b)} {counter_label_b}",
                    (255, 180, 100),
                )
            )
            self.push_log(f"{b.name} {counter_label_b} → {a.name} -{int(counter_b)}")
            self.spawn_counter_effect(b, a, counter_label_b)

        if dmg_a > 0:
            self.trigger_seele_resurgence(a, b, hp_b_before, decisive_mult, now_ms)
        if dmg_b > 0:
            self.trigger_seele_resurgence(b, a, hp_a_before, decisive_mult, now_ms)

        if grant_collision_progress:
            collision_gain = float(self.progression.get("gain_per_collision", 10.0))
            for fighter in (a, b):
                if fighter.hp > 0:
                    self.announce_evolution(fighter, advance_evolution(fighter, collision_gain))
            self.last_collision_ms = now_ms
        stop_ms = (
            ULTIMATE_HIT_STOP_MS
            if "ultimate" in (action_a, action_b)
            else HIT_STOP_MS
        )
        self.hit_stop_until_ms = max(self.hit_stop_until_ms, now_ms + stop_ms)
        if queued_slot is not None:
            self.pending_attack_slot = queued_slot
        return True

    def update_duel(self, dt: float) -> None:
        if self.state != "duel" or len(self.fighters) != 2:
            return
        r = float(BALL_RADIUS)
        now = pygame.time.get_ticks()
        self.match_real_elapsed += dt
        if now < self.hit_stop_until_ms:
            for ft in self.floats:
                ft.life -= dt
                ft.y += ft.vy * dt * 0.35
            self.floats = [ft for ft in self.floats if ft.life > 0]
            self.update_combat_effects(dt * 0.55)
            return
        if self.pending_attack_slot is not None:
            pending_slot = self.pending_attack_slot
            self.pending_attack_slot = None
            a, b = self.fighters
            if a.hp > 0 and b.hp > 0:
                self.handle_hit(
                    a,
                    b,
                    now,
                    a_can_attack=pending_slot == 0,
                    b_can_attack=pending_slot == 1,
                    grant_collision_progress=False,
                )
                return
        self.match_elapsed += dt
        idle_sec = max(0.0, (now - self.last_collision_ms) / 1000.0)
        time_gain = dt * float(self.progression.get("gain_per_second", 1.0))

        if self.match_elapsed >= DECISIVE_SEC and not self.decisive_announced:
            self.decisive_announced = True
            self.push_log("进入决胜阶段：双方造成伤害提高 50%")

        for f in self.fighters:
            if f.hp <= 0:
                continue
            self.announce_evolution(f, advance_evolution(f, time_gain))

        a, b = self.fighters
        decisive_mult = (
            DECISIVE_DAMAGE_MULT if self.match_elapsed >= DECISIVE_SEC else 1.0
        )
        special_triggered = False
        for fighter in (a, b):
            if fighter.hp > 0 and now >= fighter.petrified_until_ms:
                special_triggered = self.activate_clara_ultimate(fighter, now) or special_triggered

        ready_lords: List[Tuple[Fighter, Fighter]] = []
        for fighter, target in ((a, b), (b, a)):
            if fighter.char.get("tag") != "jingyuan" or fighter.hp <= 0 or target.hp <= 0:
                continue
            interval = max(5.0, 8.0 - (fighter.lightning_lord_hits - 3) * 0.35)
            fighter.lightning_lord_progress += dt / interval
            if fighter.lightning_lord_progress >= 1.0:
                ready_lords.append((fighter, target))
        for fighter, target in ready_lords:
            self.trigger_lightning_lord(fighter, target, now, decisive_mult)
            special_triggered = True
        if special_triggered:
            return

        self.update_hooks(dt, now)
        a_locked = self.hook_for_fighter(a) is not None or now < a.petrified_until_ms
        b_locked = self.hook_for_fighter(b) is not None or now < b.petrified_until_ms

        if a.hp > 0 and b.hp > 0 and not a_locked:
            apply_idle_motion(a, b, idle_sec, dt)
        if a.hp > 0 and b.hp > 0 and not b_locked:
            apply_idle_motion(b, a, idle_sec, dt)

        for f in self.fighters:
            if f.hp <= 0 or self.hook_for_fighter(f) or now < f.petrified_until_ms:
                continue
            f.x += f.vx * dt
            f.y += f.vy * dt
            reflect_square(f, ARENA_RECT, r)
            clamp_speed(f)
            f.trail.insert(0, (f.x, f.y))
            f.trail = f.trail[:8]

        if a.hp > 0 and b.hp > 0:
            a_can_attack = not a_locked and target_in_attack_cone(a, b)
            b_can_attack = not b_locked and target_in_attack_cone(b, a)
            self.handle_hit(a, b, now, a_can_attack, b_can_attack)
            a_locked = self.hook_for_fighter(a) is not None or now < a.petrified_until_ms
            b_locked = self.hook_for_fighter(b) is not None or now < b.petrified_until_ms

            if (
                self.hook_for_fighter(a) is None
                and self.hook_for_fighter(b) is None
                and math.hypot(a.x - b.x, a.y - b.y) <= 2 * r + 1
            ):
                resolve_bounce(a, b, r)
                clamp_speed(a)
                clamp_speed(b)

        for ft in self.floats:
            ft.life -= dt
            ft.y += ft.vy * dt
        self.floats = [ft for ft in self.floats if ft.life > 0]
        self.update_combat_effects(dt)

        if now < self.hit_stop_until_ms:
            return
        if a.hp <= 0 or b.hp <= 0:
            self.state = "over"
            if a.hp <= 0 and b.hp <= 0:
                self.end_msg = "同归于尽"
                winner = "同归于尽"
            elif a.hp <= 0:
                self.end_msg = f"{b.name} 获胜！"
                winner = b.name
            else:
                self.end_msg = f"{a.name} 获胜！"
                winner = a.name
            self.push_log(self.end_msg)
            self.finish_match("completed", winner)

    def on_click_menu(self, pos: Tuple[int, int], button: int) -> None:
        rects = self.menu_rects()
        if button != 1:
            return
        for i in range(len(self.chars)):
            if rects[f"char{i}"].collidepoint(pos):
                self.drag_char_idx = i
                self.drag_pos = pos
                return
        if rects["start"].collidepoint(pos):
            self.sfx.play("ui", 0.32)
            self.start_duel()
        elif rects["codex"].collidepoint(pos):
            self.sfx.play("ui", 0.32)
            self.codex_idx = self.pick_a
            self.state = "codex"
        elif rects["quit"].collidepoint(pos):
            self.sfx.play("ui", 0.28)
            pygame.event.post(pygame.event.Event(pygame.QUIT))

    def on_drop_menu(self, pos: Tuple[int, int]) -> None:
        if self.drag_char_idx is None:
            return
        index = self.drag_char_idx
        rects = self.menu_rects()
        if rects["p1_slot"].collidepoint(pos):
            if self.pick_b == index:
                self.pick_b = self.pick_a
            self.pick_a = index
        elif rects["p2_slot"].collidepoint(pos):
            if self.pick_a == index:
                self.pick_a = self.pick_b
            self.pick_b = index
        self.drag_char_idx = None

    def run(self) -> None:
        running = True
        while running:
            dt = self.clock.tick(FPS) / 1000.0
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.finish_match("window_closed")
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        if self.state in ("duel", "over", "codex"):
                            if self.state == "duel":
                                self.finish_match("menu_exit")
                            self.state = "menu"
                        else:
                            running = False
                    elif event.key == pygame.K_c:
                        if self.state == "duel":
                            self.finish_match("codex_exit")
                        self.codex_idx = self.pick_a
                        self.state = "codex"
                    elif event.key in (pygame.K_r, pygame.K_F5) and self.state in ("duel", "over"):
                        self.start_duel()
                    elif event.key == pygame.K_m:
                        muted = self.sfx.toggle_mute()
                        self.push_log("音效已静音" if muted else "音效已开启")
                        self.sfx.play("ui", 0.3)
                    elif self.state == "codex":
                        if event.key == pygame.K_LEFT:
                            self.codex_idx = (self.codex_idx - 1) % len(self.chars)
                            self.sfx.play("ui", 0.28)
                        elif event.key == pygame.K_RIGHT:
                            self.codex_idx = (self.codex_idx + 1) % len(self.chars)
                            self.sfx.play("ui", 0.28)
                        elif event.key == pygame.K_b:
                            self.state = "menu"
                            self.sfx.play("ui", 0.28)
                elif event.type == pygame.MOUSEBUTTONDOWN and self.state == "menu":
                    self.on_click_menu(event.pos, event.button)
                elif event.type == pygame.MOUSEMOTION and self.state == "menu":
                    if self.drag_char_idx is not None:
                        self.drag_pos = event.pos
                elif event.type == pygame.MOUSEBUTTONUP and self.state == "menu":
                    if event.button == 1:
                        self.on_drop_menu(event.pos)

            if self.state == "duel":
                self.update_duel(dt)

            if self.state == "menu":
                self.draw_menu()
            elif self.state == "codex":
                self.draw_codex()
            elif self.state == "duel":
                self.draw_duel(False)
            elif self.state == "over":
                self.draw_duel(True)

            pygame.display.flip()

        pygame.quit()
        sys.exit(0)


def main() -> None:
    App().run()


if __name__ == "__main__":
    main()
