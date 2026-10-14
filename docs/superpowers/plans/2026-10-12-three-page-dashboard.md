# Three-Page Exhibition Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-panel analytics dashboard with a three-page exhibition view (Live Attack Map, Attack Details, MITRE & Response) that makes "which laptop attacks, what, and what SENTINEL did" obvious on a projector.

**Architecture:** Backend adds a few fields to the existing `dashboard_update` payload (`technique`, `dst_port`, `blocked`, `response`, `ts`, `server_info`). Frontend is a rewrite of `dashboard/web/src` (React 19 + Vite, no new libraries); all three pages derive their state from `events_list` in `App.jsx`. No new endpoints or sockets.

**Tech Stack:** Python (Flask-SocketIO, existing), React 19, Vite 8, socket.io-client, inline SVG.

**Spec:** `docs/superpowers/specs/2026-10-07-three-page-dashboard-design.md` (visual reference: `.superpowers/brainstorm/1647-1791312199/content/three-pages.html`)

## Global Constraints

- Detection logic is untouched; only response bookkeeping (`blocked`, `response`) is added in `_run_response`.
- No new npm dependencies; `plotly` only reused for the optional map on page 2.
- Flat dark navy theme, 1px borders, large fonts, high contrast (projector).
- Status banner relaxes ~4.5 s after the last MEDIUM+ event; diagram caps at 6 attackers (oldest evicted).
- "BLOCKED" = blacklist issued the block; header badge always shows `enforcement: ON/OFF` + server IP.
- `events_list` is capped at 500 (LiveMonitor); KPI "attacks" uses `total_attacks`.
- `npm run build` and `npm run lint` must be clean; all `lab/verify_*.py` stay green.
- Keep the old dashboard working until the new build passes (work builds into `dist/`; `git stash`/revert is the rollback).

## Review Focus

- Event with empty/`T0000` technique (generic `ATTACK`): shown, chip says "unmapped", not added to the matrix.
- Zero events yet: SECURE banner, empty diagram with server node, "Waiting for detections…".
- Socket drops mid-demo: "Reconnecting…" banner shown, last data stays on screen.
- 7+ distinct attacker IPs: oldest node evicted from diagram only; table/cards keep all.
- CSRF / Session Hijacking: `blocked` stays False, `response` still lists the action.
- Replay mode (`--pcap`): events arrive with old packet timestamps; banner/age must key off arrival time (`ts` set at push), not packet time.

---

### Task 1: Backend data contract

**Files:**
- Modify: `dashboard/live_monitor.py` (`DetectionEvent.to_row`, `push_event` unchanged)
- Modify: `dashboard/server.py` (`build_snapshot_payload`, `start_dashboard_server`, `_emitter_loop`, `_install_instant_emit`)
- Modify: `sentinel.py` (`_run_response` ~L1004-1083, `_run_live` ~L1367)
- Modify: `lab/verify_dashboard_snapshot_serialization.py`
- Create: `lab/verify_blocked_flag.py`

**Interfaces:**
- Produces row fields: `technique: str`, `technique_name: str`, `dst_port: int`, `blocked: bool`, `response: list[str]`, `ts: float` (epoch seconds, arrival time).
- Produces payload key `server_info: {"enforce": bool, "server_ip": str}` (always present; `{}` defaults → `enforce False`, `server_ip ""`).
- `start_dashboard_server(monitor, amap, host, port, tick_s, info: Optional[dict] = None)`.

- [ ] **Step 1: Write failing serialization checks** — append to `lab/verify_dashboard_snapshot_serialization.py` before the final print:

```python
print()
print("--- Check 4: new row fields + server_info ---")
monitor.push_event({
    "attack_type": "SQLInjection", "src_ip": "192.168.1.50", "confidence": 0.9,
    "severity": "MEDIUM", "mitre_tactic": "Execution", "action": "block_request",
    "mitre_technique": "T1190", "mitre_technique_name": "Exploit Public-Facing Application",
    "dst_port": 80, "blocked": True, "response": ["block_request", "alert_medium"],
})
payload = build_snapshot_payload(monitor, amap, info={"enforce": True, "server_ip": "192.168.1.10"})
decoded = json.loads(json.dumps(payload))
row = decoded["monitor"]["events_list"][0]
assert row["technique"] == "T1190" and row["technique_name"].startswith("Exploit")
assert row["dst_port"] == 80 and row["blocked"] is True
assert row["response"] == ["block_request", "alert_medium"]
assert isinstance(row["ts"], float) and abs(row["ts"] - __import__("time").time()) < 5
assert decoded["server_info"] == {"enforce": True, "server_ip": "192.168.1.10"}
assert build_snapshot_payload(monitor, amap)["server_info"] == {"enforce": False, "server_ip": ""}
print("PASS: new fields present and JSON-safe")
```

