import Pipeline from './Pipeline.jsx'
import ScoreStrip from './ScoreStrip.jsx'
import { infoFor, responseText } from '../attackInfo.js'

const by = (events, ...kinds) => events.filter((e) => kinds.includes(e.detected_by)).length

export default function AnomalyPage({ events, anomaly }) {
  const found = events.filter((e) => e.detected_by === 'Anomaly').slice(0, 4)
  const stats = [
    ['Caught by ML model', by(events, 'ML'), 'var(--accent)'],
    ['Caught by signature / rule', by(events, 'Signature', 'Rule'), 'var(--accent)'],
    ['Caught ONLY by anomaly', by(events, 'Anomaly'), 'var(--crit)'],
    ['Flows checked', (anomaly?.total ?? 0).toLocaleString(), 'var(--ok)'],
  ]
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Detection layers — every flow is checked by all three</h3>
        <Pipeline events={events} anomaly={anomaly} />
        <div className="pl-stats">
          {stats.map(([l, v, c]) => (
            <div key={l}><small>{l}</small><b style={{ color: c }}>{v}</b></div>
          ))}
        </div>
      </div>
      <div className="an-row">
        <div className="panel">
          <h3>Live anomaly score — every network flow</h3>
          <ScoreStrip anomaly={anomaly} />
          <p className="legend">
            Above the dashed line the flow looks like traffic the model learned as normal. Below it, the flow is an
            outlier — unlike anything seen before — and is flagged as a possible zero-day.
          </p>
        </div>
        <div className="panel">
          <h3>Zero-day candidates</h3>
          {!found.length && <p className="empty">Nothing unusual yet. Flows that no signature or model recognises, but that look abnormal, appear here.</p>}
          {found.map((e) => (
            <div className={`card sev${e.severity}`} key={e.id}>
              <b>{infoFor(e.attack).label}</b> <span className="chip" style={{ float: 'right' }}>{e.severity}</span>
              <div className="m"><span className="mono">{e.src_ip}</span>{e.dst_port ? <> &nbsp;→&nbsp; port <span className="mono">{e.dst_port}</span></> : null}</div>
              <p>No signature matched and the ML model did not flag it — but this flow is unlike normal traffic.</p>
              <div className="m">→ <b>{responseText(e)}</b></div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
