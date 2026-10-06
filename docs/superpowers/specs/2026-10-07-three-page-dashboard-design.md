# Three-Page Exhibition Dashboard — Design

**Date:** 2026-10-07 · **Status:** awaiting user review · **Mockup:** `.superpowers/brainstorm/1647-1791312199/content/three-pages.html` (approved: "good good")

## Purpose

SENTINEL's current dashboard (`dashboard/web`) is an analytics layout that reads like a report: nothing visibly changes the moment an attack lands. For the exhibition, reviewers and guides watch the screen while the presenter attacks the server from other laptops over a phone hotspot. They must instantly see **that** an attack is happening, **which laptop** it comes from, **what** it is, and **what SENTINEL did**.

**Success criteria**
- An attack launched from a laptop produces a visible reaction (banner, packets, feed card) within ~1 s of detection.
- A reviewer can name the attacking laptop (by IP), the attack, its MITRE technique, and the response without reading a log.
- Works with the existing live pipeline, the PCAP replay fallback (`sentinel.py live --pcap`), and `lab/run_dashboard_dev.py`.

**Out of scope:** reviewers attacking the system; sound; click-to-rename laptops (user chose "just show the IP"); a map of private-IP attackers (no geography exists for them); any change to detection logic.

## Shell (all pages)

Flat dark navy theme (thin 1px borders, chips), large fonts and high contrast for a projector. Top bar: logo, three tabs, and an **enforcement badge** (`enforcement: ON/OFF`, server IP). Below it on every page: a **status banner** (green "SECURE — monitoring" ↔ red pulsing "UNDER ATTACK — <attack> from <ip> · MITRE <id>", relaxing to "last threat handled" ~4.5 s after the last MEDIUM+ event) and four **KPI cards** (attacks, attackers blocked, flows/sec, highest severity) with decorative sparklines.

## Page 1 — Live Attack Map

SVG diagram (no new libraries). Left: one laptop node per distinct `src_ip` seen recently (cap 6, oldest evicted), labelled with the IP. Right: the protected server. A dashed line per attacker; packets animate along it coloured by severity. When the event is `blocked`, the line cuts, the node greys, a ✕ BLOCKED overlay appears. Beside it: a live feed of the newest 4 cards (attack, severity chip, `src_ip → :port`, MITRE chip, one-line plain-English description, response line, BLOCKED stamp when blocked).

## Page 2 — Attack Details

Per-attacker cards (attack count, attack types, first seen, ACTIVE/BLOCKED); searchable + severity-filterable table of all detections (time, attack, IP, port, confidence, severity, response, status); clicking a row opens a right-hand incident drawer (what happened, MITRE tactic → technique + name, attacker profile from `actor_class`/`sophistication`, response list). Attack-type bars at the bottom. The world map is replaced by a note when no event has a public IP, and rendered normally when one does.

## Page 3 — MITRE & Response

Tactic columns (Discovery, Initial Access, Execution, Persistence, Exfiltration, Impact), each listing the techniques SENTINEL can detect; a technique lights up in its severity colour with a hit count when seen. Beneath: a countermeasures table (attack, MITRE ID, automatic response chain, severity, live seen count) driven by `RESPONSE_MATRIX`.

## Data contract (backend changes — the only ones)

All three pages render from the existing `dashboard_update` payload; no new endpoints or sockets.

1. `dashboard/live_monitor.py` `DetectionEvent.to_row()` gains: `technique` (from `extra["mitre_technique"]`), `technique_name` (`extra["mitre_technique_name"]`), `dst_port`, `blocked` (bool), `response` (list of action strings), `ts` (epoch seconds, for age/first-seen).
2. `sentinel.py` `_run_response()` sets `event["blocked"] = True` when an `IPBlacklister.block()` call succeeds (both the severity branch and the RESPONSE_MATRIX `ip_block_*` branch) and `event["response"] = actions`. For CSRF / Session Hijacking (session invalidation, never an IP block) `blocked` stays False and `response` still lists the action.
3. `dashboard/server.py` `start_dashboard_server(..., info=None)`: optional dict `{enforce: bool, server_ip: str}` included in every payload as `server_info`. `_run_live` passes `args.enforce_blocks` and the resolved own IP.
4. Frontend-only static tables: attack → plain-English description, attack → MITRE tactic column, and the countermeasure chains (mirroring `config.RESPONSE_MATRIX`; kept in one `attackInfo.js`).

**Honesty rule:** "BLOCKED" means SENTINEL's blacklist issued the block. With `--enforce-blocks` off, or Windows Firewall profiles off, it is not enforced at OS level; the header badge states the enforcement mode so a reviewer is never misled.

## Components (`dashboard/web/src`)

`App.jsx` (tab state, socket, derived state) · `components/TopBar.jsx` · `StatusBanner.jsx` · `KpiCards.jsx` · `pages/LivePage.jsx` (`AttackDiagram.jsx`, `FeedCards.jsx`) · `pages/DetailsPage.jsx` (`AttackerCards.jsx`, `AttackTable.jsx`, `IncidentDrawer.jsx`) · `pages/MitrePage.jsx` (`MitreMatrix.jsx`, `CountermeasureTable.jsx`) · `attackInfo.js` · `theme.css` rewritten. Existing `PlotlyPanel`/charts are reused only for the optional map on page 2; `AlertTable`, `KpiRow`, `SeverityPie` etc. are removed if unused. Derived state (per-attacker groups, blocked set, MITRE hit counts) is computed once in `App.jsx` from `events_list` and passed down.

## Error handling & edge cases

- Socket disconnected → existing "Reconnecting…" banner kept.
- No events yet → SECURE banner, empty diagram with the server node, "Waiting for detections…" in the feed/tables.
- Event with `technique` empty (T0000/unmapped, e.g. generic `ATTACK`) → shown, MITRE chip reads "unmapped"; not added to the matrix.
- `events_list` is capped at 500 by `LiveMonitor`; counters on pages 2/3 therefore reflect the last 500 events, while the KPI "attacks detected" uses `total_attacks`.
- More than 6 distinct attackers → oldest node evicted from the diagram only (table/cards keep all).

## Testing

- Extend `lab/verify_dashboard_snapshot_serialization.py`: new row fields present, JSON-serialisable, `blocked`/`response` correct for a blocking attack and for CSRF.
- New `lab/verify_blocked_flag.py`: `_run_response()` sets `blocked` for HIGH/CRITICAL and for `ip_block_*` actions, not for CSRF/Session Hijacking or sub-threshold confidence.
- `npm run build` + `npm run lint` clean.
- Manual end-to-end: `lab/run_dashboard_dev.py` (synthetic) and `sentinel.py live --pcap pcap/sentinel_20260825_102545_52170578.pcap --replay-speed 4`; presenter eyeballs the three pages (no headless browser is available in this environment).
- Regression: all existing `lab/verify_*.py` and `python sentinel.py health` stay green.

## Known risks

- Pages are only manually visual-checked; a layout bug could survive until the presenter looks. Mitigation: run the replay once on the real display before the exhibition.
- `blocked` on page 1 will look real even when OS enforcement is off — mitigated only by the badge (see Honesty rule). The pending Windows Firewall decision (profiles Private/Public are OFF; `lab/preflight.py --enforce-blocks` fails on it) should be resolved before the demo.
