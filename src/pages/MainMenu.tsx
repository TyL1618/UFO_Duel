import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStats, clearStats } from '../lib/stats'
import type { LocalStats } from '../lib/stats'

export default function MainMenu() {
  const nav = useNavigate()
  const [stats, setStats] = useState<LocalStats | null>(null)

  useEffect(() => {
    setStats(getStats())
  }, [])

  const accuracy = stats && stats.totalShots > 0
    ? Math.round((stats.totalHits / stats.totalShots) * 100)
    : null

  const topWeapon = stats
    ? Object.entries(stats.weaponShots).sort((a, b) => b[1] - a[1])[0]
    : null

  const handleClear = () => {
    clearStats()
    setStats(getStats())
  }

  const totalGames = stats ? stats.wins + stats.losses + stats.draws : 0

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg px-4">
      {/* Title */}
      <div className="text-center select-none">
        <div className="text-5xl font-bold tracking-widest text-neon-blue drop-shadow-[0_0_20px_#00d4ff]">
          UFO DUEL
        </div>
        <div className="text-sm text-gray-500 mt-2 tracking-widest">RICOCHET WARFARE</div>
      </div>

      {/* Buttons — 2×2 grid + quick match */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <div className="grid grid-cols-2 gap-3">
          <NeonButton color="green" onClick={() => nav('/game/solo')}>單機模式</NeonButton>
          <NeonButton color="blue" onClick={() => nav('/create')}>創建房間</NeonButton>
          <NeonButton color="purple" onClick={() => nav('/join')}>加入房間</NeonButton>
          <NeonButton color="blue" onClick={() => nav('/skills')}>技能總覽</NeonButton>
        </div>
        <NeonButton color="orange" onClick={() => nav('/matchmaking')}>⚡ 快速配對</NeonButton>
      </div>

      {/* Stats panel */}
      {stats && totalGames > 0 && (
        <div className="w-full max-w-xs border border-dark-border rounded-lg overflow-hidden text-xs font-mono">
          <div className="flex items-center justify-between px-3 py-1.5 bg-dark-panel text-gray-500 tracking-widest">
            <span>戰績</span>
            <button onClick={handleClear} className="text-gray-600 hover:text-gray-400 text-xs">清除</button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-dark-border">
            <StatCell label="勝" value={String(stats.wins)} color="#00ff88" />
            <StatCell label="敗" value={String(stats.losses)} color="#ff3366" />
            <StatCell label="平" value={String(stats.draws)} color="#888" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-dark-border border-t border-dark-border">
            <StatCell label="總傷害" value={String(stats.totalDamage)} />
            <StatCell label="命中率" value={accuracy !== null ? `${accuracy}%` : '—'} />
          </div>
          {topWeapon && (
            <div className="px-3 py-1.5 border-t border-dark-border text-gray-500">
              最常用：<span className="text-white">{topWeapon[0]}</span>
              <span className="text-gray-600 ml-1">×{topWeapon[1]}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center py-2 px-1">
      <div className="text-gray-600 text-xs tracking-wider">{label}</div>
      <div className="font-bold text-sm" style={{ color: color ?? '#e0e0ff' }}>{value}</div>
    </div>
  )
}

function NeonButton({
  children, color, onClick,
}: {
  children: React.ReactNode
  color: 'blue' | 'purple' | 'green' | 'orange'
  onClick: () => void
}) {
  const styles = {
    blue:   'border-neon-blue text-neon-blue hover:bg-neon-blue/10 hover:shadow-[0_0_20px_#00d4ff]',
    purple: 'border-neon-purple text-neon-purple hover:bg-neon-purple/10 hover:shadow-[0_0_20px_#9d00ff]',
    green:  'border-neon-green text-neon-green hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88]',
    orange: 'border-yellow-500 text-yellow-400 hover:bg-yellow-500/10 hover:shadow-[0_0_20px_#eab308]',
  }
  return (
    <button
      onClick={onClick}
      className={`w-full border-2 rounded px-6 py-3 text-lg tracking-widest font-mono transition-all duration-200 ${styles[color]}`}
    >
      {children}
    </button>
  )
}
