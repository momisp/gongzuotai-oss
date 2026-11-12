/**
 * Playwright 调试弹窗：测试环境地址、生成勾选、对话改用例
 */
export default function TpPwDebugModal({
  open,
  onClose,
  qaPwTestBaseUrl,
  setQaPwTestBaseUrl,
  qaGenPwSpec,
  setQaGenPwSpec,
  chatHistory,
  chatInput,
  setChatInput,
  chatBusy,
  pendingSpec,
  autoApplied,
  onApplySpec,
  onSend,
  onFetchErrors,
  errorHint,
}) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel-wide tp-pw-debug-modal"
        role="dialog"
        aria-modal="true"
        aria-label="调试 Playwright"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>调试 Playwright</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tp-pw-debug-body">
          <label className="tp-opt-row tp-v2-opt">
            <input
              type="checkbox"
              checked={qaGenPwSpec}
              onChange={(e) => setQaGenPwSpec(e.target.checked)}
            />
            <span className="tp-opt-copy">
              <strong className="tp-opt-title">额外生成 Playwright Test（.spec.ts）</strong>
              <span className="tp-opt-hint">勾选后，第③步在 Markdown 外再生成主路径用例</span>
            </span>
          </label>

          <label className="tp-pw-env tp-pw-env-in-modal">
            <span className="tp-pw-env-label">测试环境地址</span>
            <input
              type="url"
              className="tp-pw-env-input"
              value={qaPwTestBaseUrl}
              onChange={(e) => setQaPwTestBaseUrl(e.target.value)}
              placeholder="https://你的测试环境…（空则用原型 URL）"
              spellCheck={false}
            />
          </label>
          <p className="tp-pw-env-hint">
            上方主区原型 URL 只用于理解页面；此处用于生成/打开/调试时的 BASE_URL。
            同类型脚本坑记在 <code>skills/playwright-debug/SKILL.md</code>，改完即生效。
          </p>

          <div className="tp-pw-debug-chat-head">
            <strong>调试对话</strong>
            <button
              type="button"
              className="btn btn-small"
              disabled={chatBusy}
              onClick={onFetchErrors}
            >
              拉取最近报错
            </button>
          </div>
          {errorHint ? <p className="tp-pw-debug-error-hint">{errorHint}</p> : null}

          <div className="tp-pw-debug-log" aria-live="polite">
            {chatHistory.length === 0 ? (
              <div className="role-chat-msg-empty">
                描述失败现象即可（例如「登录第三条是 X，页面看起来正常」）。
                会自动带上当前 .spec.ts 与 test-results 里最近的 Errors。
              </div>
            ) : (
              chatHistory.map((m, i) => (
                <div
                  key={i}
                  className={`role-chat-msg role-chat-msg-${m.role}`}
                >
                  {m.content ||
                    (m.role === "assistant" &&
                    chatBusy &&
                    i === chatHistory.length - 1
                      ? "…"
                      : "")}
                </div>
              ))
            )}
          </div>

          {pendingSpec ? (
            <div className="tp-pw-debug-apply">
              <span>助手给出了修复后的 .spec.ts</span>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={onApplySpec}
              >
                应用到预览
              </button>
            </div>
          ) : autoApplied ? (
            <div className="tp-pw-debug-apply is-done">
              <span>已自动应用修复版到预览与 tests/playwright.spec.ts</span>
            </div>
          ) : null}

          <div className="role-chat-input-row">
            <textarea
              className="role-chat-input"
              rows={3}
              placeholder="说明报错现象、期望行为…（Ctrl/⌘+Enter 发送）"
              value={chatInput}
              disabled={chatBusy}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={chatBusy || !String(chatInput || "").trim()}
              onClick={onSend}
            >
              {chatBusy ? "分析中…" : "发送"}
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
