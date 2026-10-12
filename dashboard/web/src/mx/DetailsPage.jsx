import { useState } from 'react'
import { infoFor, responseText, techniqueOf } from '../attackInfo.js'
import { LaptopMini } from './Icons.jsx'

const Sev = ({ s }) => <span className="chip" style={{ '--c': `var(--${{ CRITICAL: 'crit', HIGH: 'high', MEDIUM: 'med', LOW: 'low', INFO: 'info' }[s] || 'info'})` }}>{s}</span>

function AttackerCards({ attackers }) {
  if (!attackers.length) return <p className="empty">No attackers seen yet.</p>
  return (
    <div className="acards">
      {attackers.map((a) => (
        <div className="acard" key={a.ip}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="ip mono"><LaptopMini size={30} />{a.ip}</span>
            {a.blocked ? <span className="chip grey">BLOCKED</span> : <span className="chip sevHIGH">ACTIVE</span>}
          </div>
          <div className="row"><span>{a.count} attacks</span><span>since {a.firstTime}</span></div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#c9d3e6' }}>{a.types.map((t) => infoFor(t).label).join(' · ')}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--dim)' }}>profile: {a.actorClass}</div>
        </div>
      ))}
    </div>
  )
}

function Drawer({ ev, onClose }) {
  const info = ev ? infoFor(ev.attack) : null
  return (
    <div className={`drawer ${ev ? 'on' : ''}`}>
      {ev && (
        <>
          <span className="x" onClick={onClose}>✕</span>
          <h2>{info.label}</h2>
          <div><Sev s={ev.severity} /> <span className="chip mt">{techniqueOf(ev) || 'unmapped'}</span></div>
          <div className="sec"><h4>What happened</h4>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              {info.desc}. Source <span className="mono">{ev.src_ip}</span>
              {ev.dst_port ? <> targeted port <span className="mono">{ev.dst_port}</span></> : null} at {ev.time}.
              Detected with {ev.confidence} confidence.
            </p></div>
          <div className="sec"><h4>MITRE ATT&amp;CK</h4>{info.tactic} → <b>{techniqueOf(ev) || '—'}</b> {info.techName}</div>
          <div className="sec"><h4>Attacker profile</h4>{ev.actor_class} · sophistication {Math.round(ev.sophistication)}/100 · risk {ev.risk}</div>
          <div className="sec"><h4>SENTINEL response</h4>
            {ev.blocked ? '✓ Source IP blocked (SENTINEL blacklist)' : '→ Not blocked'}<br />
            {responseText(ev)}
          </div>
        </>
      )}
    </div>
  )
}

export default function DetailsPage({ events, attackers, attackCounts }) {
  const [q, setQ] = useState('')
  const [sev, setSev] = useState('')
  const [selId, setSelId] = useState(null)
  const rows = events
    .filter((e) => (!sev || e.severity === sev) &&
      (!q || `${infoFor(e.attack).label} ${e.attack} ${e.src_ip}`.toLowerCase().includes(q.toLowerCase())))
    .slice(0, 150)
  const sel = events.find((e) => e.id === selId) || null
  const counts = Object.entries(attackCounts || {}).sort((a, b) => b[1] - a[1])
  const mx = Math.max(1, ...counts.map(([, v]) => v))
  return (
    <>
      <AttackerCards attackers={attackers} />
      <div className="panel">
        <h3>All detections — click a row for the incident</h3>
        <div className="tools">
          <input placeholder="Search attack, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sev} onChange={(e) => setSev(e.target.value)}>
            <option value="">All severities</option>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <table>
          <thead><tr><th>Time</th><th>Attack</th><th>Source IP</th><th>Port</th><th>Conf</th><th>Severity</th><th>Response</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr className="r" key={e.id} onClick={() => setSelId(e.id)}>
                <td className="mono">{e.time}</td>
                <td><b>{infoFor(e.attack).label}</b></td>
                <td className="mono">{e.src_ip}</td>
                <td className="mono">{e.dst_port || '—'}</td>
                <td>{e.confidence}</td>
                <td><Sev s={e.severity} /></td>
                <td style={{ color: '#c9d3e6' }}>{responseText(e)}</td>
                <td>{e.blocked ? <span className="chip" style={{ '--c': '#9ccf8f' }}>BLOCKED</span> : <span className="chip grey">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">No detections match.</p>}
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h3>Attacks by type</h3>
        {counts.map(([k, v]) => (
          <div className="bar" key={k}><span style={{ width: 150 }}>{infoFor(k).label}</span><i style={{ width: (v / mx) * 320 }} />{v}</div>
        ))}
        {!counts.length && <p className="empty">Nothing yet.</p>}
      </div>
      <Drawer ev={sel} onClose={() => setSelId(null)} />
    </>
  )
}
