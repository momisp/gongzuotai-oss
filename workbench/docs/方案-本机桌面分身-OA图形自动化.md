# 桌面分身怎么在这台电脑上做

日期：2026-10-29  
这台电脑：`DESKTOP-HUE1NIB`，当前登录的人是 `yzyz`  
给谁看：做测试、会复制命令、但不需要先懂远程桌面内部术语。

图形自动化要点 OA 的按钮。点的时候用的是你手里这只鼠标，所以你自己就没法动了。桌面分身是在这台电脑里再开一个独立小桌面，自动化去点那个小桌面，你眼前这个桌面和鼠标保持不动。

这个小桌面现在还没建成。下面先讲为什么，再讲可能出什么问题，最后才是步骤。文末的命令是操作时整段复制用的，看正文时可以跳过。

## 这几个词是什么意思

看正文时碰到这些词，回到这里对一下。

- **你眼前这个桌面**：Windows 叫它控制台。下面说「你的桌面」，都是指现在这一屏。
- **会话**：一个人在这台电脑上的一份登录。你现在这份就是会话 1。专业版同时只让这份登录占着「能看、能点」的位置。
- **远程桌面服务**：Windows 自己用来开第二份桌面的后台程序，服务名字叫 `TermService`。它没按新设置重新启动，改了也没用。
- **3389**：这个服务开门用的门牌号。门没开，分身就进不去。命令里看到 `:3389`，就是在查这扇门开了没有。
- **注册表**：Windows 的设置本。下面要改的两个开关都写在里面。必须等服务完全停掉再改，否则服务还按旧开关跑。
- **1800**：失败编号。意思是：你已经有一个桌面了，系统不肯再开一个普通的第二桌面。
- **桌面分身**：也叫子会话。它是微软留的一个例外，专门在你这份登录旁边再挂一个小桌面，不是再远程进来一个人。
- **UU 远程**：网易那个软件。它在线，只说明 UU 能连上设备，不占 Windows 这个名额。窗口里那台叫 `DESKTOP-2AORU70`，这台电脑的名字是 `DESKTOP-HUE1NIB`。

## 这台电脑现在卡在哪

你正坐在这台电脑前，这一份登录已经占着唯一的位置。系统里还有两个开关是关着的：

1. **不许连入。** 远程桌面这扇门没开，所以 3389 现在没人守着。
2. **一个人只能有一份桌面。** 所以再开普通的第二份，就会得到 1800。

上次已经把这两个开关改成允许，但服务重启时还没停稳，新设置没装进正在跑的程序里。门还是关的，连接还是 1800。改完已经改回去了，你的 OA 窗口也还在左边屏幕，没有被拉走。

2026-10-29 下午把「缺两个驱动文件」这条排除了。家里那台同样搜不到 `termdd.sys`、`tdtcp.sys`，分身却能登录。这台在启动时也没有去找这两个文件。官网安装盘里没有它们，是这版 Windows 的正常情况，不是这台独有的损坏。

这台实际卡在这里：远程桌面服务能显示「已经启动」，但启动过程里根本没有去守 3389。日志仍是「拒绝访问」。用过程记录看过，没有哪个文件或注册表项在这一步被拒绝；唯一一次拒绝是读网络组件时要了过高权限，随即改成普通读取就成功了。

证书钥匙目录原来不准这个服务写入。这个权限已经补上。服务仍然没有去创建证书，门也没有开。再把「允许分身」单独打开后启动，门还是没开。试完两个限制开关已改回 `1`。系统还原点「恢复远程桌面驱动前-20261029」（编号 36）还在，没有往系统里写入驱动。

这台装着 360 安全卫士和火绒，它们的内核驱动在运行。文字日志里没有对上这次拒绝。2026-10-29 下午试过退出它们再开门：窗口和服务自己拒绝退出，底层驱动也停不掉。停下来的两个驱动已经重新启动。只退出软件窗口解决不了。要让火绒的守护服务改成禁用，得进安全模式，这一步还没做。

360 的「主动防御」后来改成了手动，并且是停着的。18:16 在这个条件下又试了一次开门：远程桌面服务停不下来，两个限制开关根本没写成允许，随即按「改回去」核对过，仍是 `deny=1`、`single=1`。你的桌面仍是会话 1、正在使用，3389 没人守。BetterGI 里点过「功能已启用」之后，分身允许标志是 `0`（允许分身），这只表示软件把功能打开了，门还是关的。它弹出的 516，对上的就是「不许连入」还关着。GitHub 3409 那种切换补丁用不上：这台用的本来就是系统自带的 `termsrv.dll`，没有装 rdpwrap。

