import type { AppState, Entry, Game } from "./types";

const KEY = "game-notes-web-v1";

function nowIso(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultState = (): AppState => {
  const t = nowIso();
  const g1: Game = {
    id: uid(),
    name: "原神",
    sort_order: 0,
    created_at: t,
    updated_at: t,
  };
  const g2: Game = {
    id: uid(),
    name: "崩坏：星穹铁道",
    sort_order: 1,
    created_at: t,
    updated_at: t,
  };
  const g3: Game = {
    id: uid(),
    name: "绝区零",
    sort_order: 2,
    created_at: t,
    updated_at: t,
  };
  const g4: Game = {
    id: uid(),
    name: "鸣潮",
    sort_order: 3,
    created_at: t,
    updated_at: t,
  };

  const games = [g1, g2, g3, g4];

  const sampleEntryId = uid();
  const entries: Entry[] = [
    {
      id: sampleEntryId,
      game_id: g1.id,
      title: "深渊12层满星攻略",
      entry_type: "guide",
      team_name: "雷神国家队",
      game_version: "4.5",
      tags: ["深渊", "雷神"],
      body: `本期深渊12层配置分析:\n\n上半: 主要针对单体BOSS，推荐使用爆发队伍。雷神国家队可以在30秒内完成击败。\n\n下半: 群体怪物较多，需要AOE伤害。推荐使用万叶+心海的感电队。\n\n关键重点:\n- 合理利用元素爆发的无敌帧\n- 注意怪物的攻击节奏\n- 优先击败精英怪`,
      steps: [
        {
          order: 0,
          label: "准备阶段",
          detail: "确保角色满级，圣遗物强化到+20",
          timeLabel: "开始前",
        },
        {
          order: 1,
          label: "上半间",
          detail: "雷神开E，班尼特开Q，香菱开Q",
          timeLabel: "0:00 - 0:30",
        },
        {
          order: 2,
          label: "下半间",
          detail: "万叶聚怪，心海挂水",
          timeLabel: "0:30 - 1:30",
        },
      ],
      created_at: t,
      updated_at: t,
    },
    {
      id: uid(),
      game_id: g1.id,
      title: "枫丹世界任务线路图",
      entry_type: "explore",
      team_name: "",
      game_version: "",
      tags: [],
      body: "探索向备忘……",
      steps: [],
      created_at: t,
      updated_at: t,
    },
    {
      id: uid(),
      game_id: g1.id,
      title: "圣遗物副词条权重表",
      entry_type: "build",
      team_name: "",
      game_version: "",
      tags: ["圣遗物", "角色"],
      body: "养成参考……",
      steps: [],
      created_at: t,
      updated_at: t,
    },
    {
      id: uid(),
      game_id: g1.id,
      title: "魔神任务完整时间线",
      entry_type: "story",
      team_name: "",
      game_version: "",
      tags: [],
      body: "剧情整理……",
      steps: [],
      created_at: t,
      updated_at: t,
    },
  ];

  return {
    preferences: { home_cover_image: null, home_cover_updated_at: null },
    games,
    entries,
    current_game_id: g1.id,
  };
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.games || !parsed.entries) return defaultState();
    if (!parsed.preferences) {
      parsed.preferences = { home_cover_image: null, home_cover_updated_at: null };
    }
    if (parsed.current_game_id === undefined) parsed.current_game_id = parsed.games[0]?.id ?? null;
    return parsed;
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function countEntriesForGame(state: AppState, gameId: string): number {
  return state.entries.filter((e) => e.game_id === gameId).length;
}
