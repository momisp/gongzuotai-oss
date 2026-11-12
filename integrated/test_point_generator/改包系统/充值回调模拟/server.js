/**
 * 内网专用：查库最新一笔订单后 POST 到 supper_pay_callback（或渠道 notify）
 * 支持：游戏内货币(tab_spend) / 平台币(tab_spend_balance) / 绑币(tab_spend_bind)
 * 支持多种通知状态：支付成功、支付宝关单/退款、微信关闭等
 * 运行：复制 .env.example -> .env 填库连接；npm install；npm start
 * 浏览器：默认仅本机；.env 设置 HOST=0.0.0.0 后同一局域网内可用 http://本机IP:端口/ 访问
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const os = require("os");
const net = require("net");
const mysql = require("mysql2/promise");

const PORT = Number(process.env.PORT) || 3780;
const HOST = (process.env.HOST || "127.0.0.1").trim();
const DEFAULT_CALLBACK_ORIGIN = (
  process.env.CALLBACK_ORIGIN || "http://dev.example.com"
).replace(/\/$/, "");

/** 可选：支付宝原始异步通知路径（相对 callbackOrigin）。空则关单等状态仍走 supper_pay_callback 并附带 trade_status */
const ALIPAY_NOTIFY_PATH = (process.env.ALIPAY_NOTIFY_PATH || "").trim();
const WECHAT_NOTIFY_PATH = (process.env.WECHAT_NOTIFY_PATH || "").trim();

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

app.get("/simulate", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "simulate.html"));
});

app.use(express.static(path.join(__dirname, "public")));

function logLanUrls(port) {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (!n || n.internal) continue;
      const fam = n.family;
      if (
        fam === "IPv4" ||
        fam === 4 ||
        (typeof fam === "string" && fam.toLowerCase() === "ipv4")
      ) {
        if (net.isIPv4(n.address)) ips.push(n.address);
      }
    }
  }
  if (ips.length === 0) {
    console.log(
      `已监听 0.0.0.0：请在防火墙放行 TCP ${port} 后，让同事用 http://<你的局域网IP>:${port}/ 访问`
    );
    return;
  }
  console.log("同事在同一局域网内可在浏览器打开（示例）：");
  for (const ip of ips) {
    console.log(`  http://${ip}:${port}/`);
  }
}

let pool;

/** 可选业务库（仅白名单，防 SQL 注入）；回调域名与 Apifox 对齐 */
const DB_OPTIONS = {
  game_lx: {
    id: "game_lx",
    label: "龙翔",
    callbackOrigin: (
      process.env.CALLBACK_ORIGIN_LX2 || DEFAULT_CALLBACK_ORIGIN
    ).replace(/\/$/, ""),
  },
  game_yq: {
    id: "game_yq",
    label: "游趣",
    // Apifox「测试环境游戏sdk支付回调」用的是 yq.example.com，不是 dev
    callbackOrigin: (
      process.env.CALLBACK_ORIGIN_YQ || "http://yq.example.com"
    ).replace(/\/$/, ""),
  },
  game_hw: {
    id: "game_hw",
    label: "汇玩",
    callbackOrigin: (
      process.env.CALLBACK_ORIGIN_HW || "http://hw.example.com"
    ).replace(/\/$/, ""),
  },
  game_ly: {
    id: "game_ly",
    label: "龙耀",
    // 后台 ly.example.com 订单实际落在 dev_example_com（非 game_yq）
    schema: "dev_example_com",
    callbackOrigin: (
      process.env.CALLBACK_ORIGIN_LY || "http://ly.example.com"
    ).replace(/\/$/, ""),
  },
};
const DEFAULT_DB =
  DB_OPTIONS[process.env.DB_NAME]?.id || "game_lx";

/** 回调类型：游戏内货币 / 平台币 / 绑币 */
const CALLBACK_TYPES = {
  game: {
    id: "game",
    label: "充值回调（游戏内货币）",
    table: "tab_spend",
    accountField: "user_account",
    usePayConfigId: true,
  },
  balance: {
    id: "balance",
    label: "平台币充值回调",
    table: "tab_spend_balance",
    accountField: "pay_account",
    usePayConfigId: false,
  },
  bind: {
    id: "bind",
    label: "绑币充值回调",
    table: "tab_spend_bind",
    accountField: "user_account",
    usePayConfigId: false,
  },
};

/**
 * 通知状态（除「支付成功」外用于事故回归 / 状态机覆盖）
 * expectPaymentSuccess: 是否期望业务侧把订单置为支付成功
 */