- [ ] **Step 2: Run, expect FAIL** — `python lab/verify_dashboard_snapshot_serialization.py` → `TypeError` (unexpected kwarg `info`).

- [ ] **Step 3: Implement.** In `DetectionEvent.to_row` add (arrival wall-clock = `time.time() - self.age_s`):

```python
            "technique":      str(self.extra.get("mitre_technique", "")),
            "technique_name": str(self.extra.get("mitre_technique_name", "")),
            "dst_port":       int(self.extra.get("dst_port", 0) or 0),
            "blocked":        bool(self.extra.get("blocked", False)),
            "response":       list(self.extra.get("response", [])),
            "ts":             round(time.time() - self.age_s, 3),
```

In `server.py`: `build_snapshot_payload(monitor, amap, info: Optional[dict] = None)` adds
`"server_info": {"enforce": bool((info or {}).get("enforce", False)), "server_ip": str((info or {}).get("server_ip", ""))}`;
thread `info` through `_emitter_loop` (extra arg), `_install_instant_emit` (extra arg) and `start_dashboard_server(..., info=None)`.

- [ ] **Step 4: Run, expect PASS** — same command.

- [ ] **Step 5: Write `lab/verify_blocked_flag.py`** (follow the stub style of `lab/verify_reenforce_on_known_ip.py`: build `SentinelIPS.__new__`-style object or monkeypatch `_blacklist`/`_rate`/`_terminator`/`_dispatcher` with fakes). Assert on `_run_response(event)`:
  - HIGH, conf 0.9 → `event["blocked"] is True`, `event["response"] == RESPONSE_MATRIX[attack]`
  - BruteForce MEDIUM conf 0.9 (ip_block_1h branch) → `blocked True`
  - CSRF / Session Hijacking → `blocked False`, `response` non-empty
  - HIGH conf 0.5 → `blocked False`
  - `_blacklist.block` raising → `blocked False`

- [ ] **Step 6: Run, expect FAIL** (`KeyError: 'blocked'`).

- [ ] **Step 7: Implement in `_run_response`:** at top after `actions = ...` set `event["response"] = list(actions); event["blocked"] = False`. In the severity branch after `blocked = True` add `event["blocked"] = True`; in the ip_block_* branch after the successful `.block(...)` add `event["blocked"] = True`. CSRF/Hijack branch needs no change (defaults already False). In `_run_live` pass `info={"enforce": args.enforce_blocks, "server_ip": ips._own_ip or ""}` to `start_dashboard_server`.

- [ ] **Step 8: Run both scripts + `python sentinel.py health` + every existing `lab/verify_*.py`; expect all PASS.**

- [ ] **Step 9: Commit** — `git add dashboard/live_monitor.py dashboard/server.py sentinel.py lab/verify_dashboard_snapshot_serialization.py lab/verify_blocked_flag.py && git commit -m "feat: dashboard payload carries technique, port, blocked, response, server_info"`

### Task 2: Frontend shell (theme, App state, TopBar, banner, KPIs, attackInfo)

**Files (all under `dashboard/web/src/`):**
- Rewrite: `theme.css`, `App.jsx`
- Create: `attackInfo.js`, `components/TopBar.jsx`, `components/StatusBanner.jsx`, `components/KpiCards.jsx`
- Delete at end of Task 5 if unused: `KpiRow`, `AlertTable`, `SeverityPie`, `AttackBarChart`, `MitreHeatmap`, `Choropleth`, `ThroughputChart`