18:25 已安排重启进安全模式（最小）。进去之后会把火绒和 360 这些开机项改成禁用，清掉安全模式标记，再自动重启回正常桌面。原开机方式记在 `恢复火绒和360开机.ps1`。这次重启当时两个限制开关仍是 `1`，没有去开 3389。

2026-10-30 上午：安全模式脚本只完整关掉了火绒守护 `HipsDaemon`（已禁用、已停止）；360/火绒内核驱动仍在跑。一次性服务 `OASafeFix` 已删掉。09:50 趁远程桌面服务停着时把两个限制开关写成允许并启动：3389 已有人守，`rdp-tcp` 在侦听，你的桌面仍是会话 1、运行中。门暂时开着，方便你在 BetterGI 里点「启动并连接」。不用时做「改回去」。

和这次无关、不用再查的：

- Windows 没激活。没激活会出别的编号（2056、2312），不会出 1800。这次不要去点激活。
- UU 远程开着。它不占上面说的那一个名额。试分身时先别用 UU 去控这台电脑，免得它钻进小桌面。

## 可能出什么问题

做第 2 步之前，先把正在写的东西保存一下。上次停服务、再启动，OA 窗口还在原处，但一旦出问题，没保存的内容最容易丢。

### 你眼前这个桌面被挤掉

这是最大的风险。开关放开之后，如果连接时没有声明「我要的是分身」，Windows 会把它当成又一个人远程进来。专业版只留一个能看、能点的位置，你这块屏幕可能突然变成登录界面，或者鼠标、键盘暂时不听使唤。左边的 OA 会跟着这份桌面一起离开。

你会看见：屏幕一变，不再是刚才的窗口。会话列表里，你原来那一份从 Active（正在使用）变成 Disc（已断开）。

这时不要再试第二次。马上断开这次连接，然后做文末「改回去」。改回去之后，你的桌面应恢复成只有原来那一份。

### 门开着没关上

第 2 步会把「不许连入」改成允许，3389 这扇门会开着。这一步只改那两个开关，防火墙里的「远程桌面」保持不勾。防火墙仍挡着外面时，办公室里的其他电脑进不来。

风险在于：有人之后手滑勾上了防火墙那一项，或者这台电脑的防火墙本身是关的。那样的话，别人只要知道这台电脑的名字和你的 Windows 密码，就可以远程连进来。所以第 2 步或第 3 步没成功，必须做「改回去」，让两个开关回到 `1`，3389 再次没人守着。

分身真的建成、并且你决定留着用，这两个开关就要保持允许。这段时间里不要去勾防火墙的「远程桌面」。不用了，还是做「改回去」。

### 命令跑到一半停了

「放开开关」如果红字停在「服务没停稳」，设置本还没改，你的电脑还是原样。如果已经打印了 `wrote deny=0 single=0`，然后停在「门没开」，开关已经改过，门却没开好。这种中间状态不要放着过夜，马上做「改回去」。

改回去如果报「服务无法停止」或「服务没停稳」，再贴一次同一行就行。第二次会先把开关写回原来的限制，再停服务。不要连着贴很多次。

### 分身里的程序会被一起关掉

分身不是第二个可以随时断线再连回去的远程。关掉分身、注销，或者你这份登录退出，里面正在跑的程序都会没掉，没保存的也一起没。不要把只有一份的文档、没提交的修改放在分身里做。

同一时间只能有一个分身。再开一个，前一个会被换掉。

### 自动化仍可能抢走你的鼠标

分身建成之后，如果点击程序还是在你眼前这个桌面里启动，鼠标照样会被抢走。而且你会以为它在点小桌面。点击程序必须跑在分身里面，工作台页面留在你这边。

### 不要再开一个 OA

现在这个「源之蜂巢」还开着时，不要为了试分身再启动一个。两个如果共用同一份数据，后开的可能失败，也可能把窗口拉回你这个桌面，把你正在看的 OA 顶乱。这一步等分身确实出现之后再单独做。

### UU 可能连错桌面

分身一旦存在，UU 远程有可能连进小桌面，而不是你正在看的这一屏。试的这段时间不要用 UU 协助。否则你在 UU 里点的，和你眼前看到的，不是同一块屏幕。

### 这次不要重启

重启会关掉 OA 和没保存的窗口。门没开、或者还是 1800 时，不要用重启来「再试一次」。重启也解决不了「忘了改回去」：如果开关还是允许，重启后这扇门可能照样开着。

