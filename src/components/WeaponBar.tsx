import { WEAPON_MAP } from '../game/weapons'
import type { UFOState, WeaponId } from '../types/game'

interface Props {
  ufo: UFOState
  selected: WeaponId
  onSelect: (id: WeaponId) => void
  disabled: boolean
}

export default function WeaponBar({ ufo, selected, onSelect, disabled }: Props) {
  const slots = [
    { id: 'normal' as WeaponId, ammo: Infinity },
    ...ufo.weapons,
  ]

  return (
    <div className="flex items-center justify-center gap-2 py-2 bg-dark-panel border-t border-dark-border select-none">
      {slots.map(slot => {
        const def = WEAPON_MAP[slot.id]
        const empty = slot.ammo === 0
        const active = selected === slot.id
        return (
          <button
            key={slot.id}
            onClick={() => !empty && !disabled && onSelect(slot.id)}
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
  )
}
