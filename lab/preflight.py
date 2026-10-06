"""
lab/preflight.py

Purpose: One-command demo-day readiness check for `sentinel.py live`.
         Verifies the things that have actually broken live demos in this
         project: not running elevated, a missing dashboard build, a port
         the honeypot/target needs already taken, no usable capture
         interface, and Windows Firewall profiles that make --enforce-blocks
         a silent no-op.

Usage:
    python lab/preflight.py [--interface Wi-Fi] [--enforce-blocks]
Exit code is 1 if any hard requirement fails (warnings don't fail it).
"""
import argparse
import ctypes
import socket
import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_PORTS = {80: "target_service", 2222: "fake_ssh", 2121: "fake_ftp",
          8080: "fake_admin", 5432: "fake_db", 9000: "fake_api", 5000: "dashboard"}
_results: list[tuple[str, str, str]] = []


def check(level: str, name: str, detail: str = "") -> None:
    _results.append((level, name, detail))


def port_free(port: int) -> bool:
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1) if hasattr(socket, "SO_EXCLUSIVEADDRUSE") else None
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--interface", default="Wi-Fi")
    ap.add_argument("--enforce-blocks", action="store_true")
    args = ap.parse_args()

    admin = bool(ctypes.windll.shell32.IsUserAnAdmin()) if sys.platform == "win32" else False
    check("OK" if admin else "FAIL", "elevated shell",
          "" if admin else "live capture + firewall rules need an Administrator shell")

    for rel in ("models/benchmarkids_binary.pkl", "models/benchmarkids_multiclass.pkl",
                "dashboard/web/dist/index.html"):
        ok = (_ROOT / rel).is_file()
        check("OK" if ok else "FAIL", rel, "" if ok else "missing (dashboard: cd dashboard/web && npm run build)")

    try:
        from scapy.all import conf, get_if_list
        names = [str(i.name) for i in conf.ifaces.values()]
        ok = any(args.interface.lower() == n.lower() for n in names)
        check("OK" if ok else "FAIL", f"capture interface '{args.interface}'",
              "" if ok else f"not found; Npcap installed? available: {names[:6]}")
    except Exception as exc:
        check("FAIL", "scapy/Npcap", str(exc))

    for port, svc in _PORTS.items():
        if port_free(port):
            check("OK", f"port {port} free ({svc})")
        else:
            lvl = "WARN" if svc in ("target_service", "fake_db") else "FAIL"
            check(lvl, f"port {port} in use ({svc})",
                  "ok if target_service is already running" if svc == "target_service"
                  else "honeypot will skip this decoy" if svc == "fake_db" else "something else holds it")

    if sys.platform == "win32":
        out = subprocess.run(["netsh", "advfirewall", "show", "allprofiles", "state"],
                             capture_output=True, text=True).stdout
        off = [blk.splitlines()[0].split()[0] for blk in out.split("\n\n") if "OFF" in blk.upper()]
        if args.enforce_blocks and off:
            check("FAIL", "firewall profiles", f"OFF: {off} -- block rules will not be enforced on those profiles")
        else:
            check("OK" if not off else "WARN", "firewall profiles", f"OFF: {off}" if off else "")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            check("OK", "own IP (give this to attackers)", s.getsockname()[0])
    except OSError as exc:
        check("WARN", "own IP", f"unresolved ({exc}) -- self-traffic filter disabled")

    icon = {"OK": "[ OK ]", "WARN": "[WARN]", "FAIL": "[FAIL]"}
    for lvl, name, detail in _results:
        print(f"{icon[lvl]} {name}" + (f" -- {detail}" if detail else ""))
    failed = sum(r[0] == "FAIL" for r in _results)
    print(f"\n{'READY' if not failed else f'{failed} hard failure(s)'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
