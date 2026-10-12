import { useEffect, useRef } from 'react'
import { SEV_COLOR } from '../attackInfo.js'

const NS = 'http://www.w3.org/2000/svg'
const MAX_NODES = 4
const SERVER_X = 610
const SERVER_Y = 215
const NODE_X = 97

const slotsFor = (n) => {
  if (n <= 1) return [215]
  const top = 85
  const bot = 345
  return Array.from({ length: n }, (_, i) => top + (i * (bot - top)) / (n - 1))
}

function mk(parent, tag, attrs) {
  const el = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
  parent.appendChild(el)
  return el
}

// SMIL <animate>/<set>/<animateMotion> children, built with DOM calls (no innerHTML).
const smil = (parent, tag, attrs) => mk(parent, tag, attrs)

// Comet-trail packets on a curved path from the attacker to the server,
// impact ripples + server shake on arrival.
function sendPackets(fx, srv, y, col) {
  const bend = y < 215 ? -70 : y > 215 ? 70 : -60
  const path = `M150,${y} Q340,${(y + 215) / 2 + bend} 560,215`
  for (let k = 0; k < 8; k++) {
    const g = mk(fx, 'g', { filter: 'url(#glow)' })
    const d = k * 0.24
    for (let t = 0; t < 5; t++) {
      const c = mk(g, 'circle', { r: 6 - t, cx: 0, cy: 0, fill: col, opacity: 0 })
      const b = (d + t * 0.04).toFixed(2)
      smil(c, 'set', { attributeName: 'opacity', to: (1 - t * 0.2).toFixed(2), begin: `${b}s` })
      smil(c, 'animateMotion', { path, dur: '.85s', begin: `${b}s`, fill: 'freeze', calcMode: 'spline', keyTimes: '0;1', keySplines: '.4 0 .9 .6' })
      smil(c, 'set', { attributeName: 'opacity', to: 0, begin: `${(+b + 0.85).toFixed(2)}s` })
    }
    setTimeout(() => {
      if (k % 3 === 0) {
        ripple(fx, col)
        srv?.animate?.(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' },
            { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
          { duration: 380 },
        )
      }
    }, (d + 0.85) * 1000)
    setTimeout(() => g.remove(), (d + 1.2) * 1000)
  }
}

function ripple(fx, col) {
  for (let k = 0; k < 3; k++) {
    const c = mk(fx, 'circle', { cx: SERVER_X, cy: SERVER_Y, r: 40, fill: 'none', stroke: col, 'stroke-width': 3, opacity: 0 })
    smil(c, 'animate', { attributeName: 'r', from: 40, to: 105, dur: '1.1s', begin: `${k * 0.22}s`, fill: 'freeze' })
    smil(c, 'animate', { attributeName: 'opacity', from: 0.9, to: 0, dur: '1.1s', begin: `${k * 0.22}s`, fill: 'freeze' })
    setTimeout(() => c.remove(), 1700)
  }
}

function alertRings(fx, y, col) {
  for (let k = 0; k < 3; k++) {
    const r = mk(fx, 'circle', { cx: NODE_X, cy: y, r: 34, fill: 'none', stroke: col, 'stroke-width': 2.5, opacity: 0 })
    smil(r, 'animate', { attributeName: 'r', from: 34, to: 66, dur: '1s', begin: `${k * 0.3}s`, fill: 'freeze' })
    smil(r, 'animate', { attributeName: 'opacity', from: 0.85, to: 0, dur: '1s', begin: `${k * 0.3}s`, fill: 'freeze' })
    setTimeout(() => r.remove(), 1700)
  }
}

// Shield flies from the server to the attacker, shockwave on impact.
function shieldFly(fx, y) {
  const t = mk(fx, 'text', { x: SERVER_X, y: 225, 'text-anchor': 'middle', style: 'font-size:34px', filter: 'url(#glow)' })
  t.textContent = '🛡'
  const a = t.animate(
    [
      { transform: 'translate(0,0) scale(.5)', opacity: 0 },
      { transform: `translate(-120px,${(y - 215) * 0.3}px) scale(1.3)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${NODE_X - SERVER_X}px,${y - 215}px) scale(1.5)`, opacity: 1 },
    ],
    { duration: 650, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' },
  )
  a.onfinish = () => {
    const r = mk(fx, 'circle', { cx: NODE_X, cy: y, r: 30, fill: 'none', stroke: '#3ddc97', 'stroke-width': 4 })
    smil(r, 'animate', { attributeName: 'r', from: 30, to: 75, dur: '.6s', fill: 'freeze' })
    smil(r, 'animate', { attributeName: 'opacity', from: 1, to: 0, dur: '.6s', fill: 'freeze' })
    const fl = mk(fx, 'line', { x1: 150, y1: y, x2: 560, y2: 215, stroke: '#fff', 'stroke-width': 3, opacity: 0.9 })
    fl.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, fill: 'forwards' })
    setTimeout(() => { r.remove(); fl.remove(); t.remove() }, 700)
  }
}

