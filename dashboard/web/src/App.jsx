import './modern.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { infoFor } from './attackInfo.js'
import { KpiCards, StatusBanner, TopBar, topSeverityOf } from './mx/Shell.jsx'
import AttackDiagram from './mx/AttackDiagram.jsx'
import FeedCards from './mx/FeedCards.jsx'
import DetailsPage from './mx/DetailsPage.jsx'
import MitrePage from './mx/MitrePage.jsx'
import AnomalyPage from './mx/AnomalyPage.jsx'

// A detection within this many seconds keeps the banner in UNDER ATTACK.
const ATTACK_WINDOW_S = 8

// One entry per distinct source IP, most recently active first.
function groupAttackers(events) {
  const map = new Map()
  for (const e of events) {                       // events arrive newest first
    let a = map.get(e.src_ip)
    if (!a) {
      a = { ip: e.src_ip, count: 0, types: [], blocked: false, severity: e.severity,
        lastAge: e.age_s, firstTime: e.time, actorClass: e.actor_class }
      map.set(e.src_ip, a)
    }
    a.count += e.count || 1
    if (!a.types.includes(e.attack)) a.types.push(e.attack)
    a.blocked = a.blocked || e.blocked
    a.firstTime = e.time                          // ends as the oldest event's time
  }
  return [...map.values()]
}

export default function App() {
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState(null)
  // Tab is kept in the URL hash (#live, #details, #anomaly, #mitre) so a tab can be linked/reloaded.
  const [page, setPageState] = useState(() => {
    const h = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '')
    return ['live', 'details', 'anomaly', 'mitre'].includes(h) ? h : 'live'
  })
  const setPage = (p) => { window.location.hash = p; setPageState(p) }
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const socket = io()
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('dashboard_update', (payload) => setData(payload))
    return () => socket.disconnect()
  }, [])

  const monitor = data?.monitor ?? null
  const events = useMemo(() => monitor?.events_list ?? [], [monitor])
  const attackers = useMemo(() => groupAttackers(events), [events])
  const info = data?.server_info

  const latest = events.length ? { ...events[0], label: infoFor(events[0].attack).label } : null
  const underAttack = !!latest && latest.age_s < ATTACK_WINDOW_S && latest.severity !== 'INFO'
  const blockedCount = attackers.filter((a) => a.blocked).length
  const topSeverity = events.length ? topSeverityOf(events) : ''

  // Red screen-edge glow whenever a new detection lands (not on first load).
  const seenId = useRef(null)
  const latestId = latest?.id
  useEffect(() => {
    if (latestId === undefined) return undefined
    if (seenId.current === null) { seenId.current = latestId; return undefined }
    if (latestId === seenId.current) return undefined
    seenId.current = latestId
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 1100)
    return () => clearTimeout(t)
  }, [latestId])

  return (
    <>
      <div className={`vig ${flash ? 'on' : ''}`} />
      <TopBar page={page} setPage={setPage} info={info} />
      <div className="wrap">
        {!connected && <div className="reconnect">Reconnecting to dashboard server…</div>}
        <StatusBanner latest={latest} underAttack={underAttack} enforce={!!info?.enforce} />
        {page !== 'anomaly' && <KpiCards monitor={monitor} blockedCount={blockedCount} topSeverity={topSeverity} />}

        <div className={`page ${page === 'live' ? 'on' : ''}`}>
          <div className="hero">
            <div className="panel"><h3>Server Map</h3>
              <AttackDiagram attackers={attackers} events={events} underAttack={underAttack} /></div>
            <div className="panel"><h3>Live attack feed</h3><FeedCards events={events} /></div>
          </div>
        </div>
        <div className={`page ${page === 'details' ? 'on' : ''}`}>
          <DetailsPage events={events} attackers={attackers} attackCounts={monitor?.attack_counts} />
        </div>
        <div className={`page ${page === 'anomaly' ? 'on' : ''}`}>
          <AnomalyPage events={events} anomaly={monitor?.anomaly} />
        </div>
        <div className={`page ${page === 'mitre' ? 'on' : ''}`}>
          <MitrePage events={events} attackCounts={monitor?.attack_counts} />
        </div>
      </div>
    </>
  )
}
