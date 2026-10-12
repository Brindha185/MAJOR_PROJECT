import { SEV_COLOR, SEV_ORDER } from '../attackInfo.js'

export function TopBar({ page, setPage, info }) {
  const tabs = [['live', '① Live Attack Map'], ['details', '② Attack Details'], ['mitre', '③ MITRE & Response']]
  const enforce = !!info?.enforce
  return (
    <header className="top">
      <div className="logo">SENTINEL<i> IPS</i></div>
      <nav className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>{label}</button>
        ))}
      </nav>
      <div className="badges">
        {info?.mode === 'replay' && <span className="badge">REPLAY (recorded session)</span>}
        <span className={`badge ${enforce ? '' : 'off'}`}>
          OS-level blocking: <b>{enforce ? 'ON' : 'OFF'}</b>
        </span>
        {info?.server_ip && <span className="badge">server {info.server_ip}</span>}
      </div>
    </header>
  )
}

export function StatusBanner({ latest, underAttack, enforce }) {
  if (underAttack && latest) {
    const tech = latest.technique && latest.technique !== 'T0000' ? ` · MITRE ${latest.technique}` : ''
    return (
      <div className="banner atk">
        <span>⚠ UNDER ATTACK — {latest.label} from {latest.src_ip}{tech}</span>
        <small>{latest.blocked ? 'attacker blocked' : 'responding…'}</small>
      </div>
    )
  }
  return (
    <div className="banner safe">
      <span><span className="dot" />{latest ? 'SECURE — last threat handled' : 'SECURE — monitoring'}</span>
      <small>{enforce ? 'enforcement on' : 'blocks recorded in blacklist'}</small>
    </div>
  )
}

const SPARK = [
  ['#ff5c7a', 'M0 34 C15 30 20 8 35 20 S60 36 75 14 90 6 100 10'],
  ['#3ddc97', 'M0 36 C20 34 30 24 45 22 S75 14 100 6'],
  ['#6fa8ff', 'M0 30 C15 10 30 36 45 18 S75 30 100 12'],
]

export function KpiCards({ monitor, blockedCount, topSeverity }) {
  const fps = Math.round(monitor?.current_fps ?? 0)
  const cards = [
    ['Attacks detected', (monitor?.total_attacks ?? 0).toLocaleString(), '#ff5c7a', SPARK[0]],
    ['Attackers blocked', blockedCount, '#3ddc97', SPARK[1]],
    ['Flows / sec', fps.toLocaleString(), '#6fa8ff', SPARK[2]],
    ['Highest severity', topSeverity || '—', SEV_COLOR[topSeverity] || '#8a97b0', null],
  ]
  return (
    <div className="kpis">
      {cards.map(([l, v, c, sp]) => (
        <div className="kpi" key={l} style={{ '--c': c }}>
          <div className="l">{l}</div>
          <div className="v" style={l === 'Highest severity' ? { color: c } : undefined}>{v}</div>
          {sp && (
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <path d={sp[1]} fill="none" stroke={sp[0]} strokeWidth="2" />
            </svg>
          )}
        </div>
      ))}
    </div>
  )
}

export const topSeverityOf = (events) =>
  events.reduce((m, e) => (SEV_ORDER.indexOf(e.severity) > SEV_ORDER.indexOf(m) ? e.severity : m), 'INFO')
