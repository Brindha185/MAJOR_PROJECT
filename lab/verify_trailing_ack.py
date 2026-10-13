"""
lab/verify_trailing_ack.py

Purpose: Regression check for the phantom-flow bug found live 2026-10-13.
         When both FINs of a connection were seen the collector closed the
         flow; the final ACK of the shutdown then found no flow and started a
         new 2-packet "flow" (one FIN, one ACK) that lingered until the idle
         sweep and was scored by the ML model as a port scan -- so ordinary
         curl traffic got a benign laptop auto-blocked.

Confirms: (1) a normal HTTP connection (handshake, request, response, FIN
          both ways, trailing ACK) yields exactly ONE flow, (2) a trailing
          RST after close is also swallowed, (3) a genuinely new connection
          reusing the same 5-tuple (fresh SYN) still opens a new flow,
          (4) memory is bounded, (5) a late packet AFTER the TIME_WAIT
          window is not swallowed.

Usage:
    python lab/verify_trailing_ack.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import logging
logging.disable(logging.CRITICAL)

from scapy.layers.inet import IP, TCP
from scapy.packet import Raw

import core.flow_collector as fc
from core.flow_collector import FlowCollector

CLI, SRV, CP, SP = "192.168.0.108", "192.168.0.101", 40000, 80


def pkt(src, dst, sport, dport, flags, payload=b"", t=0.0):
    p = IP(src=src, dst=dst) / TCP(sport=sport, dport=dport, flags=flags)
    if payload:
        p = p / Raw(payload)
    p.time = t
    return p


def connection(t0, cport=CP, last="ACK"):
    """A normal HTTP exchange; the shutdown ends with a trailing ACK or RST."""
    pk = [
        pkt(CLI, SRV, cport, SP, "S", t=t0),
        pkt(SRV, CLI, SP, cport, "SA", t=t0 + .001),
        pkt(CLI, SRV, cport, SP, "A", t=t0 + .002),
        pkt(CLI, SRV, cport, SP, "PA", b"GET / HTTP/1.1\r\nHost: x\r\n\r\n", t=t0 + .003),
        pkt(SRV, CLI, SP, cport, "PA", b"HTTP/1.1 200 OK\r\n\r\nok", t=t0 + .004),
        pkt(SRV, CLI, SP, cport, "FA", t=t0 + .005),
        pkt(CLI, SRV, cport, SP, "FA", t=t0 + .006),
        pkt(SRV, CLI, SP, cport, "A" if last == "ACK" else "R", t=t0 + .007),   # the trailing packet
    ]
    return pk


def run(packets):
    c = FlowCollector()
    for p in packets:
        c.ingest_packet(p)
    return c, c.flush_all()


print("--- Check 1: normal connection + trailing ACK = exactly one flow ---")
c, df = run(connection(1000.0))
assert len(df) == 1, f"expected 1 flow, got {len(df)}: {df[['total_fwd_packets','total_backward_packets']].values.tolist()}"
print("PASS")

print("--- Check 2: trailing RST after close is swallowed too ---")
c, df = run(connection(1000.0, last="RST"))
assert len(df) == 1, len(df)
print("PASS")

print("--- Check 3: fresh SYN on the same 5-tuple opens a new flow ---")
c, df = run(connection(1000.0) + connection(1005.0))
assert len(df) == 2, len(df)
print("PASS")

print("--- Check 4: many closed connections keep the memory bounded ---")
c = FlowCollector()
for i in range(fc._CLOSED_MEMORY_MAX + 50):
    for p in connection(2000.0 + i * 0.1, cport=10000 + (i % 50000)):
        c.ingest_packet(p)
assert len(c._closed_at) <= fc._CLOSED_MEMORY_MAX + 1, len(c._closed_at)
print("PASS")

print("--- Check 5: a stray ACK long after TIME_WAIT is not swallowed ---")
c = FlowCollector()
for p in connection(3000.0):
    c.ingest_packet(p)
c.ingest_packet(pkt(SRV, CLI, SP, CP, "A", t=3000.0 + fc._TIME_WAIT_S + 5))
df = c.flush_all()
assert len(df) == 2, len(df)
print("PASS")

print("\nAll checks passed.")
