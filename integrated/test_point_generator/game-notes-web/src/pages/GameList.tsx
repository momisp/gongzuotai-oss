import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
const ICONS = ["🎮", "🚂", "⚡", "🌊", "🎯", "🕹️"];

function iconFor(idx: number) {
  return ICONS[idx % ICONS.length];
}

export default function GameList() {
  const navigate = useNavigate();
  const { state, addGame, setCurrentGameId, countEntries } = useAppState();
  const sorted = useMemo(
    () => [...state.games].sort((a, b) => a.sort_order - b.sort_order),
    [state.games],
  );
  const currentId = state.current_game_id;

  const onSelect = (id: string) => {
    setCurrentGameId(id);
    navigate(`/games/${id}/entries`);
  };

  const onAdd = () => {
    const name = window.prompt("请输入游戏名称");
    if (name) addGame(name);
  };

  return (
    <div className="page">
      <Link to="/" className="link-back">
        ← 返回首页
      </Link>
      <h1 className="page-title">游戏列表</h1>
      <ul className="card-list">
        {sorted.map((g, i) => {
          const active = g.id === currentId;
          const n = countEntries(g.id);
          return (
            <li key={g.id}>
              <button
                type="button"
                className={`game-card${active ? " game-card--active" : ""}`}
                onClick={() => onSelect(g.id)}
              >
                <span className="game-card__icon" aria-hidden>
                  {iconFor(i)}
                </span>
                <span className="game-card__body">
                  <span className="game-card__title-row">
                    <span className="game-card__name">{g.name}</span>
                    {active ? <span className="pill pill--current">当前</span> : null}
                  </span>
                  <span className="game-card__meta">{n} 条笔记</span>
                </span>
                {active ? <span className="game-card__check">✓</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="add-game-btn" onClick={onAdd}>
        + 添加游戏
      </button>
    </div>
  );
}
