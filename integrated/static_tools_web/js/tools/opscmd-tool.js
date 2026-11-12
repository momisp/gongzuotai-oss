/**
 * 运维常用命令速查：Linux 与 PowerShell 同条对比，点击复制
 */

var OPS_CMD_GROUPS = [
  {
    id: "basic",
    title: "基础与进程",
    items: [
      { cmd: "uname -a", ps: "Get-ComputerInfo | Select OsName, OsVersion, CsName", desc: "查看系统/内核/主机名等概要信息" },
      { cmd: "hostname", ps: "$env:COMPUTERNAME", desc: "显示当前计算机主机名" },
      { cmd: "uptime", ps: "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime", desc: "系统已运行时长（自上次启动）" },
      { cmd: "whoami", ps: "whoami", desc: "当前登录用户名" },
      { cmd: "id", ps: "whoami /groups", desc: "当前用户及所属组/权限信息" },
      { cmd: "ps aux", ps: "Get-Process | Sort-Object CPU -Descending", desc: "列出进程及 CPU/内存占用" },
      { cmd: "ps -ef", ps: "Get-CimInstance Win32_Process | Select ProcessId, Name, CommandLine", desc: "列出进程 PID、名称、命令行" },
      { cmd: "top", ps: "Get-Process | Sort-Object CPU -Desc | Select -First 15", desc: "查看资源占用最高的进程（可配合循环刷新）" },
      { cmd: "kill <PID>", ps: "Stop-Process -Id <PID>", desc: "结束指定进程（默认较温和）" },
      { cmd: "kill -9 <PID>", ps: "Stop-Process -Id <PID> -Force", desc: "强制结束进程" },
      { cmd: "pkill -f <名称>", ps: "Get-Process <名称> | Stop-Process", desc: "按进程名结束匹配进程" },
      { cmd: "nohup cmd &", ps: "Start-Process powershell -ArgumentList '-Command cmd' -WindowStyle Hidden", desc: "后台启动命令，关闭终端不中断" },
    ],
  },
  {
    id: "file",
    title: "文件与权限",
    items: [
      { cmd: "ls -lah", ps: "Get-ChildItem -Force", desc: "详细列出文件，含隐藏项（-Force）" },
      { cmd: "cd <目录>", ps: "Set-Location <目录>", desc: "切换当前工作目录" },
      { cmd: "pwd", ps: "Get-Location", desc: "显示当前目录路径" },
      { cmd: "cp -r src dst", ps: "Copy-Item -Recurse src dst", desc: "递归复制文件或目录" },
      { cmd: "mv old new", ps: "Move-Item old new", desc: "移动或重命名" },
      { cmd: "rm -rf <路径>", ps: "Remove-Item -Recurse -Force <路径>", desc: "递归强制删除（危险，慎用）" },
      { cmd: "find /path -name '*.log'", ps: "Get-ChildItem C:\\path -Recurse -Filter *.log", desc: "按文件名模式递归查找" },
      { cmd: "grep -rn '关键字' /path", ps: "Select-String -Path C:\\path\\* -Pattern '关键字' -Recurse", desc: "在目录下递归搜索文本" },
      { cmd: "tail -f app.log", ps: "Get-Content app.log -Wait -Tail 20", desc: "实时跟踪日志新增行" },
      { cmd: "head -n 20 file", ps: "Get-Content file -TotalCount 20", desc: "查看文件前 20 行" },
      { cmd: "chmod 755 file", ps: "icacls file /grant Users:(RX)", desc: "修改访问权限（Windows 用 ACL）" },
      { cmd: "chown user:group file", ps: "icacls file /setowner DOMAIN\\user", desc: "修改文件所有者" },
      { cmd: "tar -czvf a.tar.gz dir/", ps: "Compress-Archive -Path dir\\* -DestinationPath a.zip", desc: "打包压缩目录（Windows 常用 zip）" },
      { cmd: "tar -xzvf a.tar.gz", ps: "Expand-Archive -Path a.zip -DestinationPath .", desc: "解压压缩包" },
    ],
  },
  {
    id: "network",
    title: "网络",
    items: [
      { cmd: "ip addr", ps: "Get-NetIPAddress | Where AddressFamily -eq IPv4", desc: "查看本机 IPv4 地址" },
      { cmd: "ip route", ps: "Get-NetRoute | Where DestinationPrefix -eq '0.0.0.0/0'", desc: "查看默认路由/网关" },
      { cmd: "ss -tulnp", ps: "Get-NetTCPConnection -State Listen", desc: "查看 TCP 监听端口及本地地址" },
      { cmd: "netstat -tulnp", ps: "netstat -ano", desc: "查看端口与对应 PID（经典命令）" },
      { cmd: "ping -c 4 host", ps: "Test-Connection host -Count 4", desc: "发送 4 个包测试连通性" },
      { cmd: "curl -I https://example.com", ps: "Invoke-WebRequest -Uri https://example.com -Method Head", desc: "只请求 HTTP 响应头" },
      { cmd: "wget -O- url", ps: "(Invoke-WebRequest -Uri url).Content", desc: "下载 URL 正文到输出" },
      { cmd: "dig example.com", ps: "Resolve-DnsName example.com", desc: "DNS 解析查询" },
      { cmd: "nslookup example.com", ps: "nslookup example.com", desc: "DNS 查询（两者均有 nslookup）" },
      { cmd: "traceroute host", ps: "Test-NetConnection host -TraceRoute", desc: "追踪到目标的路由路径" },
      { cmd: "iptables -L -n", ps: "Get-NetFirewallRule | Select DisplayName, Enabled, Direction", desc: "查看防火墙规则概要" },
      { cmd: "tcpdump -i eth0 port 80", ps: "netsh trace start capture=yes", desc: "抓包/网络跟踪（Windows 用 netsh 等）" },
    ],
  },
  {
    id: "disk",
    title: "磁盘与内存",
    items: [
      { cmd: "df -h", ps: "Get-PSDrive -PSProvider FileSystem", desc: "磁盘/分区空间使用情况" },
      { cmd: "du -sh *", ps: "Get-ChildItem | ForEach { $s=(Get-ChildItem $_ -Recurse -EA SilentlyContinue | Measure Length -Sum).Sum; [pscustomobject]@{Name=$_.Name; Size=$s} }", desc: "统计当前目录各项占用（简化版）" },
      { cmd: "du -h --max-depth=1 /path", ps: "Get-ChildItem C:\\path | ForEach { ... }", desc: "指定路径下一级子项大小" },
      { cmd: "lsblk", ps: "Get-Disk | Format-Table Number, FriendlyName, Size", desc: "列出物理磁盘" },
      { cmd: "fdisk -l", ps: "Get-Partition", desc: "查看分区信息" },
      { cmd: "mount | column -t", ps: "Get-Volume", desc: "已挂载卷/盘符及文件系统" },
      { cmd: "free -h", ps: "Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory, TotalVisibleMemorySize", desc: "物理内存与可用量（单位 KB，需换算）" },
      { cmd: "vmstat 1 5", ps: "Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 5", desc: "周期性采样 CPU 等指标" },
      { cmd: "lsof -i :8080", ps: "Get-NetTCPConnection -LocalPort 8080 | Select OwningProcess", desc: "查看占用指定端口的进程 PID" },
    ],
  },
  {
    id: "service",
    title: "服务管理",
    items: [
      { cmd: "systemctl status nginx", ps: "Get-Service nginx", desc: "查看服务状态" },
      { cmd: "systemctl start nginx", ps: "Start-Service nginx", desc: "启动服务" },
      { cmd: "systemctl stop nginx", ps: "Stop-Service nginx", desc: "停止服务" },
      { cmd: "systemctl restart nginx", ps: "Restart-Service nginx", desc: "重启服务" },
      { cmd: "systemctl enable nginx", ps: "Set-Service nginx -StartupType Automatic", desc: "设置开机自动启动" },
      { cmd: "systemctl disable nginx", ps: "Set-Service nginx -StartupType Disabled", desc: "取消开机自启" },
      { cmd: "journalctl -u nginx -f", ps: "Get-EventLog -LogName Application -Newest 50", desc: "查看应用/服务相关日志（Windows 事件日志）" },
      { cmd: "journalctl --since today", ps: "Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=(Get-Date).Date}", desc: "查看今天的系统日志" },
      { cmd: "crontab -e", ps: "taskschd.msc", desc: "编辑计划任务（Linux crontab / Windows 任务计划）" },
      { cmd: "crontab -l", ps: "schtasks /query /fo LIST", desc: "列出已配置的计划任务" },
    ],
  },
  {
    id: "win",
    title: "Windows 专章",
    items: [
      { cmd: "—", ps: "Get-Service", desc: "列出所有 Windows 服务" },
      { cmd: "—", ps: "Get-EventLog -LogName System -Newest 20", desc: "最近 20 条系统事件日志" },
      { cmd: "—", ps: "Get-WinEvent -LogName Security -MaxEvents 10", desc: "最近 10 条安全日志" },
      { cmd: "—", ps: "sfc /scannow", desc: "扫描并修复系统文件完整性" },
      { cmd: "—", ps: "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*", desc: "已安装程序注册表项（查软件列表）" },
      { cmd: "—", ps: "winget search <包名>", desc: "在 winget 中搜索可安装包" },
      { cmd: "—", ps: "winget install <包名>", desc: "用 winget 安装软件" },
      { cmd: "—", ps: "Test-NetConnection host -Port 443", desc: "测试到目标主机某端口的 TCP 连通性" },
      {
        cmd: "—",
        ps: "Get-WinEvent -LogName 'Microsoft-Windows-Vpn-Client/Operational' -MaxEvents 50",
        desc: "【系统自带 VPN】查看 VPN 客户端操作日志（连接/失败首选）",
      },
      {
        cmd: "—",
        ps: "Get-WinEvent -LogName 'Microsoft-Windows-Vpn-Client/Operational' -MaxEvents 200 | Where-Object { $_.Level -le 3 } | Select TimeCreated, Id, Message -First 20",
        desc: "【系统自带 VPN】仅看错误/警告（Level≤3）",
      },
      {
        cmd: "—",
        ps: "Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='RasClient'; StartTime=(Get-Date).AddDays(-1)} -MaxEvents 30",
        desc: "【系统自带 VPN】RasClient 拨号失败记录（常见 ID 20225 等）",
      },
      { cmd: "—", ps: "Get-VpnConnection", desc: "【系统自带 VPN】列出已配置的 VPN 连接及当前状态" },
      { cmd: "—", ps: "rasdial \"VPN连接名\"", desc: "【系统自带 VPN】命令行发起连接（便于复现并立刻查日志）" },
      { cmd: "—", ps: "rasdial \"VPN连接名\" /disconnect", desc: "【系统自带 VPN】断开指定连接" },
      { cmd: "—", ps: "netsh ras set tracing * enabled", desc: "【系统自带 VPN】开启 RAS 跟踪（日志在 %windir%\\tracing，用完请 disabled）" },
      { cmd: "—", ps: "eventvwr.msc", desc: "【系统自带 VPN】图形界面：Vpn-Client → Operational" },
    ],
  },
  {
    id: "docker",
    title: "Docker",
    items: [
      { cmd: "docker ps", ps: "docker ps", desc: "运行中的容器（Win/Mac/Linux 命令相同）" },
      { cmd: "docker ps -a", ps: "docker ps -a", desc: "所有容器含已停止" },
      { cmd: "docker images", ps: "docker images", desc: "本地镜像列表" },
      { cmd: "docker logs -f <容器>", ps: "docker logs -f <容器>", desc: "实时跟踪容器日志" },
      { cmd: "docker exec -it <容器> bash", ps: "docker exec -it <容器> sh", desc: "进入容器 shell（Windows 镜像可能只有 sh）" },
      { cmd: "docker compose up -d", ps: "docker compose up -d", desc: "后台启动 compose 栈" },
      { cmd: "docker compose down", ps: "docker compose down", desc: "停止并删除 compose 资源" },
      { cmd: "docker compose logs -f", ps: "docker compose logs -f", desc: "跟踪 compose 日志" },
      { cmd: "docker system df", ps: "docker system df", desc: "Docker 占用磁盘空间" },
      { cmd: "docker prune -f", ps: "docker prune -f", desc: "清理未使用 Docker 对象" },
    ],
  },
  {
    id: "k8s",
    title: "Kubernetes",
    items: [
      { cmd: "kubectl get pods -A", ps: "kubectl get pods -A", desc: "所有命名空间 Pod（kubectl 跨平台相同）" },
      { cmd: "kubectl get nodes", ps: "kubectl get nodes", desc: "集群节点状态" },
      { cmd: "kubectl describe pod <名>", ps: "kubectl describe pod <名>", desc: "Pod 详情与事件" },
      { cmd: "kubectl logs -f <pod>", ps: "kubectl logs -f <pod>", desc: "跟踪 Pod 日志" },
      { cmd: "kubectl exec -it <pod> -- sh", ps: "kubectl exec -it <pod> -- sh", desc: "进入 Pod shell" },
      { cmd: "kubectl apply -f deploy.yaml", ps: "kubectl apply -f deploy.yaml", desc: "声明式部署/更新" },
      { cmd: "kubectl rollout restart deploy/<名>", ps: "kubectl rollout restart deploy/<名>", desc: "滚动重启 Deployment" },
      { cmd: "kubectl top pods", ps: "kubectl top pods", desc: "Pod 资源用量" },
    ],
  },
  {
    id: "log",
    title: "日志与排错",
    items: [
      { cmd: "dmesg | tail", ps: "Get-WinEvent -LogName System -MaxEvents 30", desc: "内核/系统级最近消息" },
      { cmd: "last", ps: "Get-EventLog -LogName Security -InstanceId 4624 -Newest 20", desc: "登录成功记录（安全日志 4624）" },
      { cmd: "w", ps: "query user", desc: "当前登录会话用户" },
      { cmd: "strace -p <PID>", ps: "—", desc: "跟踪系统调用（Linux 专用，Windows 可用 Procmon 等）" },
      { cmd: "lsof -p <PID>", ps: "Get-Process -Id <PID> | Select-Object -ExpandProperty Modules", desc: "查看进程加载模块/句柄（近似）" },
      { cmd: "watch -n 1 'df -h'", ps: "while($true){cls; Get-PSDrive; Start-Sleep 1}", desc: "每秒刷新磁盘信息" },
    ],
  },
];

