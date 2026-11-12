import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ENTRY_TYPE_LABEL, TAG_FILTER_CHIPS, TYPE_FILTER_CHIPS } from "../labels";
import type { EntryType } from "../types";
import { useAppState } from "../context/AppStateContext";
import { formatRelative } from "../util/time";
export default function EntryList() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { state } = useAppState();

  const game = state.games.find((g) => g.id === gameId);
  const [typePick, setTypePick] = useState<Set<EntryType>>(new Set());
  const [tagPick, setTagPick] = useState<Set<string>>(new Set());

  const entries = useMemo(() => {
    let list = state.entries.filter((e) => e.game_id === gameId);
    if (typePick.size) {
      list = list.filter((e) => typePick.has(e.entry_type));
    }
    if (tagPick.size) {
      list = list.filter((e) => e.tags.some((t) => tagPick.has(t)));
    }
    list = [...list].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return list;
  }, [state.entries, gameId, typePick, tagPick]);

  const toggleType = (t: EntryType) => {
    setTypePick((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  const toggleTag = (t: string) => {
    setTagPick((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  if (!gameId || !game) {
    return (
      <div className="page">
        <p>未找到游戏。</p>
        <Link to="/games">返回游戏列表</Link>
      </div>
    );
  }

  return (
    <div className="page page--fab">
      <Link to="/" className="link-back">
        ← 返回首页
      </Link>
      <h1 className="page-title">
        {game.name} - 笔记列表
      </h1>

      <section className="filter-block">
        <div className="filter-label">类型筛选</div>
        <div className="chip-row">
          {TYPE_FILTER_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`chip${typePick.has(key) ? " chip--on" : ""}`}
              onClick={() => toggleType(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-block">
        <div className="filter-label">标签筛选</div>
        <div className="chip-row">
          {TAG_FILTER_CHIPS.map((label) => (
            <button
              key={label}
              type="button"
              className={`chip${tagPick.has(label) ? " chip--on" : ""}`}
              onClick={() => toggleTag(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <ul className="note-card-list">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="note-card"
              onClick={() => navigate(`/games/${gameId}/entries/${e.id}`)}
            >
              <div className="note-card__left">
                <div className="note-card__title">{e.title || "(无标题)"}</div>
                <div className="note-card__meta">
                  {(() => {
                    const prefix = [
                      e.team_name || null,
                      ...e.tags.map((t) => `[${t}]`),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const rel = formatRelative(e.updated_at);
                    return prefix ? `${prefix} · ${rel}` : rel;
                  })()}
                </div>
              </div>
              <span className="note-card__tag">{ENTRY_TYPE_LABEL[e.entry_type]}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="fab"
        aria-label="新建笔记"
        onClick={() => navigate(`/games/${gameId}/entries/new`)}
      >
        +
      </button>
    </div>
  );
}
