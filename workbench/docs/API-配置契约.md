# 工作台 API / 配置契约（DEV-05）

简表，减少魔法字符串。完整路由仍以 `workbench/app.py` 为准。

## 嵌入参数

| 场景 | URL |
|------|-----|
| 测试点生成 | `/agile-sim/?embed=standalone-qa&projectId=&projectName=&ganttIds=` |
| 数据验证 | `/agile-sim/?embed=data-verify` |
| 敏捷全站 | `/agile-sim/` |

`sessionStorage.workbench_project_context`：`{ projectId, projectName, assetProjects, ganttProjectIds }`  
`sessionStorage.workbench_context_pack`：项目上下文包（账号/环境/URL/包）

## 常用 API

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/workbench-health` | 服务状态 + agile 路径 |
| GET/POST | `/api/data-backup` | 列出 / 创建 data 备份 |
| GET | `/api/global-search?q=` | 全局搜索 |
| GET/PUT | `/api/workbench-runtime` | 后台任务开关 |
| GET | `/api/projects/:id/overview` | 项目汇总 |
| GET/POST/DELETE | `/api/projects/:id/rounds` | 本轮结论 |
| GET | `/api/projects/:id/context-pack` | 环境账号上下文 |
| GET | `/api/projects/:id/bug-template` | 缺陷 Markdown |
| GET/PUT | `/api/projects/:id/release-checklist` | 发版勾选清单 |
| GET | `/api/projects/:id/regression-suggest` | 回归模块建议 |
| GET/POST | `/api/projects/:id/install-history` | 装包历史 |
| GET | `/api/workbench-selfcheck` | 最小自检 |
| GET | `/api/test-info/catalog` | 测试信息目录 |

## 本地数据文件

| 文件 | 说明 |
|------|------|
| `data/tools.json` | 侧栏工具注册 |
| `data/projects.json` | 项目中心 |
| `data/project_round_results.json` | 本轮结论 |
| `data/project_release_checklists.json` | 发版清单 |
| `data/workbench_runtime.json` | 后台开关 |
| `data/backups/` | 手动备份目录（gitignore） |
