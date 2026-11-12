# skills/ · 角色技能（system prompt 外挂）

每个子目录是一个**角色技能**，结构最小化：

```text
skills/
├── playwright-debug/SKILL.md   # Playwright 生成/调试/自动修复（共用已知坑）
└── roles/
    ├── pm/SKILL.md          # 产品经理
    ├── ui/SKILL.md          # UI 设计
    ├── fullstack/SKILL.md   # 全栈落地
    ├── qa/SKILL.md          # 测试岗
    └── ops/SKILL.md         # 运维岗
```

## 文件格式

每个 `SKILL.md` 是**纯 Markdown**（可有可无的 YAML frontmatter）。
**正文整体被服务端读取作为 system prompt**（会去掉 frontmatter）。

> 想换 PM 的口吻？直接改 `pm/SKILL.md`。下一次发起请求就生效（无需重启 Node）。
> Playwright 老踩的坑：改 `playwright-debug/SKILL.md`，生成 /「调试 pw」对话 / 自动跑测修复都会读到。

## 输出契约（务必保留）

不同角色对**输出格式**有刚性要求，改文案时**不要破坏以下契约**，否则前端预览/写盘会失败：

| 角色 | 输出要求 |
|------|----------|
| `pm` | 一份完整 HTML（不要 Markdown 围栏），用于写 `prototype.html` |
| `ui` | 优化后的完整 HTML，用于写 `ui.html` |
| `fullstack` | 严格用 `### FILE: <path>` 多段，对应 `index.html / styles.css / app.js / README.md`，写到 `app/` |
| `qa` | 单文件 Markdown（无外层围栏），写 `测试点.md` |
| `ops` | 单文件 Markdown，写 `运维手册.md` |

## 追问对话

每个角色 Tab 的「**追问对话**」也使用同一份 SKILL.md。
追问时模型若回复中含 `### FILE: 相对路径` 段，会写入 `generated/<sessionId>/<path>`（允许覆盖 `prototype.html`、`测试点.md` 等）。
对话历史持久化在：`generated/<sessionId>/conversations/<role>.jsonl`。
