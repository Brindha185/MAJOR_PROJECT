import { useEffect, useRef } from 'react'
import { SEV_COLOR, THEME } from '../attackInfo.js'
import { LaptopGlyph, ServerGlyph } from './Icons.jsx'

const NS = 'http://www.w3.org/2000/svg'
const W = 1000
const H = 560
const MAX_NODES = 4
const NODE_X = 150
const SERVER = { x: 850, y: 280 }
const LINE_FROM = NODE_X + 74   // where a packet leaves a laptop
const LINE_TO = SERVER.x - 82   // where it lands on the rack

const slotsFor = (n) => {
  if (n <= 1) return [SERVER.y]
  const top = 115
  const bot = 445
  return Array.from({ length: n }, (_, i) => top + (i * (bot - top)) / (n - 1))
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2)

function mk(parent, tag, attrs) {
  const el = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
  parent.appendChild(el)
  return el
}

const quad = (p0, c, p1, u) => {
  const a = (1 - u) * (1 - u)
  const b = 2 * (1 - u) * u
  const d = u * u
  return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]
}

// Expanding ring via the Web Animations API (compositor-driven, no layout).
function ring(fx, cx, cy, r, color, { delay = 0, scale = 2.4, duration = 1000, width = 2.5 } = {}) {
  const c = mk(fx, 'circle', { cx, cy, r, fill: 'none', stroke: color, 'stroke-width': width })
  c.style.transformBox = 'fill-box'
  c.style.transformOrigin = 'center'
  const a = c.animate(
    [{ transform: 'scale(1)', opacity: 0.85 }, { transform: `scale(${scale})`, opacity: 0 }],
    { duration, delay, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'both' },
  )
  a.onfinish = () => c.remove()
}

// One frame-by-frame animation loop per burst: crisp comet trails (no blur
// filter) travelling a curved path with ease-in-out, ripples on arrival.
function flyPackets(fx, srv, y, color) {
  const p0 = [LINE_FROM, y]
  const p1 = [LINE_TO, SERVER.y]
  const c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + (y < SERVER.y ? -90 : y > SERVER.y ? 90 : -70)]
  const COUNT = 7
  const STAGGER = 0.13
  const DUR = 0.85
  const TRAIL = 4
  const packets = Array.from({ length: COUNT }, () => ({
    dots: Array.from({ length: TRAIL }, (_, j) =>
      mk(fx, 'circle', { r: 7 - j * 1.4, fill: color, opacity: 0, cx: p0[0], cy: p0[1] })),
    hit: false,
  }))
  const start = performance.now()
  const frame = (now) => {
    const t = (now - start) / 1000
    let live = false
    packets.forEach((pk, i) => {
      const local = t - i * STAGGER
      pk.dots.forEach((dot, j) => {
        const u = clamp01((local - j * 0.032) / DUR)
        if (local - j * 0.032 <= 0 || u >= 1) { dot.setAttribute('opacity', 0); return }
        const [x, yy] = quad(p0, c, p1, easeInOut(u))
        dot.setAttribute('cx', x.toFixed(1))
        dot.setAttribute('cy', yy.toFixed(1))
        dot.setAttribute('opacity', (1 - j * 0.24).toFixed(2))
      })
      if (local < DUR + TRAIL * 0.032) live = true
      if (!pk.hit && local >= DUR) {
        pk.hit = true
        if (i % 3 === 0) {
          ring(fx, SERVER.x, SERVER.y, 58, color, { scale: 2.2, duration: 900 })
          ring(fx, SERVER.x, SERVER.y, 58, color, { scale: 2.2, duration: 900, delay: 160 })
          srv?.animate?.(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
              { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
            { duration: 320, easing: 'ease-out' },
          )
        }
      }
    })
    if (live) requestAnimationFrame(frame)
    else packets.forEach((pk) => pk.dots.forEach((d) => d.remove()))
  }
  requestAnimationFrame(frame)
}

