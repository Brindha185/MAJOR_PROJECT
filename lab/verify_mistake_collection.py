"""
lab/verify_mistake_collection.py

Purpose: Self-check for live MistakeCollector wiring (2026-10-06). The
         collector was instantiated by sentinel.py but .add() was never
         called, so adaptive self-learning had never collected a real
         mistake. Now a Layer 2 signature hit on a flow Layer 1 scored
         benign is recorded as a confirmed Layer 1 false negative.

Confirms: (1) a signature hit with pred_binary=0 is collected as FN,
          (2) a signature hit Layer 1 already caught is NOT collected,
          (3) a chunk with no signature hits collects nothing,
          (4) per-chunk collection is capped.

Usage:
    python lab/verify_mistake_collection.py
"""
import sys
import tempfile
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pandas as pd

import sentinel
from adaptive.mistake_collector import MistakeCollector
from sentinel import SentinelIPS

_SQLI = "GET /search?q=1 UNION SELECT password FROM users HTTP/1.1\r\nHost: x\r\n\r\n"
_CLEAN = "GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n"

ips = SentinelIPS()
tmp = Path(tempfile.mkdtemp()) / "buf.parquet"   # never touch models/mistakes_buffer.parquet


def fresh() -> None:
    ips._mistakes = MistakeCollector(buffer_path=tmp)
    ips._mistakes.clear()


print("--- Check 1: signature hit missed by Layer 1 is collected as FN ---")
fresh()
chunk = pd.DataFrame({
    "src_ip": ["1.1.1.1"], "dst_ip": ["2.2.2.2"],
    "payload_sample": [_SQLI], "pred_binary": [0], "confidence": [0.1],
    "flow_duration": [5.0], "total_fwd_packets": [3.0],
})
out = ips._run_signatures(chunk)
assert ips._mistakes.fn_count() == 1 and ips._mistakes.fp_count() == 0, ips._mistakes.summary()
X, y = ips._mistakes.get_xy()
assert list(y) == [1] and "flow_duration" in X.columns and "pred_binary" not in X.columns, X.columns
assert out.iloc[0]["pred_binary"] == 1
print("PASS: 1 FN collected, labels/features sane, row still promoted to attack")

print("--- Check 2: signature hit Layer 1 already flagged is not a mistake ---")
fresh()
chunk["pred_binary"] = [1]
ips._run_signatures(chunk)
assert ips._mistakes.count() == 0, ips._mistakes.summary()
print("PASS: nothing collected")

print("--- Check 3: no signature hit collects nothing ---")
fresh()
chunk2 = chunk.assign(payload_sample=[_CLEAN], pred_binary=[0])
ips._run_signatures(chunk2)
assert ips._mistakes.count() == 0, ips._mistakes.summary()
print("PASS: nothing collected")

print("--- Check 4: per-chunk cap ---")
fresh()
n = sentinel._MISTAKES_PER_CHUNK_MAX + 25
big = pd.DataFrame({
    "src_ip": [f"3.3.3.{i % 250}" for i in range(n)], "dst_ip": ["2.2.2.2"] * n,
    "payload_sample": [_SQLI] * n, "pred_binary": [0] * n, "confidence": [0.1] * n,
    "flow_duration": [1.0] * n,
})
ips._run_signatures(big)
assert ips._mistakes.count() == sentinel._MISTAKES_PER_CHUNK_MAX, ips._mistakes.count()
print(f"PASS: capped at {sentinel._MISTAKES_PER_CHUNK_MAX}")

print("--- Check 5: plain request to a public-IP server is not 'raw_ip_host' Phishing; real phishing still is ---")
fresh()
for host_hdr in ("Host: 2.2.2.2", "Host: shop.example.com"):
    c = pd.DataFrame({"src_ip": ["1.1.1.1"], "dst_ip": ["2.2.2.2"], "pred_binary": [0],
                      "confidence": [0.1], "payload_sample": [f"GET /index.html HTTP/1.1\r\n{host_hdr}\r\n\r\n"]})
    assert "sig_attack_type" not in ips._run_signatures(c).columns, host_hdr
phish = pd.DataFrame({"src_ip": ["1.1.1.1"], "dst_ip": ["2.2.2.2"], "pred_binary": [0], "confidence": [0.1],
                      "payload_sample": ["GET /?q=verify-your-paypal-account HTTP/1.1\r\nHost: 2.2.2.2\r\n\r\n"]})
assert ips._run_signatures(phish).iloc[0]["sig_attack_type"] == "Phishing"
print("PASS")

print("\nAll checks passed.")
