import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppState, Entry, EntryType, Game } from "../types";
import { countEntriesForGame, loadState, saveState, uid } from "../storage";

function nowIso(): string {
  return new Date().toISOString();
}

type Ctx = {
  state: AppState;
  setCoverImage: (dataUrl: string | null) => void;
  setCurrentGameId: (id: string | null) => void;
  addGame: (name: string) => void;
  upsertEntry: (entry: Entry) => void;
  deleteEntry: (entryId: string) => void;
  countEntries: (gameId: string) => number;
};

const AppStateContext = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());

  const setCoverImage = useCallback((dataUrl: string | null) => {
    const t = nowIso();
    setState((prev) => {
      const next: AppState = {
        ...prev,
        preferences: {
          home_cover_image: dataUrl,
          home_cover_updated_at: dataUrl ? t : null,
        },
      };
      saveState(next);
      return next;
    });
  }, []);

  const setCurrentGameId = useCallback((id: string | null) => {
    setState((prev) => {
      const next = { ...prev, current_game_id: id };
      saveState(next);
      return next;
    });
  }, []);

  const addGame = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => {
      const t = nowIso();
      const g: Game = {
        id: uid(),
        name: trimmed,
        sort_order: prev.games.length,
        created_at: t,
        updated_at: t,
      };
      const next: AppState = {
        ...prev,
        games: [...prev.games, g],
        current_game_id: g.id,
      };
      saveState(next);
      return next;
    });
  }, []);

  const upsertEntry = useCallback((entry: Entry) => {
    setState((prev) => {
      const exists = prev.entries.some((e) => e.id === entry.id);
      const entries = exists
        ? prev.entries.map((e) => (e.id === entry.id ? entry : e))
        : [...prev.entries, entry];
      const next = { ...prev, entries };
      saveState(next);
      return next;
    });
  }, []);

  const deleteEntry = useCallback((entryId: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        entries: prev.entries.filter((e) => e.id !== entryId),
      };
      saveState(next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      setCoverImage,
      setCurrentGameId,
      addGame,
      upsertEntry,
      deleteEntry,
      countEntries: (gameId) => countEntriesForGame(state, gameId),
    }),
    [state, setCoverImage, setCurrentGameId, addGame, upsertEntry, deleteEntry],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): Ctx {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState outside provider");
  return ctx;
}

export function emptyEntry(gameId: string): Entry {
  const t = nowIso();
  return {
    id: uid(),
    game_id: gameId,
    title: "",
    entry_type: "guide" as EntryType,
    team_name: "",
    game_version: "",
    tags: [],
    body: "",
    steps: [],
    created_at: t,
    updated_at: t,
  };
}
