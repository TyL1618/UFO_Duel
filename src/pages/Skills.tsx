import { useNavigate } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'

export default function Skills() {
  const nav = useNavigate()

  return (
    <div className="flex flex-col w-full h-full bg-dark-bg overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-dark-border shrink-0">
        <button
          onClick={() => nav('/')}
          className="text-gray-400 hover:text-white text-sm tracking-widest transition-colors"
        >
          ← 返回
        </button>
        <div className="text-neon-blue tracking-widest font-bold font-mono">技能總覽</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-4">
          {WEAPON_DEFS.map(w => (
            <div key={w.id} className="flex items-start gap-3 p-3 border border-dark-border rounded bg-dark-panel">
              <span className="text-2xl leading-none flex-shrink-0 w-8 text-center">{w.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white text-sm font-mono">{w.label}</span>
                  <span className="text-gray-500 text-xs font-mono">
                    傷害 {w.damage > 0 ? w.damage : '—'}
                  </span>
                  <span className="text-gray-500 text-xs font-mono">
                    彈數 {w.ammo === 0 ? '∞' : w.ammo}
                  </span>
                </div>
                <div className="text-gray-400 text-xs mt-1 leading-relaxed">
                  {w.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
