import { readFile, writeFile } from "fs/promises";
import path from "path";
import { runPlaywrightSteps, normalizeStepList } from "./playwright-steps.mjs";

/** 去掉编号、模块号等，得到列表展示用的一句话名称 */
export function cleanTestPointTitle(raw) {
  let t = String(raw || "").trim();
  t = t.replace(/^#{1,6}\s+/, "");
  t = t.replace(/^[A-Z]{0,3}?\d{0,2}-?\d{2,4}\s+/, "");
  t = t.replace(/^M\d{1,3}(?:-\d{3})?\s+/i, "");
  t = t.replace(/^(?:P\d+|TC\d+|用例\s*\d+)[:：\s]*/i, "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/^[-*+]\s+/, "");
  t = t.replace(/^【[^】]+】\s*/, "");
  return t.trim();
}

const SKIP_TITLE =
  /^(测试点|功能测试|测试对象|模块编号|基于最新|项目.+测试点$|#)/i;

/** 是否像「一句话测试场景」（非步骤列表碎片） */
function looksLikeScenarioLine(title) {
  const t = cleanTestPointTitle(title);
  if (t.length < 8 || t.length > 120) return false;
  if (SKIP_TITLE.test(t)) return false;
  if (/^`/.test(t) || /^F12|^Console|^HTTP/i.test(t)) return false;
  if (
    /^(点击|输入|选择|切换|加载|新建|删除|打开|关闭|在|当|未|已|项目名|首次|页面|切换至)/.test(
      t
    ) &&
    /(能够|可以|应|会|显示|提示|弹出|变为|不可|禁用|成功|失败|清空|出现)/.test(t)
  ) {
    return true;
  }
  return /，.*(能够|可以|显示|提示|弹出)/.test(t);
}

function sectionKindFromHeading(heading) {
  const h = String(heading || "").trim();
  if (/业务/.test(h)) return "business";
  if (/功能/.test(h)) return "functional";
  return null;
}

function tryParseStepsJson(raw) {
  try {
    const j = JSON.parse(String(raw || "").trim());
    const steps = normalizeStepList(j.steps || j);
    return steps.length ? steps : null;
  } catch {
    return null;
  }
}

function makeSmokePoint(title, steps) {
  return {
    id: `smoke_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTestPointTitle(title) || "冒烟自动化主流程",
    detail: "",
    kind: "smoke",
    automatable: true,
    steps,
  };
}

/** 模型只输出裸 JSON / 无 ## 冒烟 段时，仍解析为可执行冒烟项 */
export function parseLooseJsonSmokeFromMd(md) {
  const text = String(md || "").trim();
  if (!text) return [];
  const out = [];
  const seen = new Set();

  const push = (title, steps) => {
    const key = `${title}:${steps.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(makeSmokePoint(title, steps));
  };

  const stripped = text.replace(/^json\s*/im, "").trim();
  const whole = tryParseStepsJson(stripped);
  if (whole) {
    push("冒烟自动化主流程", whole);
    return out;
  }

  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    const steps = tryParseStepsJson(m[1]);
    if (steps) push("冒烟自动化（JSON 块）", steps);
  }
  if (out.length) return out;

  const brace = text.match(/\{[\s\S]*"steps"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
  if (brace) {
    const steps = tryParseStepsJson(brace[0]);
    if (steps) push("冒烟自动化主流程", steps);
  }
  return out;
}

/** 放宽：任意 ## 段下的列表项 / ### 标题 */
function parseRelaxedBulletsFromMd(md) {
  const text = String(md || "").trim();
  if (!text) return [];
  const items = [];
  let sectionKind = "functional";

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(">") || trimmed === "---") continue;

    const h2 = /^##\s+(.+)$/.exec(trimmed);
    if (h2) {
      const kind = sectionKindFromHeading(h2[1]);
      if (kind) sectionKind = kind;
      else if (/冒烟/.test(h2[1])) sectionKind = "smoke";
      continue;
    }

    if (sectionKind === "smoke") continue;

    const h3 = /^###\s+(.+)$/.exec(trimmed);
    if (h3) {
      const title = cleanTestPointTitle(h3[1]);
      if (title.length >= 4 && !SKIP_TITLE.test(title)) {
        items.push({
          id: `tp_${items.length}_${Date.now().toString(36)}`,
          title,
          detail: "",
          kind: sectionKind === "smoke" ? "functional" : sectionKind || "functional",
        });
      }
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      const title = cleanTestPointTitle(bullet[1]);
      if (
        title.length >= 6 &&
        title.length <= 200 &&
        !SKIP_TITLE.test(title) &&
        !/^（.*(请重新|手工|补充).*$/.test(title)
      ) {
        items.push({
          id: `tp_${items.length}_${Date.now().toString(36)}`,
          title,
          detail: "",
          kind: sectionKind === "smoke" ? "functional" : sectionKind || "functional",
        });
      }
      continue;
    }

    const num = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (num) {
      const title = cleanTestPointTitle(num[1]);
      if (title.length >= 6 && title.length <= 200 && !SKIP_TITLE.test(title)) {
        items.push({
          id: `tp_${items.length}_${Date.now().toString(36)}`,
          title,
          detail: "",
          kind: sectionKind || "functional",
        });
      }
    }
  }
  return items;
}

/** 从测试点 Markdown 解析条目（先业务后功能；列表只展示 title 一句话） */
export function parseTestPointsFromMd(md) {
  const text = String(md || "").trim();
  if (!text) return [];

  const items = [];
  let current = null;
  let buf = [];
  let sectionKind = "functional";

  const flush = () => {
    if (!current) return;
    const title = cleanTestPointTitle(current.title);
    if (title && title.length >= 4 && !SKIP_TITLE.test(title)) {
      current.title = title;
      current.detail = buf.join("\n").trim();
      items.push(current);
    }
    current = null;
    buf = [];
  };

  const pushBullet = (rawTitle) => {
    if (!looksLikeScenarioLine(rawTitle)) return;
    flush();
    items.push({
      id: `tp_${items.length}_${Date.now().toString(36)}`,
      title: cleanTestPointTitle(rawTitle),
      detail: "",
      kind: sectionKind || "functional",
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(">")) continue;
    if (trimmed === "---") continue;
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) continue;

    const h2 = /^##\s+(.+)$/.exec(trimmed);
    if (h2) {
      flush();
      const kind = sectionKindFromHeading(h2[1]);
      if (kind) sectionKind = kind;
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      pushBullet(bullet[1]);
      continue;
    }

    if (current) buf.push(line);
  }
  flush();

  const seen = new Set();
  const business = [];
  const functional = [];
  const other = [];
  for (const it of items) {
    const key = it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    if (it.kind === "business") business.push(it);
    else if (it.kind === "functional") functional.push(it);
    else other.push(it);
  }

  let smoke = parseSmokePlaywrightFromMd(text);
  if (!smoke.length) smoke = parseLooseJsonSmokeFromMd(text);

  let merged = [...smoke, ...business, ...functional, ...other];
  if (merged.length === 0) {
    merged = [...parseLooseJsonSmokeFromMd(text), ...parseRelaxedBulletsFromMd(text)];
  } else if (!business.length && !functional.length && !other.length && smoke.length) {
    const relaxed = parseRelaxedBulletsFromMd(text).filter((p) => p.kind !== "smoke");
    if (relaxed.length) merged = [...smoke, ...relaxed];
  }

  const dedupe = new Set();
  const final = [];
  for (const p of merged) {
    const k = `${p.kind}:${p.title}`;
    if (dedupe.has(k)) continue;
    dedupe.add(k);
    final.push(p);
  }
  return final.slice(0, 80);
}

/** 解析 ## 冒烟自动化 下 ### 标题 + json 步骤块；无标准段落时回退全文件 json 块 */
export function parseSmokePlaywrightFromMd(md) {
  const text = String(md || "");
  const items = [];
  const seen = new Set();

  const pushBlock = (titleRaw, jsonRaw) => {
    try {
      const j = JSON.parse(String(jsonRaw).trim());
      const steps = normalizeStepList(j.steps || j);
      if (!steps.length) return;
      const title = cleanTestPointTitle(titleRaw) || "冒烟自动化";
      const key = `${title}:${steps.length}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(makeSmokePoint(title, steps));
    } catch {
      /* 非法 JSON 跳过 */
    }
  };

  const sec = /##\s*冒烟/.test(text)
    ? text.match(/##\s*冒烟[^\n]*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i)
    : null;
  const body = sec ? sec[1] : text;

  for (const m of body.matchAll(/###\s*(.+?)\r?\n[\s\S]*?```json\s*([\s\S]*?)```/gi)) {
    pushBlock(m[1], m[2]);
  }
  if (items.length) return items;

  for (const m of body.matchAll(/###\s*(.+?)\r?\n[\s\S]*?```\s*json\s*([\s\S]*?)```/gi)) {
    pushBlock(m[1], m[2]);
  }
  if (items.length) return items;

  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    pushBlock("冒烟自动化", m[1]);
  }
  return items;
}

export async function readSessionPlaywrightSmoke(sessionDir) {
  try {
    const raw = await readFile(path.join(sessionDir, "qa", "playwright-smoke.json"), "utf8");
    const j = JSON.parse(raw);
    const cases = Array.isArray(j.cases) ? j.cases : Array.isArray(j) ? j : [];
    return cases
      .map((c, i) => ({
        id: c.id || `smoke_file_${i}`,
        title: cleanTestPointTitle(c.title || c.name || `冒烟${i + 1}`),
        detail: "",
        kind: "smoke",
        automatable: true,
        steps: normalizeStepList(c.steps),
      }))
      .filter((c) => c.steps.length > 0);
  } catch {
    return [];
  }
}

/** 工作台「测试点生成」独立模式默认 Skill（与 skills/standalone-qa/SKILL.md 对齐；以磁盘 Skill 为准） */
export const STANDALONE_QA_SKILL_DEFAULT = `你是资深测试工程师。按四步产出：①页面框架 → ②业务场景（冒烟+条件结果）→ ③页面功能 → ④专项测试（权限/并发幂等/弱网/兼容/安全，独立文档可进禅道「专项测试」模块）。写作对齐手写 XMind。

### 语言（强制）
简洁：一句一个可验证点，禁止「验证一下/相关逻辑」空话。
准确：开关开闭、对象、期望结果写死。
可直接当用例：叶子读完就能测，禁止还需二次分解的汇总句/原则句。
禁止技术英文与图标字符：勿写 Toast/maxlength/placeholder；改「提示「…」」「最多可输入 N 位」。勿写 ✎✓ 等符号，改「编辑按钮」。原型界面上本来显示的英文文案/账号名（如 ces）可保留。例外：功能点叶子优先级标记 [P0]/[P1]/[P2] 为规范强制，不算技术英文。
弹窗与内部细则须缩进嵌套（父 - 弹窗名，子再缩进），禁止弹窗名与内部条目同级并排。

### HTML 原型约定
「原型说明」「更新记录」不是被测功能：框架与用例禁止列入；须精读其正文理解业务与 PM 追加变更。
功能点只写有可见入口的交互；隐藏 modal / 仅说明里有、页面无按钮的弹窗，禁止写成可点击弹出的操作用例。
证据权威：关键按钮交互轨迹 ≫ 可见正文 ≫ 说明文案。说明缺步但演示已有结果必须按演示写，可标【据原型演示】；两边无证据则【待核实】，禁止臆造目标页。

### 写作风格（手写 XMind）
- 句式：〔（前置）〕操作，能/会/不会 + 可观察结果
- 成对覆盖：取消/确定、有数据/无数据、余额足够/不足；业务开关须开/关成对
- 必须写具体文案与数值；禁止含糊「阈值」
- 功能点：≥70% 交互；叶子标 [P0]/[P1]/[P2]；**P0 占比≤25%**（非阻断勿标 P0）
- 功能点必须覆盖框架每一个一级 ##；落实易漏清单：工作台/首页每张可点待办卡片、侧栏导航、通用支付弹窗、资源用尽弹窗、成功弹窗闭环、多入口至少1条、详情字段抽样、售罄限购、配置空态、售后仅退款vs退货退款分流
- 禁止空叶子/抄皮/业务结果进③；入口进入每入口最多1条
- 业务场景②双段：冒烟门禁≤15 + 业务场景；覆盖各模块能力；开关关闭态/活动结束/配置为0/后台↔端联动
- ④专项五章强制：权限与多角色、并发与幂等、弱网与异常网络、兼容性、安全；不与③混写；禁止「安全无问题」空话

### 第一步 · 页面框架
Tab/一级导航为 ##；入口挂载内页整树。禁止内页与首页平铺成一长列 ##。
列表字段在「列表」下平级展开，禁止「列：A/B/C」进备注；二次确认挂在各操作下。
筛选区只写抓取搜索表单可见控件；仅列表列有的字段（如认证状态）挂列表，勿臆造进筛选。
列表项写 \`- 筛选区\` 不要写 \`- ### 筛选区\`。壳层顶栏/侧栏/消息占位页不展开。框架标题不要写〔源:〕。

### 第二步 · 业务场景（冒烟门禁 + 业务场景）
双段；覆盖各 Tab；冒烟含可点待办卡片跳转。

### 第三步 · 页面功能（测行为，少抄皮）
全模块；P0≤25%；易漏清单必落实。
溯源锚点（强制）：每条交互叶子句末加 \`〔源:一级/二级/区块 · 「关键控件」〕\`，路径与①框架标题对齐；无控件可只写路径。例：\`- [P1] 选中「用户账号」后出现清除；点清除恢复占位〔源:工作台/用户列表/筛选区 · 「用户账号」〕\`。

### 第四步 · 专项测试
独立 Markdown；五章齐；可进禅道「专项测试」。

禁止 JSON/Playwright/用例编号/空话开场白。`;

const DECOMPOSE_BIZ_HINT =
  "【业务规则拆分 · 强制】开关组合、同手机号/同身份证、多渠道各自是否满足条件、连带入池/不入池等交叉规则，" +
  "必须拆成可直接执行的叶子测试点（条件+具体渠道+入池/不入池），禁止用原则句一概而过。" +
  "自检：若还能问「开还是关？A还是B？入不入池？」则继续拆。" +
  "语言须简洁准确：一句一个点；写死开关开闭与期望结果。\n" +
  "【开关成对 / 边界 · 强制】说明或抓取出现的业务开关必须同时写「开」与「关」结果；" +
  "有活动期/池抢完则写「活动已结束」「池抢完」；配置值为 0 不发放、推荐/轮播空配置须单列；" +
  "后台改公告/上下架/审核后客户端可见性须有对应业务叶子。\n" +
  "【业务能力全覆盖 · 强制】「## 业务场景」下的 ### 须覆盖框架各一级模块中的主要业务能力/入口" +
  "（对照框架 ## 与 ###、以及「进××」类入口），禁止只写首页相关能力就结束；" +
  "祈福服务/商城/我的等 Tab 上的预约、下单、订单、登录、记录等能力必须有对应 ###。" +
  "冒烟门禁须能串起各主 Tab 至少各 1 条可达路径，并对工作台/首页每一张可点待办/统计卡片各写 1 条跳转门禁（有则必写）。\n";

const TRACE_SOURCE_HINT =
  "【溯源锚点 · 强制 · 供需求溯源台定位 · 路径优先】每条交互叶子句末追加：" +
  "〔源:入口或模块/目标页/区块 · 「关键控件文案」〕。" +
  "定位顺序：①先写清页面路径（须含与溯源台图册页签一致的目标页名，如「用户列表」「工作台」），" +
  "②再写区块（筛选区/列表区/工具栏等），③「」内才是页内控件。" +
  "路径段与①框架 ## / ### 对齐（用 / 分隔，勿写坐标）；禁止只写控件名不写目标页。" +
  "示例：- [P1] 点击某行蓝色「联运币」弹出充值〔源:工作台/用户列表/列表区 · 「联运币」〕；" +
  "- [P1] 「账号状态」下拉筛选〔源:工作台/用户列表/筛选区 · 「账号状态」〕。" +
  "修订保留已有〔源:…〕；新增必补。禁止把〔源:〕写进标题行或单独成行。\n";

const DECOMPOSE_FUNC_HINT =
  "【功能点 · 测行为少抄皮 · 强制】" +
  "叶子≥70% 为交互/状态/校验失败/空态/成对按钮；≤30% 为静态展示；禁止把推荐区每个商品价格/限量逐条抄成叶子。" +
  "禁止单独叶子「界面与原型一致」「弹窗功能完整」「筛选正常」。" +
  "禁止业务结果型叶子（扣福缘、订单变待联系、入池等，归②）；入口「进入XX页」每入口最多1条。" +
  "叶子须标 [P0]/[P1]/[P2]；**[P0] 占比不得超过全部已标叶子的 25%**——仅真正阻断主操作才标 P0，其余降为 P1/P2。" +
  "有表单/列表/弹窗的区块尽量含：默认态、合法成功、取消无副作用、空/非法/边界、无数据缺省；失败须写提示文案或阻断表现。" +
  "筛选项/枚举/开关须拆成独立叶子——框架筛选区真实列出的每一项都要有对应叶子；" +
  "仅出现在列表列的字段（如「认证状态」只在表头）写在列表区叶子，禁止因示例习惯塞进筛选区。\n" +
  "【章节嵌套 · 强制】按「页 → 区 → 叶子」层层写：" +
  "`## 用户列表` 下再 `### 筛选区` / `### 工具栏` / `### 列表区`，叶子挂在区下；" +
  "禁止写成合并标题 `## 用户列表-筛选区`（导出会变成中间多一点、无法一层层缩进）。\n" +
  "【测试范围】不要给「消息/通讯录/快捷语」占位页、顶栏壳（管理员/离开/账号下拉）写功能点，除非框架明确把它们列为业务范围。\n" +
  TRACE_SOURCE_HINT +
  "【易漏强制清单】①工作台/首页每一张可点待办或统计卡片各1条[P0]跳转（进列表且默认对应状态Tab）；" +
  "②业务范围内主导航进入各1条；③通用支付弹窗：应付金额/取消无扣款/确认后结果；" +
  "④资源用尽弹窗按钮闭环；⑤成功弹窗主按钮可观察闭环；⑥多入口同页次要入口至少1条可执行叶子；" +
  "⑦详情页关键字段抽样+返回；⑧售罄/限购/未选规格；⑨配置空态界面；⑩售后仅退款 vs 退货退款同意后界面分流。\n" +
  "【全模块覆盖 · 强制】输出一级 ## 必须与框架一级 ## 对齐（跳过明确标为占位/壳层的模块）。" +
  "禁止只写「## 首页」就结束；首页入口挂载可写深链路，但随后必须继续写其余业务页功能。\n" +
  "【按钮结果须可观察 · 演示优先于说明】点按钮后的结果必须写「关弹窗 / 回上一页 / 提示文案 / 当前页状态变化」等可观察反馈；" +
  "权威顺序：【关键按钮交互轨迹】≫ 可见正文/抓取 ≫ 原型说明/更新记录。" +
  "说明文案缺步但轨迹或可见正文已演示 → 必须按演示写，可标【据原型演示】；" +
  "禁止把别的入口的跳转写到本按钮上。" +
  "轨迹与说明、可见正文都没有证据时 → 写【待核实】，禁止臆造目标页。\n";

const DECOMPOSE_SPECIAL_HINT =
  "【专项测试④ · 强制】只输出「专项测试点」Markdown，五个一级 ## 必须齐全：" +
  "权限与多角色、并发与幂等、弱网与异常网络、兼容性、安全。" +
  "叶子标 [P0]/[P1]/[P2] +（条件）+ 可观察结果；可直接进禅道「专项测试」模块。" +
  "写专项风险，禁止重复抄③普通点击路径；可引用「在××页」。" +
  "权限：已登录/未登录/无权限隐藏或禁用/越权访问失败；无多角色证据标【待核实】。" +
  "并发幂等：支付/下单连点、审核连点、发货核销连点、抢号连点、重复提交——只产生一次有效结果。" +
  "弱网：加载态、失败可重试、提交超时提示；兼容：写具体端名主路径可完成；安全：越权、敏感二次确认、富文本不执行脚本、退出后不可继续。" +
  "禁止空话「并发正常/安全无问题/兼容性OK」；无某类能力时该章写1条「本原型无××，跳过」标[P2]。\n";
const HTML_PROTO_HINT =
  "【HTML 原型约定】若素材含「改动汇总」「原型说明」「更新记录」浮窗：那是给测试看的说明文档（改动汇总=本版改页清单；原型说明=字段口径；更新记录=PM 追加变更），不是被测产品功能。" +
  "须通读三段正文再写框架/测点；框架中禁止出现「改动汇总/原型说明/更新记录」模块；禁止写「打开/关闭」这些浮窗的用例；" +
  "但必须精读二者正文来理解业务规则与迭代差异，再映射到真实页面（如渠道激活/设置/批次记录及其业务弹窗）。\n" +
  "【可见入口强制】功能测试点只写页面上有明确入口（可见按钮/行操作）能打开的交互。" +
  "隐藏在页面底部的 modal DOM、或仅写在「原型说明/更新记录」里但当前页没有任何按钮触发的弹窗" +
  "（例如有「更换商务/生成批次」弹窗 HTML，但无对应入口按钮），禁止写成「点击即可弹出」的操作用例；" +
  "最多在框架简介中注明「说明中提及、当前页未见入口」。\n" +
  "【筛选 vs 列表列 · 严格按抓取可见】搜索/筛选区叶子只能写抓取里「搜索表单/筛选条」真实出现的控件；" +
  "列表表头列（如仅出现在表格列的「认证状态」）挂在「列表/列表区」下，禁止因列名常见就臆造进筛选区；" +
  "说明文案与抓取冲突时以抓取可见界面为准。\n";

const CONCRETE_DATA_HINT =
  "【具体数据强制要求】原型、设置页、表单中出现的默认值/阈值/金额/天数/开关开闭/选项文案，必须原样写入测试点。" +
  "禁止只写「阈值」「设定金额」「超限」等含糊词。" +
  "例如界面显示流水金额 500 元、统计周期 30 天、未登录 15 天，则必须写成「最近 30 天累计流水低于 500 元」「未登录超过 15 天」。" +
  "开关须写明默认开/关（如解除合作默认开、锁定默认关）。\n";

const LAYOUT_ORDER_HINT =
  "【梳理顺序 · 强制 · Tab 顶层 + 入口挂载】" +
  "一级 ## 只给 App 底部 Tab / 顶部主导航 / 后台左侧一级菜单（如：首页、祈福服务、文创商城、我的；或工作台、内容管理）。" +
  "页面内从上到下、从左到右用 ### 列区块；能跳转到其他页的入口写成「入口名（进××页）」，" +
  "并在该入口下用缩进嵌套挂上目标页整页框架（页名→态/区块→控件/弹窗→若再跳转继续挂）。" +
  "❌ 禁止把请分身、还愿墙、签到领福、抢靓号、公告、数藏专区等二级页全部提成与「首页」平级的一长列 ##。" +
  "✅ 例：## 首页 → ### 快捷入口卡片 → - 请分身（进…） → - 魁星岩·请分身 → - 未请分身态 / 已请分身态。" +
  "授权登录、设置等全局页挂在最自然的 Tab 下（如 我的→点击登录→授权登录），不要单独冒顶成与 Tab 平级的一串 ##。" +
  "多入口进同一页只在主入口下挂整树，次要入口保留「进××」即可。\n";

const HANDWRITTEN_FRAMEWORK_HINT =
  "【对齐手写 XMind 框架 · 强制】\n" +
  "1. 列表字段平铺：表头每一列必须是「列表 / 列表区」下的平级叶子（如 - 用户id、- 用户账号、- 结算模式、- 用户简称、- 账号状态、- 认证状态、- 注册时间、- 操作），" +
  "禁止建「列」父节点再把字段写进冒号后备注（如「列：A/B/C」）——导出 XMind 备注常不显示。选项写子节点：结算模式 → 平台结算 / 预付款。\n" +
  "2. 二次确认勿汇总：禁止单独写「二次确认弹窗（锁定、解锁、认证通过、认证驳回等）」；" +
  "每个操作各自挂「二次确认」。\n" +
  "3. 页内结构：搜索/筛选区 → 工具栏 → 列表(字段平铺+操作) → 分页；弹窗挂触发入口下。\n" +
  "4. Markdown 标题层级：页用 ##、区内用 - 缩进叶子；禁止在列表项里写「### 筛选区」（井号会进脑图标题）。正确：`- 筛选区` 再缩进字段。\n" +
  "5. 【测试范围 · 强制】只展开本次业务范围内的页面（如联运管理七个入口及其内页）。" +
  "禁止展开「消息 / 通讯录 / 快捷语」占位页细则；禁止在每个业务页下重复挂「顶栏（各页共用）/ 侧栏」整树——" +
  "壳层顶栏侧栏最多在工作台提一句「各页共用顶栏/侧栏」，不要展开品牌/管理员/离开/账号下拉等节点。\n" +
  "6. 框架节点标题不要写〔源:…〕（溯源锚点只用于③功能点叶子）。\n";

const FRAMEWORK_SYS =
  "你是资深测试工程师。当前任务是输出「项目页面框架」（类似手写 XMind：Tab 为大枝，从入口把内页挂下去）。" +
  "不是写详细测试点。\n" +
  HTML_PROTO_HINT +
  LAYOUT_ORDER_HINT +
  HANDWRITTEN_FRAMEWORK_HINT +
  "输出简体中文 Markdown，不要代码围栏包裹全文，禁止 JSON/Playwright。\n" +
  "格式示例（后台列表页 · 字段平铺 + 操作挂确认；筛选项以抓取可见为准，下例「认证状态」仅在列表列出现）：\n" +
  "# （项目名）· 页面框架\n" +
  "## 工作台\n" +
  "> 业务简介：联运管理入口。\n" +
  "### 联运管理 · 功能入口区\n" +
  "- 用户列表（进用户列表页）\n" +
  "  - 用户列表页\n" +
  "    - 搜索\n" +
  "      - 用户id\n" +
  "      - 用户账号\n" +
  "      - 用户简称\n" +
  "      - 结算模式\n" +
  "      - 账号状态\n" +
  "      - 注册时间\n" +
  "      - 搜索按钮\n" +
  "      - 清空按钮\n" +
  "      - 新增按钮\n" +
  "        - 新增用户弹窗\n" +
  "          - 用户账号\n" +
  "          - 密码\n" +
  "          - 用户简称\n" +
  "          - 结算模式\n" +
  "          - 账号状态\n" +
  "          - 确定 / 取消\n" +
  "    - 列表\n" +
  "      - 用户id\n" +
  "      - 用户账号\n" +
  "      - 联运币\n" +
  "      - 扶持额度\n" +
  "        - 扶持额度明细弹窗\n" +
  "      - 结算模式\n" +
  "      - 用户简称\n" +
  "      - 账号状态\n" +
  "      - 认证状态\n" +
  "      - 注册时间\n" +
  "      - 操作\n" +
  "        - 查看\n" +
  "          - 用户详情弹窗\n" +
  "        - 锁定\n" +
  "          - 二次确认\n" +
  "        - 解锁\n" +
  "          - 二次确认\n" +
  "        - 认证通过\n" +
  "          - 二次确认\n" +
  "        - 认证驳回\n" +
  "          - 二次确认\n" +
  "    - 分页组件\n" +
  "要求：每个一级 ## 后必须有「> 业务简介：…」；同站多页合并进同一框架；" +
  "自检若出现「首页与大量内页全部 ## 平级」必须改成入口挂载；" +
  "自检若出现汇总「二次确认弹窗」或「列」下缩进字段必须改平铺；" +
  "自检筛选区字段是否与抓取搜索表单一致（勿把仅列表列塞进筛选）；不要出现「原型说明」「更新记录」。";

const BIZ_SCENARIO_SYS =
  "你是资深测试工程师。当前任务是输出「业务场景测试点」，必须包含两段：" +
  "①「## 冒烟门禁」最短主链路（建议≤15条，只问通不通）；" +
  "②「## 业务场景」按业务能力分组，叶子必须是〔（条件）〕业务结果（会/不会/成功/失败/扣减/状态变为）。\n" +
  HTML_PROTO_HINT +
  CONCRETE_DATA_HINT +
  DECOMPOSE_BIZ_HINT +
  "输出简体中文 Markdown，不要代码围栏包裹全文，禁止 JSON/Playwright/用例编号。\n" +
  "【双段结构 · 强制】\n" +
  "# （项目名）· 业务场景测试点\n" +
  "## 冒烟门禁\n" +
  "- 能进入首页（不白屏）\n" +
  "- （游客）点「暂不登录」能浏览首页\n" +
  "- （已登录）核心主路径能走通…\n" +
  "## 业务场景\n" +
  "### 请分身\n" +
  "- （未请分身）请分身成功并获得专属编号\n" +
  "- （已请分身）不再走免费请分身主流程\n" +
  "### 线上祈福\n" +
  "- （今日福缘 ≥1）提交成功，福缘 −1\n" +
  "- （今日福缘为 0）不能提交\n" +
  "### 分享好友\n" +
  "- （有会长）复制链接带会长 ID\n" +
  "- （无会长）复制链接不含会长 ID\n" +
  "### 代理币预支\n" +
  "#### 会长在预支白名单 · 额度足够\n" +
  "- （余额足够）充值成功，会长预支额度增加\n" +
  "- （余额不足）充值失败\n" +
  "#### 会长不在预支白名单\n" +
  "- 无法使用预支额度给玩家充值\n" +
  "要求：按用户目标/业务能力分组，对齐框架业务入口；禁止按每个 UI 页平铺；" +
  "禁止只写功能名词；禁止吸顶/背景音乐/弹窗按钮文案等展示与逐步 UI（归③功能点）；" +
  "禁止「登录并进入××」超长旅程深嵌套；禁止「## 正向业务 / ## 逆向业务」分章；" +
  "条件含原型具体金额/天数/次数；不要把「原型说明」「更新记录」写成被测场景。";

/** 素材是否声明双原型（前台+后台） */
function isDualPrototypeMaterial(material) {
  const text = String(material || "");
  if (/【多原型[·・.]?独立】/.test(text)) return false;
  if (/【双原型】/.test(text)) return true;
  const hasFront = /(?:前台|C\s*端|客户端|小程序|用户端)\s*[:：]\s*https?:\/\//i.test(text);
  const hasBack = /(?:后台|管理端|运营端|B\s*端|管理后台)\s*[:：]\s*https?:\/\//i.test(text);
  return hasFront && hasBack;
}

function isMultiIndependentMaterial(material) {
  const text = String(material || "");
  if (/【多原型[·・.]?独立】/.test(text)) return true;
  const hasA = /原型\s*A(?:（[^）]+）|\([^)]+\))?\s*[:：]\s*https?:\/\//i.test(text);
  const hasB = /原型\s*B(?:（[^）]+）|\([^)]+\))?\s*[:：]\s*https?:\/\//i.test(text);
  return hasA && hasB;
}

function hasVersionScopeNote(material) {
  return /【本版范围】|仅(?:生成)?\s*V2|按版本查看\s*[=：]\s*V2/i.test(
    String(material || "")
  );
}

const DUAL_FRAMEWORK_HINT =
  "【双原型 · 强制】素材含前台与后台两套原型。" +
  "框架一级 ## 须覆盖「前台（C 端）」与「后台（管理端）」两大段（可用 ## 前台 / ## 后台，或产品实际名称）；" +
  "各自内部再按 Tab/侧栏入口挂载；禁止只写其中一端。" +
  "抓取块标有【前台原型】【后台原型】时，模块归属必须与之对齐。";

const DUAL_BIZ_HINT =
  "【双原型跨端闭环 · 强制】业务场景必须关联前台与后台：" +
  "至少覆盖「前台产生数据/订单/申请 → 后台列表可见/状态正确 → 后台审核/履约/配置 → 前台结果变化」类闭环；" +
  "冒烟门禁须各端至少有可达主路径；" +
  "后台开关/配置对前台展示的影响须开/关成对写清；禁止只写单端场景。";

const MULTI_FRAMEWORK_HINT =
  "【多原型·独立 · 强制】素材含两套独立系统原型（不是前台/后台）。" +
  "框架一级 ## 须按系统/原型标签分两大段（可用抓取中的【原型A·…】【原型B·…】名称）；" +
  "各段内部再按该系统自己的菜单挂载；禁止把一端叫成前台/后台，禁止合并成单一产品壳。";

const MULTI_BIZ_HINT =
  "【多原型·独立业务 · 强制】两套系统各自写冒烟与业务场景，不要硬写跨端闭环；" +
  "若素材【本版范围】声明仅 V2，则新商务侧只覆盖 V2 改动页（商务绩效/小组/有效端/免预警/设置等），禁止展开 V1 未改菜单全量场景。";

const VERSION_SCOPE_HINT =
  "【本版范围 · 强制】素材声明仅测某一版本（如 V2 近期改版）。" +
  "框架与测点只覆盖该版本侧栏可见/改动清单中的页面与交互；" +
  "原型中仍存在的历史版本页面若未纳入本版，标为范围外或不写；禁止按「全部页面」生成全站回归级测点。";

const THREE_FLOAT_PANELS_HINT =
  "【三浮窗通读 · 强制】抓取中若有「改动汇总」「原型说明」「更新记录」三段正文，必须全部精读后再写框架/测点：" +
  "① 改动汇总＝本版改了哪些页、每页改点、全站项（框架一级模块须覆盖汇总中的改动页，漏页不合格）；" +
  "② 原型说明＝当前页字段/交互口径；" +
  "③ 更新记录＝PM 追加规则变更。" +
  "禁止把这三个浮窗本身写成被测入口；禁止只看可见列表就忽略浮窗正文。" +
  "【禁止「未展开」占位】严禁写「侧栏可见入口；本次抓取未展开页内区块」「本页结构未抓取」这类空壳叶子。" +
  "抓取若有【子页面：××】或【子页面·原型说明：××】，必须在该入口下展开筛选/列表/工具栏/弹窗等 ### 区块；" +
  "改动汇总已列该页但正文偏少时，按汇总改点与同模块已抓页面结构展开，缺证据处写【待核实】，不得只留入口一句。";

export function buildStandaloneFrameworkMessages({
  material,
  skill,
  pageContext,
  reviewFeedback,
  priorDraft,
}) {
  const skillHint = String(skill || "").trim();
  const mat = String(material || "").trim();
  const ctx = String(pageContext || "").trim();
  const review = String(reviewFeedback || "").trim();
  const draft = String(priorDraft || "").trim();
  const multi =
    isMultiIndependentMaterial(mat) || /【多原型[·・.]?独立合并说明】|【原型A/.test(ctx);
  const dual =
    !multi &&
    (isDualPrototypeMaterial(mat) ||
      /【前台原型】|【后台原型】|【双原型合并说明】/.test(ctx));
  const verScope = hasVersionScopeNote(mat) || /【本版范围】|biz_ver_view=/.test(ctx);
  const reviewBlock = review
    ? `【上一轮评审报告 · 请重点落实其中「① 页面框架」的严重问题与遗漏】\n${review.slice(0, 8000)}\n\n` +
      (draft
        ? `【修订模式 · 强制】以下是当前框架稿。请在此基础上修订：落实严重问题与遗漏；无问题条目尽量原样保留，勿无故改写。输出完整修订后全文。\n\n【当前框架稿】\n${draft.slice(0, 10000)}\n\n`
        : "按报告修正后重新输出完整「项目页面框架」Markdown。\n\n")
    : "";
  return [
    {
      role: "system",
      content:
        FRAMEWORK_SYS +
        (skillHint
          ? `\n\n【用户 Skill 中与框架相关的要求请一并遵循】\n${skillHint.slice(0, 4000)}`
          : ""),
    },
    {
      role: "user",
      content:
        `【原型 / 说明 / 网址】\n${mat || "（未填写）"}\n\n` +
        (ctx
          ? `【已抓取内容（须通读「改动汇总/原型说明/更新记录」三浮窗；按钮跳转/提示以「关键按钮交互轨迹」与可见正文为准，说明缺步时勿因缺步而省略演示结果）】\n${ctx.slice(0, 20000)}\n\n`
          : "") +
        reviewBlock +
        (multi ? MULTI_FRAMEWORK_HINT + "\n" : dual ? DUAL_FRAMEWORK_HINT + "\n" : "") +
        (verScope ? VERSION_SCOPE_HINT + "\n" : "") +
        THREE_FLOAT_PANELS_HINT +
        "\n" +
        "请只输出「项目页面框架」Markdown：" +
        "一级 ## 只对应 Tab/主导航/后台一级菜单（有导航结构则与之对齐）；" +
        "页内区块用 ###；能跳转的入口下用缩进挂目标页整树（入口挂载）。" +
        "列表表头字段必须平铺为列表下叶子；禁止「列：A/B/C」进备注；二次确认挂在各操作下；" +
        "列表项标题禁止带 ###（写「- 筛选区」不要「- ### 筛选区」）；" +
        "不要展开消息/通讯录/快捷语占位页，不要在每个业务页下重复顶栏/侧栏壳层节点；" +
        "禁止把请分身/还愿墙/签到/公告/抢靓号等内页与首页摊平成一长列 ##；" +
        "禁止只写「产品系统 / 入口页」这种预览壳标题；禁止把抓取失败时的空壳当成完整框架。" +
        "授权登录等全局页挂在「我的」等自然入口下，不要单独冒顶一串 ##。" +
        "同站已抓取的多页内容要合并进同一框架（挂到对应入口下）。不要输出测试点；不要写〔源:〕；不要把「原型说明」「更新记录」列为页面。",
    },
  ];
}

export function buildStandaloneBizScenarioMessages({
  material,
  skill,
  framework,
  pageContext,
  reviewFeedback,
  priorDraft,
}) {
  const skillHint = String(skill || "").trim();
  const mat = String(material || "").trim();
  const fw = String(framework || "").trim();
  const ctx = String(pageContext || "").trim();
  const review = String(reviewFeedback || "").trim();
  const multi =
    isMultiIndependentMaterial(mat) || /【多原型[·・.]?独立合并说明】|【原型A/.test(ctx);
  const dual =
    !multi &&
    (isDualPrototypeMaterial(mat) ||
      /【前台原型】|【后台原型】|【双原型合并说明】/.test(ctx) ||
      /##\s*前台|##\s*后台|##\s*管理/.test(fw));
  const verScope = hasVersionScopeNote(mat) || /【本版范围】|biz_ver_view=/.test(ctx);
  const l1 = extractFrameworkL1Titles(fw);
  const blocks = extractFrameworkBlockTitles(fw);
  const coverBits = [];
  if (l1.length) coverBits.push(`框架一级模块：${l1.join("、")}`);
  if (blocks.length) coverBits.push(`框架主要区块/能力线索：${blocks.slice(0, 40).join("、")}`);
  const coverHint = coverBits.length
    ? `【业务能力全覆盖 · 强制】${coverBits.join("。")}。` +
      "「## 业务场景」的 ### 须覆盖上述模块下的主要业务能力，禁止只写首页相关就结束；" +
      "冒烟门禁须覆盖各主 Tab 可达路径。缺模块对应能力不合格。\n"
    : "【业务能力全覆盖 · 强制】对照框架各一级 ## 与入口，业务场景须覆盖各模块主要能力，禁止只写首页。\n";
  const draft = String(priorDraft || "").trim();
  const reviewBlock = review
    ? `【上一轮评审报告 · 请重点落实其中「② 业务场景」的严重问题与遗漏】\n${review.slice(0, 8000)}\n\n` +
      (draft
        ? `【修订模式 · 强制】以下是当前业务场景稿。请在此基础上修订：落实严重问题与遗漏；无问题条目尽量原样保留。输出完整修订后全文（仍须含冒烟门禁+业务场景双段）。\n\n【当前业务场景稿】\n${draft.slice(0, 10000)}\n\n`
        : "按报告修正后重新输出完整「业务场景测试点」Markdown（含冒烟门禁+业务场景双段）。\n\n")
    : "";
  return [
    {
      role: "system",
      content:
        BIZ_SCENARIO_SYS +
        (skillHint
          ? `\n\n【用户 Skill 中与业务场景相关的要求请一并遵循】\n${skillHint.slice(0, 4000)}`
          : ""),
    },
    {
      role: "user",
      content:
        `【原型 / 说明 / 网址】\n${mat || "（未填写）"}\n\n` +
        (fw ? `【已确认的项目页面框架】\n${fw}\n\n` : "") +
        (ctx
          ? `【抓取内容（业务规则精读说明/更新记录；按钮结果优先采用「关键按钮交互轨迹」与可见正文）】\n${ctx.slice(0, 12000)}\n\n`
          : "") +
        reviewBlock +
        coverHint +
        (multi ? MULTI_BIZ_HINT + "\n" : dual ? DUAL_BIZ_HINT + "\n" : "") +
        (verScope ? VERSION_SCOPE_HINT + "\n" : "") +
        THREE_FLOAT_PANELS_HINT +
        "\n" +
        "请只输出「业务场景测试点」Markdown，必须含两段：" +
        "先「## 冒烟门禁」（建议≤15条，主链路通不通），再「## 业务场景」（按请分身/祈福/签到/下单等业务能力分组）。" +
        "业务场景叶子必须是〔（条件）〕业务结果，禁止只写功能名词；禁止按每个 UI 页平铺；" +
        "禁止吸顶/背景音乐/弹窗按钮文案/勾选协议等逐步 UI（归功能点）；" +
        "禁止「登录并进入××」超长旅程；禁止「## 正向业务 / ## 逆向业务」。" +
        "开关/同号同证/多渠道入池等交叉规则拆成可直接测的叶子；后台判定树可浅嵌套写结果；" +
        "条件含原型具体金额/天数/次数。语言简洁准确。" +
        "不要重复输出页面框架；不要把「原型说明」「更新记录」当被测对象。",
    },
  ];
}

const SPECIAL_SYS =
  "你是资深测试工程师。当前任务是输出「专项测试点」（④），与页面功能③分开。" +
  "五个一级 ## 强制齐全：权限与多角色、并发与幂等、弱网与异常网络、兼容性、安全。\n" +
  HTML_PROTO_HINT +
  DECOMPOSE_SPECIAL_HINT +
  "输出简体中文 Markdown，不要代码围栏包裹全文，禁止 JSON/Playwright/用例编号。\n" +
  "【结构示例】\n" +
  "# （项目名）· 专项测试点\n" +
  "## 权限与多角色\n" +
  "### 未登录 / 已登录\n" +
  "- [P0] （未登录）打开需登录入口，进入授权登录或提示先登录，不能完成下单\n" +
  "- [P1] （无权限角色【待核实】）管理菜单不可见或进入后提示无权限\n" +
  "## 并发与幂等\n" +
  "### 支付与提交\n" +
  "- [P0] （确认支付连点两次）只产生 1 笔有效订单，第二次提示处理中或已提交\n" +
  "- [P0] （审核「同意」连点两次）业务状态只变更一次，不会重复流转\n" +
  "## 弱网与异常网络\n" +
  "### 加载与提交\n" +
  "- [P1] （弱网）列表显示加载中，失败能提示并可重试\n" +
  "- [P1] （提交超时）有失败提示，不会静默成功\n" +
  "## 兼容性\n" +
  "### 主端\n" +
  "- [P2] （微信小程序主路径）首页到下单关键按钮可点、无遮挡\n" +
  "## 安全\n" +
  "### 越权与敏感\n" +
  "- [P0] （普通账号）不能查看或操作他人订单/审核单\n" +
  "- [P1] （退出登录后）按返回不能继续操作需登录功能\n" +
  "要求：写专项风险；禁止空话；无证据标待核实；不要输出①②③全文。";

export function buildStandaloneSpecialMessages({
  material,
  skill,
  framework,
  businessScenarios,
  pageFunctionMd,
  pageContext,
  reviewFeedback,
  priorDraft,
}) {
  const skillHint = String(skill || "").trim();
  const mat = String(material || "").trim();
  const fw = String(framework || "").trim();
  const biz = String(businessScenarios || "").trim();
  const func = String(pageFunctionMd || "").trim();
  const ctx = String(pageContext || "").trim();
  const review = String(reviewFeedback || "").trim();
  const draft = String(priorDraft || "").trim();
  const reviewBlock = review
    ? `【上一轮评审报告 · 请重点落实其中「④ 专项测试」的严重问题与遗漏】\n${review.slice(0, 8000)}\n\n` +
      (draft
        ? `【修订模式 · 强制】以下是当前专项稿。请在此基础上修订：落实严重问题与遗漏；无问题条目尽量原样保留。输出完整修订后全文（仍须五章齐全）。\n\n【当前专项测试稿】\n${draft.slice(0, 10000)}\n\n`
        : "按报告修正后重新输出完整「专项测试点」Markdown（五章齐全）。\n\n")
    : "";
  return [
    {
      role: "system",
      content:
        SPECIAL_SYS +
        (skillHint
          ? `\n\n【用户 Skill 中与专项相关的要求请一并遵循】\n${skillHint.slice(0, 4000)}`
          : ""),
    },
    {
      role: "user",
      content:
        `【原型 / 说明】\n${mat || "（未填写）"}\n\n` +
        (fw ? `【已确认的项目页面框架】\n${fw.slice(0, 8000)}\n\n` : "") +
        (biz ? `【已确认的业务场景 · 用于识别支付/审核/抢号等专项风险点】\n${biz.slice(0, 6000)}\n\n` : "") +
        (func
          ? `【已确认的页面功能 · 专项勿重复普通点击，可引用模块名】\n${func.slice(0, 6000)}\n\n`
          : "") +
        (ctx
          ? `【抓取内容】\n${ctx.slice(0, 10000)}\n\n`
          : "") +
        reviewBlock +
        "请只输出「专项测试点」Markdown：" +
        "五个一级 ##（权限与多角色、并发与幂等、弱网与异常网络、兼容性、安全）必须齐全；" +
        "叶子 [P0]/[P1]/[P2] +（条件）+ 可观察结果；" +
        "覆盖支付/审核/抢号连点、越权、弱网重试、主端兼容、退出后不可操作等；" +
        "禁止空话；禁止把④写进③；不要输出框架/业务/功能全文。",
    },
  ];
}

/** 从框架 Markdown 提取一级 ## 标题（Tab/主导航模块名） */
export function extractFrameworkL1Titles(frameworkMd) {
  const out = [];
  const seen = new Set();
  for (const raw of String(frameworkMd || "").split(/\r?\n/)) {
    const m = raw.match(/^##\s+(.+)$/);
    if (!m) continue;
    const title = String(m[1] || "")
      .replace(/\s*[（(].*?[）)]\s*$/, "")
      .trim();
    if (!title || seen.has(title)) continue;
    if (/^(冒烟门禁|业务场景|页面功能测试点)$/.test(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

/** 从框架提取 ### 区块名，供②业务场景全覆盖提示 */
export function extractFrameworkBlockTitles(frameworkMd) {
  const out = [];
  const seen = new Set();
  for (const raw of String(frameworkMd || "").split(/\r?\n/)) {
    const m = raw.match(/^###\s+(.+)$/);
    if (!m) continue;
    let title = String(m[1] || "")
      .replace(/\s*[（(].*?[）)]\s*$/, "")
      .trim();
    title = title.replace(/（进.+?）/g, "").replace(/\(进.+?\)/g, "").trim();
    if (!title || seen.has(title)) continue;
    if (/^(顶部导航|顶栏|公告区|公告区域)$/.test(title) && out.length > 8) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}


/** 总评段落（标题行 + 随后一小段），兼容「## 总评」换行后再写「合格」 */
function reviewVerdictChunk(md) {
  const head = String(md || "").slice(0, 1200);
  const m = head.match(/##\s*总评[^\n]*\n+([\s\S]{0,400})/);
  if (m) {
    const title = head.match(/##\s*总评[^\n]*/)?.[0] || "总评";
    return `${title}\n${m[1]}`;
  }
  const i = head.indexOf("总评");
  return i >= 0 ? head.slice(i, i + 280) : head;
}

/** 从评审报告判断是否需强制返工（仅严重问题 / 总评明确需返工；遗漏与建议改进不强制） */
export function reviewNeedsRework(md) {
  const t = String(md || "");
  if (!t.trim()) return false;
  const chunk = reviewVerdictChunk(t);
  const hasPass =
    /合格（复审通过）/.test(chunk) ||
    /(?:基本合格|(?<!不)合格)/.test(chunk);
  const hasRework = /需返工/.test(chunk);
  // 总评写「基本合格 / 合格」且未写「需返工」→ 不强制返工（遗漏可人工补）
  if (hasPass && !hasRework) return false;
  if (hasRework && !hasPass) return true;
  if (/合格（复审通过）/.test(chunk)) return false;

  // 只取「### 严重问题」到下一个 ###/## 之间的正文，勿把后面「遗漏」的 - 列表算进来
  const re = /###\s*严重问题[^\n]*\n([\s\S]*?)(?=\n###|\n##\s|$)/g;
  let m;
  while ((m = re.exec(t))) {
    const body = m[1] || "";
    // 节内已声明「（无）」时，后面的「上一轮闭合情况」证据列表不算新严重项
    if (/[（(]\s*无/.test(body.slice(0, 120))) continue;
    const bullets = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l));
    const real = bullets.filter(
      (l) =>
        !/^(?:[-*]\s*)?(?:无|暂无|无严重|无必须改|跳过|未提供|（无|无）)/.test(l) &&
        !/^(?:[-*]\s*)?(?:\*\*)?(?:证据|新稿|结论|已闭合|复审)/.test(l) &&
        !/已闭合/.test(l) &&
        l.length > 8
    );
    if (real.length) return true;
  }
  return false;
}

const REVIEW_SYS =
  "你是资深测试评审专家。对照「原型抓取/说明」，一次性评审①页面框架、②业务场景、③页面功能、④专项测试，输出简体中文 Markdown 评审报告。" +
  "权威顺序：【关键按钮交互轨迹（演示证据）】≫ 原型抓取可见正文 ≫ 原型说明/更新记录 ≫ ①框架 ≫ ②③④测试点。" +
  "说明缺步但轨迹/可见正文已演示的结果，不得因「说明没写」判臆造；应要求测试点写上演示结果（可标【据原型演示】）。" +
  "框架未列出的入口，只要抓取里能见到菜单/文案，不得判「臆造」。" +
  "分册关注：" +
  "①框架：Tab/一级 ## 是否齐全、入口是否挂载内页、有无把「原型说明/更新记录」当模块；" +
  "②场景：冒烟+业务双段、条件+结果、开关开/关成对、待办卡片门禁、交叉规则；" +
  "③功能：全模块、P0是否≤约25%、易漏清单（待办卡片/支付弹窗/用尽弹窗/成功闭环/多入口/详情/售罄/空态/售后分流）、成对取消确定；" +
  "④专项：五章（权限/并发幂等/弱网/兼容/安全）是否齐、有无空话、支付审核连点与越权是否覆盖。" +
  "【防误报 · 严重问题门槛 · 强制】" +
  "1) 「严重问题」每条必须先写「证据：」并摘录原文关键词；写不出证据 → 禁止进严重问题，改放「建议改进」并标「待核实」。" +
  "2) 禁止用「若无可见菜单则为臆造」假设句。" +
  "3) 同一目标页允许多入口并存。" +
  "4) 提示文案抓取未写清时勿轻易判臆造。" +
  "5) 以交互轨迹与可见正文仲裁①②③④冲突。" +
  "6) `[P0]/[P1]/[P2]` 是规范强制标记，不算禁止技术英文；但③若几乎全是 P0（目测>40%）→ 写入遗漏/建议「P0 膨胀需降噪」，一般不单独因比例进严重除非同时漏主路径。" +
  "7) 「需返工」仅当至少一条严重问题有实质条目；仅遗漏/建议 → 总评基本合格或合格。" +
  "8) 复审：严重已闭合且无新证据级严重 → 合格（复审通过）。" +
  "9) 成功弹窗主按钮必须有可观察闭环。" +
  "输出结构强制：\n" +
  "# 测试点评审报告（①②③④）\n" +
  "## 总评（合格/基本合格/需返工 + 一句话，点名①②③④）\n" +
  "## ① 页面框架\n### 严重问题（必须改）\n- 证据 → 定位 → 问题 → 建议改成\n### 遗漏\n- …\n### 建议改进（含待核实）\n- …\n" +
  "## ② 业务场景\n### 严重问题（必须改）\n- …\n### 遗漏\n- …\n### 建议改进（含待核实）\n- …\n" +
  "## ③ 页面功能\n### 严重问题（必须改）\n- …\n### 遗漏\n- …\n### 建议改进（含待核实）\n- …\n" +
  "## ④ 专项测试\n### 严重问题（必须改）\n- …\n### 遗漏\n- …\n### 建议改进（含待核实）\n- …\n" +
  "## 可保留的优点\n- …\n" +
  "某步内容为空则该步写「未提供，跳过」。禁止输出完整重写后的①②③④全文；禁止 JSON/Playwright；不要寒暄开场白。";

/** 对照原型一并评审①框架 / ②场景 / ③功能 / ④专项 */
export function buildStandaloneReviewMessages({
  material,
  skill,
  framework,
  businessScenarios,
  pageContext,
  pageFunctionMd,
  specialMd,
  priorReviewReport,
}) {
  const skillText = String(skill || "").trim() || STANDALONE_QA_SKILL_DEFAULT;
  const mat = String(material || "").trim();
  const fw = String(framework || "").trim();
  const biz = String(businessScenarios || "").trim();
  const ctx = String(pageContext || "").trim();
  const func = String(pageFunctionMd || "").trim();
  const special = String(specialMd || "").trim();
  const prior = String(priorReviewReport || "").trim();
  const reReviewBlock = prior
    ? `【复审模式 · 强制】上一轮评审报告如下。本次只核对：\n` +
      `1) 上一轮「严重问题」「遗漏」是否已在新稿中落实；\n` +
      `2) 修订是否引入新的、有证据的严重错误。\n` +
      `不要对已合格细节吹毛求疵。若上一轮问题已闭合且无新证据级严重问题 → 总评写「合格（复审通过）」。\n\n` +
      `【上一轮评审报告】\n${prior.slice(0, 10000)}\n\n`
    : "";
  return [
    {
      role: "system",
      content: REVIEW_SYS + "\n\n【生成规范摘要 · 评审时对照】\n" + skillText.slice(0, 4000),
    },
    {
      role: "user",
      content:
        `【原型 / 说明】\n${mat || "（未填写）"}\n\n` +
        (ctx
          ? `【原型抓取（权威：交互轨迹 ≫ 可见正文 ≫ 说明；判臆造/漏入口前必须先检索本段）】\n${ctx.slice(0, 14000)}\n\n`
          : "【警告】本次无原型抓取正文：禁止把任何点判为「臆造入口/臆造反馈」，最多写入建议改进·待核实。\n\n") +
        reReviewBlock +
        `【待评审 · ① 页面框架】\n${fw.slice(0, 8000) || "（空 · 跳过①）"}\n\n` +
        `【待评审 · ② 业务场景测试点】\n${biz.slice(0, 8000) || "（空 · 跳过②）"}\n\n` +
        `【待评审 · ③ 页面功能测试点】\n${func.slice(0, 12000) || "（空 · 跳过③）"}\n\n` +
        `【待评审 · ④ 专项测试点】\n${special.slice(0, 8000) || "（空 · 跳过④）"}\n\n` +
        "请按强制结构输出①②③④合订评审报告。" +
        "严重问题必须带「证据」摘录；吃不准的一律进建议改进并标待核实。" +
        (prior
          ? "本次为复审：优先写清「已闭合 / 未闭合」项。"
          : "④ 若未提供可写跳过，但仍应在总评点名；若已提供则检查五章是否齐全。"),
    },
  ];
}

export function buildStandaloneQaMessages({
  material,
  skill,
  framework,
  businessScenarios,
  pageContext,
  reviewFeedback,
  priorDraft,
}) {
  const skillText = String(skill || "").trim() || STANDALONE_QA_SKILL_DEFAULT;
  const mat = String(material || "").trim();
  const fw = String(framework || "").trim();
  const biz = String(businessScenarios || "").trim();
  const ctx = String(pageContext || "").trim();
  const review = String(reviewFeedback || "").trim();
  const l1 = extractFrameworkL1Titles(fw);
  const coverHint = l1.length
    ? `【框架一级模块必须全覆盖】${l1.join("、")}。输出必须含同名一级 ##，缺任一模块不合格；禁止只写首页。\n`
    : "【框架一级模块必须全覆盖】框架有几个一级 ## 就写几个；禁止只写首页。\n";
  const draft = String(priorDraft || "").trim();
  const reviewBlock = review
    ? `【上一轮评审报告 · 请重点落实其中「③ 页面功能」的严重问题与遗漏】\n${review.slice(0, 10000)}\n\n` +
      (draft
        ? `【修订模式 · 强制】以下是当前功能点稿。请在此基础上修订：落实严重问题与遗漏（如图中遗漏项须补齐）；无问题叶子尽量原样保留，勿推倒重来；已有〔源:…〕锚点必须保留，新增叶子补锚点。输出完整修订后全文。「建议改进」尽量采纳。\n\n【当前功能点稿】\n${draft.slice(0, 14000)}\n\n`
        : "按报告修正后重新输出完整页面功能测试点 Markdown。「建议改进」尽量采纳；叶子须带〔源:…〕锚点。\n\n") +
      "输出仍须符合第三步规范（含溯源锚点）。\n\n"
    : "";
  return [
    {
      role: "system",
      content:
        skillText +
        "\n\n" +
        HTML_PROTO_HINT +
        CONCRETE_DATA_HINT +
        DECOMPOSE_FUNC_HINT,
    },
    {
      role: "user",
      content:
        `【原型 / 说明】\n${mat || "（未填写）"}\n\n` +
        (fw ? `【已确认的项目页面框架】\n${fw}\n\n` : "") +
        (biz
          ? `【已确认的业务场景测试点 · 第三步测行为少抄皮，勿重复业务结果与冒烟主链路】\n${biz}\n\n`
          : "") +
        (ctx
          ? `【抓取内容（业务规则精读说明/更新记录；按钮结果优先采用「关键按钮交互轨迹」与可见正文）】\n${ctx.slice(0, 12000)}\n\n`
          : "") +
        reviewBlock +
        coverHint +
        "请严格按 Skill「第三步」输出页面功能测试点：测行为、少抄皮；" +
        "≥70% 交互/校验/空态，≤30% 静态展示；叶子标 [P0]/[P1]/[P2]，且 [P0]≤25%；" +
        "短句「操作，能/会/不会+结果」；成对写取消/确定；校验失败写清提示文案；默认值写具体数字。" +
        "落实易漏清单：待办卡片跳转、支付弹窗、用尽弹窗、成功闭环、多入口、详情字段、售罄限购、空态、售后分流。" +
        "禁止「界面与原型一致」「筛选正常」；禁止逐商品抄价格/限量；禁止业务结果型叶子（归②）；" +
        "入口导航每入口最多1条。章节顺序与框架一致，且每个框架业务一级 ## 都要有对应功能点章节。" +
        "章节必须「## 页名」再「### 筛选区/工具栏/列表区」层层嵌套，禁止「## 页名-区名」合并。" +
        "框架筛选区真实有的字段测点必须有对应叶子；仅列表列有的字段写在列表区，勿臆造筛选控件。" +
        "不要写消息/通讯录/快捷语占位与顶栏壳层用例。" +
        "每条交互叶子句末必须带溯源锚点〔源:框架路径 · 「控件」〕（路径对齐①框架标题）。" +
        "不要输出框架或整段业务场景/冒烟/专项；不要给「原型说明」「更新记录」写用例。",
    },
  ];
}

/** 从原型说明里猜 baseURL（供 .spec.ts）；保留 preview 路径，勿裁成站点根 */
export function guessPlaywrightBaseUrl(material) {
  const m = String(material || "").match(/https?:\/\/[^\s"'<>]+/i);
  if (!m) return "http://127.0.0.1:5173/";
  // 去掉末尾标点，保留路径；统一加尾斜杠，便于 page.goto('.') 留在 preview 下
  let url = m[0].replace(/[),.]+$/, "");
  if (!url.endsWith("/")) url += "/";
  return url;
}

/** 规范化用户填写的测试环境地址 */
export function normalizePlaywrightBaseUrl(raw) {
  let url = String(raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/[),.]+$/, "");
}

/**
 * 把 .spec.ts 里的 BASE_URL / test.use baseURL 改成测试环境地址。
 * 生成仍可用原型理解页面，跑自动化时指向真实测试环境。
 */
export function rewritePlaywrightBaseUrl(ts, newUrl) {
  const url = normalizePlaywrightBaseUrl(newUrl);
  let t = String(ts || "");
  if (!url || !t) return t;
  if (/\bconst\s+BASE_URL\b/.test(t)) {
    t = t.replace(
      /const\s+BASE_URL\s*=\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*;?/,
      `const BASE_URL = ${JSON.stringify(url)};`
    );
  } else {
    t = `const BASE_URL = ${JSON.stringify(url)};\n\n` + t;
  }
  t = t.replace(
    /test\.use\(\s*\{\s*baseURL\s*:\s*(?:'[^']*'|"[^"]*"|BASE_URL)\s*\}\s*\)/g,
    "test.use({ baseURL: BASE_URL })"
  );
  return t;
}

/**
 * 修正模型爱写的 page.goto('/') —— 在带 /preview/xxx 的 baseURL 下会跳到站点根（灵巅云壳），
 * 而不是原型预览页。
 */
export function sanitizePlaywrightSpecTs(ts, baseUrl) {
  let t = String(ts || "");
  const base = String(baseUrl || "").trim().replace(/\/?$/, "");
  if (!t) return t;
  // 强制入口用完整 BASE_URL，避免 '/' 打到域名根
  t = t.replace(
    /page\.goto\(\s*['"]\/['"]\s*\)/g,
    "page.goto(BASE_URL)"
  );
  t = t.replace(
    /page\.goto\(\s*`\/`\s*\)/g,
    "page.goto(BASE_URL)"
  );
  // 若缺 BASE_URL 常量但有 test.use baseURL，尽量补一个
  if (base && !/\bconst\s+BASE_URL\b/.test(t) && /test\.use\(\s*\{\s*baseURL/.test(t)) {
    t = `const BASE_URL = ${JSON.stringify(base)};\n\n` + t;
  }
  // test.use 里若写了相对 base，尽量换成 BASE_URL
  if (/\bconst\s+BASE_URL\b/.test(t)) {
    t = t.replace(
      /test\.use\(\s*\{\s*baseURL\s*:\s*['"][^'"]+['"]\s*\}\s*\)/g,
      "test.use({ baseURL: BASE_URL })"
    );
  }
  return t;
}

/** 从模型输出中抽出 Playwright Test .spec.ts 正文 */
export function extractPlaywrightSpecTs(raw) {
  let t = String(raw || "").trim();
  if (!t) return "";
  const fence =
    /```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  t = t.replace(/^#+\s+.+$/gm, "").trim();
  return t;
}

/** 轻度校验：至少像一份 @playwright/test 用例 */
export function looksLikePlaywrightSpec(ts) {
  const t = String(ts || "");
  return (
    /@playwright\/test/.test(t) &&
    /\btest\s*\(/.test(t) &&
    t.length > 80
  );
}

/**
 * 独立模式：在 Markdown 测试点之外，额外生成标准 Playwright Test（.spec.ts）
 * 只覆盖可自动化主路径，不把全部功能点硬转脚本。
 */
export function buildStandalonePlaywrightSpecMessages({
  material,
  framework,
  businessScenarios,
  pageFunctionMd,
  pageContext,
  baseUrl,
  skillHint,
}) {
  const mat = String(material || "").trim();
  const fw = String(framework || "").trim();
  const biz = String(businessScenarios || "").trim();
  const func = String(pageFunctionMd || "").trim();
  const ctx = String(pageContext || "").trim().slice(0, 12000);
  const url = String(baseUrl || guessPlaywrightBaseUrl(mat)).trim();
  const skill = String(skillHint || "").trim();
  return [
    {
      role: "system",
      content:
        (skill
          ? skill + "\n\n## 本轮任务（生成 .spec.ts）\n"
          : "你是资深前端测试工程师。") +
        "根据已确认的页面框架、业务场景与页面功能测试点，" +
        "输出一份可直接放入 Playwright 项目运行的 TypeScript 测试文件（@playwright/test）。\n" +
        "硬性要求：\n" +
        "1) 只输出一个 ```typescript 代码块，不要 Markdown 说明、不要 JSON 步骤 DSL。\n" +
        "2) 必须 `import { test, expect } from '@playwright/test'`。\n" +
        "3) 用例 4～10 条，覆盖：打开入口、登录（若原型有）、侧栏/主导航跳转、1～2 条关键业务断言；" +
        "不要把全部功能点逐条翻译成脚本。\n" +
        "4) 优先 getByRole / getByText({ exact: true }) / #id；避免脆弱的绝对 xpath。\n" +
        "5) 使用 test.describe 分组；每条 test 标题用简体中文。\n" +
        "6) 页面地址：文件顶部定义 const BASE_URL；test.use({ baseURL: BASE_URL })；" +
        "打开入口用 page.goto(BASE_URL)；**禁止** page.goto('/')。\n" +
        "7) /preview/ 预览壳须进 iframe；真实测试环境通常不要硬套 iframe。\n" +
        "8) 避开「原型说明」浮层的重复文案与输入框。\n" +
        "9) 选择器/文案必须来自下方原型上下文；登录账号用上下文演示账号。",
    },
    {
      role: "user",
      content:
        `【baseURL】（请原样写入 const BASE_URL，打开页面用 page.goto(BASE_URL)，不要 goto('/')）\n${url}\n\n` +
        `【原型 / 说明】\n${mat || "（未填写）"}\n\n` +
        (ctx ? `【原型页面上下文（节选）】\n${ctx}\n\n` : "") +
        (fw ? `【已确认的项目页面框架】\n${fw}\n\n` : "") +
        (biz ? `【已确认的业务场景测试点】\n${biz}\n\n` : "") +
        (func
          ? `【已确认的页面功能测试点（仅作选题参考，勿全量脚本化）】\n${func.slice(0, 14000)}\n\n`
          : "") +
        "请生成 playwright.spec.ts 内容（仅 typescript 代码块）。",
    },
  ];
}

/** 独立模式：去掉误输出的 Playwright JSON，保留列表条目 */
export function repairStandaloneTestPointMd(md) {
  let text = String(md || "").trim();
  if (!text) return text;
  const withoutFences = text.replace(/```[\s\S]*?```/g, "").trim();
  const listLines = (withoutFences.match(/^[-*+]\s+.+$/gm) || []).length;
  const headingLines = (withoutFences.match(/^#{1,3}\s+.+$/gm) || []).length;
  if (listLines >= 3 || (headingLines >= 2 && listLines >= 1)) {
    text = text.replace(/##\s*冒烟自动化[\s\S]*?(?=##|$)/gi, "");
    text = text.replace(/```json[\s\S]*?```/gi, "");
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }
  if (/```json|"op"\s*:|"selector"\s*:/i.test(text)) {
    return (
      "# 测试点\n\n" +
      "> 模型本轮输出了 JSON/自动化脚本而非一条条测试点。请点击「生成测试点文档」重试；若仍出现，请在 Skill 中强调「禁止 JSON」。\n"
    );
  }
  return text;
}

export const QA_PIPELINE_STYLE_HINT =
  "【敏捷流水线 · 测试点列表专用格式 · 固定顺序】\n" +
  "必须按以下结构输出（禁止颠倒）：\n" +
  "# （项目名）测试点\n\n" +
  "## 冒烟自动化（Playwright）\n" +
  "写 3～5 条核心主流程，每条：### 一句话标题 + 紧跟 ```json 步骤数组（可被执行，替代人工冒烟）。\n" +
  "步骤 op 仅允许：goto,clearStorage,reload,wait,fill,click,clickRole,selectOption,expectText,expectVisible,expectEnabled,expectDisabled,expectCountMin。\n" +
  "selector 必须用 app 源码真实 id（如 #projName #taskName #addProjBtn #addTaskBtn #tabSingle #demoBtn）。\n" +
  "示例：\n" +
  "### 主流程：新建项目并添加任务后甘特可见\n" +
  "```json\n" +
  "{\"steps\":[\n" +
  "{\"op\":\"goto\"},\n" +
  "{\"op\":\"clearStorage\"},\n" +
  "{\"op\":\"reload\"},\n" +
  "{\"op\":\"fill\",\"selector\":\"#projName\",\"value\":\"冒烟项目A\"},\n" +
  "{\"op\":\"clickRole\",\"role\":\"button\",\"name\":\"新建项目\"},\n" +
  "{\"op\":\"expectText\",\"text\":\"已创建项目\"},\n" +
  "{\"op\":\"fill\",\"selector\":\"#taskName\",\"value\":\"联调任务\"},\n" +
  "{\"op\":\"clickRole\",\"role\":\"button\",\"name\":\"添加任务\"},\n" +
  "{\"op\":\"expectCountMin\",\"selector\":\".bar\",\"min\":1}\n" +
  "]}\n" +
  "```\n\n" +
  "## 业务测试点\n" +
  "- （用户价值/主流程/空状态，一句完整场景，给人看）\n" +
  "- …\n\n" +
  "## 功能测试点\n" +
  "- （具体按钮/输入/校验，一句：操作 + 可验证结果）\n" +
  "禁止：用例编号（M01-001）、模块号、优先级、表格、引用块（>）。\n" +
  "业务/功能段不要用代码围栏；冒烟段必须用 ```json。";

/** 模型只输出裸 Playwright JSON 时，整理为带章节的 Markdown，便于列表解析与人工编辑 */
export function repairTestPointMdIfNeeded(md) {
  const text = String(md || "").trim();
  if (!text) return text;
  const points = parseTestPointsFromMd(text);
  const hasListItems = points.some((p) => p.kind === "business" || p.kind === "functional");
  if (hasListItems) return text;

  const smoke = parseLooseJsonSmokeFromMd(text);
  if (!smoke.length) return text;

  const title = smoke[0].title || "冒烟自动化主流程";
  const jsonBody = JSON.stringify({ steps: smoke[0].steps }, null, 2);
  return (
    `# 测试点（已自动整理）\n\n` +
    `## 冒烟自动化（Playwright）\n` +
    `### ${title}\n` +
    "```json\n" +
    jsonBody +
    "\n```\n\n" +
    `## 业务测试点\n` +
    `- 请结合需求补充主流程与空状态场景（模型本轮未输出业务条目）\n\n` +
    `## 功能测试点\n` +
    `- 请结合 app 源码补充按钮、校验与异常场景（模型本轮未输出功能条目）\n`
  );
}

export async function readSessionTestMd(sessionDir) {
  try {
    return await readFile(path.join(sessionDir, "测试点.md"), "utf8");
  } catch {
    return "";
  }
}

export async function writeSessionTestMd(sessionDir, md) {
  await writeFile(path.join(sessionDir, "测试点.md"), md, "utf8");
}

export const QA_PIPELINE_GEN_SYS =
  "你是资深测试工程师。根据业务需求、原型与全栈 app 源码，输出「测试点列表」。\n" +
  QA_PIPELINE_STYLE_HINT;

export function buildPipelineTestGenMessages({ requirement, contextHtml, appExcerpt }) {
  const req = String(requirement || "").trim() || "（见会话需求）";
  const ctx = String(contextHtml || "").trim().slice(0, 10000);
  const app = String(appExcerpt || "").trim().slice(0, 12000);
  return [
    { role: "system", content: QA_PIPELINE_GEN_SYS },
    {
      role: "user",
      content:
        `【业务需求】\n${req}\n\n` +
        (ctx ? `【原型/UI 节选】\n${ctx}\n\n` : "") +
        (app ? `【全栈 app 节选】\n${app}\n\n` : "") +
        "请按「## 冒烟自动化（Playwright）」→「## 业务测试点」→「## 功能测试点」顺序输出；冒烟段写可执行 json 步骤，业务/功能段写 - 列表。",
    },
  ];
}

const PW_INSTALL_HINT =
  "Playwright 浏览器未安装，已跳过自动化点击。请在 agile-sim-demo 目录执行：npx playwright install chromium（约 150MB，仅需一次）";

function extractQuotedNames(text) {
  const names = [];
  for (const m of String(text).matchAll(/「([^」]+)」/g)) names.push(m[1]);
  return [...new Set(names)];
}

function extractExpectedSnippets(text) {
  const t = String(text || "");
  const out = [];
  if (/请输入项目名称/.test(t)) out.push("请输入项目名称");
  if (/暂无数据/.test(t)) out.push("暂无数据");
  if (/暂无项目/.test(t)) out.push("暂无项目");
  for (const m of t.matchAll(/提示[「"]([^」"]+)[」"]/g)) out.push(m[1]);
  for (const m of t.matchAll(/显示[「"]([^」"]+)[」"]/g)) out.push(m[1]);
  for (const m of t.matchAll(/状态栏[^，。]*[「"]([^」"]+)[」"]/g)) out.push(m[1]);
  return [...new Set(out)].filter((s) => s.length >= 2 && s.length <= 80);
}

export async function launchPlaywrightBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { error: "未安装 playwright 包" };
  }
  try {
    const browser = await chromium.launch({ headless: true });
    return { browser };
  } catch (e) {
    const msg = String(e?.message || e);
    const missingBrowser =
      /Executable doesn't exist|browserType\.launch|chrome-headless-shell|ms-playwright/i.test(
        msg
      );
    return {
      error: missingBrowser ? PW_INSTALL_HINT : `Playwright 启动失败：${msg.slice(0, 200)}`,
    };
  }
}

function attachPageListeners(page, consoleErrors) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));
}

/** 按单条测试点场景做 Playwright：有 steps 则执行步骤引擎，否则标题启发式 */
export async function runPlaywrightForTestPoint({ page, pageUrl, point, timeoutMs = 25000 }) {
  const issues = [];
  const consoleErrors = [];
  const title = String(point?.title || "");
  const steps = normalizeStepList(point?.steps);

  if (steps.length > 0) {
    attachPageListeners(page, consoleErrors);
    const r = await runPlaywrightSteps({ page, pageUrl, steps, timeoutMs });
    for (const msg of r.issues) issues.push(msg);
    if (consoleErrors.length) {
      issues.push(
        ...consoleErrors.slice(0, 4).map((t) => `控制台错误：${String(t).slice(0, 200)}`)
      );
    }
    return { issues, consoleErrors };
  }

  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  if (/首次进入|无数据|空状态/.test(title)) {
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  }

  if (/留空|为空/.test(title) && /项目名/.test(title)) {
    await page.locator("#projName").fill("").catch(() => {});
  } else {
    const nameM = title.match(/项目名称[「"]([^」"]+)[」"]|输入项目名称[「"]([^」"]+)[」"]/);
    const name = nameM?.[1] || nameM?.[2];
    if (name) await page.locator("#projName").fill(name).catch(() => {});
  }

  const btnNames = extractQuotedNames(title);
  for (const name of btnNames) {
    try {
      const loc = page.getByRole("button", { name });
      const n = await loc.count();
      if (n === 0) {
        issues.push(`未找到按钮「${name}」`);
        continue;
      }
      const el = loc.first();
      await el.scrollIntoViewIfNeeded({ timeout: 4000 });
      const disabled = await el.isDisabled();
      if (disabled) {
        if (/不可|禁用|未创建|不能|留空/.test(title)) continue;
        issues.push(`按钮「${name}」不可点击（disabled）`);
        continue;
      }
      await el.click({ timeout: 6000 });
      await page.waitForTimeout(350);
    } catch (e) {
      issues.push(`按钮「${name}」：${String(e.message || e).slice(0, 100)}`);
    }
  }

  for (const exp of extractExpectedSnippets(title)) {
    try {
      const body = await page.locator("body").innerText({ timeout: 5000 });
      if (!body.includes(exp)) {
        issues.push(`未在页面找到预期文案「${exp}」`);
      }
    } catch (e) {
      issues.push(`校验文案「${exp}」失败：${String(e.message || e).slice(0, 80)}`);
    }
  }

  if (consoleErrors.length) {
    issues.push(
      ...consoleErrors.slice(0, 4).map((t) => `控制台错误：${String(t).slice(0, 200)}`)
    );
  }

  return { issues, consoleErrors };
}

/** 兼容旧调用：仅打开页面检查控制台，不再盲目点击全部按钮 */
export async function runPlaywrightAppSmoke({ pageUrl, timeoutMs = 20000 }) {
  const launched = await launchPlaywrightBrowser();
  if (launched.error) {
    return { usedPlaywright: false, issues: [], warning: launched.error, consoleErrors: [] };
  }
  const consoleErrors = [];
  try {
    const page = await launched.browser.newPage();
    attachPageListeners(page, consoleErrors);
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const issues = consoleErrors.length
      ? consoleErrors.slice(0, 8).map((t) => `控制台错误：${String(t).slice(0, 200)}`)
      : [];
    return { usedPlaywright: true, issues, consoleErrors };
  } catch (e) {
    return {
      usedPlaywright: false,
      issues: [],
      warning: `Playwright 执行异常：${String(e?.message || e).slice(0, 200)}`,
      consoleErrors: [],
    };
  } finally {
    await launched.browser?.close?.().catch(() => {});
  }
}

export function buildPointCheckMessages({ requirement, point, appExcerpt }) {
  return [
    {
      role: "system",
      content:
        "你是测试工程师。根据测试点与 app 源码，判断该测试点最可能的结果：pass 或 fail。\n" +
        '只输出一行 JSON：{"status":"pass"|"fail","reason":"简短说明"}',
    },
    {
      role: "user",
      content:
        `【需求摘要】\n${String(requirement || "").slice(0, 2000)}\n\n` +
        `【当前测试点】\n${point.title}\n${point.detail || ""}\n\n` +
        `【app 源码节选】\n${String(appExcerpt || "").slice(0, 14000)}`,
    },
  ];
}

export function parsePointCheckJson(raw) {
  const t = String(raw || "").trim();
  const m = /\{[\s\S]*\}/.exec(t);
  if (!m) return { status: "fail", reason: "模型未返回可解析结果" };
  try {
    const j = JSON.parse(m[0]);
    const status = j.status === "pass" ? "pass" : "fail";
    return { status, reason: String(j.reason || "").slice(0, 500) };
  } catch {
    return { status: "fail", reason: t.slice(0, 300) };
  }
}