// Shield flies server → attacker, lands with a shockwave, then the ✕ stamp shows.
function shieldStrike(fx, y) {
  const outer = mk(fx, 'g', { transform: `translate(${SERVER.x - 120},${SERVER.y})` })
  const inner = mk(outer, 'g', {})
  inner.style.transformOrigin = '0 0'
  const glyph = document.createElementNS(NS, 'path')
  glyph.setAttribute('d', 'M0 -26L22 -17V2C22 15 12 24 0 29C-12 24 -22 15 -22 2V-17Z')
  glyph.setAttribute('fill', THEME.ok)
  glyph.setAttribute('stroke', '#1a1511')
  glyph.setAttribute('stroke-width', '3')
  inner.appendChild(glyph)
  const tick = document.createElementNS(NS, 'path')
  tick.setAttribute('d', 'M-9 1l6 7 12-14')
  tick.setAttribute('fill', 'none')
  tick.setAttribute('stroke', '#1a1511')
  tick.setAttribute('stroke-width', '4.5')
  tick.setAttribute('stroke-linecap', 'round')
  inner.appendChild(tick)
  const dx = NODE_X + 70 - (SERVER.x - 120)
  const dy = y - SERVER.y
  const a = inner.animate(
    [
      { transform: 'translate(0,0) scale(.4)', opacity: 0 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5}px) scale(1.25)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(1.5)`, opacity: 1 },
    ],
    { duration: 700, easing: 'cubic-bezier(.35,0,.2,1)', fill: 'forwards' },
  )
  a.onfinish = () => {
    ring(fx, NODE_X, y, 46, THEME.ok, { scale: 2.6, duration: 700, width: 4 })
    const flash = mk(fx, 'line', { x1: LINE_FROM, y1: y, x2: LINE_TO, y2: SERVER.y, stroke: '#fff', 'stroke-width': 3 })
    flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 420, fill: 'forwards' }).onfinish = () => flash.remove()
    inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => outer.remove()
  }
}

export default function AttackDiagram({ attackers, events, underAttack }) {
  const svgRef = useRef(null)
  const fxRef = useRef(null)
  const srvRef = useRef(null)
  const order = useRef([])
  const lastId = useRef(null)
  const shielded = useRef(new Set())
  const posRef = useRef({})

  // Stable first-seen node order, capped at the MAX_NODES most recent attackers.
  const recent = attackers.slice(0, MAX_NODES)
  const recentSet = new Set(recent.map((a) => a.ip))
  recent.slice().reverse().forEach((a) => {
    if (!order.current.includes(a.ip)) order.current.push(a.ip)
  })
  order.current = order.current.filter((ip) => recentSet.has(ip))
  const nodes = order.current
  const ys = slotsFor(nodes.length)
  const pos = {}
  nodes.forEach((ip, i) => { pos[ip] = ys[i] })
  posRef.current = pos
  const byIp = Object.fromEntries(attackers.map((a) => [a.ip, a]))

  // Animate only events that arrived since the last payload; one burst per
  // attacker per update so a flood stays readable.
  useEffect(() => {
    if (lastId.current === null) {
      lastId.current = events.length ? events[0].id : 0
      return
    }
    const fresh = events.filter((e) => e.id > lastId.current)
    if (!fresh.length) return
    lastId.current = events[0].id
    const done = new Set()
    fresh.slice().reverse().forEach((e) => {
      const y = posRef.current[e.src_ip]
      if (y == null || !fxRef.current) return
      const col = SEV_COLOR[e.severity] || THEME.accent
      if (!done.has(e.src_ip)) {
        done.add(e.src_ip)
        flyPackets(fxRef.current, srvRef.current, y, col)
        ring(fxRef.current, NODE_X, y, 46, col, { scale: 1.9, duration: 900 })
        ring(fxRef.current, NODE_X, y, 46, col, { scale: 1.9, duration: 900, delay: 220 })
        const node = svgRef.current?.querySelector(`[data-ip="${e.src_ip}"] .icon`)
        node?.animate?.(
          [{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
          { duration: 480, easing: 'cubic-bezier(.2,1.4,.4,1)' },
        )
      }
      if (e.blocked && !shielded.current.has(e.src_ip)) {
        shielded.current.add(e.src_ip)
        setTimeout(() => fxRef.current && shieldStrike(fxRef.current, y), 1000)
      }
    })
  }, [events])

  return (
    <svg ref={svgRef} id="dia" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="beam" x1="0" x2="1">
          <stop offset="0" stopColor={THEME.accent} stopOpacity="0" />
          <stop offset="1" stopColor={THEME.accent} stopOpacity=".28" />
        </linearGradient>
      </defs>
      <g className="scan">
        <path d={`M${SERVER.x},${SERVER.y} L${SERVER.x},${SERVER.y - 230} A230,230 0 0 1 ${SERVER.x + 200},${SERVER.y - 114} Z`} fill="url(#beam)" />
      </g>

      {nodes.map((ip) => {
        const a = byIp[ip] || {}
        const y = pos[ip]
        const active = (a.lastAge ?? 99) < 10
        const col = SEV_COLOR[a.severity] || THEME.accent
        const stroke = a.blocked ? '#6b5a48' : active ? col : THEME.accent
        const cls = `node ${a.blocked ? 'blocked' : active ? 'active' : 'idle'}`
        return (
          <g key={ip} className={cls} data-ip={ip}>
            <line x1={LINE_FROM} y1={y} x2={LINE_TO} y2={SERVER.y}
              stroke={a.blocked ? '#3a2f26' : active ? col : THEME.lineIdle} strokeWidth="2.5"
              strokeDasharray={active && !a.blocked ? '0' : '8 8'} strokeLinecap="round" />
            <g transform={`translate(${NODE_X},${y})`}>
              <g className="icon"><LaptopGlyph stroke={stroke} active={active && !a.blocked} banned={a.blocked} /></g>
            </g>
            <text x={NODE_X} y={y + 66} textAnchor="middle" className="ip-label">{ip}</text>
            {a.blocked && (
              <text x={NODE_X} y={y - 52} textAnchor="middle" className="blocked-label">BLOCKED</text>
            )}
          </g>
        )
      })}

      <circle cx={SERVER.x} cy={SERVER.y} r="92" fill="none" stroke={THEME.accent} strokeOpacity=".22" strokeWidth="2">
        <animate attributeName="r" values="92;112;92" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values=".3;.05;.3" dur="3.4s" repeatCount="indefinite" />
      </circle>
      {/* Position lives on the outer <g>; the shake animates the inner one. A CSS
          transform replaces (not adds to) a transform attribute, so animating the
          positioned group itself threw the rack to the SVG origin mid-shake. */}
      <g transform={`translate(${SERVER.x},${SERVER.y})`}>
        <g ref={srvRef}><ServerGlyph alert={underAttack} /></g>
      </g>
      <text x={SERVER.x} y={SERVER.y + 124} textAnchor="middle" className="srv-label">SERVER</text>
      {!nodes.length && (
        <text x="430" y="285" textAnchor="middle" className="ip-label" style={{ fontSize: 18 }}>
          Waiting for connected devices…
        </text>
      )}
      <g ref={fxRef} />
    </svg>
  )
}

