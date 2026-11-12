"""快速检测 /agile-sim/ 代理链路是否完整。"""
import re
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8765"


def fetch(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read()


def main():
    status, body = fetch(f"{BASE}/agile-sim/")
    html = body.decode("utf-8", errors="replace")
    print(f"/agile-sim/ -> {status}, {len(html)} bytes")
    print("workbench base:", "/agile-sim/@vite/client" in html)

    scripts = re.findall(r'src="([^"]+)"', html)
    failed = 0
    for src in scripts:
        url = src if src.startswith("http") else BASE + src
        try:
            s, data = fetch(url)
            print(f"  OK {src[:70]} -> {s} ({len(data)} bytes)")
        except urllib.error.HTTPError as e:
            failed += 1
            print(f"  FAIL {src[:70]} -> HTTP {e.code}")
        except OSError as e:
            failed += 1
            print(f"  FAIL {src[:70]} -> {e}")

    try:
        s, data = fetch(f"{BASE}/agile-sim/api/health")
        print(f"/agile-sim/api/health -> {s}")
    except Exception as e:
        failed += 1
        print(f"/agile-sim/api/health FAIL: {e}")

    print("FAILED" if failed else "ALL OK")


if __name__ == "__main__":
    main()
