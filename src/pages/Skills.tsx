import { useNavigate } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'

const WEAPON_DESC: Record<string, string> = {
  normal:    '無限彈藥，碰牆反彈',
  split:     '碰牆時分裂成三顆，各方向展開',
  pierce:    '穿透軟牆，不破壞地形，射程較短',
  sticky:    '黏附軟牆、硬牆或 UFO，一回合後 3×3 範圍爆炸，每格 20 傷害，自傷減半',
  tracking:  '進入追蹤範圍時自動轉向敵機',
  shockwave: '碰到任何目標即觸發 5×5 爆炸：直擊 25、3×3 內圈 18、5×5 外圈 14，範圍內軟牆全毀，自傷減半',
  burst:     '連發三顆，逐一射出，每顆 7 傷害',
  smoke:     '碰牆後展開 3×3 煙霧，持續 4 回合，遮蔽敵方視野',
  acid:      '命中後施加燃燒：每回合 5 傷害，持續 3 回合',
  sniper:    '命中傷害 15，瞄準時顯示虛線彈道預覽（最多 3 段硬牆折射）',
}

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
                  {WEAPON_DESC[w.id]}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
