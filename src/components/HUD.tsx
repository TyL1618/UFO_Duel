import type { PlayerId, UFOState } from '../types/game'

interface Props {
  players: PlayerId[]
  ufos: { [K in PlayerId]?: UFOState }
  turn: number
  maxTurns: number
  timerSeconds: number
  currentTurn: PlayerId
  localPlayer: PlayerId
  waitingFor?: string
  roomId?: string
}

export default function HUD({ players, ufos, turn, maxTurns, timerSeconds, currentTurn, localPlayer, waitingFor, roomId }: Props) {
  const is2p = players.length === 2
  return (
    <div className="flex items-center justify-between px-4 py-1 bg-dark-panel border-b border-dark-border select-none text-sm font-mono">
      {is2p ? (
        <>
          <PlayerInfo ufo={ufos[players[0]]!} active={currentTurn === players[0]} isLocal={localPlayer === players[0]} />
          <Center turn={turn} maxTurns={maxTurns} timerSeconds={timerSeconds} waitingFor={waitingFor} roomId={roomId} />
          <PlayerInfo ufo={ufos[players[1]]!} active={currentTurn === players[1]} isLocal={localPlayer === players[1]} flip />
        </>
      ) : (
        <div className="flex w-full items-center gap-0">
          {/* Left: first two players */}
          <div className="flex gap-3 flex-1">
            {players.slice(0, 2).map(pid => (
              <PlayerInfo key={pid} ufo={ufos[pid]!} active={currentTurn === pid} isLocal={localPlayer === pid} compact />
            ))}
          </div>
          <Center turn={turn} maxTurns={maxTurns} timerSeconds={timerSeconds} waitingFor={waitingFor} roomId={roomId} />
          {/* Right: remaining players */}
          <div className="flex gap-3 flex-1 justify-end">
            {players.slice(2).map(pid => (
              <PlayerInfo key={pid} ufo={ufos[pid]!} active={currentTurn === pid} isLocal={localPlayer === pid} compact flip />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Center({ turn, maxTurns, timerSeconds, waitingFor, roomId }: {
  turn: number; maxTurns: number; timerSeconds: number; waitingFor?: string; roomId?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0 shrink-0 mx-2">
      <div className="text-gray-400 text-xs tracking-widest">回合 {turn}/{maxTurns}</div>
      {roomId && roomId !== 'solo' && (
        <div className="tracking-widest" style={{ fontSize: '9px', color: '#2a2a4a' }}>{roomId}</div>
      )}
      <div
        className="text-2xl font-bold tabular-nums"
        style={{ color: timerSeconds <= 5 ? '#ff3366' : '#ffdd00' }}
      >
        {timerSeconds}
      </div>
      {waitingFor && (
        <span
          className="whitespace-nowrap font-bold tracking-wider"
          style={{ fontSize: '10px', color: '#ffcc00', animation: 'waiting-blink 0.9s ease-in-out infinite' }}
        >
          ▶ {waitingFor}
        </span>
      )}
    </div>
  )
}

function PlayerInfo({ ufo, active, isLocal, flip, compact }: {
  ufo: UFOState; active: boolean; isLocal: boolean; flip?: boolean; compact?: boolean
}) {
  if (!ufo) return null
  const hearts = Array.from({ length: Math.ceil(ufo.maxHp / 10) }, (_, i) => (i + 1) * 10 <= ufo.hp)
  const opacity = ufo.isDead ? 'opacity-40' : ''
  return (
    <div className={`flex flex-col ${flip ? 'items-end' : 'items-start'} gap-0.5 ${opacity}`}>
      <div
        className="text-xs tracking-wider font-bold"
        style={{ color: active ? ufo.color : '#555' }}
      >
        {ufo.name}{isLocal ? ' ◀' : ''}{ufo.isDead ? ' 💀' : ''}
      </div>
      {!compact && (
        <div className="flex gap-0.5">
          {hearts.map((filled, i) => (
            <span key={i} style={{ color: filled ? '#ff3366' : '#333', fontSize: '10px' }}>♥</span>
          ))}
        </div>
      )}
      <div className="text-xs" style={{ color: ufo.color }}>
        {ufo.isDead ? 'DEAD' : `${ufo.hp} HP`}
      </div>
    </div>
  )
}