export default function AttackDiagram({ attackers, events }) {
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
      const col = SEV_COLOR[e.severity] || '#4fd1c5'
      if (!done.has(e.src_ip)) {
        done.add(e.src_ip)
        sendPackets(fxRef.current, srvRef.current, y, col)
        alertRings(fxRef.current, y, col)
      }
      if (e.blocked && !shielded.current.has(e.src_ip)) {
        shielded.current.add(e.src_ip)
        setTimeout(() => fxRef.current && shieldFly(fxRef.current, y), 1000)
      }
    })
  }, [events])

  return (
    <svg id="dia" viewBox="0 0 700 430">
      <defs>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="beam" x1="0" x2="1">
          <stop offset="0" stopColor="#4fd1c5" stopOpacity="0" />
          <stop offset="1" stopColor="#4fd1c5" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <g className="scan"><path d="M610,215 L610,95 A120,120 0 0 1 700,137 Z" fill="url(#beam)" /></g>

      {nodes.map((ip) => {
        const a = byIp[ip] || {}
        const y = pos[ip]
        const active = (a.lastAge ?? 99) < 10
        const col = SEV_COLOR[a.severity] || '#4fd1c5'
        const cls = `node ${a.blocked ? 'blocked' : active ? 'active' : 'idle'}`
        return (
          <g key={ip} className={cls}>
            <line x1="150" y1={y} x2="560" y2="215"
              stroke={a.blocked ? '#2a3550' : active ? col : '#33405e'} strokeWidth="2"
              strokeDasharray={active && !a.blocked ? '0' : '7 7'} />
            <rect x="55" y={y - 28} width="84" height="56" rx="9" fill="#1c2438"
              stroke={a.blocked ? '#566079' : '#4fd1c5'} strokeWidth="2" />
            <text x="97" y={y + 6} textAnchor="middle" style={{ fontSize: 26 }}>💻</text>
            <text x="97" y={y + 48} textAnchor="middle" style={{ fontSize: 12, fill: '#eaf0fa' }}>{ip}</text>
            {a.blocked && (
              <g>
                <rect x="55" y={y - 28} width="84" height="56" rx="9" fill="rgba(20,26,40,.8)" />
                <text x="97" y={y + 10} textAnchor="middle" style={{ fontSize: 30, fill: '#ff5c7a' }}>✕</text>
                <text x="97" y={y - 34} textAnchor="middle" style={{ fontSize: 11, fill: '#3ddc97', fontWeight: 700 }}>BLOCKED</text>
              </g>
            )}
          </g>
        )
      })}

      <circle cx="610" cy="215" r="58" fill="none" stroke="#4fd1c5" strokeOpacity=".25" strokeWidth="2">
        <animate attributeName="r" values="58;74;58" dur="3s" repeatCount="indefinite" />
      </circle>
      <rect ref={srvRef} x="565" y="175" width="90" height="80" rx="12" fill="#0f3a48" stroke="#4fd1c5" strokeWidth="3" />
      <text x="610" y="222" textAnchor="middle" style={{ fontSize: 34 }}>🖥</text>
      <text x="610" y="285" textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: '#eaf0fa' }}>PROTECTED SERVER</text>
      {!nodes.length && (
        <text x="300" y="215" textAnchor="middle" style={{ fontSize: 14, fill: '#8a97b0' }}>
          Waiting for attackers…
        </text>
      )}
      <g ref={fxRef} />
    </svg>
  )
}
