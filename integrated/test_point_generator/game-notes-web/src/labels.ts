import type { EntryType } from "./types";

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  guide: "攻略",
  build: "养成",
  explore: "探索",
  story: "剧情",
};

export const ENTRY_TYPES: EntryType[] = ["guide", "build", "explore", "story"];

export const TYPE_FILTER_CHIPS: { key: EntryType; label: string }[] = [
  { key: "guide", label: "攻略" },
  { key: "build", label: "养成" },
  { key: "explore", label: "探索" },
  { key: "story", label: "剧情" },
];

export const TAG_FILTER_CHIPS = ["深渊", "世界BOSS", "圣遗物", "角色", "武器"] as const;
