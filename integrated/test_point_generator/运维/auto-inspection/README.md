# 阿里云自动巡查（ECS + 云监控 + 证书到期 + Excel）

与工作台「测试运维工作区 → 一键生成每日巡检报告」同一套逻辑。

## 给同事用（最快）

1. 把整个 `auto-inspection` 文件夹拷给他（**不要**带上 `.env`、`.venv`）。
2. 对方双击 **`一键生成每日巡检.bat`**。
3. 首次会生成 `.env` / `config.yaml`：在 `.env` 填入阿里云 RAM 只读 AccessKey；`config.yaml` 按需改实例名关键词。
4. 再双击一次 → 自动装依赖并生成报告，完成后打开 `reports\` 目录：
   - `巡检报告_YYYY-MM-DD_HHMM.md`
   - `ECS_应用分组巡检简报_全合一_YYYYMMDD_HHMM.xlsx`（含 ECS 明细 + 证书到期）

证书域名清单在 `scripts/check_cert_expiry.py` 的 `CERT_DOMAINS`，可按业务改。

钉钉可选：在 `.env` 配 `DINGTALK_WEBHOOK`（本 bat 默认只出本地报告；要推群用 `python -m inspection.runner`）。

---

## 能力一览

| 能力 | 说明 |
|------|------|
| ECS | 实例状态、包年包月到期剩余天数（按地域轮询） |
| 云监控 | CPU / 内存 / 磁盘最近一次采样（需 Agent + RAM 权限） |
| 证书 | TLS 自动查域名到期日、剩余天数、紧急/关注级别 |
| 过滤 | 仅巡检实例名包含配置关键词的机器；空列表表示全部 |
| 钉钉 | 可选，与「钉钉报告推送」相同 Webhook |

---

## 1. 手动安装（不用 bat 时）

```powershell
cd auto-inspection
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy config.example.yaml config.yaml
copy env.example .env
```

编辑 `config.yaml`（地域、实例名关键词、阈值）。  
编辑 `.env` 填入 **AccessKey**（勿泄露、勿提交 Git）。

---

## 2. 权限与登录（怎么申请、怎么获取 AK）

**强烈建议：不用主账号 AK，改用 RAM 用户最小权限。**

### 2.1 在阿里云控制台操作

1. 主账号或有 RAM 管理权限的账号登录 [RAM 控制台](https://ram.console.aliyun.com/)。
2. **身份管理 → 用户 → 创建用户**  
   - 勾选 **OpenAPI 调用访问**，会得到 `AccessKeyId` / `AccessKeySecret`（仅此一次可见 Secret，请保存到 `.env`）。
3. **不要**把该用户加入过高权限的组；改为 **单独挂载自定义策略**（见下文 JSON）。

### 2.2 本工具所需最小权限（自定义策略示例）

将下面策略保存为策略名如 `OpsInspectReadOnly`，绑定到 RAM 用户：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeInstances",
        "ecs:DescribeInstanceAttribute",
        "ecs:DescribeDisks"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cms:DescribeMetricLast",
        "cms:DescribeMetricList"
      ],
      "Resource": "*"
    }
  ]
}
```

说明：

- **ECS**：拉实例列表、状态、到期时间等只读。
- **CMS**：云监控读指标；若报无权限或拉不到数，报告里会给「自动批注」提示检查策略或 Agent。

若公司安全要求 **STS 临时凭证**，需要你们现有运维体系签发 `AccessKeyId/Secret/Token`，当前开源小脚本为标准长效 AK 写法；要接 STS 可再改 `AcsClient` 构造方式。

### 2.3 多账号

- **各账号分别建 RAM 用户**，各一套 AK，写入不同环境变量，例如 `ALIBABA_CLOUD_ACCESS_KEY_ID_2`。  
- 在 `config.yaml` 的 `accounts` 中增加第二段。

### 2.4 安全注意

- `.env` 不要提交 Git；已写在 `.gitignore`。  
- 定期轮换 AK；泄漏立即在控制台禁用并新建。

---

## 3. 运行方式

### 一键日报（推荐，同事日常用）

双击 `一键生成每日巡检.bat`，或：

```powershell
.\.venv\Scripts\Activate.ps1
python daily_report.py --out .\reports
```

### 单次巡查（Markdown + 可选钉钉）

```powershell
python -m inspection.runner --config config.yaml --title "大派对手动巡查" --no-dingtalk
```

- 报告默认写入 `logs/report_*.md`。  
- 去掉 `--no-dingtalk` 且配好 Webhook 才会推群。

### 常驻 / 任务计划

见下方 `schedule.daily_times`；或用 Windows 任务计划程序每天调一次 bat / `daily_report.py`。

---

## 4. 钉钉推送策略（`config.yaml` → `notify`）

| 配置 | 含义 |
|------|------|
| `dingtalk_on_every_run: true` | 每次巡检都发钉钉 |
| `dingtalk_only_on_risk: true` | **仅当存在预警/严重** 时发送 |

---

## 5. 退出码

`python -m inspection.runner`：有预警/严重 → `1`，全正常 → `0`。  
`daily_report.py`：成功 `0`，失败 `1`，缺配置 `2`。

---

## 6. 常见问题

- **DescribeInstances 报错 / 403**：检查 RAM 策略、地域是否在 `regions` 中列出。  
- **CPU/内存/磁盘拿不到**：策略缺 `cms:*`、实例未装云监控 Agent、或刚创建尚无数据。  
- **钉钉 errcode 与加签**：加签需配 `DINGTALK_SECRET`。
- **证书查询失败**：本机网络能否访问该域名 443。
