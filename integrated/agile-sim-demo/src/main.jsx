import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

class WorkbenchErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[agile-sim] render error", error, info);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      const stack = this.state.error?.stack || "";
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#fef2f2",
            color: "#7f1d1d",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: 20 }}>页面渲染失败</h1>
          <p style={{ lineHeight: 1.5 }}>
            测试点 / 敏捷模拟嵌入页发生错误。可刷新本页、在工作台点「新窗口打开」，或回到今日工作台查看服务状态。
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              color: "#111",
            }}
          >
            {msg}
            {stack ? `\n\n${stack}` : ""}
          </pre>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" onClick={() => window.location.reload()}>
              刷新页面
            </button>
            <button
              type="button"
              onClick={() => {
                const text = `${msg}\n${stack}`;
                navigator.clipboard?.writeText(text).catch(() => {});
              }}
            >
              复制错误信息
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WorkbenchErrorBoundary>
      <App />
    </WorkbenchErrorBoundary>
  </React.StrictMode>
);
