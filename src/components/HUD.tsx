import type { UFOState } from '../types/game'

interface Props {
  p1: UFOState
  p2: UFOState
  turn: number
  maxTurns: number
  timerSeconds: number
  currentTurn: 'p1' | 'p2'
  waitingFor?: string
  roomId?: string
}

export default function HUD({ p1, p2, turn, maxTurns, timerSeconds, currentTurn, waitingFor, roomId }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-1 bg-dark-panel border-b border-dark-border select-none text-sm font-mono">
      <PlayerInfo ufo={p1} active={currentTurn === 'p1'} />
      <div className="flex flex-col items-center gap-0">
        <div className="text-gray-400 text-xs tracking-widest">回合 {turn}/{maxTurns}</div>
        {roomId && roomId !== 'solo' && (
          <div className="tracking-widest" style={{ fontSize: '9px', color: '#2a2a4a' }}>{roomId}</div>
        )}
        <div
          className="text-2xl font-bold tabular-nums"
          style={{ color: timerSeconds <= 3 ? '#ff3366' : '#ffdd00' }}
        >
          {timerSeconds}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {waitingFor && (
          <span
            className="whitespace-nowrap font-bold tracking-wider"
            style={{
              fontSize: '11px',
              color: '#ffcc00',
              animation: 'waiting-blink 0.9s ease-in-out infinite',
            }}
          >
            ▶ {waitingFor} 回合中
          </span>
        )}
        <PlayerInfo ufo={p2} active={currentTurn === 'p2'} flip />
      </div>
    </div>
  )
}

function PlayerInfo({ ufo, active, flip }: { ufo: UFOState; active: boolean; flip?: boolean }) {
  const hearts = Array.from({ length: Math.ceil(ufo.maxHp / 10) }, (_, i) => {
    const threshold = (i + 1) * 10
    return threshold <= ufo.hp
  })

  return (
    <div className={`flex flex-col ${flip ? 'items-end' : 'items-start'} gap-0.5`}>
      <div
        className="text-xs tracking-wider font-bold"
        style={{ color: active ? ufo.color : '#666' }}
      >
        {ufo.name}
      </div>
      <div className="flex gap-0.5">
        {hearts.map((filled, i) => (
          <span key={i} style={{ color: filled ? '#ff3366' : '#333', fontSize: '10px' }}>
            ♥
          </span>
        ))}
      </div>
      <div className="text-xs" style={{ color: ufo.color }}>
        {ufo.hp} HP
      </div>
    </div>
  )
}
