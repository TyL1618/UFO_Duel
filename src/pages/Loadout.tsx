import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'
import type { WeaponId } from '../types/game'

const UFO_COLORS = [
  { label: '藍', value: '#00d4ff' },
  { label: '紫', value: '#9d00ff' },
  { label: '綠', value: '#00ff88' },
  { label: '紅', value: '#ff3366' },
  { label: '黃', value: '#ffdd00' },
  { label: '白', value: '#ffffff' },
]

export default function Loadout() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()

  const [name, setName] = useState('')
  const [color, setColor] = useState('#00d4ff')
  const [selected, setSelected] = useState<WeaponId[]>([])

  const specials = WEAPON_DEFS.filter(w => w.id !== 'normal')

  const toggle = (id: WeaponId) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(w => w !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  const ready = name.trim().length > 0 && selected.length === 4

  return (
    <div className="flex flex-col items-center w-full h-full bg-dark-bg py-6 px-4 gap-5 overflow-auto">
      <div className="text-neon-blue tracking-widest text-lg">整裝 — 房間 {roomId}</div>

      {/* Name */}
      <div className="w-full max-w-sm">
        <div className="text-gray-400 text-xs mb-1 tracking-widest">玩家名稱</div>
        <input
          type="text"
          maxLength={12}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="輸入名稱"
          className="w-full bg-dark-panel border border-dark-border focus:border-neon-blue outline-none rounded px-3 py-2 text-white font-mono tracking-wider transition-colors"
        />
      </div>

      {/* Color */}
      <div className="w-full max-w-sm">
        <div className="text-gray-400 text-xs mb-2 tracking-widest">飛碟顏色</div>
        <div className="flex gap-3">
          {UFO_COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              title={c.label}
              className="w-9 h-9 rounded-full border-2 transition-all"
              style={{
                background: c.value,
                borderColor: color === c.value ? '#fff' : 'transparent',
                boxShadow: color === c.value ? `0 0 12px ${c.value}` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Weapons */}
      <div className="w-full max-w-sm">
        <div className="text-gray-400 text-xs mb-2 tracking-widest">
          選擇 4 種特殊武器（{selected.length}/4）
        </div>
        <div className="grid grid-cols-2 gap-2">
          {specials.map(w => {
            const active = selected.includes(w.id)
            return (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-all ${
                  active
                    ? 'border-neon-green bg-neon-green/10 text-neon-green'
                    : 'border-dark-border text-gray-400 hover:border-gray-500'
                } ${!active && selected.length >= 4 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="text-xl">{w.icon}</span>
                <div>
                  <div className="text-xs font-bold">{w.label}</div>
                  <div className="text-xs opacity-60">傷害 {w.damage} × 2發</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Ready */}
      <button
        disabled={!ready}
        onClick={() => nav(`/game/${roomId}`)}
        className="mt-auto border-2 border-neon-green text-neon-green px-10 py-3 rounded tracking-widest text-lg hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        準備好！
      </button>
    </div>
  )
}
