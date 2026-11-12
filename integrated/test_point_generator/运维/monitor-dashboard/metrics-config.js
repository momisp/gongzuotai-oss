/**
 * 视图模式（内嵌多数云平台不可用，默认用命名窗口）：
 * - "namedWindow" 同一浏览器窗口名复用，切换指标只改该窗口地址（推荐）
 * - "iframe"      右侧尝试 iframe（仅部分允许嵌入的页面可用）
 * - "newTabEach"  每次点击新开标签（与命名窗口互斥）
 */
window.OPS_VIEW_MODE = "namedWindow";

/** 命名窗口的 window.name，勿与日常网页重名即可 */
window.OPS_NAMED_WINDOW = "OpsMetricsPane";

/**
 * 指标：name、url、account（侧栏显示为「名称 (主体账号)」，与《大派对资源费用相关》表一致）、openExternal
 */
window.OPS_METRICS = [
  {
    id: "m1",
    name: "大派对2 · 云监控应用分组",
    account: "aa1007777119",
    url: "https://cloudmonitornext.console.aliyun.com/app-group/244715179/resource",
    openExternal: false,
  },
  {
    id: "m2",
    name: "短信服务 · 控制台",
    account: "hsxc95",
    url: "https://dysms.console.aliyun.com/overview",
    openExternal: false,
  },
  {
    id: "m6",
    name: "宙包 · 短信服务 · 控制台",
    account: "zyyz95",
    url: "https://dysms.console.aliyun.com/overview",
    openExternal: false,
  },
  {
    id: "m3",
    name: "OSS · 资源包",
    account: "aa1007777120",
    url: "https://oss.console.aliyun.com/package",
    openExternal: false,
  },
  {
    id: "m4",
    name: "CDN · 资源",
    account: "aa1007777120",
    url: "https://cdn.console.aliyun.com/resource",
    openExternal: false,
  },
  {
    id: "m5",
    name: "SSL 证书 · CAS",
    account: "aa1007777119",
    url: "https://yundun.console.aliyun.com/?p=cas",
    openExternal: false,
  },
];