## 做成要哪几步

用管理员身份打开 PowerShell：开始菜单搜 `PowerShell`，右键「以管理员身份运行」。弹出「是否允许」时点「是」。普通窗口改不了这些设置。

### 1. 先看现状，先别改

复制文末「查看现状」。你应看到：只有你这一份桌面，两个开关都是 `0x1`（`0x1` 就是开着限制），3389 没有输出。OA「源之蜂巢」还在左边屏幕。对不上就先停，不要往下做。

这一步不新开 OA，也不去点 OA。

### 2. 停掉服务，改两个开关，再启动

在管理员 PowerShell 里只贴文末那一行（运行 `放开开关.ps1`）。它会自己做这几件事：把远程桌面服务停稳，确认停住了，再把那两个开关改成允许，然后重新启动，并检查门开了没有。

怎样算这一步通过：

- 窗口最后出现 `listener-ok`。
- 能看到 `:3389`，或者会话列表里多了一行 `rdp-tcp`，状态是 Listen（正在等连接）。
- 你的桌面还在，鼠标还能动，OA 窗口还在原位。

少一条，就做文末「改回去」，不要进入第 3 步。

### 3. 门开了，再建立分身

这一步是去连那个小桌面，不是再开一个 UU，也不是用系统自带的「远程桌面连接」去连自己。用自带的远程桌面连接自己，会和你眼前这个桌面抢位置。

连接时要指定「这是分身，不是第二个普通桌面」，小桌面大小用 1920×1080。成功时会话列表里会多出一个新会话，你眼前这个桌面仍是 Active（正在使用）。

失败时长这样：

- 还是 1800：小桌面没建成，你的桌面还在。做「改回去」。
- 你的屏幕突然变成登录或被挤掉：这次被当成了普通远程桌面。马上断开，然后做「改回去」。

分身同一时间只能有一个。关掉它，里面正在跑的程序会一起关掉。

分身桌面分辨率跟预览所在屏走；预览窗默认最大化（双屏时优先副屏），并关闭 SmartSizing，避免「小窗看 1080p」裁边或压扁。你在预览里看到的裁切，多半是预览窗本身不够大，不是 OA 真少了一截——分身内 PrintWindow 核过，最大化后 tab 是完整的。OA 仍须最大化（`--start-maximized` + 脚本强制）。键鼠不稳时走 Electron CDP（9333）。

### 4. 分身真的有了，再让自动化进去点

2026-10-30：分身已经能连上。自动化控制面板可自己开分身窗口（`ChildSessionHost.exe`），不必再开 BetterGI。默认勾选「图形自动化走桌面分身」。点流水线「执行」时，工作台留在你这边，Airtest 进分身会话里跑。

你要先做好这几件：

1. 远程桌面门开着（3389 有人守）。没有就先跑 `放开开关.ps1`。
2. 面板设置 → **启动分身**，等到「已连接 · 会话 x」。也可继续用 BetterGI，二选一即可（同一时间只能一个分身）。
3. **在分身窗口里**打开「源之蜂巢」、进到工作台并最大化。不要在主桌面再开一个同配置的 OA。
4. 再点 OA 流水线的执行。

关掉分身窗口或点「关闭分身」，里面的程序会一起没。右边倒计时仍在主桌面。关掉「图形自动化走桌面分身」会回到主桌面点（会抢鼠标）。

### 分身和主桌面怎么区分

Windows 分身和主桌面是**同一个 Windows 用户**，开机启动项会进分身。做不到「注册表两套启动项」。工作台的办法是：

1. 分身连上后，只杀掉**分身会话里**名单中的启动软件（微信、Snipaste、搜狗等），不动主桌面进程。
2. OA 用独立目录 `%LOCALAPPDATA%\oa-child-profile` 启动，不跟主桌面的 `Roaming\源之蜂巢` 抢锁。
3. 账号写在本机 `workbench/.oa_child_login.json`（已忽略进仓库），跑图形自动化前自动登录。

## 改回去

第 2 步或第 3 步没有成功，就复制文末「改回去」。做完应看到两个开关又是 `1`，会话里只剩你原来那一份，3389 再次没有输出。防火墙里的「远程桌面」不要去勾。也不要为了这一步重启电脑。重启会关掉正在开的 OA。

## 查看现状

普通或管理员 PowerShell 都可以。

```powershell
query session
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server" /v fDenyTSConnections
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server" /v fSingleSessionPerUser
sc.exe query TermService
netstat -ano | findstr ":3389"
```

