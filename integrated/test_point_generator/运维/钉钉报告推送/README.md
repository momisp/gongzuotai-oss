# 运维巡检报告 → 钉钉群

把小脚本放在本目录，用于：**截图 + Markdown 备注（运维建议）→ 合并成一份报告 → 推送钉钉群机器人**。

## 1. 准备钉钉机器人

1. 打开目标群 → **群设置** → **智能群助手** → **添加机器人** → **自定义**。
2. 复制 **Webhook**（形如 `https://oapi.dingtalk.com/robot/send?access_token=...`）。
3. 若安全设置选了 **加签**，同时复制 **SEC** 开头的密钥。

## 2. 本地配置

```text
cd 钉钉报告推送
pip install -r requirements.txt
copy env.example .env
```

编辑 `.env` 填入 `DINGTALK_WEBHOOK`，有加签则填 `DINGTALK_SECRET`。**不要把 .env 发给他人或提交到公开仓库。**

若同时使用 **`.env`** 与同目录 **`env`**（无前缀）：脚本会先读 `.env` 再读 `env`，**后者会覆盖同名变量**。因此如果只维护 `env`，请删掉 `.env` 里的占位 Webhook；或始终在 `env` 里写真实值（占位符请勿留在 `.env` 的 `access_token=` 里，否则易出现 `token is not exist`）。


## 3. 写备注

可复制 `巡检备注示例.md` 改名为你自己的文件，按《大派对-云资源监控检查清单》逐项填「结果 + 运维建议」。

## 4. 运行

**指定多张截图：**

```powershell
python send_ops_report.py --title "大派对运维日检-2026-05-20" --notes 我的备注.md --images "D:\shots\cpu.png" "D:\shots\disk.png"
```

**扫描整个文件夹（按文件名排序）：**

```powershell
python send_ops_report.py --title "大派对运维日检" --notes 我的备注.md --image-dir D:\shots
```

**活动前 1 小时加检：**

```powershell
python send_ops_report.py --title "大派对-活动前巡检" --notes 我的备注.md --image-dir D:\shots --report-type "活动前1小时_加检"
```

**只发文字、不发图片：**

```powershell
python send_ops_report.py --title "仅文字" --notes 我的备注.md --no-images
```

**试跑不推钉钉（看拼接结果）：**

```powershell
python send_ops_report.py --title "试跑" --notes 巡检备注示例.md --dry-run
```

每次运行会在本目录生成 `report_YYYYMMDD_HHMMSS.md`（也可用 `--out 路径.md` 指定），便于归档。**若由 Electron「每日巡检」调用且带 `--excel`，将额外生成与工作簿「大派对资源费用相关」同构的多 Sheet xlsx（含 Sheet1「实例/阿里云账号/备注 …」、`域名主体相关`、过程明细）；域名表在项目内 `运维/domain-inventory.json` 维护。**

## 5. 钉钉侧效果说明


- 先发 **一条 Markdown**：含标题、时间、报告类型、截图清单、你的运维建议全文。
- 再按顺序各发 **一条图片消息**（每条约间隔 0.35s，降低限流概率）。
- 单条 Markdown 过长会自动截断并在文末提示「看本地 report 文件」。
- 单张图片建议 **小于 2MB**；过大可能发送失败。

## 6. 常见问题

| 现象 | 处理 |
|------|------|
| `errcode 310000` 等签名校验失败 | 检查 `DINGTALK_SECRET` 是否与机器人「加签」一致 |
| `errcode 300005` / `token is not exist` | Webhook 错误或仍是模板占位（如 `.env` 里 `access_token=你的TOKEN`）；或机器人已删除重置，请到群内复制新地址 |
| `errcode 460101` / body ≤20000 字节 | **自定义机器人「图片」消息的整条 JSON（含 base64）有严格大小上限**；脚本已用 Pillow 自动压成较小 JPEG。请在本目录执行 **`pip install -r requirements.txt`** 安装 Pillow || 表格在钉钉里格式乱 | 钉钉 Markdown 对表格支持一般，可改为列表或小段文字 |
| 公司网络拦截 `oapi.dingtalk.com` | 换网络或走合规代理 |

## 7. 安全提示

Webhook 等同于群通知密钥，勿写入代码仓库；轮换机器人后记得更新 `.env`。
