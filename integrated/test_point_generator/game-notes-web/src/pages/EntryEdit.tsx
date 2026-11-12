import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ENTRY_TYPE_LABEL, ENTRY_TYPES } from "../labels";
import type { Entry, EntryType, Step } from "../types";
import { emptyEntry, useAppState } from "../context/AppStateContext";
function nowIso() {
  return new Date().toISOString();
}

export default function EntryEdit() {
  const { gameId, entryId } = useParams<{ gameId: string; entryId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, upsertEntry, deleteEntry } = useAppState();
  const isNew = location.pathname.endsWith("/new");

  const initial = useMemo(() => {
    if (!gameId) return null;
    if (isNew) return emptyEntry(gameId);
    if (!entryId) return null;
    return state.entries.find((e) => e.id === entryId && e.game_id === gameId) ?? null;
  }, [gameId, entryId, isNew, state.entries]);

  const [draft, setDraft] = useState<Entry | null>(null);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (initial) setDraft({ ...initial, steps: [...initial.steps] });
  }, [initial]);

  const game = state.games.find((g) => g.id === gameId);

  if (!gameId || !game || !draft) {
    return (
      <div className="page">
        <p>无法编辑。</p>
        <Link to="/games">返回</Link>
      </div>
    );
  }

  const setType = (t: EntryType) => setDraft({ ...draft, entry_type: t });

  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, "");
    if (!v || draft.tags.includes(v)) return;
    setDraft({ ...draft, tags: [...draft.tags, v] });
    setTagInput("");
  };

  const removeTag = (t: string) => {
    setDraft({ ...draft, tags: draft.tags.filter((x) => x !== t) });
  };

  const addStep = () => {
    const nextOrder =
      draft.steps.length === 0
        ? 0
        : Math.max(...draft.steps.map((s) => s.order)) + 1;
    const s: Step = {
      order: nextOrder,
      label: "",
      detail: "",
      timeLabel: "",
    };
    setDraft({ ...draft, steps: [...draft.steps, s] });
  };

  const updateStep = (order: number, patch: Partial<Step>) => {
    setDraft({
      ...draft,
      steps: draft.steps.map((s) => (s.order === order ? { ...s, ...patch } : s)),
    });
  };

  const removeStep = (order: number) => {
    setDraft({
      ...draft,
      steps: draft.steps.filter((s) => s.order !== order),
    });
  };

  const onSave = () => {
    const t = nowIso();
    const saved: Entry = {
      ...draft,
      updated_at: t,
      created_at: draft.created_at || t,
    };
    upsertEntry(saved);
    navigate(`/games/${gameId}/entries/${saved.id}`);
  };

  const onCancel = () => {
    navigate(-1);
  };

  const onDelete = () => {
    if (!isNew && window.confirm("确定删除这条笔记？")) {
      deleteEntry(draft.id);
      navigate(`/games/${gameId}/entries`);
    }
  };

  return (
    <div className="page page-edit">
      <button type="button" className="link-back" onClick={onCancel}>
        ← 取消
      </button>
      <h1 className="page-title">{isNew ? "新建笔记" : "编辑笔记"}</h1>

      <div className="form-card">
        <label className="field">
          <span className="field-label">
            标题 <span className="req">*</span>
          </span>
          <input
            className="input"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="笔记标题"
          />
        </label>

        <div className="field">
          <span className="field-label">
            类型 <span className="req">*</span>
          </span>
          <div className="type-toggle-row">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`type-toggle${draft.entry_type === t ? " type-toggle--on" : ""}`}
                onClick={() => setType(t)}
              >
                {ENTRY_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">队伍名称</span>
          <input
            className="input"
            value={draft.team_name}
            onChange={(e) => setDraft({ ...draft, team_name: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field-label">游戏版本</span>
          <input
            className="input"
            value={draft.game_version}
            onChange={(e) => setDraft({ ...draft, game_version: e.target.value })}
          />
        </label>

        <div className="field">
          <span className="field-label">标签</span>
          <div className="tag-input-row">
            <input
              className="input"
              value={tagInput}
              placeholder="输入标签后按回车"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button type="button" className="btn btn-outline" onClick={addTag}>
              添加
            </button>
          </div>
          <div className="tag-bag">
            {draft.tags.map((t) => (
              <span key={t} className="tag-pill">
                #{t}
                <button type="button" className="tag-pill__x" onClick={() => removeTag(t)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">正文内容</span>
          <textarea
            className="textarea"
            rows={8}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </label>

        <div className="field">
          <div className="field-heading-row">
            <span className="field-label">步骤列表</span>
            <button type="button" className="btn btn-link" onClick={addStep}>
              + 添加步骤
            </button>
          </div>
          <div className="step-edit-list">
            {[...draft.steps]
              .sort((a, b) => a.order - b.order)
              .map((s, idx) => (
                <div key={s.order} className="step-edit-card">
                  <div className="step-edit-head">
                    <span>步骤 {idx + 1}</span>
                    <button type="button" className="btn-del" onClick={() => removeStep(s.order)}>
                      ×
                    </button>
                  </div>
                  <input
                    className="input"
                    placeholder="阶段标题"
                    value={s.label}
                    onChange={(e) => updateStep(s.order, { label: e.target.value })}
                  />
                  <textarea
                    className="textarea textarea--sm"
                    placeholder="说明"
                    rows={2}
                    value={s.detail ?? ""}
                    onChange={(e) => updateStep(s.order, { detail: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="时间或阶段，如 开始前 / 0:00 - 0:30"
                    value={s.timeLabel ?? ""}
                    onChange={(e) => updateStep(s.order, { timeLabel: e.target.value })}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="footer-actions">
        {!isNew ? (
          <button type="button" className="btn btn-danger-outline" onClick={onDelete}>
            删除
          </button>
        ) : (
          <span />
        )}
        <div className="footer-actions__right">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
