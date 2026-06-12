import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHANGELOG } from '../lib/changelog'

export default function MainMenu() {
  const nav = useNavigate()
  const [showChangelog, setShowChangelog] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // Android back button → exit confirm; web beforeunload → browser warning
  useEffect(() => {
    window.history.pushState(null, '', window.location.pathname)
    const handlePop = () => {
      window.history.pushState(null, '', window.location.pathname)
      setShowExitConfirm(true)
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('popstate', handlePop)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('popstate', handlePop)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

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

      <button
        onClick={() => setShowChangelog(true)}
        className="text-gray-600 text-xs tracking-widest hover:text-gray-400 transition-colors"
      >
        更新日誌
      </button>

      {/* Changelog modal */}
      {showChangelog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
          <div className="bg-dark-panel border border-dark-border rounded-lg w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-dark-border shrink-0">
              <div className="text-neon-blue tracking-widest font-bold font-mono text-sm">更新日誌</div>
              <button
                onClick={() => setShowChangelog(false)}
                className="text-gray-500 hover:text-white text-lg leading-none"
              >✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">
              {CHANGELOG.map(entry => (
                <div key={entry.version}>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-neon-green font-mono font-bold text-sm">{entry.version}</span>
                    <span className="text-gray-500 text-xs">{entry.date}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {entry.items.map((item, i) => (
                      <li key={i} className="text-gray-300 text-xs leading-relaxed flex gap-2">
                        <span className="text-gray-600 shrink-0">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Exit confirm dialog */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
          <div className="bg-dark-panel border border-dark-border rounded-lg px-8 py-6 flex flex-col gap-4 items-center">
            <div className="text-white tracking-widest text-base">確定要離開遊戲？</div>
            <div className="flex gap-3">
              <button
                onClick={() => { window.close(); setShowExitConfirm(false) }}
                className="border-2 border-red-500 text-red-400 px-6 py-2 rounded tracking-widest text-sm hover:bg-red-500/10 transition-all"
              >
                確定離開
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="border border-dark-border text-gray-500 px-6 py-2 rounded tracking-widest text-sm hover:border-gray-500 hover:text-gray-300 transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
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
