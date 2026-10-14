# SENTINEL — Banner Results Numbers (every figure traced to a file)

Written for: the banner designer (Group G40). Use only the numbers in the
"USE ON THE BANNER" tables; the rest are for answering reviewers' questions.

Source of truth: `docs/RESEARCH_PAPER_RESULTS_M1-M4.md` (tables noted below)
and the report files under `reports/`.

---

## USE ON THE BANNER

### A. Detection performance — CIC-IDS-2017, held-out test set (Table 1)
Caption: *"CIC-IDS-2017 held-out test set, 527,330 network flows."*

| Metric | Value |
|---|---|
| Accuracy | **99.69%** |
| Precision | 98.53% |
| Recall | 99.68% |
| F1-score | **99.10%** |
| ROC-AUC | **99.99%** |
| False-positive rate | 0.31% |
| False-negative rate | 0.32% |
| Confusion matrix | TP 90,018 · TN 435,681 · FP 1,344 · FN 287 |

Figures: `reports/confusion_matrix_2017_binary_20260720_133638.png`,
`reports/roc_2017_binary_20260720_133637.png`,
`reports/pr_curve_2017_binary_20260720_133638.png`,
`reports/benchmark_2017_binary_20260720_133638.png`.

> The 99.83% / 99.67% / 1.00 currently on the banner are real but come from a
> **2,400-flow regression check** (`reports/report_2017_binary_20260720_133638.json`),
> not the full test. Prefer the 527,330-flow numbers above. A "perfect 1.00" AUC
> also invites suspicion of data leakage.

### B. Tested on real traffic (Table 10, §4.1b) — the strongest result
Caption: *"Model trained on a benchmark, tested on our own live network
capture (17,612 flows), before and after adaptive retraining."*

| Metric (17,612 live flows) | Before | After |
|---|---|---|
| Accuracy | 95.16% | **99.74%** |
| Normal flows wrongly flagged | **733 of 2,365 (31%)** | **0** |
| ROC-AUC | 0.8987 | **0.9998** |
| Precision | 95.38% | 100.00% |
| Recall | 99.22% | 99.70% |
| F1 | 97.26% | 99.85% |

Figures: `reports/confusion_matrix_live_m4_big_before_retrain_20260727_233542.png`,
`reports/confusion_matrix_live_m4_big_after_retrain_20260727_233544.png`,
`reports/roc_live_m4_big_before_retrain_20260727_233541.png`,
`reports/roc_live_m4_big_after_retrain_20260727_233543.png`.

> **Do NOT use "1.29% → 99.95%".** It is marked "documented" only (2026-07-26).
> Re-running the same 2,092-flow capture gave 98.66% accuracy with ROC-AUC 0.61
> (27 of 54 normal flows wrongly flagged) — deceptively high accuracy, poor model.

### C. Speed and scale
| Item | Value | Source |
|---|---|---|
| Throughput (lightweight model, 10 features) | **1,638,934 flows / second** | Table 4 |
| Lightweight model accuracy / F1 / AUC | 99.47% / 98.46% / 99.95% | Table 4 |
| Software modules (health check) | 33 | `python sentinel.py health` |
| Detection layers | 3 (ML · signatures & rules · anomaly) + honeypots | architecture |

### D. Attack types detected live on a real network
Live-tested with real attacker machines (runbook `docs/DEMO_RUNBOOK.md`; Aug 2026
sessions, plus this week's rehearsal): SQL injection, XSS, command injection,
path traversal, web shell, CSRF, port scan, DoS, DDoS, brute force, honeypot hits,
bot/C2 beacon, phishing, exfiltration, session hijacking, zero-day (anomaly) —
**16 types**. Infiltration is a documented limitation (looks like a port scan to a
flow-based model); Heartbleed is trained but not live-testable here.

---

## KEEP FOR REVIEWER QUESTIONS (don't need to be on the banner)

### Cross-dataset generalisation (Tables 2 and 3) — an honest finding
| Experiment | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| Train 2017 → test 2018 (15,188,468 flows) | 85.64% | 74.18% | **20.12%** | 31.66% | 92.35% |
| Train 2017+2018 → test 2018 | — | 100.00% | **80.83%** | 89.40% | — |

Takeaway: a model trained on one dataset misses most attacks on another
(domain shift); training on both closes most of the gap. The same effect appeared
on live traffic (section B).

### Multi-class (Table 5)
Macro F1 **88.31%** over 8 classes: BENIGN, DoS, DDoS, PortScan, BruteForce, Bot,
Infiltration, Heartbleed.

### Explainability — top SHAP features (Table 6)
`bwd_packet_length_std` 33.82% · `average_packet_size` 17.47% ·
`packet_length_mean` 10.02% · `packet_length_std` 6.33% · `max_packet_length` 5.61%.
Figure: `shap_plots/shap_bar_20260720_133628.png`.

### Small live capture (2,092 flows, 54 normal) — shows why accuracy alone misleads
| | Before retrain | After retrain |
|---|---|---|
| Accuracy | 98.66% | 99.95% |
| ROC-AUC | **0.6086** | 0.9999 |
| Normal flows wrongly flagged | 27 of 54 | 0 |

---

## Suggested text for the three Results boxes

**Box 1 — Detection performance**  
99.69% Accuracy · 99.10% F1 · 99.99% ROC-AUC  
*CIC-IDS-2017 held-out test, 527,330 flows*

**Box 2 — Tested on real traffic**  
Benchmark model on our live network: **31% of normal traffic falsely flagged**  
After adaptive retraining: **0%**  (accuracy 95.2% → 99.7%, AUC 0.90 → 1.00)  
*17,612 live flows · 1.64 M flows/sec · 16 attack types detected live*

**Box 3 — Attack families covered** (keep as is)
