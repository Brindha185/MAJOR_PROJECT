// Server-render every new component with sample events to catch runtime errors
// (no browser needed). Run from dashboard/web: node <this file>
import { createServer } from 'vite'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const mk = (id, attack, ip, sev, blocked, age = 1) => ({
  id, time: '12:00:0' + (id % 10), attack, src_ip: ip, confidence: '94.0%', severity: sev,
  tactic: 'x', risk: '55.0', action: 'ip_block, alert', actor_class: 'ScriptKiddie', sophistication: 30,
  age_s: age, technique: id % 2 ? 'T1190' : 'T0000', dst_port: 80, blocked, actions: ['ip_block', 'alert_high'],
})
const events = [
  mk(5, 'SQLInjection', '192.168.43.21', 'MEDIUM', false, 1),
  mk(4, 'DDoS', '192.168.43.22', 'HIGH', true, 3),
  mk(3, 'Honeypot', '192.168.43.21', 'CRITICAL', true, 9),
  mk(2, 'MysteryAttack', '192.168.43.23', 'LOW', false, 30),
  mk(1, 'PortScan', '192.168.43.23', 'LOW', false, 60),
]
const attackers = [
  { ip: '192.168.43.21', count: 2, types: ['SQLInjection', 'Honeypot'], blocked: true, severity: 'MEDIUM', lastAge: 1, firstTime: '12:00:03', actorClass: 'ScriptKiddie' },
  { ip: '192.168.43.22', count: 1, types: ['DDoS'], blocked: true, severity: 'HIGH', lastAge: 3, firstTime: '12:00:04', actorClass: 'ScriptKiddie' },
  { ip: '192.168.43.23', count: 2, types: ['MysteryAttack', 'PortScan'], blocked: false, severity: 'LOW', lastAge: 30, firstTime: '12:00:01', actorClass: 'ScriptKiddie' },
]
const counts = { SQLInjection: 1, DDoS: 1, Honeypot: 1, MysteryAttack: 1, PortScan: 1 }
const monitor = { current_fps: 1200, total_attacks: 5 }
const load = (p) => server.ssrLoadModule(p)
let fails = 0
const t = (name, fn) => { try { const out = fn(); console.log('OK  ', name, `(${out.length} chars)`) } catch (e) { fails++; console.log('FAIL', name, e.message) } }

const shell = await load('/src/mx/Shell.jsx')
const feed = (await load('/src/mx/FeedCards.jsx')).default
const dia = (await load('/src/mx/AttackDiagram.jsx')).default
const det = (await load('/src/mx/DetailsPage.jsx')).default
const mit = (await load('/src/mx/MitrePage.jsx')).default
const app = (await load('/src/App.jsx')).default

t('TopBar live', () => renderToString(h(shell.TopBar, { page: 'live', setPage() {}, info: { enforce: false, server_ip: '1.2.3.4', mode: 'replay' } })))
t('TopBar no info', () => renderToString(h(shell.TopBar, { page: 'live', setPage() {}, info: undefined })))
t('Banner attack', () => renderToString(h(shell.StatusBanner, { latest: { ...events[0], label: 'SQL Injection' }, underAttack: true, enforce: false })))
t('Banner safe empty', () => renderToString(h(shell.StatusBanner, { latest: null, underAttack: false, enforce: false })))
t('Kpis', () => renderToString(h(shell.KpiCards, { monitor, blockedCount: 2, topSeverity: 'HIGH' })))
t('Kpis empty', () => renderToString(h(shell.KpiCards, { monitor: null, blockedCount: 0, topSeverity: '' })))
t('Feed', () => renderToString(h(feed, { events })))
t('Feed empty', () => renderToString(h(feed, { events: [] })))
t('Diagram', () => renderToString(h(dia, { attackers, events })))
t('Diagram empty', () => renderToString(h(dia, { attackers: [], events: [] })))
t('Diagram 6 attackers (cap)', () => renderToString(h(dia, { attackers: Array.from({ length: 6 }, (_, i) => ({ ...attackers[0], ip: '10.0.0.' + i })), events })))
t('Details', () => renderToString(h(det, { events, attackers, attackCounts: counts })))
t('Details empty', () => renderToString(h(det, { events: [], attackers: [], attackCounts: undefined })))
t('Mitre', () => renderToString(h(mit, { events, attackCounts: counts })))
t('Mitre empty', () => renderToString(h(mit, { events: [], attackCounts: undefined })))
t('App (no data)', () => renderToString(h(app)))
await server.close()
console.log(fails ? `${fails} FAILED` : 'ALL OK')
process.exit(fails ? 1 : 0)
