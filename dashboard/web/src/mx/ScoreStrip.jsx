import { useEffect, useRef } from 'react'
import { THEME } from '../attackInfo.js'

const N = 150            // points visible on the strip
const LO = -0.3
const HI = 0.3
const RED = '#f04848'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// Live Layer 3 anomaly scores. Scores below 0 are what the IsolationForest calls
// an outlier. Data arrives in bursts every ~2 s, so new points are queued and
// released at a steady pace to keep the line scrolling smoothly.
export default function ScoreStrip({ anomaly }) {
  const canvasRef = useRef(null)
  const buf = useRef([])            // points currently on the strip: {idx, score}
  const queue = useRef([])          // received but not yet drawn
  const lastIdx = useRef(0)
  const state = useRef({ fitted: false, buffered: 0, needed: 100 })

  // Ingest new scores whenever a payload arrives.
  useEffect(() => {
    if (!anomaly) return
    state.current = { fitted: anomaly.fitted, buffered: anomaly.buffered, needed: anomaly.needed }
    const fresh = (anomaly.scores || []).filter(([i]) => i > lastIdx.current)
    if (!fresh.length) return
    lastIdx.current = fresh[fresh.length - 1][0]
    const pts = fresh.map(([idx, score]) => ({ idx, score }))
    if (buf.current.length === 0) buf.current = pts.slice(-N)       // first load: show immediately
    else queue.current.push(...pts)
    if (queue.current.length > 600) queue.current = queue.current.slice(-600)
  }, [anomaly])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    let lastRelease = performance.now()
    let interval = 100

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = (now) => {
      const W = canvas.clientWidth
      const H = canvas.clientHeight
      // Release queued points at a pace that drains the queue between payloads.
      if (queue.current.length && now - lastRelease >= interval) {
        buf.current.push(queue.current.shift())
        if (buf.current.length > N) buf.current.shift()
        lastRelease = now
        interval = clamp(1800 / Math.max(queue.current.length, 1), 12, 140)
      }
      const t = queue.current.length || now - lastRelease < interval ? clamp((now - lastRelease) / interval, 0, 1) : 1
      const dx = W / (N - 1)
      const y = (v) => H - ((clamp(v, LO, HI) - LO) / (HI - LO)) * H

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(240,72,72,.10)'
      ctx.fillRect(0, y(0), W, H - y(0))
      ctx.fillStyle = 'rgba(122,209,127,.06)'
      ctx.fillRect(0, 0, W, y(0))
      ctx.strokeStyle = 'rgba(106,86,69,.9)'
      ctx.lineWidth = 1
      for (let i = 1; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(0, (H * i) / 6); ctx.lineTo(W, (H * i) / 6); ctx.stroke()
      }
      ctx.setLineDash([10, 8])
      ctx.strokeStyle = RED
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(W, y(0)); ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '600 14px "Segoe UI", sans-serif'
      ctx.fillStyle = RED
      ctx.fillText('anomaly threshold', W - 150, y(0) - 8)
      ctx.fillStyle = THEME.ok
      ctx.fillText('normal traffic', W - 110, 22)
      ctx.fillStyle = '#ff9a9a'
      ctx.fillText('outlier zone', W - 100, H - 10)

      const pts = buf.current
      if (pts.length > 1) {
        const shift = queue.current.length ? (1 - t) * dx : 0
        const x = (k) => W - (pts.length - 1 - k) * dx - shift
        ctx.lineWidth = 3
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        for (let k = 1; k < pts.length; k++) {
          ctx.strokeStyle = pts[k].score < 0 || pts[k - 1].score < 0 ? RED : THEME.accent
          ctx.beginPath(); ctx.moveTo(x(k - 1), y(pts[k - 1].score)); ctx.lineTo(x(k), y(pts[k].score)); ctx.stroke()
        }
        const pulse = 12 + Math.sin(now / 150) * 3
        for (let k = 0; k < pts.length; k++) {
          if (pts[k].score >= 0) continue
          ctx.fillStyle = RED
          ctx.beginPath(); ctx.arc(x(k), y(pts[k].score), 6, 0, 7); ctx.fill()
          ctx.strokeStyle = 'rgba(240,72,72,.5)'
          ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(x(k), y(pts[k].score), pulse, 0, 7); ctx.stroke()
        }
      }

      const st = state.current
      if (!st.fitted) {
        ctx.fillStyle = 'rgba(26,21,17,.78)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fbf3e6'
        ctx.font = '700 22px "Segoe UI", sans-serif'
        ctx.fillText('Learning what normal traffic looks like…', W / 2, H / 2 - 18)
        ctx.font = '500 16px "Segoe UI", sans-serif'
        ctx.fillStyle = '#cdbba4'
        ctx.fillText(`${st.buffered} / ${st.needed} normal flows observed`, W / 2, H / 2 + 12)
        ctx.fillStyle = '#6a5645'
        ctx.fillRect(W / 2 - 160, H / 2 + 30, 320, 10)
        ctx.fillStyle = THEME.accent
        ctx.fillRect(W / 2 - 160, H / 2 + 30, 320 * clamp(st.buffered / st.needed, 0, 1), 10)
        ctx.textAlign = 'start'
      } else if (!pts.length) {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#cdbba4'
        ctx.font = '500 17px "Segoe UI", sans-serif'
        ctx.fillText('Waiting for traffic…', W / 2, H / 2)
        ctx.textAlign = 'start'
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className="strip" />
}
