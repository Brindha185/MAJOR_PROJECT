"""
lab/verify_anomaly_telemetry.py

Purpose: Self-check for the Anomaly Detection dashboard tab (2026-10-13).
         The tab needs (a) a rolling window of live Layer 3 anomaly scores
         with exact counts and the "learning baseline" status, and (b) a
         `detected_by` attribution (ML / Signature / Rule / Anomaly /
         Honeypot) on every detection so the pipeline view can show which
         layer caught what.

Confirms: (1) LiveMonitor stores/rolls scores, keeps exact counts, and the
          snapshot is JSON-safe, (2) set_anomaly_state is reflected,
          (3) _record_anomaly_scores samples a bounded number of points but
          keeps every flagged flow and the exact totals, (4) _build_event
          attributes Signature / Rule / ML / Anomaly correctly, including
          an anomaly-only ZeroDay, (5) the dashboard row exposes detected_by.

Usage:
    python lab/verify_anomaly_telemetry.py
"""
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import numpy as np
import pandas as pd

import sentinel
from dashboard.live_monitor import LiveMonitor
from sentinel import SentinelIPS

print("--- Check 1: monitor stores scores, rolls over, exact counts, JSON-safe ---")
m = LiveMonitor()
m.record_anomaly([0.12, 0.1, -0.2], n_total=500, n_flagged=1)
snap = m.snapshot()["anomaly"]
json.dumps(snap)
assert snap["total"] == 500 and snap["flagged"] == 1, snap
assert [p[0] for p in snap["scores"]] == [1, 2, 3], snap["scores"]
for _ in range(10):
    m.record_anomaly([0.1] * 100, 100, 0)
snap = m.snapshot()["anomaly"]
assert len(snap["scores"]) == 400, len(snap["scores"])
assert snap["scores"][-1][0] == 3 + 1000, snap["scores"][-1]
print("PASS")

print("--- Check 2: baseline-learning state is reflected ---")
assert m.snapshot()["anomaly"]["fitted"] is False
m.set_anomaly_state(False, 63, 100)
a = m.snapshot()["anomaly"]
assert (a["fitted"], a["buffered"], a["needed"]) == (False, 63, 100), a
m.set_anomaly_state(True, 100, 100)
assert m.snapshot()["anomaly"]["fitted"] is True
print("PASS")

ips = SentinelIPS()
ips._monitor = LiveMonitor()

print("--- Check 3: score sampling is bounded, keeps flagged flows and exact totals ---")
scores = np.full(5000, 0.12)
flags = np.zeros(5000, dtype=bool)
scores[[17, 3000, 4999]] = -0.2
flags[[17, 3000, 4999]] = True
ips._record_anomaly_scores(scores, flags)
a = ips._monitor.snapshot()["anomaly"]
assert a["total"] == 5000 and a["flagged"] == 3, a
assert len(a["scores"]) <= sentinel._ANOMALY_SAMPLE_PER_CHUNK + 3, len(a["scores"])
assert sum(1 for _, s in a["scores"] if s < 0) == 3, "every flagged flow must be sampled"
ips._record_anomaly_scores(np.array([]), np.array([], dtype=bool))      # empty chunk is a no-op
print("PASS")

print("--- Check 4: _build_event attributes the detecting layer ---")
def ev(**row):
    base = {"src_ip": "1.1.1.1", "destination_port": 80, "confidence": 0.9}
    base.update(row)
    return ips._build_event(pd.Series(base))

assert ev(sig_attack_type="SQLInjection")["detected_by"] == "Signature"
assert ev(sig_attack_type="DoS")["detected_by"] == "Rule"
assert ev(sig_attack_type="Bot")["detected_by"] == "Rule"
assert ev(attack_class="PortScan")["detected_by"] == "ML"
z = ev(attack_class="BENIGN", anomaly_detected=True)
assert z["attack_type"] == "ZeroDay" and z["detected_by"] == "Anomaly", z
u = ev(attack_class="BENIGN", anomaly_detected=False)
assert u["attack_type"] == "Unknown" and u["detected_by"] == "ML", u
print("PASS")

print("--- Check 5: dashboard row carries detected_by ---")
mon = LiveMonitor()
mon.push_event({"attack_type": "ZeroDay", "src_ip": "2.2.2.2", "severity": "CRITICAL", "detected_by": "Anomaly"})
row = mon.snapshot()["events_list"][0]
assert row["detected_by"] == "Anomaly", row
print("PASS")

print("\nAll checks passed.")
