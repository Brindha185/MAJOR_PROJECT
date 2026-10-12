"""
lab/verify_blocked_flag.py

Purpose: Self-check for the `blocked` / `response` fields the three-page
         dashboard (2026-10-12) reads from each detection event.
         SentinelIPS._run_response() sets event["blocked"] only when an
         IPBlacklister.block() call was actually issued, and always records
         the RESPONSE_MATRIX action list in event["response"]. Also checks
         LiveMonitor's row output carries the new fields and a stable id.

Confirms: (1) CRITICAL/HIGH at confidence >= 0.70 -> blocked, (2) a MEDIUM
          attack with an ip_block_* matrix action (BruteForce) -> blocked,
          (3) a plain MEDIUM attack (SQLInjection) -> not blocked,
          (4) CSRF / Session Hijacking -> never blocked (session kill only),
          (5) HIGH below the 0.70 confidence floor -> not blocked,
          (6) to_row() exposes id/age_s/technique/dst_port/blocked/actions
          and ids strictly increase.

Usage:
    python lab/verify_blocked_flag.py
"""
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dashboard.live_monitor import LiveMonitor
from sentinel import SentinelIPS


class _StubBlacklist:
    """Records block() calls; never touches threat_intel/ip_blacklist.txt."""
    def __init__(self):
        self.calls = []

    def block(self, ip, duration_s=0, reason=""):
        self.calls.append((ip, duration_s, reason))


ips = SentinelIPS()
ips._blacklist = _StubBlacklist()


def run(attack, severity, confidence, extra=None):
    ev = {"src_ip": "192.168.43.21", "attack_type": attack, "severity": severity,
          "confidence": confidence, "dst_port": 80}
    ev.update(extra or {})
    n_before = len(ips._blacklist.calls)
    ips._run_response(ev)
    return ev, len(ips._blacklist.calls) - n_before


print("--- Check 1: HIGH/CRITICAL at >=0.70 is blocked ---")
for atk, sev in (("DDoS", "HIGH"), ("WebShell", "CRITICAL")):
    ev, calls = run(atk, sev, 0.9)
    assert ev.get("blocked") is True and calls == 1, (atk, ev, calls)
    assert ev["response"], ev
print("PASS")

print("--- Check 2: MEDIUM attack with an ip_block_* matrix action is blocked ---")
ev, calls = run("BruteForce", "MEDIUM", 0.9)
assert ev.get("blocked") is True and calls == 1, (ev, calls)
print("PASS")

print("--- Check 3: plain MEDIUM attack is not blocked ---")
ev, calls = run("SQLInjection", "MEDIUM", 0.9)
assert not ev.get("blocked") and calls == 0, (ev, calls)
assert "block_request" in ev["response"], ev["response"]
print("PASS")

print("--- Check 4: CSRF / Session Hijacking never blocked ---")
for atk in ("CSRF", "Session Hijacking"):
    ev, calls = run(atk, "MEDIUM", 0.9, {"session_token": "abc"})
    assert not ev.get("blocked") and calls == 0, (atk, ev, calls)
print("PASS")

print("--- Check 5: HIGH below the confidence floor is not blocked ---")
ev, calls = run("DoS", "HIGH", 0.5)
assert not ev.get("blocked") and calls == 0, (ev, calls)
print("PASS")

print("--- Check 6: dashboard row carries the new fields, ids increase, JSON-safe ---")
mon = LiveMonitor()
mon.push_event({"attack_type": "SQLInjection", "src_ip": "1.1.1.1", "severity": "MEDIUM",
                "mitre_technique": "T1190", "dst_port": 80, "blocked": False, "response": ["block_request"]})
mon.push_event({"attack_type": "DDoS", "src_ip": "2.2.2.2", "severity": "HIGH",
                "blocked": True, "response": ["rate_limit", "ip_block"]})
rows = mon.snapshot()["events_list"]          # newest first
json.dumps(rows)
assert rows[0]["id"] > rows[1]["id"], rows
assert rows[1]["technique"] == "T1190" and rows[1]["dst_port"] == 80 and rows[1]["blocked"] is False
assert rows[0]["blocked"] is True and rows[0]["actions"] == ["rate_limit", "ip_block"], rows[0]
assert "age_s" in rows[0]
print("PASS")

print("\nAll checks passed.")
