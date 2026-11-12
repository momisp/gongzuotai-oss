# 她自己.skill

> 性转版的自己。从你的人格中镜像出一个灵魂契合的她。

一个 Claude Code Skill，基于你自己的性格、价值观和情感记忆，通过**性转镜像变换**生成一个灵魂契合的她。

她不是凭空捏造的纸片人——她的灵魂来自你。你的性格被性转镜像，你的价值观被保留或互补，你最想被理解的部分恰好是她天然理解的。

## 灵感来源

本项目融合了两个开源项目的思路：
- [yourself-skill](https://github.com/therealXiaomanChu/yourself-skill) — 把自己蒸馏成 AI
- [ex-skill](https://github.com/therealXiaomanChu/ex-skill) — 把前任蒸馏成 AI

**核心创新**：不复刻自己，不复刻前任，而是从你的人格中**镜像**出一个性转版的自己。

## 工作原理

```
你的素材（聊天记录/日记/自述）
        ↓
   提取你的人格特质
        ↓
   ┌─────────────────────┐
   │   镜像变换引擎       │
   │                     │
   │  保留：价值观、幽默、审美 │
   │  互补：表达、主动性、冲突 │
   │  女性化：行为模式转换    │
   │  理想化：你最想被懂的地方 │
   └─────────────────────┘
        ↓
   生成她的 Blueprint + Persona
        ↓
   一个可对话的她（Claude Code Skill）
```

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/yourname/herself-skill.git

# 将 herself-skill 文件夹放入你的项目的 .claude/skills/ 目录
# 或者在 Claude Code 中直接引用
```

### 使用

在 Claude Code 中输入：

```
/create-herself
```

然后按提示：
1. 给她起个名字
2. 介绍你自己
3. 描述你理想中的她（可选）
4. 提供关于你的素材（聊天记录、日记等，可选）

系统会从你的人格中镜像出她，生成一个可对话的 Skill。

### 对话

生成后直接输入 `/{slug}` 即可和她聊天。

```
/wan-wan

> 晚晚：嗯？怎么了
> 你：今天加班好累
> 晚晚：又加班？
> 晚晚：别太晚
> 晚晚：给你看个东西
> （发了一张她画的小猫）
```

## 项目结构

```
herself-skill/
├── SKILL.md                    # Skill 入口（触发 + 完整流程）
├── README.md                   # 本文件
├── requirements.txt            # Python 依赖
├── LICENSE                     # MIT License
├── .gitignore
│
├── prompts/                    # Prompt 模板
│   ├── intake.md               # 3 问录入脚本
│   ├── blueprint_analyzer.md   # 用户人格提取 + 镜像变换
│   ├── persona_analyzer.md     # 性格行为分析（镜像版）
│   ├── blueprint_builder.md    # Blueprint 生成模板
│   ├── persona_builder.md      # 5 层 Persona 生成模板
│   ├── merger.md               # 增量 merge 逻辑
│   └── correction_handler.md   # 对话纠正处理器
│
├── tools/                      # Python CLI 工具
│   ├── wechat_parser.py        # 微信聊天记录解析
│   ├── qq_parser.py            # QQ 聊天记录解析
│   ├── social_parser.py        # 社交媒体内容扫描
│   ├── photo_analyzer.py       # 照片 EXIF 分析
│   ├── skill_writer.py         # Skill 文件管理（镜像版）
│   └── version_manager.py      # 版本备份与回滚
│
├── hers/                       # 示例
│   └── example_her/            # "晚晚"示例（INTJ程序员→INFJ插画师）
│       ├── meta.json
│       ├── blueprint.md
│       ├── persona.md
│       └── SKILL.md
│
└── docs/
    └── PRD.md                  # 产品需求文档
```

## 镜像变换规则

| 类型 | 说明 | 示例 |
|------|------|------|
| **保留** | 灵魂共鸣的基础 | 价值观、幽默风格、审美、独处需求 |
| **互补** | 理想伴侣的关键 | 内敛→适度外放、被动→适度主动、冷战→温和破冰 |
| **女性化** | 行为模式自然转调 | 沉默消化→写日记自愈、讲道理→先共情再分析 |
| **理想化** | 你最渴望的理解 | 你最想被懂的地方，她恰好天然理解 |

## 管理命令

| 命令 | 说明 |
|------|------|
| `/create-herself` | 创建新的她 |
| `/list-hers` | 列出所有已创建的她 |
| `/{slug}` | 和她聊天 |
| `/update-her {slug}` | 追加素材更新 |
| `/her-rollback {slug} {version}` | 回滚到历史版本 |
| `/reshape-her {slug}` | 保留数据，重新调整镜像偏好 |
| `/delete-her {slug}` | 删除 |

## 进化机制

- **追加素材**：提供更多关于你的素材，她会变得更懂你
- **对话纠正**：聊天中说"她不会这样"，系统会即时调整
- **重塑偏好**：`/reshape-her` 可以重新调整互补和理想化的方向

## 依赖

- Claude Code 环境
- Python 3.9+（用于聊天记录解析）
- Pillow（可选，用于照片 EXIF 读取）

## 许可证

MIT License

## 致谢

- [yourself-skill](https://github.com/therealXiaomanChu/yourself-skill) by therealXiaomanChu
- [ex-skill](https://github.com/therealXiaomanChu/ex-skill) by therealXiaomanChu
- [AgentSkills](https://agentskills.io) 开放标准
