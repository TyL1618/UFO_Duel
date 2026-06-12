import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHANGELOG } from '../lib/changelog'

const TUTORIAL_CARDS = [
  {
    icon: '🕹',
    title: '移動',
    body: '點擊「移動」進入移動模式，再點選目標格確認。也可用畫面下方的 D-pad 方向鍵導航到相鄰格。',
  },
  {
    icon: '🎯',
    title: '射擊',
    body: '長按畫布拖曳方向後放開即射出。子彈碰到硬牆會無限反彈，碰到軟牆會停止。',
  },
  {
    icon: '⚙️',
    title: '武器選擇',
    body: '右側武器欄可切換武器。普通子彈無限；特殊武器彈數有限。在整裝室決定帶哪四種武器。',
  },
  {
    icon: '🌀',
    title: '特殊武器',
    body: '傳送門：放置兩個門，踩上即傳送。護盾：抵擋最多 50 傷害。電磁脈衝：命中後清除 5×5 範圍護盾。',
  },
  {
    icon: '🏆',
    title: '勝利條件',
    body: '用子彈命中對手降低 HP，HP 歸零即淘汰。最後存活者（或 HP 最高者）獲勝。注意別被自己的子彈打到！',
  },
]

export default function MainMenu() {
  const nav = useNavigate()
  const [showChangelog, setShowChangelog] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialPage, setTutorialPage] = useState(0)

  useEffect(() => {
    if (!localStorage.getItem('ufo_tutorial_seen')) {
      setShowTutorial(true)
    }
  }, [])

  const closeTutorial = () => {
    localStorage.setItem('ufo_tutorial_seen', '1')
    setShowTutorial(false)
    setTutorialPage(0)
  }

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

      <div className="flex gap-4">
        <button
          onClick={() => { setTutorialPage(0); setShowTutorial(true) }}
          className="text-gray-600 text-xs tracking-widest hover:text-gray-400 transition-colors"
        >
          操控說明
        </button>
        <button
          onClick={() => setShowChangelog(true)}
          className="text-gray-600 text-xs tracking-widest hover:text-gray-400 transition-colors"
        >
          更新日誌
        </button>
      </div>

      {/* Tutorial overlay */}
      {showTutorial && (() => {
        const card = TUTORIAL_CARDS[tutorialPage]
        const isLast = tutorialPage === TUTORIAL_CARDS.length - 1
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm pb-10 px-4">
            <div className="bg-dark-panel border border-dark-border rounded-xl w-full max-w-sm flex flex-col gap-5 p-6">
              {/* Page dots */}
              <div className="flex gap-2 justify-center">
                {TUTORIAL_CARDS.map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full transition-colors"
                    style={{ background: i === tutorialPage ? '#00d4ff' : '#333' }} />
                ))}
              </div>
              {/* Card content */}
              <div className="flex flex-col items-center gap-3 text-center min-h-[120px]">
                <div className="text-4xl">{card.icon}</div>
                <div className="text-neon-blue font-bold tracking-widest text-base">{card.title}</div>
                <div className="text-gray-300 text-sm leading-relaxed">{card.body}</div>
              </div>
              {/* Navigation */}
              <div className="flex gap-3">
                {tutorialPage > 0 && (
                  <button
                    onClick={() => setTutorialPage(p => p - 1)}
                    className="flex-1 border border-dark-border text-gray-500 py-2 rounded tracking-widest text-sm hover:border-gray-500 hover:text-gray-300 transition-all"
                  >
                    上一頁
                  </button>
                )}
                {!isLast ? (
                  <button
                    onClick={() => setTutorialPage(p => p + 1)}
                    className="flex-1 border-2 border-neon-blue text-neon-blue py-2 rounded tracking-widest text-sm hover:bg-neon-blue/10 transition-all"
                  >
                    下一頁
                  </button>
                ) : (
                  <button
                    onClick={closeTutorial}
                    className="flex-1 border-2 border-neon-green text-neon-green py-2 rounded tracking-widest text-sm hover:bg-neon-green/10 transition-all"
                  >
                    開始遊戲！
                  </button>
                )}
              </div>
              <button onClick={closeTutorial} className="text-gray-600 text-xs tracking-widest hover:text-gray-400 text-center transition-colors">
                跳過說明
              </button>
            </div>
          </div>
        )
      })()}

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