var opscmdActiveGroup = "all";

function renderOpscmdTool(container) {
  container.innerHTML =
    "<h2>运维命令速查</h2>" +
    '<p class="bili-note">同一行对照 <strong>Linux/Bash</strong> 与 <strong>PowerShell</strong>，右侧为含义。<strong>点击命令</strong>即可复制，适合运维入门。</p>' +
    '<label class="tool-search-wrap opscmd-search-wrap">' +
    '<span class="visually-hidden">搜索命令</span>' +
    '<input type="search" id="opscmdSearch" class="tool-search" placeholder="搜索 Linux、PowerShell 或含义…" autocomplete="off" />' +
    "</label>" +
    '<div id="opscmdTabs" class="tool-category-tabs opscmd-tabs" role="tablist"></div>' +
    '<p id="opscmdCopyTip" class="opscmd-copy-tip" aria-live="polite"></p>' +
    '<div id="opscmdTableWrap" class="opscmd-table-wrap"></div>';

  opscmdRenderTabs();
  opscmdRenderTable();

  var search = document.getElementById("opscmdSearch");
  if (search) search.addEventListener("input", opscmdRenderTable);
}

function opscmdRenderTabs() {
  var tabs = document.getElementById("opscmdTabs");
  if (!tabs) return;
  tabs.innerHTML = "";

  function addTab(id, label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-category-tab" + (opscmdActiveGroup === id ? " is-active" : "");
    btn.dataset.group = id;
    btn.textContent = label;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", opscmdActiveGroup === id ? "true" : "false");
    btn.addEventListener("click", function () {
      opscmdActiveGroup = id;
      opscmdRenderTabs();
      opscmdRenderTable();
    });
    tabs.appendChild(btn);
  }

  addTab("all", "全部");
  OPS_CMD_GROUPS.forEach(function (g) {
    addTab(g.id, g.title);
  });
}