**Interfaces:**
- `attackInfo.js` exports `ATTACK_INFO: {[attack]: {desc: string, tactic: string}}` (plain-English line + MITRE tactic column for all 13 `MITRE_ATTACK_MAP` keys plus Honeypot, WebShell, CSRF, PathTraversal, Session Hijacking, Exfiltration), `COUNTERMEASURES: {[attack]: string[]}` (mirror of `config.RESPONSE_MATRIX`), `SEV_ORDER = ['CRITICAL','HIGH','MEDIUM','LOW','INFO']`, `TACTIC_COLUMNS = ['Discovery','Initial Access','Execution','Persistence','Exfiltration','Impact']`.
- `App.jsx` derives once from `monitor.events_list` and passes down: `attackers: [{ip, count, types:Set, firstTs, lastTs, blocked, lastSeverity}]` (sorted by `lastTs` desc), `blockedIps: Set`, `techniqueHits: {[techId]: {count, severity}}`, `lastThreat` (newest MEDIUM+ event or null), `underAttack = lastThreat && Date.now()/1000 - lastThreat.ts < 4.5` (re-evaluated by a 500 ms `setInterval` tick).

- [ ] **Step 1:** Write `attackInfo.js` (static tables; descriptions one plain sentence each, e.g. PortScan → "Probing many ports to find open services.").
- [ ] **Step 2:** Rewrite `theme.css`: CSS variables (navy `#0d1424` bg, `#16203a` card, 1px `#2a3860` border, severity colours reused from current file), classes `.topbar .tabs .tab.active .badge .banner.secure .banner.attack(pulse keyframes) .kpis .kpi .card .chip .sev-CRITICAL…`. Min font 15 px body, 22+ px banner/KPI numbers.
- [ ] **Step 3:** Write `TopBar` (logo, 3 tab buttons calling `setTab`, badge `enforcement: ON|OFF · server <ip>` from `server_info`), `StatusBanner` (green "SECURE — monitoring" / red pulsing "UNDER ATTACK — {attack} from {ip} · MITRE {technique}" / amber "last threat handled" when `lastThreat` exists but not `underAttack`), `KpiCards` (attacks = `total_attacks`, attackers blocked = `blockedIps.size`, flows/sec = `current_fps`, highest severity from `SEV_ORDER`; inline-SVG sparkline from `throughput_fps` on flows/sec card only).
- [ ] **Step 4:** Rewrite `App.jsx`: socket as today (keep `Reconnecting…` banner), `tab` state (`'live'|'details'|'mitre'`), derived state per Interfaces, render TopBar + StatusBanner + KpiCards + active page (pages stubbed as `<div>` for now).
- [ ] **Step 5:** `cd dashboard/web && npm run build && npm run lint` → clean.
- [ ] **Step 6:** Start `python lab/run_dashboard_dev.py`, open `http://localhost:5000`, confirm tabs switch, banner flips red on an event then relaxes.
- [ ] **Step 7: Commit** — `git add dashboard/web && git commit -m "feat(dashboard): three-page shell, banner, KPIs, attackInfo tables"`

### Task 3: Page 1 — Live Attack Map

**Files:** Create `pages/LivePage.jsx`, `components/AttackDiagram.jsx`, `components/FeedCards.jsx`; extend `theme.css`.

**Interfaces:** `LivePage({attackers, events, serverInfo})`; `AttackDiagram({attackers, events})`; `FeedCards({events})` takes `events.slice(0,4)`.

- [ ] **Step 1:** `AttackDiagram`: SVG viewBox 900×420. Server node right (label `server_ip` or "Protected server"). Up to 6 attacker nodes left (`attackers.slice(0,6)`, evenly spaced), label = IP only. Dashed line per node; for each event with `ts` < 3 s old render an animated `<circle>` along the line (`<animateMotion>`), coloured by severity. Blocked attacker: line stroke removed/greyed, node greyed, "✕ BLOCKED" text. Empty state: only the server node + "Waiting for detections…".
- [ ] **Step 2:** `FeedCards`: newest 4 events: attack name, severity chip, `src_ip → :dst_port`, MITRE chip (`technique` or "unmapped"), `ATTACK_INFO[attack].desc`, response line (`response.join(' → ')`), BLOCKED stamp when `blocked`. Key by `ts+src_ip+attack`.
- [ ] **Step 3:** `LivePage` lays out diagram (left, ~65%) + feed (right). Wire into `App.jsx`.
- [ ] **Step 4:** build + lint clean; run dev runner (Task 5 adds richer synthetic data — until then use current events) and eyeball.
- [ ] **Step 5: Commit** — `feat(dashboard): live attack map page`

