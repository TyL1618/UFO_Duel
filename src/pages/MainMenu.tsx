import { useNavigate } from 'react-router-dom'

export default function MainMenu() {
  const nav = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg px-4">
      <div className="text-center select-none">
        <div className="text-5xl font-bold tracking-widest text-neon-blue drop-shadow-[0_0_20px_#00d4ff]">
          UFO DUEL
        </div>
        <div className="text-sm text-gray-500 mt-2 tracking-widest">RICOCHET WARFARE</div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <div className="grid grid-cols-2 gap-3">
          <NeonButton color="green" onClick={() => nav('/game/solo')}>單機模式</NeonButton>
          <NeonButton color="blue" onClick={() => nav('/create')}>創建房間</NeonButton>
          <NeonButton color="purple" onClick={() => nav('/join')}>加入房間</NeonButton>
          <NeonButton color="blue" onClick={() => nav('/skills')}>技能總覽</NeonButton>
        </div>
        <NeonButton color="orange" onClick={() => nav('/matchmaking')}>⚡ 快速配對</NeonButton>
      </div>
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