function opscmdCollectRows() {
  var q = (document.getElementById("opscmdSearch") && document.getElementById("opscmdSearch").value.trim().toLowerCase()) || "";
  var rows = [];
  OPS_CMD_GROUPS.forEach(function (g) {
    if (opscmdActiveGroup !== "all" && opscmdActiveGroup !== g.id) return;
    g.items.forEach(function (item) {
      var ps = item.ps != null ? item.ps : "—";
      var hay = (item.cmd + " " + ps + " " + item.desc + " " + g.title).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      rows.push({ group: g.title, cmd: item.cmd, ps: ps, desc: item.desc });
    });
  });
  return rows;
}

function opscmdCmdCell(text, kind, label) {
  if (!text || text === "—") {
    return '<td class="opscmd-cmd opscmd-na"><span class="opscmd-na-text">—</span></td>';
  }
  var cls = "opscmd-cmd" + (kind === "ps" ? " opscmd-ps" : " opscmd-linux");
  return (
    '<td class="' +
    cls +
    '"><button type="button" class="opscmd-copy-btn" title="点击复制 ' +
    opscmdEscapeAttr(label) +
    '" data-cmd="' +
    opscmdEscapeAttr(text) +
    '" data-label="' +
    opscmdEscapeAttr(label) +
    '"><code>' +
    opscmdEscapeHtml(text) +
    "</code></button></td>"
  );
}

