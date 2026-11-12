import { Link, useNavigate, useParams } from "react-router-dom";
import { ENTRY_TYPE_LABEL } from "../labels";
import { useAppState } from "../context/AppStateContext";
function formatLocal(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function EntryDetail() {
  const { gameId, entryId } = useParams<{ gameId: string; entryId: string }>();
  const navigate = useNavigate();
  const { state } = useAppState();

  const game = state.games.find((g) => g.id === gameId);
  const entry = state.entries.find((e) => e.id === entryId && e.game_id === gameId);

  if (!gameId || !entryId || !game || !entry) {
    return (
      <div className="page">
        <p>未找到笔记。</p>
        <Link to={gameId ? `/games/${gameId}/entries` : "/games"}>返回列表</Link>
      </div>
    );
  }

  const steps = [...entry.steps].sort((a, b) => a.order - b.order);

  return (
    <div className="page page-detail">
      <header className="detail-head">
        <Link to={`/games/${gameId}/entries`} className="link-back">
          ← 返回列表
        </Link>
        <div className="detail-head__row">
          <h1 className="page-title page-title--detail">{entry.title || "(无标题)"}</h1>
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => navigate(`/games/${gameId}/entries/${entry.id}/edit`)}
          >
            ✎ 编辑
          </button>
        </div>
        <div className="detail-badges">
          <span className="pill pill--primary">{ENTRY_TYPE_LABEL[entry.entry_type]}</span>
          <span className="detail-version">
            {[entry.team_name, entry.game_version && `版本 ${entry.game_version}`]
              .filter(Boolean)
              .join(" ")}
          </span>
        </div>
        {entry.tags.length > 0 ? (
          <div className="hash-tags">
            {entry.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        ) : null}
      </header>

      <section className="detail-card">
        <h2 className="detail-card__title">正文</h2>
        <div className="detail-body">{entry.body || "（暂无正文）"}</div>
      </section>

      {steps.length > 0 ? (
        <section className="detail-card">
          <h2 className="detail-card__title">步骤清单</h2>
          <ol className="step-timeline">
            {steps.map((s, i) => (
              <li key={s.order} className="step-timeline__item">
                <div className="step-timeline__dot">{i + 1}</div>
                <div className="step-timeline__content">
                  <div className="step-timeline__label">{s.label}</div>
                  {s.timeLabel ? (
                    <div className="step-timeline__time">🕐 {s.timeLabel}</div>
                  ) : null}
                  {s.detail ? <div className="step-timeline__desc">{s.detail}</div> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <footer className="detail-footer">最后更新: {formatLocal(entry.updated_at)}</footer>
    </div>
  );
}
