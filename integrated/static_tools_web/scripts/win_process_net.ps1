# 采样 TCP 连接字节并按 PID 汇总（Vista+；仅统计 TCP，UDP 不计）
param([int]$SampleMs = 1000)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class ProcNetTraffic {
    const int AF_INET = 2;
    const int TCP_TABLE_OWNER_PID_ALL = 5;
    const int TcpConnectionEstatsData = 3;

    [StructLayout(LayoutKind.Sequential)]
    struct MIB_TCPROW {
        public uint dwState;
        public uint dwLocalAddr;
        public uint dwLocalPort;
        public uint dwRemoteAddr;
        public uint dwRemotePort;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MIB_TCPROW_OWNER_PID {
        public uint dwState;
        public uint dwLocalAddr;
        public uint dwLocalPort;
        public uint dwRemoteAddr;
        public uint dwRemotePort;
        public uint dwOwningPid;
    }

    [DllImport("iphlpapi.dll", SetLastError = true)]
    static extern uint GetExtendedTcpTable(IntPtr pTcpTable, ref int pdwSize, bool bOrder, int ulAf, int TableClass, uint Reserved);

    [DllImport("iphlpapi.dll", SetLastError = true)]
    static extern uint SetPerTcpConnectionEStats(ref MIB_TCPROW Row, int EstatsType, IntPtr Rw, uint RwVersion, uint RwSize, uint Offset);

    [DllImport("iphlpapi.dll", SetLastError = true)]
    static extern uint GetPerTcpConnectionEStats(ref MIB_TCPROW Row, int EstatsType, IntPtr Rw, uint RwVersion, uint RwSize, IntPtr Ros, uint RosVersion, uint RosSize, IntPtr Rod, uint RodVersion, uint RodSize);

    static Dictionary<uint, ulong[]> ReadPidBytes() {
        var map = new Dictionary<uint, ulong[]>();
        int size = 0;
        GetExtendedTcpTable(IntPtr.Zero, ref size, true, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
        if (size <= 0) return map;

        IntPtr buf = Marshal.AllocHGlobal(size);
        try {
            uint ret = GetExtendedTcpTable(buf, ref size, true, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
            if (ret != 0) return map;

            uint count = (uint)Marshal.ReadInt32(buf);
            int offset = 4;
            int rowSize = Marshal.SizeOf(typeof(MIB_TCPROW_OWNER_PID));

            for (uint i = 0; i < count; i++) {
                IntPtr rowPtr = IntPtr.Add(buf, offset);
                var row = (MIB_TCPROW_OWNER_PID)Marshal.PtrToStructure(rowPtr, typeof(MIB_TCPROW_OWNER_PID));
                offset += rowSize;

                uint pid = row.dwOwningPid;
                if (pid == 0) continue;

                var tcpRow = new MIB_TCPROW {
                    dwState = row.dwState,
                    dwLocalAddr = row.dwLocalAddr,
                    dwLocalPort = row.dwLocalPort,
                    dwRemoteAddr = row.dwRemoteAddr,
                    dwRemotePort = row.dwRemotePort
                };

                IntPtr rw = Marshal.AllocHGlobal(8);
                IntPtr ros = Marshal.AllocHGlobal(128);
                IntPtr rod = Marshal.AllocHGlobal(128);
                try {
                    Marshal.WriteByte(rw, 0, 1);
                    SetPerTcpConnectionEStats(ref tcpRow, TcpConnectionEstatsData, rw, 0, 8, 0);
                    uint es = GetPerTcpConnectionEStats(ref tcpRow, TcpConnectionEstatsData, rw, 0, 8, ros, 0, 128, rod, 0, 128);
                    if (es != 0) continue;

                    ulong bytesOut = (ulong)Marshal.ReadInt64(rod, 0);
                    ulong bytesIn = (ulong)Marshal.ReadInt64(rod, 8);

                    if (bytesIn == 0 && bytesOut == 0) continue;

                    if (!map.ContainsKey(pid)) map[pid] = new ulong[] { 0, 0 };
                    map[pid][0] += bytesIn;
                    map[pid][1] += bytesOut;
                } finally {
                    Marshal.FreeHGlobal(rw);
                    Marshal.FreeHGlobal(ros);
                    Marshal.FreeHGlobal(rod);
                }
            }
        } finally {
            Marshal.FreeHGlobal(buf);
        }
        return map;
    }

    public static string GetJson(int sampleMs) {
        var a = ReadPidBytes();
        System.Threading.Thread.Sleep(sampleMs > 0 ? sampleMs : 1000);
        var b = ReadPidBytes();

        var allPids = new HashSet<uint>(a.Keys);
        foreach (var k in b.Keys) allPids.Add(k);

        var items = new List<string>();
        foreach (var pid in allPids) {
            ulong aIn = 0, aOut = 0, bIn = 0, bOut = 0;
            if (a.ContainsKey(pid)) { aIn = a[pid][0]; aOut = a[pid][1]; }
            if (b.ContainsKey(pid)) { bIn = b[pid][0]; bOut = b[pid][1]; }

            long rxSec = (long)(bIn >= aIn ? bIn - aIn : bIn);
            long txSec = (long)(bOut >= aOut ? bOut - aOut : bOut);
            long totalSec = rxSec + txSec;
            ulong bytesRecv = bIn;
            ulong bytesSent = bOut;
            ulong bytesTotal = bytesRecv + bytesSent;

            if (totalSec <= 0 && bytesTotal <= 0) continue;

            items.Add(string.Format(
                "{{\"pid\":{0},\"bytesRecv\":{1},\"bytesSent\":{2},\"bytesTotal\":{3},\"rxSec\":{4},\"txSec\":{5},\"totalSec\":{6}}}",
                pid, bytesRecv, bytesSent, bytesTotal, rxSec, txSec, totalSec
            ));
        }

        return "{\"processes\":[" + string.Join(",", items) + "],\"sampleMs\":" + sampleMs + ",\"method\":\"tcp-estats\"}";
    }
}
"@

[ProcNetTraffic]::GetJson($SampleMs)