function opscmdRenderTable() {
  var wrap = document.getElementById("opscmdTableWrap");
  if (!wrap) return;
  var rows = opscmdCollectRows();

  if (!rows.length) {
    wrap.innerHTML = '<p class="opscmd-empty">没有匹配的命令，换个关键词或选「全部」。</p>';
    return;
  }

  var html =
    '<table class="opscmd-table"><thead><tr>' +
    '<th scope="col">Linux / Bash</th>' +
    '<th scope="col">PowerShell</th>' +
    '<th scope="col">含义</th>' +
    "</tr></thead><tbody>";

  rows.forEach(function (r) {
    html +=
      "<tr class=\"opscmd-row\">" +
      opscmdCmdCell(r.cmd, "linux", "Linux") +
      opscmdCmdCell(r.ps, "ps", "PowerShell") +
      '<td class="opscmd-desc">' +
      opscmdEscapeHtml(r.desc) +
      (opscmdActiveGroup === "all" ? '<span class="opscmd-tag">' + opscmdEscapeHtml(r.group) + "</span>" : "") +
      "</td></tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;

  wrap.querySelectorAll(".opscmd-copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      opscmdCopy(btn.dataset.cmd || "", btn.dataset.label || "");
    });
  });
}

function opscmdEscapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function opscmdEscapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function opscmdCopy(text, label) {
  var tip = document.getElementById("opscmdCopyTip");
  var prefix = label ? "[" + label + "] " : "";
  var show = function (msg, ok) {
    if (!tip) return;
    tip.textContent = msg;
    tip.className = "opscmd-copy-tip " + (ok ? "is-ok" : "is-err");
  };
  if (!text) {
    show("无内容可复制", false);
    return;
  }
  var done = function () {
    show("已复制 " + prefix + text, true);
  };
  var fail = function () {
    show("复制失败，请手动选中命令", false);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fail);
    return;
  }
  try {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    done();
  } catch (e) {
    fail();
  }
}
