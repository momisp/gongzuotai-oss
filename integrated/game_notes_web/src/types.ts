export type EntryType = "guide" | "build" | "explore" | "story";

export interface Step {
  order: number;
  label: string;
  detail?: string;
  timeLabel?: string;
}

export interface Game {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  game_id: string;
  title: string;
  entry_type: EntryType;
  team_name: string;
  game_version: string;
  tags: string[];
  body: string;
  steps: Step[];
  created_at: string;
  updated_at: string;
}

export interface AppPreferences {
  home_cover_image: string | null;
  home_cover_updated_at: string | null;
}

export interface AppState {
  preferences: AppPreferences;
  games: Game[];
  entries: Entry[];
  current_game_id: string | null;
}