const NOTIFY_STATUSES = {
  success: {
    id: "success",
    label: "支付成功（原逻辑）",
    group: "通用",
    expectPaymentSuccess: true,
    payType: "wxscan",
    transport: "supper",
  },
  alipay_success: {
    id: "alipay_success",
    label: "支付宝·TRADE_SUCCESS",
    group: "支付宝",
    expectPaymentSuccess: true,
    payType: "aliscan",
    trade_status: "TRADE_SUCCESS",
    transport: "alipay_or_supper",
  },
  alipay_finished: {
    id: "alipay_finished",
    label: "支付宝·TRADE_FINISHED（不可再当第二笔成功）",
    group: "支付宝",
    expectPaymentSuccess: true,
    payType: "aliscan",
    trade_status: "TRADE_FINISHED",
    transport: "alipay_or_supper",
  },
  alipay_closed: {
    id: "alipay_closed",
    label: "支付宝·TRADE_CLOSED 未付关单【事故回归】",
    group: "支付宝",
    expectPaymentSuccess: false,
    payType: "aliscan",
    trade_status: "TRADE_CLOSED",
    closeReason: "timeout",
    transport: "alipay_or_supper",
  },
  alipay_closed_refund: {
    id: "alipay_closed_refund",
    label: "支付宝·TRADE_CLOSED 全额退款关单",
    group: "支付宝",
    expectPaymentSuccess: false,
    payType: "aliscan",
    trade_status: "TRADE_CLOSED",
    closeReason: "full_refund",
    transport: "alipay_or_supper",
  },
  alipay_partial_refund: {
    id: "alipay_partial_refund",
    label: "支付宝·部分退款（仍 TRADE_SUCCESS + 退款字段）",
    group: "支付宝",
    expectPaymentSuccess: false,
    payType: "aliscan",
    trade_status: "TRADE_SUCCESS",
    closeReason: "partial_refund",
    transport: "alipay_or_supper",
  },
  alipay_wait: {
    id: "alipay_wait",
    label: "支付宝·WAIT_BUYER_PAY 待支付",
    group: "支付宝",
    expectPaymentSuccess: false,
    payType: "aliscan",
    trade_status: "WAIT_BUYER_PAY",
    transport: "alipay_or_supper",
  },
  wx_success: {
    id: "wx_success",
    label: "微信·支付成功 SUCCESS",
    group: "微信",
    expectPaymentSuccess: true,
    payType: "wxscan",
    trade_state: "SUCCESS",
    transport: "wechat_or_supper",
  },
  wx_closed: {
    id: "wx_closed",
    label: "微信·已关闭 CLOSED",
    group: "微信",
    expectPaymentSuccess: false,
    payType: "wxscan",
    trade_state: "CLOSED",
    transport: "wechat_or_supper",
  },
  wx_notpay: {
    id: "wx_notpay",
    label: "微信·未支付 NOTPAY",
    group: "微信",
    expectPaymentSuccess: false,
    payType: "wxscan",
    trade_state: "NOTPAY",
    transport: "wechat_or_supper",
  },
  wx_payerror: {
    id: "wx_payerror",
    label: "微信·支付失败 PAYERROR",
    group: "微信",
    expectPaymentSuccess: false,
    payType: "wxscan",
    trade_state: "PAYERROR",
    transport: "wechat_or_supper",
  },
  wx_refund: {
    id: "wx_refund",
    label: "微信·转入退款 REFUND",
    group: "微信",
    expectPaymentSuccess: false,
    payType: "wxscan",
    trade_state: "REFUND",
    transport: "wechat_or_supper",
  },
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatNow() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

function resolveDbName(raw) {
  const key = String(raw || "").trim();
  if (DB_OPTIONS[key]) return key;
  return DEFAULT_DB;
}

function resolveCallbackType(raw) {
  const key = String(raw || "").trim();
  if (CALLBACK_TYPES[key]) return key;
  return "game";
}

function resolveNotifyStatus(raw) {
  const key = String(raw || "").trim();
  if (NOTIFY_STATUSES[key]) return key;
  return "success";
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      // 连接默认库；查询时用 库名.tab_spend 显式指定
      database: process.env.DB_NAME || "game_lx",
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

function supperCallbackUrl(origin, pay_config_id) {
  return (
    `${origin}/callback/Notify/supper_pay_callback/pid/` +
    `${encodeURIComponent(String(pay_config_id))}?test=${encodeURIComponent("123fdafcxd")}`
  );
}

function buildSupperBody(statusMeta, { out_trade_no, real_amount }) {
  const amount = String(real_amount == null ? "" : real_amount);
  const body = {
    test: "123fdafcxd",
    out_trade_no: String(out_trade_no),
    pay_type: statusMeta.payType || "wxscan",
    real_amount: amount,
    sign: "7c6f851b83227c89ccb1bec0d2baf82f",
    super_order_number: "2025101114571113131",
    trade_no: "j9k37m21v01413m1bqx24n0A10006004",
  };

  // 原「支付成功」保持字段完全一致，避免影响现有联调
  if (statusMeta.id === "success") {
    return body;
  }

  if (statusMeta.trade_status) body.trade_status = statusMeta.trade_status;
  if (statusMeta.trade_state) body.trade_state = statusMeta.trade_state;
  body.expect_payment_success = statusMeta.expectPaymentSuccess ? 1 : 0;
  body.notify_status = statusMeta.id;

  if (statusMeta.closeReason === "timeout") {
    body.gmt_close = formatNow();
  }
  if (statusMeta.closeReason === "full_refund") {
    body.refund_fee = amount;
    body.gmt_refund = formatNow();
    body.gmt_close = formatNow();
  }
  if (statusMeta.closeReason === "partial_refund") {
    const half = amount && !Number.isNaN(Number(amount))
      ? String(Math.round(Number(amount) * 50) / 100)
      : amount;
    body.refund_fee = half;
    body.gmt_refund = formatNow();
  }

  return body;
}

/** 支付宝异步通知风格（form）；路径可用 .env ALIPAY_NOTIFY_PATH 配置 */
function buildAlipayFormBody(statusMeta, { out_trade_no, real_amount }) {
  const amount = String(real_amount == null ? "" : real_amount);
  const body = {
    notify_time: formatNow(),
    notify_type: "trade_status_sync",
    notify_id: `test_notify_${Date.now()}`,
    app_id: "test_app_id",
    charset: "utf-8",
    version: "1.0",
    sign_type: "RSA2",
    sign: "test_sign_bypass",
    trade_no: `2026TEST${Date.now()}`,
    out_trade_no: String(out_trade_no),
    trade_status: statusMeta.trade_status || "TRADE_SUCCESS",
    total_amount: amount,
    receipt_amount: statusMeta.expectPaymentSuccess ? amount : "0.00",
    test: "123fdafcxd",
  };
  if (statusMeta.closeReason === "timeout") {
    body.gmt_close = formatNow();
  }
  if (statusMeta.closeReason === "full_refund") {
    body.refund_fee = amount;
    body.gmt_refund = formatNow();
    body.gmt_close = formatNow();
  }
  if (statusMeta.closeReason === "partial_refund") {
    const half = amount && !Number.isNaN(Number(amount))
      ? String(Math.round(Number(amount) * 50) / 100)
      : amount;
    body.refund_fee = half;
    body.gmt_refund = formatNow();
  }
  return body;
}

function resolveRequest(statusMeta, dbMeta, pay_config_id, order) {
  const origin = dbMeta.callbackOrigin;
  const baseOrder = {
    out_trade_no: order.pay_order_number,
    real_amount: order.pay_amount,
  };

  // 配置了支付宝原始 notify 路径时，支付宝类状态优先打真实 notify 入口
  if (
    statusMeta.transport === "alipay_or_supper" &&
    ALIPAY_NOTIFY_PATH
  ) {
    const pathPart = ALIPAY_NOTIFY_PATH.startsWith("/")
      ? ALIPAY_NOTIFY_PATH
      : `/${ALIPAY_NOTIFY_PATH}`;
    const url = `${origin}${pathPart}${pathPart.includes("?") ? "&" : "?"}test=${encodeURIComponent("123fdafcxd")}`;
    return {
      url,
      contentType: "application/x-www-form-urlencoded",
      body: buildAlipayFormBody(statusMeta, baseOrder),
      via: "alipay_notify_path",
    };
  }

  if (
    statusMeta.transport === "wechat_or_supper" &&
    WECHAT_NOTIFY_PATH
  ) {
    const pathPart = WECHAT_NOTIFY_PATH.startsWith("/")
      ? WECHAT_NOTIFY_PATH
      : `/${WECHAT_NOTIFY_PATH}`;
    const url = `${origin}${pathPart}`;
    const body = buildSupperBody(statusMeta, baseOrder);
    return {
      url,
      contentType: "application/json",
      body,
      via: "wechat_notify_path",
    };
  }

  return {
    url: supperCallbackUrl(origin, pay_config_id),
    contentType: "application/json",
    body: buildSupperBody(statusMeta, baseOrder),
    via: "supper_pay_callback",
  };
}

async function sendCallback(url, contentType, body) {
  const headers = {
    Accept: "*/*",
  };
  let payload;
  if (contentType === "application/x-www-form-urlencoded") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(
      Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, v == null ? "" : String(v)])
      )
    ).toString();
  } else {
    // 与 Apifox 一致（不要带 charset，部分网关会挑剔）
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(url, { method: "POST", headers, body: payload });
  const text = await r.text();
  return { status: r.status, text };
}

