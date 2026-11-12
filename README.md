# 工作台

个人测试工作台：常用链接、项目资产、测试点 / 数据验证、业务自动化（冒烟 / 功能测试 / 渠道主流程造数）、运维巡检等，集中在一个本地网页里用。

## 启动

需要已安装 **Python 3.10+**。在 `workbench` 目录执行：

```bat
start.bat
```

浏览器打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。页面没更新时按 **Ctrl+F5**。

手动启动：

```bat
cd workbench
pip install -r requirements.txt
python app.py
```

## 目录

| 路径 | 说明 |
| --- | --- |
| `workbench/` | Flask 主程序、页面、接口 |
| `data/` | 本地数据与配置（含密钥的 json **不要提交**） |
| `integrated/` | 嵌入的子工具（测试点生成、敏捷模拟、静态工具等） |

## 配置

带密码、Token、数据库账号的文件已加入 `.gitignore`。本地从 example 复制一份再填：

```text
data/oa_promote_config.example.json      → data/oa_promote_config.json
data/biz_web_config.example.json         → data/biz_web_config.json
data/channel_web_config.example.json     → data/channel_web_config.json
data/game_sdk_config.example.json        → data/game_sdk_config.json
data/smoke_db_config.example.json        → data/smoke_db_config.json
data/smoke_oa_audit_api.example.json     → data/smoke_oa_audit_api.json
```

主流程台（渠道商务 → 会长 → 打包 → 玩家）也可在页面里点 **环境变量** 查看和改参数，不必直接改 json。

## 主要能力

- **核心**：网址收藏、项目资产、文件路径、测试点生成、数据验证
- **业务自动化**：新商务冒烟、页面功能测试、渠道主流程造数（勾选步骤开跑、运行记录、造数记录）
- **运维**：每日巡检、证书检查
- **系统**：剪贴板历史、区域录屏、壁纸、延时摄影

## 仓库

- 地址：https://github.com/momisp/gongzuotai
- 默认分支：`main`
- 仅本机使用，请勿把真实密码、API Key 推到 GitHub
