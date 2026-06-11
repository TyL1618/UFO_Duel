import { useNavigate } from 'react-router-dom'

export default function PrivateLobby() {
  const nav = useNavigate()

  return (
    // Centered but scrollable: on short landscape screens the content (and the
    // back button) stays reachable instead of being clipped off the bottom.
    <div className="w-full h-full bg-dark-bg overflow-y-auto flex">
      <div className="m-auto flex flex-col items-center gap-5 px-4 py-5 w-full max-w-xs">
      <div className="text-neon-blue text-xl tracking-widest">私人連線</div>

      <div className="flex flex-col gap-4 w-full">
        {/* Create section */}
        <div className="border border-dark-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-dark-panel text-gray-500 text-xs tracking-widest">創建房間</div>
          <div className="flex flex-col gap-2 p-3">
            <NeonButton color="green" onClick={() => nav('/create')}>
              1v1 對戰
            </NeonButton>
            <NeonButton color="purple" onClick={() => nav('/create-multi')}>
              多人 FFA (3–4 人)
            </NeonButton>
          </div>
        </div>

        {/* Join section */}
        <div className="border border-dark-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-dark-panel text-gray-500 text-xs tracking-widest">加入房間</div>
          <div className="p-3">
            <NeonButton color="blue" onClick={() => nav('/join')}>
              輸入房號加入
            </NeonButton>
          </div>
        </div>
      </div>

      <button
        onClick={() => nav('/')}
        className="text-gray-600 hover:text-gray-400 text-sm tracking-widest transition-colors"
      >
        ← 返回首頁
      </button>
      </div>
    </div>
  )
}

function NeonButton({
  children, color, onClick,
}: {
  children: React.ReactNode
  color: 'blue' | 'purple' | 'green'
  onClick: () => void
}) {
  const styles = {
    blue:   'border-neon-blue text-neon-blue hover:bg-neon-blue/10 hover:shadow-[0_0_16px_#00d4ff]',
    purple: 'border-neon-purple text-neon-purple hover:bg-neon-purple/10 hover:shadow-[0_0_16px_#9d00ff]',
    green:  'border-neon-green text-neon-green hover:bg-neon-green/10 hover:shadow-[0_0_16px_#00ff88]',
  }
  return (
    <button
      onClick={onClick}
      className={`w-full border-2 rounded px-6 py-3 text-base tracking-widest font-mono transition-all duration-200 ${styles[color]}`}
    >
      {children}
    </button>
  )
}