app.get("/api/databases", (req, res) => {
  res.json({
    ok: true,
    defaultId: DEFAULT_DB,
    items: Object.values(DB_OPTIONS).map(({ id, label, callbackOrigin }) => ({
      id,
      label,
      callbackOrigin,
    })),
  });
});

app.get("/api/callback-types", (req, res) => {
  res.json({
    ok: true,
    defaultId: "game",
    items: Object.values(CALLBACK_TYPES).map(({ id, label }) => ({ id, label })),
  });
});

app.get("/api/notify-statuses", (req, res) => {
  res.json({
    ok: true,
    defaultId: "success",
    alipayNotifyPath: ALIPAY_NOTIFY_PATH || null,
    wechatNotifyPath: WECHAT_NOTIFY_PATH || null,
    items: Object.values(NOTIFY_STATUSES).map((s) => ({
      id: s.id,
      label: s.label,
      group: s.group,
      expectPaymentSuccess: !!s.expectPaymentSuccess,
      trade_status: s.trade_status || null,
      trade_state: s.trade_state || null,
    })),
  });
});

app.post("/api/simulate-recharge", async (req, res) => {
  const account = (req.body && String(req.body.account || "").trim()) || "";
  const dbName = resolveDbName(req.body && req.body.database);
  const typeId = resolveCallbackType(req.body && req.body.callbackType);
  const statusId = resolveNotifyStatus(req.body && req.body.notifyStatus);
  const dbMeta = DB_OPTIONS[dbName];
  const schema = dbMeta.schema || dbName;
  const typeMeta = CALLBACK_TYPES[typeId];
  const statusMeta = NOTIFY_STATUSES[statusId];
  if (!account) {
    return res.status(400).json({
      ok: false,
      message: "请输入玩家账号",
    });
  }

  let row;
  try {
    // 游戏内货币：与 Apifox 一致取 pay_config_id；平台币/绑币只取订单号与金额，pid 固定 0
    const selectCols = typeMeta.usePayConfigId
      ? `id             AS id,
              pay_order_number AS pay_order_number,
              pay_config_id  AS pay_config_id,
              pay_amount     AS pay_amount,
              pay_status     AS pay_status`
      : `id             AS id,
              pay_order_number AS pay_order_number,
              pay_amount     AS pay_amount`;
    const [rows] = await getPool().query(
      `SELECT ${selectCols}
         FROM \`${schema}\`.\`${typeMeta.table}\`
        WHERE \`${typeMeta.accountField}\` = ?
        ORDER BY id DESC
        LIMIT 1`,
      [account]
    );
    row = rows && rows[0];
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      message: "数据库查询失败，见服务端控制台",
      database: dbName,
      databaseLabel: dbMeta.label,
      schema,
      callbackType: typeId,
      callbackTypeLabel: typeMeta.label,
      notifyStatus: statusId,
      notifyStatusLabel: statusMeta.label,
      detail: String(e.message || e),
    });
  }

  if (!row) {
    return res.status(404).json({
      ok: false,
      message: `未找到该玩家在「${dbMeta.label}」(${schema}) 的${typeMeta.label}记录`,
      database: dbName,
      databaseLabel: dbMeta.label,
      schema,
      callbackType: typeId,
      callbackTypeLabel: typeMeta.label,
      notifyStatus: statusId,
      notifyStatusLabel: statusMeta.label,
      table: typeMeta.table,
    });
  }

  // 平台币/绑币：按约定固定 pid=0；游戏内货币沿用订单 pay_config_id
  const pay_config_id = typeMeta.usePayConfigId
    ? row.pay_config_id == null
      ? 0
      : row.pay_config_id
    : 0;

  // 与 Apifox 一致：即使 pay_config_id=0 也继续走 pid/0，不拦截换单
  const reqPlan = resolveRequest(statusMeta, dbMeta, pay_config_id, row);
  const { url, contentType, body, via } = reqPlan;

  let callbackStatus;
  let callbackText;
  try {
    const r = await sendCallback(url, contentType, body);
    callbackStatus = r.status;
    callbackText = r.text;
  } catch (e) {
    console.error(e);
    return res.status(502).json({
      ok: false,
      message: "回调请求发送失败",
      database: dbName,
      databaseLabel: dbMeta.label,
      callbackType: typeId,
      callbackTypeLabel: typeMeta.label,
      notifyStatus: statusId,
      notifyStatusLabel: statusMeta.label,
      url,
      via,
      sent: body,
      detail: String(e.message || e),
    });
  }

  let callbackJson = null;
  try {
    callbackJson = JSON.parse(callbackText);
  } catch {
    /* 非 JSON 原文返回；支付宝原始 notify 常返回纯文本 success */
  }

  const alipayPlainOk =
    typeof callbackText === "string" &&
    callbackText.trim().toLowerCase() === "success";

  // Apifox 成功约定：code === 0 且 message 成功；HTTP 200 不等于业务成功
  const businessOk =
    alipayPlainOk ||
    (callbackJson &&
      Number(callbackJson.code) === 0 &&
      String(callbackJson.message || "").includes("成功"));

  const preview =
    callbackText && callbackText.length > 2000
      ? callbackText.slice(0, 2000) + "…"
      : callbackText;

  const common = {
    database: dbName,
    databaseLabel: dbMeta.label,
    callbackType: typeId,
    callbackTypeLabel: typeMeta.label,
    notifyStatus: statusId,
    notifyStatusLabel: statusMeta.label,
    expectPaymentSuccess: !!statusMeta.expectPaymentSuccess,
    trade_status: statusMeta.trade_status || null,
    trade_state: statusMeta.trade_state || null,
    table: typeMeta.table,
    url,
    via,
    orderId: row.id,
    pay_config_id,
    pay_status: row.pay_status,
    sent: body,
    callbackStatus,
    callbackBodyPreview: preview,
  };

  // 负向状态：接口「受理成功」≠ 订单应支付成功；交给测试核对库表/结算/发货
  if (!statusMeta.expectPaymentSuccess) {
    const delivered = callbackStatus >= 200 && callbackStatus < 500;
    return res.status(200).json({
      ...common,
      ok: delivered,
      message: delivered
        ? `已发出「${statusMeta.label}」回调（HTTP ${callbackStatus}）。请核对：订单不得变支付成功、无结算、无发货。` +
          (businessOk
            ? " 接口返回了成功字样，务必以订单/结算/发货为准。"
            : " 若接口报错，把日志同步研发确认是否已支持该状态字段/入口。")
        : `回调 HTTP ${callbackStatus}，可能未进入业务处理。`,
    });
  }

  if (!businessOk) {
    const hintPaid =
      Number(row.pay_status) === 1
        ? " 该订单 pay_status=1（可能已支付），重复回调常会返回「失败」——请重新下一笔未支付订单再试。"
        : " 请核对域名（游趣 yq.example.com / 龙耀 ly.example.com）与 pid。";
    return res.status(200).json({
      ...common,
      ok: false,
      message:
        `回调已发出，但业务未成功（期望 code=0 / message=成功；当前 HTTP ${callbackStatus}）。` +
        hintPaid,
    });
  }

  return res.json({
    ...common,
    ok: true,
    message: `已根据「${dbMeta.label}」最新${typeMeta.label}（id=${row.id}）发起「${statusMeta.label}」并成功`,
  });
});

app.listen(PORT, HOST, () => {
  console.log(
    `充值回调模拟（内网专用）已监听 ${HOST}:${PORT}  加载页 /launcher  充值页 /simulate`
  );
  console.log(`本机访问: http://127.0.0.1:${PORT}/`);
  console.log(
    `游趣回调: ${DB_OPTIONS.game_yq.callbackOrigin}  汇玩回调: ${DB_OPTIONS.game_hw.callbackOrigin}  龙翔回调: ${DB_OPTIONS.game_lx.callbackOrigin}  龙耀回调: ${DB_OPTIONS.game_ly.callbackOrigin}`
  );
  if (ALIPAY_NOTIFY_PATH) {
    console.log(`支付宝原始 notify 路径: ${ALIPAY_NOTIFY_PATH}`);
  } else {
    console.log(
      "未配置 ALIPAY_NOTIFY_PATH：关单等状态将走 supper_pay_callback 并附带 trade_status 字段"
    );
  }
  if (HOST === "0.0.0.0") {
    logLanUrls(PORT);
  } else {
    console.log("仅本机可连。若要让同事访问，请在 .env 设置 HOST=0.0.0.0 并放行防火墙端口");
  }
});
