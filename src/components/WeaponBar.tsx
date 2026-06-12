import { useState, useRef } from 'react'
import { WEAPON_MAP } from '../game/weapons'
import type { UFOState, WeaponId } from '../types/game'

interface Props {
  ufo: UFOState
  selected: WeaponId
  onSelect: (id: WeaponId) => void
  disabled: boolean
  vertical?: boolean
}

export default function WeaponBar({ ufo, selected, onSelect, disabled, vertical }: Props) {
  const [tooltip, setTooltip] = useState<WeaponId | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout>>()

  const slots = [
    { id: 'normal' as WeaponId, ammo: Infinity },
    ...ufo.weapons,
  ]

  const startLongPress = (id: WeaponId) => {
    longPressRef.current = setTimeout(() => setTooltip(id), 500)
  }
  // Only cancel the pending timer — does NOT close the tooltip once it's visible
  const cancelTimer = () => {
    clearTimeout(longPressRef.current)
  }
  // Close the tooltip (and cancel any pending timer)
  const closeTooltip = () => {
    clearTimeout(longPressRef.current)
    setTooltip(null)
  }

  if (vertical) {
    return (
      <>
        <div className="flex flex-col py-2 px-2 gap-1.5 select-none overflow-y-auto">
          {slots.map(slot => {
            const def = WEAPON_MAP[slot.id]
            const empty = slot.ammo === 0
            const active = selected === slot.id
            return (
              <button
                key={slot.id}
                onClick={() => !empty && !disabled && onSelect(slot.id)}
                onPointerDown={() => startLongPress(slot.id)}
                onPointerUp={closeTooltip}
                onPointerLeave={cancelTimer}
                className={`
                  flex items-center gap-2 w-full px-2 py-2.5 rounded border-2 transition-all
                  ${active ? 'border-neon-yellow shadow-[0_0_8px_#ffdd00]' : 'border-dark-border'}
                  ${empty || disabled ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:border-gray-500 cursor-pointer'}
                `}
              >
                <span className="text-base leading-none flex-shrink-0">{def.icon}</span>
                <span
                  className="flex-1 text-left leading-none truncate text-xs"
                  style={{ color: active ? '#ffdd00' : '#aaa' }}
                >
                  {def.label}
                </span>
                <span
                  className="leading-none flex-shrink-0 text-xs"
                  style={{ color: active ? '#ffdd00' : '#555' }}
                >
                  {slot.ammo === Infinity ? '∞' : slot.ammo}
                </span>
              </button>
            )
          })}
        </div>
        {tooltip && <WeaponTooltip id={tooltip} onClose={closeTooltip} />}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-center gap-2 py-2 bg-dark-panel border-t border-dark-border select-none">
        {slots.map(slot => {
          const def = WEAPON_MAP[slot.id]
          const empty = slot.ammo === 0
          const active = selected === slot.id
          return (
            <button
              key={slot.id}
              onClick={() => !empty && !disabled && onSelect(slot.id)}
              onPointerDown={() => startLongPress(slot.id)}
              onPointerUp={closeTooltip}
              onPointerLeave={cancelTimer}
              className={`
                flex flex-col items-center justify-center w-14 h-16 rounded border-2 transition-all gap-0.5
                ${active ? 'border-neon-yellow shadow-[0_0_10px_#ffdd00]' : 'border-dark-border'}
                ${empty || disabled ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:border-gray-500 cursor-pointer'}
              `}
            >
              <span className="text-lg leading-none">{def.icon}</span>
              <span
                className="leading-none tracking-tight"
                style={{ fontSize: '9px', color: active ? '#ffdd00' : '#aaa' }}
              >
                {def.label.slice(0, 3)}
              </span>
              <span className="leading-none" style={{ fontSize: '9px', color: active ? '#ffdd00' : '#666' }}>
                {slot.ammo === Infinity ? '∞' : slot.ammo}
              </span>
            </button>
          )
        })}
      </div>
      {tooltip && <WeaponTooltip id={tooltip} onClose={closeTooltip} />}
    </>
  )
}

function WeaponTooltip({ id, onClose }: { id: WeaponId; onClose: () => void }) {
  const def = WEAPON_MAP[id]
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerUp={onClose}
    >
      <div className="bg-dark-panel border border-dark-border rounded-lg px-6 py-5 max-w-xs mx-4 flex flex-col gap-3 pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{def.icon}</span>
          <div>
            <div className="text-white font-mono text-base">{def.label}</div>
            <div className="flex gap-3 mt-0.5">
              <span className="text-gray-500 text-xs font-mono">傷害 {def.damage > 0 ? def.damage : '—'}</span>
              <span className="text-gray-500 text-xs font-mono">彈數 {def.ammo === 0 ? '∞' : def.ammo}</span>
            </div>
          </div>
        </div>
        <div className="text-gray-300 text-sm leading-relaxed">{def.desc}</div>
        <div className="text-gray-600 text-xs text-center tracking-widest">放開關閉</div>
      </div>
    </div>
  )
}
