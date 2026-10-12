import { infoFor, responseText, techniqueOf } from '../attackInfo.js'

// Newest 5 distinct (source, attack) pairs -- a flood would otherwise fill
// every card with the same attack.
export default function FeedCards({ events }) {
  const seen = new Set()
  const cards = []
  for (const e of events) {
    const k = `${e.src_ip}|${e.attack}`
    if (seen.has(k)) continue
    seen.add(k)
    cards.push(e)
    if (cards.length === 5) break
  }
  if (!cards.length) return <div className="feed"><p className="empty">Waiting for detections…</p></div>
  return (
    <div className="feed">
      {cards.map((e) => {
        const info = infoFor(e.attack)
        const tech = techniqueOf(e)
        return (
          <div className={`card sev${e.severity}`} key={e.id}>
            {e.blocked && <div className="stamp">BLOCKED</div>}
            <b>{info.label}</b> <span className="chip" style={{ float: 'right' }}>{e.severity}</span>
            <div className="m">
              <span className="mono">{e.src_ip}</span>{e.dst_port ? <> &nbsp;→&nbsp; port <span className="mono">{e.dst_port}</span></> : null}
              {tech && <> &nbsp;<span className="chip mt">{tech}</span></>}
            </div>
            <p>{info.desc}</p>
            <div className="m">{e.blocked ? '✓ ' : '→ '}<b style={e.blocked ? { color: '#9ccf8f' } : undefined}>{responseText(e)}</b></div>
          </div>
        )
      })}
    </div>
  )
}
