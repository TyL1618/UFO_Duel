import { useNavigate, useLocation } from 'react-router-dom'
import { getStats } from '../lib/stats'

const MESSAGES: Record<string, { title: string; sub: string }> = {
  left:            { title: '您已離開對戰',        sub: '以下為您的生涯戰績' },
  opp_left:        { title: '對手已離開遊戲',       sub: '以下為您的生涯戰績' },
  opp_disconnected:{ title: '對手已離線，對戰結束', sub: '以下為您的生涯戰績' },
}

export default function GameResult() {
  const nav = useNavigate()
  const location = useLocation()
  const reason = (location.state as { reason?: string } | null)?.reason ?? ''
  const msg = MESSAGES[reason] ?? { title: '對戰結束', sub: '以下為您的生涯戰績' }

  const stats = getStats()
  const totalGames = stats.wins + stats.losses + stats.draws
  const accuracy = stats.totalShots > 0
    ? Math.round((stats.totalHits / stats.totalShots) * 100)
    : null
  const topWeapon = Object.entries(stats.weaponShots).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-6 px-4">
      <div className="text-center">
        <div className="text-yellow-400 text-xl tracking-widest">{msg.title}</div>
        {totalGames > 0 && (
          <div className="text-gray-600 text-xs mt-1 tracking-wider">{msg.sub}</div>
        )}
      </div>

      {totalGames > 0 ? (
        <div className="w-full max-w-xs border border-dark-border rounded-lg overflow-hidden text-xs font-mono">
          <div className="px-3 py-1.5 bg-dark-panel text-gray-500 tracking-widest">生涯戰績</div>
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
      ) : (
        <div className="text-gray-600 text-sm tracking-widest">尚無戰績紀錄</div>
      )}

      <button
        onClick={() => nav('/')}
        className="border-2 border-neon-blue text-neon-blue px-10 py-3 rounded tracking-widest text-lg hover:bg-neon-blue/10 hover:shadow-[0_0_20px_#00d4ff] transition-all"
      >
        返回首頁
      </button>
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
