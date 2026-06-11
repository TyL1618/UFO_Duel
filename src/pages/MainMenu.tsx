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

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        <NeonButton color="green"  onClick={() => nav('/game/solo')}>單機模式</NeonButton>
        <NeonButton color="blue"   onClick={() => nav('/private')}>私人連線</NeonButton>
        <NeonButton color="blue"   onClick={() => nav('/skills')}>技能總覽</NeonButton>
        <NeonButton color="orange" onClick={() => nav('/matchmaking')}>⚡ 快速配對</NeonButton>
      </div>
    </div>
  )
}

function NeonButton({
  children, color, onClick,
}: {
  children: React.ReactNode
  color: 'blue' | 'green' | 'orange'
  onClick: () => void
}) {
  const styles = {
    blue:   'border-neon-blue text-neon-blue hover:bg-neon-blue/10 hover:shadow-[0_0_20px_#00d4ff]',
    green:  'border-neon-green text-neon-green hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88]',
    orange: 'border-yellow-500 text-yellow-400 hover:bg-yellow-500/10 hover:shadow-[0_0_20px_#eab308]',
  }
  return (
    <button
      onClick={onClick}
      className={`w-full border-2 rounded px-4 py-3 text-lg tracking-widest font-mono transition-all duration-200 ${styles[color]}`}
    >
      {children}
    </button>
  )
}