### Task 4: Pages 2 & 3 — Attack Details, MITRE & Response

**Files:** Create `pages/DetailsPage.jsx`, `components/AttackerCards.jsx`, `components/AttackTable.jsx`, `components/IncidentDrawer.jsx`, `pages/MitrePage.jsx`, `components/MitreMatrix.jsx`, `components/CountermeasureTable.jsx`.

- [ ] **Step 1:** `AttackerCards`: one card per `attackers` entry — IP, count, attack types, first seen (`new Date(firstTs*1000)`), ACTIVE/BLOCKED chip.
- [ ] **Step 2:** `AttackTable`: columns time, attack, IP, port, confidence, severity chip, response, status (BLOCKED/ACTIVE). Text search box (matches attack/IP) + severity filter `<select>` over `SEV_ORDER`. Row click → `setSelected(event)`.
- [ ] **Step 3:** `IncidentDrawer` (fixed right panel, closes on ✕ or Esc): what happened (`ATTACK_INFO.desc`), MITRE `tactic → technique · technique_name`, attacker profile (`actor_class`, `sophistication`), response list.
- [ ] **Step 4:** Bottom of Details: attack-type counts as simple CSS bars from `monitor.attack_counts`. World map: render existing `WorldMap` only if `figures.world_map` has traces; otherwise a one-line note "All attackers are private-network hosts — no geolocation".
- [ ] **Step 5:** `MitreMatrix`: `TACTIC_COLUMNS`; for each column list techniques derived from `MITRE_ATTACK_MAP`-equivalent table in `attackInfo.js` (add `TECHNIQUES: [{id,name,tactic,attack}]` there); a technique with `techniqueHits[id]` is filled in its severity colour with the count; unmapped events are excluded. `CountermeasureTable`: attack, MITRE ID, `COUNTERMEASURES[attack].join(' → ')`, severity, live seen count from `attack_counts`.
- [ ] **Step 6:** Wire both pages into `App.jsx`; build + lint clean.
- [ ] **Step 7: Commit** — `feat(dashboard): attack details and MITRE response pages`

### Task 5: Dev data, cleanup, end-to-end verification

**Files:** Modify `lab/run_dashboard_dev.py`; delete unused components; modify `docs/DEMO_RUNBOOK.md`.

- [ ] **Step 1:** Extend `run_dashboard_dev.py` samples with private LAN IPs (`192.168.43.21`, `192.168.43.22`), `dst_port`, `mitre_technique`, `mitre_technique_name`, `blocked`, `response`, and pass `info={"enforce": False, "server_ip": "192.168.43.10"}` to `start_dashboard_server`.
- [ ] **Step 2:** Delete components no longer imported (`grep -r` each name first), rebuild, `npm run lint` clean.
- [ ] **Step 3:** Run dev runner; walk all three pages: banner red→amber→green cycle, packets animate, blocked node greys, drawer opens, matrix lights, countermeasure counts increment.
- [ ] **Step 4:** Run replay: `.\venv\Scripts\python.exe sentinel.py live --pcap pcap\sentinel_20260825_102545_52170578.pcap --replay-speed 4`; confirm SQLi → XSS → PathTraversal → WebShell → Phishing → PortScan appear correctly on page 1 and in the table with MITRE chips.
- [ ] **Step 5:** Regression: `python sentinel.py health` and all `lab/verify_*.py` PASS.
- [ ] **Step 6:** Update `docs/DEMO_RUNBOOK.md` Phase 0 step 4 to describe the three tabs and what to point at; note the enforcement badge.
- [ ] **Step 7: Commit** — `feat(dashboard): dev data, cleanup, runbook for three-page UI`

### Task 6: Rehearsal (do not skip)

- [ ] Resolve the Windows Firewall question (Private/Public profiles OFF → `preflight.py --enforce-blocks` fails): either enable profiles and keep `--enforce-blocks`, or run without it and say so (the badge will read OFF).
- [ ] Full live run with both laptops per `docs/DEMO_RUNBOOK.md`, core ⭐ path, with the dashboard on the real display.
- [ ] Fallback check: replay command above works offline.
