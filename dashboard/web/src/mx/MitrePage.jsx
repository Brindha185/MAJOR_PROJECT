import { ATTACK_INFO, SEV_COLOR, TACTICS } from '../attackInfo.js'

// Highest severity currently seen per attack, for colouring lit-up techniques.
const sevByAttack = (events) => {
  const m = {}
  events.forEach((e) => { if (!m[e.attack]) m[e.attack] = e.severity })
  return m
}

export default function MitrePage({ events, attackCounts }) {
  const counts = attackCounts || {}
  const sev = sevByAttack(events)
  const entries = Object.entries(ATTACK_INFO).filter(([k]) => k !== 'ATTACK')
  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>MITRE ATT&amp;CK coverage — techniques light up as they are detected</h3>
        <div className="mtx">
          {TACTICS.map((t) => (
            <div className="col" key={t}>
              <h5>{t}</h5>
              {entries.filter(([, i]) => i.tactic === t).map(([k, i]) => {
                const n = counts[k]
                return (
                  <div className={`tech ${n ? 'hit' : ''}`} key={k}
                    style={n ? { '--c': SEV_COLOR[sev[k]] || '#4fd1c5' } : undefined}>
                    {i.label}{n ? ` ×${n}` : ''}
                    <small>{i.tech || 'unmapped'}</small>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h3>Countermeasures — what SENTINEL does for each attack</h3>
        <table>
          <thead><tr><th>Attack</th><th>MITRE</th><th>Automatic response</th><th>Seen</th></tr></thead>
          <tbody>
            {entries.map(([k, i]) => (
              <tr key={k}>
                <td><b>{i.label}</b></td>
                <td className="mono">{i.tech || '—'}</td>
                <td style={{ color: '#c9d3e6' }}>{i.rsp.join(' → ')}</td>
                <td className="mono">{counts[k] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
