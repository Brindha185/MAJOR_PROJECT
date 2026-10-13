"""
lab/verify_merge_bruteforce_beacon.py

Purpose: Regression checks for three fixes made during the 2026-10-13 live
         rehearsal.
         (A) Event merging: a flood/scan raised tens of thousands of
             detections (34,904 in one rehearsal) that pushed every other
             attack out of the dashboard's 500-row window. Repeated
             detections of one attack from one source within a short window
             now merge into a single row with a count.
         (B) Brute force: hydra produced only ~16 login requests and the ML
             model scored them benign, so nothing fired. A rule now flags
             8+ login-endpoint requests from one source within 60 s.
         (C) Bot beacon: the beacon was scored across ALL of one laptop's
             connections to the server (honeypot probes, flood, upload), so
             a real 3 s beacon never looked regular. Now it is scored per
             destination port over a recent window.

Usage:
    python lab/verify_merge_bruteforce_beacon.py
"""
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import logging
logging.disable(logging.CRITICAL)

import pandas as pd

import core.flow_collector as fc
import dashboard.live_monitor as lm
from core.flow_collector import FlowCollector
from dashboard.live_monitor import LiveMonitor
from sentinel import SentinelIPS

# ---------------------------------------------------------------- (A) merging
print("--- A1: repeated detections from one source merge into one counted row ---")
m = LiveMonitor()
for i in range(50):
    m.push_event({"attack_type": "DoS", "src_ip": "10.0.0.9", "severity": "HIGH", "blocked": i == 40})
snap = m.snapshot()
assert len(snap["events_list"]) == 1, len(snap["events_list"])
row = snap["events_list"][0]
assert row["count"] == 50 and row["blocked"] is True, row
assert snap["total_attacks"] == 50 and snap["attack_counts"] == {"DoS": 50}, snap["attack_counts"]
print("PASS")

print("--- A2: different source or different attack is NOT merged; ids/rev behave ---")
m = LiveMonitor()
m.push_event({"attack_type": "DoS", "src_ip": "1.1.1.1", "severity": "HIGH"})
m.push_event({"attack_type": "DoS", "src_ip": "2.2.2.2", "severity": "HIGH"})
m.push_event({"attack_type": "SQLInjection", "src_ip": "2.2.2.2", "severity": "MEDIUM"})
rows = m.snapshot()["events_list"]
assert len(rows) == 3, [r["attack"] for r in rows]
m.push_event({"attack_type": "SQLInjection", "src_ip": "2.2.2.2", "severity": "MEDIUM"})
rows2 = m.snapshot()["events_list"]
assert len(rows2) == 3 and rows2[0]["count"] == 2 and rows2[0]["id"] == rows[0]["id"] and rows2[0]["rev"] > rows[0]["rev"]
print("PASS")

print("--- A3: outside the merge window starts a new row ---")
orig = lm._MERGE_WINDOW_S
lm._MERGE_WINDOW_S = 0.05
try:
    m = LiveMonitor()
    m.push_event({"attack_type": "DoS", "src_ip": "3.3.3.3", "severity": "HIGH"})
    time.sleep(0.12)
    m.push_event({"attack_type": "DoS", "src_ip": "3.3.3.3", "severity": "HIGH"})
    assert len(m.snapshot()["events_list"]) == 2
finally:
    lm._MERGE_WINDOW_S = orig
print("PASS")

# ------------------------------------------------------------ (B) brute force
ips = SentinelIPS()


def chunk(n, src="192.168.0.108", payload="GET /login HTTP/1.0\r\nHost: x\r\nUser-Agent: Mozilla/5.0 (Hydra)\r\n\r\n"):
    return pd.DataFrame({"src_ip": [src] * n, "payload_sample": [payload] * n, "pred_binary": [0] * n, "confidence": [0.1] * n})


print("--- B1: 10 login requests from one source -> BruteForce ---")
ips._auth_hits.clear()
out = ips._run_bruteforce(chunk(10))
assert (out["sig_attack_type"] == "BruteForce").all() and (out["pred_binary"] == 1).all(), out
assert (out["confidence"] >= 0.75).all()
print("PASS")

print("--- B2: 3 login requests (a normal user) -> nothing ---")
ips._auth_hits.clear()
out = ips._run_bruteforce(chunk(3))
assert "sig_attack_type" not in out.columns or out["sig_attack_type"].isna().all()
print("PASS")

print("--- B3: counted across chunks, per source ---")
ips._auth_hits.clear()
ips._run_bruteforce(chunk(5, "1.1.1.1"))
ips._run_bruteforce(chunk(5, "2.2.2.2"))
a = ips._run_bruteforce(chunk(5, "1.1.1.1"))          # 1.1.1.1 now has 10
b = ips._run_bruteforce(chunk(2, "2.2.2.2"))          # 2.2.2.2 has 7 -> still below
assert (a["sig_attack_type"] == "BruteForce").all()
assert "sig_attack_type" not in b.columns or b["sig_attack_type"].isna().all()
print("PASS")

print("--- B4: ordinary page requests and an existing label are left alone ---")
ips._auth_hits.clear()
out = ips._run_bruteforce(chunk(20, payload="GET /search?q=hello HTTP/1.1\r\nHost: x\r\n\r\n"))
assert "sig_attack_type" not in out.columns or out["sig_attack_type"].isna().all()
c = chunk(10)
c["sig_attack_type"] = "SQLInjection"
out = ips._run_bruteforce(c)
assert (out["sig_attack_type"] == "SQLInjection").all()
print("PASS")

# ------------------------------------------------------------------ (C) beacon
SRC, DST = "192.168.0.109", "192.168.0.101"


def collector_with(history):
    c = FlowCollector()
    c._conn_history[(SRC, DST)].extend(history)
    return c


print("--- C1: a regular 3 s beacon to :80 is found even among noisy traffic to other ports ---")
t0 = 1000.0
beacon = [(t0 + i * 3.0, 80) for i in range(8)]
noise = [(t0 + 1.0 + i * 1.7 + (i % 3) * 0.9, 2222 + (i % 4)) for i in range(20)]
history = sorted(beacon + noise)
assert collector_with(history).beacon_score(SRC, DST)["is_beacon"] is True, collector_with(history).beacon_score(SRC, DST)
print("PASS")

print("--- C2: old connections outside the window are ignored ---")
old_noise = [(t0 - 500 + i * 7.3 + (i % 5) * 4.1, 80) for i in range(15)]
history = sorted(old_noise + beacon)
assert collector_with(history).beacon_score(SRC, DST)["is_beacon"] is True
print("PASS")

print("--- C3: irregular browsing on one port is still not a beacon ---")
irregular = [(t0 + sum([2.0, 9.0, 3.5, 20.0, 1.2, 14.0, 6.0, 31.0][:i]), 80) for i in range(9)]
assert collector_with(irregular).beacon_score(SRC, DST)["is_beacon"] is False
print("PASS")

print("\nAll checks passed.")
