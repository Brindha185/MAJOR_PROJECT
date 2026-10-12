import { THEME } from '../attackInfo.js'

// Hand-drawn SVG icons (crisp at any scale, no emoji). All are drawn centred on
// (0,0) so they can be dropped into the diagram at any coordinate.

export function LaptopGlyph({ stroke = THEME.accent, active = false, banned = false }) {
  return (
    <g>
      {/* lid */}
      <rect x="-46" y="-36" width="92" height="60" rx="7" fill={THEME.panel2} stroke={stroke} strokeWidth="2.5" />
      {/* screen */}
      <rect x="-39" y="-29" width="78" height="46" rx="3" fill="#17120e" />
      <path d="M-30 -18h30M-30 -9h48M-30 0h22" stroke={active ? stroke : '#6b5a48'} strokeWidth="3" strokeLinecap="round" />
      <path d="M-30 9h8" stroke={active ? stroke : '#6b5a48'} strokeWidth="3" strokeLinecap="round" />
      {/* base */}
      <path d="M-58 28h116l-8 10h-100z" fill={THEME.panel2} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="-9" y="29.5" width="18" height="3" rx="1.5" fill={stroke} opacity=".7" />
      {banned && (
        <g>
          <circle cx="0" cy="-6" r="26" fill="rgba(26,21,17,.78)" stroke="#ea5a4f" strokeWidth="5" />
          <path d="M-18 -24L18 12" stroke="#ea5a4f" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

export function ServerGlyph({ stroke = THEME.accent, alert = false }) {
  const led = alert ? '#ea5a4f' : THEME.ok
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const y = -78 + i * 52
        return (
          <g key={i}>
            <rect x="-62" y={y} width="124" height="44" rx="8" fill={THEME.panel2} stroke={stroke} strokeWidth="2.5" />
            <path d={`M-18 ${y + 14}h60M-18 ${y + 22}h60M-18 ${y + 30}h60`} stroke="#6b5a48" strokeWidth="2" strokeLinecap="round" />
            <circle className={alert ? 'led blink' : 'led'} cx="-44" cy={y + 22} r="5" fill={led} style={{ animationDelay: `${i * 0.12}s` }} />
            <circle cx="-30" cy={y + 22} r="3" fill="#6b5a48" />
          </g>
        )
      })}
      <rect x="-36" y="80" width="72" height="8" rx="4" fill={THEME.panel2} stroke={stroke} strokeWidth="2" />
    </g>
  )
}

export function ShieldGlyph({ color = THEME.ok }) {
  return (
    <g>
      <path d="M0 -26L22 -17V2C22 15 12 24 0 29C-12 24 -22 15 -22 2V-17Z" fill={color} stroke="#1a1511" strokeWidth="3" strokeLinejoin="round" />
      <path d="M-9 1l6 7 12-14" fill="none" stroke="#1a1511" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

// Small standalone laptop for cards and lists.
export function LaptopMini({ size = 22, color = THEME.accent }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="-60 -40 120 84" style={{ verticalAlign: 'middle' }} aria-hidden="true">
      <LaptopGlyph stroke={color} active />
    </svg>
  )
}
