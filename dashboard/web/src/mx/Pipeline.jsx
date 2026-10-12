import { useEffect, useRef, useState } from 'react'
import { infoFor } from '../attackInfo.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const IDLE = ['', '', '']          // state of stage 1..3: '' | 'pass' | 'fire' | 'skip'

// Which stages a detection passed before the layer that caught it fired.
const script = (e) => {
  const label = infoFor(e.attack).label
  switch (e.detected_by) {
    case 'Anomaly':
      return { stages: ['pass', 'pass', 'fire'], verdict: `${label} — caught ONLY by the anomaly layer`, bad: true }
    case 'Signature':
      return { stages: ['pass', 'fire', ''], verdict: `${label} — caught by a known signature`, bad: true }
    case 'Rule':
      return { stages: ['pass', 'fire', ''], verdict: `${label} — caught by a behaviour rule`, bad: true }
    case 'Honeypot':
      return { stages: ['skip', 'skip', 'skip'], verdict: `${label} — touched a decoy service (100% malicious)`, bad: true }
    default:
      return { stages: ['fire', '', ''], verdict: `${label} — caught by the ML model`, bad: true }
  }
}

const CLEAN = { stages: ['pass', 'pass', 'pass'], verdict: 'Normal traffic — all layers clear', bad: false }

// Animated pipeline driven by real detections: every new event travels through
// the layers and stops at the one that caught it. When nothing is being caught,
// clean flows being checked (anomaly.total growing) pass through green.
export default function Pipeline({ events, anomaly }) {
  const [stages, setStages] = useState(IDLE)
  const [flow, setFlow] = useState('—')
  const [verdict, setVerdict] = useState({ text: 'Watching traffic…', bad: false })
  const [tok, setTok] = useState(0)                  // 0 = flow box, 1..3 = stages
  const queue = useRef([])
  const lastId = useRef(null)
  const lastTotal = useRef(null)
  const total = anomaly?.total ?? 0
  const totalRef = useRef(total)
  totalRef.current = total

  useEffect(() => {
    if (lastId.current === null) { lastId.current = events.length ? events[0].id : 0; return }
    const fresh = events.filter((e) => e.id > lastId.current)
    if (!fresh.length) return
    lastId.current = events[0].id
    queue.current.push(...fresh.reverse())            // oldest first
    if (queue.current.length > 6) queue.current = queue.current.slice(-6)   // a flood: show the latest
  }, [events])

  useEffect(() => {
    let alive = true
    ;(async () => {
      while (alive) {
        let job = queue.current.shift()
        let name
        let plan
        if (job) {
          plan = script(job)
          name = `${job.src_ip}${job.dst_port ? ` → :${job.dst_port}` : ''}`
        } else if (lastTotal.current !== null && totalRef.current > lastTotal.current) {
          plan = CLEAN
          name = 'Normal flow'
        } else {
          lastTotal.current = totalRef.current
          await sleep(300)
          continue
        }
        lastTotal.current = totalRef.current
        setStages(IDLE); setTok(0); setFlow(name); setVerdict({ text: '…', bad: false })
        await sleep(450)
        const shown = [...IDLE]
        if (plan.stages[0] === 'skip') {
          // Honeypot: caught at the decoy service before any layer runs, so the
          // token must not travel through the stages.
          setStages(['skip', 'skip', 'skip'])
          await sleep(500)
        }
        for (let k = 0; k < 3 && alive && plan.stages[0] !== 'skip'; k += 1) {
          if (!plan.stages[k]) break
          setTok(k + 1)
          await sleep(560)
          shown[k] = plan.stages[k]
          setStages([...shown])
          if (plan.stages[k] === 'fire') break
        }
        setVerdict({ text: plan.verdict, bad: plan.bad })
        await sleep(job ? 2200 : 1400)
      }
    })()
    return () => { alive = false }
  }, [])

  const box = (i, title, sub) => (
    <div className={`pl-box ${stages[i - 1]}`} key={i}>
      <h4>{title}</h4><small>{sub}</small>
      {stages[i - 1] === 'pass' && <span className="pl-tag ok">✓ clear</span>}
      {stages[i - 1] === 'fire' && <span className="pl-tag bad">⚠ caught here</span>}
      {stages[i - 1] === 'skip' && <span className="pl-tag dim">bypassed</span>}
    </div>
  )
  return (
    <div>
      <div className="pl-row">
        <div className={`pl-box start ${tok === 0 ? 'on' : ''}`}><h4>Incoming flow</h4><small>{flow}</small></div>
        <span className="pl-arrow">→</span>
        {box(1, '① ML model', 'trained on known attacks')}
        <span className="pl-arrow">→</span>
        {box(2, '② Signatures & rules', 'known patterns, behaviours')}
        <span className="pl-arrow">→</span>
        {box(3, '③ Anomaly detector', 'never-seen-before')}
      </div>
      <div className={`pl-token t${tok}`} />
      <div className="pl-verdict" style={{ color: verdict.bad ? '#ea5a4f' : '#9ccf8f' }}>{verdict.text}</div>
    </div>
  )
}
