"""
lab/run_dashboard_dev.py

Purpose: Manual QA harness for dashboard/server.py and dashboard/web --
         NOT part of the sentinel.py product surface. sentinel.py live is
         live-only (no synthetic data), per
         docs/superpowers/specs/2026-08-09-live-dashboard-design.md.
         This script starts the embedded dashboard server against a
         LiveMonitor/AttackMap fed a rotating stream of synthetic
         detection events, so the frontend can be developed and eyeballed
         in a browser without needing a real packet capture running.

Usage:
    python lab/run_dashboard_dev.py
    # then open http://localhost:5000
"""
import random
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dashboard.attack_map import AttackMap
from dashboard.live_monitor import LiveMonitor
from dashboard.server import start_dashboard_server

# (attack, severity, tactic, technique, dst_port, response actions, blocks?)
_SAMPLE_ATTACKS = [
    ("PortScan",     "LOW",      "Discovery",      "T1046",     0,    ["ip_block_24h", "alert_medium", "log"], True),
    ("SQLInjection", "MEDIUM",   "Execution",      "T1190",     80,   ["block_request", "alert_medium", "log_payload"], False),
    ("XSS",          "MEDIUM",   "Execution",      "T1059.007", 80,   ["sanitize_input", "block_request", "alert_medium"], False),
    ("WebShell",     "CRITICAL", "Persistence",    "T1505.003", 80,   ["block_request", "ip_block", "alert_critical"], True),
    ("DDoS",         "HIGH",     "Impact",         "T1498",     80,   ["rate_limit", "ip_block", "alert_high", "log_pcap"], True),
    ("Honeypot",     "CRITICAL", "Initial Access", "T1110",     2222, ["ip_block", "log_pcap", "alert_critical"], True),
    ("Bot",          "HIGH",     "Persistence",    "T1543",     80,   ["ip_block", "c2_domain_block", "alert_high"], True),
    ("Exfiltration", "MEDIUM",   "Exfiltration",   "T1041",     80,   ["log"], False),
]
# Hotspot-style private attackers, matching the exhibition setup.
_ATTACKER_IPS = ["192.168.43.21", "192.168.43.22", "192.168.43.23"]


def main() -> None:
    monitor = LiveMonitor()
    amap = AttackMap()
    start_dashboard_server(monitor, amap, info={"enforce": False, "server_ip": "192.168.43.10", "mode": "demo"})
    print("Dev dashboard running at http://localhost:5000 -- Ctrl+C to stop")

    rng = random.Random()
    try:
        while True:
            atk, sev, tactic, tech, port, actions, blocks = rng.choice(_SAMPLE_ATTACKS)
            ip = rng.choice(_ATTACKER_IPS)
            event = {
                "attack_type": atk, "severity": sev, "mitre_tactic": tactic,
                "mitre_technique": tech, "dst_port": port,
                "src_ip": ip, "confidence": round(rng.uniform(0.65, 0.99), 3),
                "risk_score": round(rng.uniform(30, 98), 1),
                "action": ", ".join(actions[:2]), "response": actions, "blocked": blocks,
                "actor_class": "ScriptKiddie", "sophistication": 30.0,
                "lat": 0.0, "lon": 0.0, "country": "Unknown", "country_code": "", "city": "",
            }
            monitor.push_event(event)
            amap.ingest(event)
            monitor.record_throughput(rng.uniform(800_000, 1_700_000))
            time.sleep(3)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