`query session` 是列出现在有哪几份登录。`reg query` 是读那两个开关。`sc.exe query TermService` 是看远程桌面服务在不在跑。最后一行没有输出，就是 3389 这扇门没开。

## 放开开关

不要把下面一大段拖进窗口。从下往上选时，行会倒着贴进去，窗口左边出现 `>>`，表示它还在等你说完，设置其实没改。

先按一次 `Ctrl+C`，左边变回 `PS C:\...>` 再继续。然后只贴这一行（窗口标题要带「管理员」）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "workbench/docs/放开开关.ps1"
```

跑完看有没有 `listener-ok`。完整步骤在 `放开开关.ps1` 里，和原来那段相同。

```powershell
$ErrorActionPreference = "Stop"
$base = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server"
$log = "$env:TEMP\oa-child-enable.txt"
function Log($t) { Add-Content -Path $log -Value ((Get-Date -Format "HH:mm:ss") + " " + $t); Write-Output $t }
Set-Content -Path $log -Value "" -Encoding utf8
Log "before deny=$((Get-ItemProperty $base).fDenyTSConnections) single=$((Get-ItemProperty $base).fSingleSessionPerUser)"
function Wait-State($want) {
    $deadline = (Get-Date).AddSeconds(40)
    do {
        $state = (sc.exe query TermService | Select-String "STATE").ToString()
        if ($state -match $want) { return $state }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return (sc.exe query TermService | Select-String "STATE").ToString()
}
Log "stop"
cmd /c "net stop TermService /y"
$stopped = Wait-State "STOPPED"
Log "after-stop $stopped"
if ($stopped -notmatch "STOPPED") { throw "服务没停稳，设置没改" }
Start-Sleep -Seconds 2
$stopped2 = (sc.exe query TermService | Select-String "STATE").ToString()
Log "stop-stable $stopped2"
if ($stopped2 -notmatch "STOPPED") { throw "刚停稳又自己起来了，设置没改" }
Set-ItemProperty $base -Name fDenyTSConnections -Type DWord -Value 0
Set-ItemProperty $base -Name fSingleSessionPerUser -Type DWord -Value 0
Log "wrote deny=0 single=0"
$started = $false
foreach ($i in 1..8) {
    $out = cmd /c "net start TermService" 2>&1 | Out-String
    $state = Wait-State "RUNNING|STOPPED"
    Log "start-$i $($out.Trim()) | $state"
    if ($state -match "RUNNING") {
        Start-Sleep -Seconds 2
        $listen = netstat -ano | findstr ":3389"
        $q = query session 2>&1 | Out-String
        if ($listen -or $q -match "rdp-tcp") { $started = $true; break }
        Log "running-but-no-listener"
    }
    Start-Sleep -Seconds 2
}
if (-not $started) { throw "服务在跑，但门没开。请做文末的改回去" }
cmd /c "net start UmRdpService"
cmd /c "net start SessionEnv"
Log "listener-ok"
Log (netstat -ano | findstr ":3389")
Log (query session 2>&1 | Out-String)
```

窗口里如果抛出红字「门没开」或「没停稳」，设置要么没改，要么需要按下一节改回去。日志在 `C:\Users\yzyz\AppData\Local\Temp\oa-child-enable.txt`。

## 改回去

管理员 PowerShell 里只贴这一行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "workbench/docs/改回去.ps1"
```

下面这段和这个文件是同一件事，不用再贴。

```powershell
$base = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server"
function Wait-State($want) {
    $deadline = (Get-Date).AddSeconds(40)
    do {
        $state = (sc.exe query TermService | Select-String "STATE").ToString()
        if ($state -match $want) { return $state }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return (sc.exe query TermService | Select-String "STATE").ToString()
}
cmd /c "net stop TermService /y"
$stopped = Wait-State "STOPPED"
if ($stopped -notmatch "STOPPED") { throw "服务没停稳，先不要改设置" }
Set-ItemProperty $base -Name fDenyTSConnections -Type DWord -Value 1
Set-ItemProperty $base -Name fSingleSessionPerUser -Type DWord -Value 1
cmd /c "net start TermService"
Wait-State "RUNNING"
Write-Output "deny=$((Get-ItemProperty $base).fDenyTSConnections) single=$((Get-ItemProperty $base).fSingleSessionPerUser)"
query session
netstat -ano | findstr ":3389"
```

最后一行应是 `deny=1 single=1`。3389 再次查不到，就说明门已经关上，回到现在的状态。
