using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Windows.Forms;
using Microsoft.Win32;

[ComImport]
[Guid("302D8188-0052-4807-806A-362B628F9AC5")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMsRdpExtendedSettings
{
    // 顺序必须与 BetterGI / IDL 一致：先 set 后 get；VARIANT 用 Struct 封送。
    void set_Property(
        [In, MarshalAs(UnmanagedType.BStr)] string propertyName,
        [In, MarshalAs(UnmanagedType.Struct)] ref object value);

    [return: MarshalAs(UnmanagedType.Struct)]
    object get_Property([In, MarshalAs(UnmanagedType.BStr)] string propertyName);
}

[ComImport]
[Guid("336D5562-EFA8-482E-8CB3-C5C0FC7A7DB6")]
[InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
interface IMsTscAxEvents
{
    [DispId(1)] void OnConnecting();
    [DispId(2)] void OnConnected();
    [DispId(4)] void OnDisconnected(int discReason);
    [DispId(10)] void OnFatalError(int errorCode);
    [DispId(22)] void OnLogonError(int lError);
}

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
public class RdpSink : IMsTscAxEvents
{
    readonly Action<string> _log;
    public RdpSink(Action<string> log) { _log = log; }
    public void OnConnecting() { _log("event OnConnecting"); }
    public void OnConnected() { _log("event OnConnected"); }
    public void OnDisconnected(int discReason) { _log("event OnDisconnected " + discReason); }
    public void OnFatalError(int errorCode) { _log("event OnFatalError " + errorCode); }
    public void OnLogonError(int lError) { _log("event OnLogonError " + lError); }
}

public class RdpHost : AxHost
{
    // 与 BetterGI 相同：MsRdpClient（本机注册为 version 11）
    public RdpHost() : base("A0C63C30-F08D-4AB4-907C-34905D770C7D") { }
    public object Ocx()
    {
        if (!IsHandleCreated)
        {
            IntPtr ignored = Handle;
        }
        return GetOcx();
    }
}

public class ChildSessionHost
{
    static string DirRoot
    {
        get
        {
            var t = Environment.GetEnvironmentVariable("TEMP") ?? ".";
            return Path.Combine(t, "oa-child-host");
        }
    }
    static string LogPath { get { return Path.Combine(DirRoot, "host.log"); } }
    static string PidPath { get { return Path.Combine(DirRoot, "host.pid"); } }
    static string StatusPath { get { return Path.Combine(DirRoot, "host.status.json"); } }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSEnableChildSessions(bool enable);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSIsChildSessionsEnabled(out bool enabled);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSGetChildSessionId(out uint sessionId);

    static void Log(string text)
    {
        try
        {
            Directory.CreateDirectory(DirRoot);
            File.AppendAllText(LogPath, DateTime.Now.ToString("HH:mm:ss") + " " + text + Environment.NewLine);
        }
        catch { }
    }

    static void WriteStatus(string state, uint sid, string detail)
    {
        try
        {
            Directory.CreateDirectory(DirRoot);
            var safe = (detail ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
            var json = "{\"state\":\"" + state + "\",\"sessionId\":" + (sid == uint.MaxValue ? "null" : sid.ToString())
                + ",\"detail\":\"" + safe
                + "\",\"pid\":" + System.Diagnostics.Process.GetCurrentProcess().Id
                + ",\"updatedAt\":\"" + DateTime.Now.ToString("o") + "\"}";
            File.WriteAllText(StatusPath, json);
        }
        catch { }
    }

    static object GetProp(object target, string name)
    {
        return target.GetType().InvokeMember(
            name, BindingFlags.GetProperty, null, target, null, CultureInfo.InvariantCulture);
    }

    static void SetProp(object target, string name, object value)
    {
        target.GetType().InvokeMember(
            name, BindingFlags.SetProperty, null, target, new[] { value }, CultureInfo.InvariantCulture);
    }

    static int GetRdpPort()
    {
        try
        {
            using (var key = Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp"))
            {
                object v = key == null ? null : key.GetValue("PortNumber");
                if (v is int)
                {
                    int port = (int)v;
                    if (port > 0 && port <= 65535) return port;
                }
            }
        }
        catch { }
        return 3389;
    }

    [STAThread]
    public static int Main(string[] args)
    {
        Directory.CreateDirectory(DirRoot);
        File.WriteAllText(LogPath, "");
        File.WriteAllText(PidPath, System.Diagnostics.Process.GetCurrentProcess().Id.ToString());
        WriteStatus("starting", uint.MaxValue, "正在打开分身");
        Log("start");

        uint sid = uint.MaxValue;
        object client = null;
        try
        {
            bool enabled = false;
            if (!WTSIsChildSessionsEnabled(out enabled))
                Log("is-enabled-query-failed " + Marshal.GetLastWin32Error());
            if (!enabled)
            {
                if (!WTSEnableChildSessions(true))
                {
                    Log("enable-failed " + Marshal.GetLastWin32Error());
                    WriteStatus("error", uint.MaxValue, "无法启用子会话");
                    MessageBox.Show("无法启用桌面分身（子会话）。", "工作台·桌面分身");
                    return 2;
                }
                Log("enabled");
            }
            else Log("already-enabled");

            Application.EnableVisualStyles();

            // 分身桌面跟「预览所在那块屏」走；预览窗最大化，避免小窗裁切/压扁
            Screen previewScreen = Screen.PrimaryScreen;
            foreach (Screen s in Screen.AllScreens)
            {
                if (!s.Primary)
                {
                    previewScreen = s; // 双屏时预览放到副屏，少挡主桌面
                    break;
                }
            }
            var desk = previewScreen.Bounds;
            int deskW = Math.Max(1024, desk.Width);
            int deskH = Math.Max(768, desk.Height);
            Log("preview-screen " + previewScreen.DeviceName + " desk=" + deskW + "x" + deskH);

            var form = new Form();
            form.Text = "工作台·桌面分身（关掉此窗口=断开分身）";
            form.MinimumSize = new Size(960, 540);
            form.StartPosition = FormStartPosition.Manual;
            form.Location = previewScreen.WorkingArea.Location;
            form.Size = previewScreen.WorkingArea.Size;
            form.WindowState = FormWindowState.Maximized;
            // 预览只作旁观，不要置顶抢主桌面焦点（自动化跑测时尤其）
            form.TopMost = false;
            form.ShowInTaskbar = true;

            var host = new RdpHost();
            host.Dock = DockStyle.Fill;
            form.Controls.Add(host);
            form.Show();
            Application.DoEvents();
            IntPtr forceHandle = host.Handle;
            Log("handle " + (host.IsHandleCreated ? forceHandle.ToString() : "none")
                + " client=" + host.ClientSize.Width + "x" + host.ClientSize.Height);

            client = host.Ocx();
            if (client == null)
            {
                Log("ocx-null");
                WriteStatus("error", uint.MaxValue, "远程桌面控件没有创建成功");
                MessageBox.Show("远程桌面控件没有创建成功。", "工作台·桌面分身");
                return 3;
            }

            var point = (IConnectionPointContainer)client;
            IConnectionPoint connectionPoint;
            var eventId = typeof(IMsTscAxEvents).GUID;
            point.FindConnectionPoint(ref eventId, out connectionPoint);
            int cookie;
            connectionPoint.Advise(new RdpSink(Log), out cookie);
            Log("events-advised " + cookie);

            // 桌面分辨率尽量贴近预览客户区，1:1 少裁边；太小则退回整屏
            int viewW = Math.Max(host.ClientSize.Width, 1024);
            int viewH = Math.Max(host.ClientSize.Height, 768);
            if (viewW < deskW * 9 / 10 || viewH < deskH * 9 / 10)
            {
                viewW = deskW;
                viewH = deskH;
            }
            SetProp(client, "Server", "localhost");
            SetProp(client, "DesktopWidth", viewW);
            SetProp(client, "DesktopHeight", viewH);
            SetProp(client, "ColorDepth", 32);
            SetProp(client, "ConnectingText", "正在创建工作台桌面分身…");
            SetProp(client, "DisconnectedText", "工作台桌面分身已断开");
            Log("rdp-desktop " + viewW + "x" + viewH);

            try
            {
                var secured = GetProp(client, "SecuredSettings2");
                if (secured != null)
                {
                    SetProp(secured, "KeyboardHookMode", 1);
                    SetProp(secured, "AudioRedirectionMode", 2);
                }
            }
            catch (Exception ex) { Log("secured " + ex.Message); }

            try
            {
                var advanced = GetProp(client, "AdvancedSettings7");
                if (advanced != null)
                {
                    SetProp(advanced, "RDPPort", GetRdpPort());
                    SetProp(advanced, "EnableCredSspSupport", true);
                    SetProp(advanced, "EnableWindowsKey", 1);
                    // false：1:1 显示，不把 1080p 硬压进小窗（看起来像上下裁切）
                    SetProp(advanced, "SmartSizing", false);
                    Log("rdp-port " + GetRdpPort() + " smartSizing=false desk=" + deskW + "x" + deskH);
                }
            }
            catch (Exception ex) { Log("advanced " + ex.Message); }

            var extended = (IMsRdpExtendedSettings)client;
            object connectToChildSession = true;
            extended.set_Property("ConnectToChildSession", ref connectToChildSession);
            try
            {
                object readback = extended.get_Property("ConnectToChildSession");
                Log("ConnectToChildSession readback=" + readback + " type=" + (readback == null ? "null" : readback.GetType().FullName));
            }
            catch (Exception ex) { Log("readback-failed " + ex.Message); }

            bool closing = false;
            form.FormClosing += (s, e) =>
            {
                if (closing) return;
                closing = true;
                WriteStatus("stopping", sid, "正在断开");
                try
                {
                    client.GetType().InvokeMember(
                        "Disconnect", BindingFlags.InvokeMethod, null, client, null, CultureInfo.InvariantCulture);
                }
                catch (Exception ex) { Log("disconnect " + ex.Message); }
            };

            var timer = new Timer { Interval = 500 };
            timer.Tick += (s, e) =>
            {
                uint current;
                if (WTSGetChildSessionId(out current) && current != uint.MaxValue && sid != current)
                {
                    sid = current;
                    Log("child-sid " + sid);
                    WriteStatus("connected", sid, "分身已连接");
                    form.Text = "工作台·桌面分身 · 会话 " + sid + "（关掉此窗口=断开）";
                }
            };

            WriteStatus("connecting", uint.MaxValue, "正在连接");
            client.GetType().InvokeMember(
                "Connect", BindingFlags.InvokeMethod, null, client, null, CultureInfo.InvariantCulture);
            Log("connect-called");
            timer.Start();

            var until = DateTime.UtcNow.AddSeconds(35);
            while (DateTime.UtcNow < until && sid == uint.MaxValue && form.Visible)
            {
                Application.DoEvents();
                uint current;
                if (WTSGetChildSessionId(out current) && current != uint.MaxValue)
                {
                    sid = current;
                    Log("child-sid " + sid);
                    WriteStatus("connected", sid, "分身已连接");
                    form.Text = "工作台·桌面分身 · 会话 " + sid + "（关掉此窗口=断开）";
                    break;
                }
                System.Threading.Thread.Sleep(200);
            }

            if (sid == uint.MaxValue)
            {
                string why = "连接超时，没有拿到分身会话";
                try { why += "；Connected=" + GetProp(client, "Connected"); } catch { }
                try { why += "；ext=" + GetProp(client, "ExtendedDisconnectReason"); } catch { }
                Log("no-sid " + why);
                WriteStatus("error", uint.MaxValue, why);
                MessageBox.Show(why + "\n请确认 3389 已开。不要用系统自带远程桌面连自己。", "工作台·桌面分身");
                try
                {
                    client.GetType().InvokeMember(
                        "Disconnect", BindingFlags.InvokeMethod, null, client, null, CultureInfo.InvariantCulture);
                }
                catch { }
                return 4;
            }

            Application.Run(form);
            timer.Stop();
            WriteStatus("stopped", uint.MaxValue, "已关闭");
            Log("exit-ok");
            return 0;
        }
        catch (Exception ex)
        {
            Log("fatal " + ex);
            WriteStatus("error", uint.MaxValue, ex.Message);
            try { MessageBox.Show("桌面分身异常：" + ex.Message, "工作台·桌面分身"); } catch { }
            return 1;
        }
        finally
        {
            try { if (File.Exists(PidPath)) File.Delete(PidPath); } catch { }
        }
    }
}
