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
          <div className="flex gap-3 flex-1">
            {players.slice(0, 2).map(pid => (
              <PlayerInfo key={pid} ufo={ufos[pid]!} active={currentTurn === pid} isLocal={localPlayer === pid} compact />
            ))}
          </div>
          <Center turn={turn} maxTurns={maxTurns} timerSeconds={timerSeconds} waitingFor={waitingFor} roomId={roomId} />
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
  const glow = ufo.isDead ? 'none' : active ? `0 0 10px ${ufo.color}, 0 0 4px ${ufo.color}` : `0 0 5px ${ufo.color}99`
  const hasShield = (ufo.shieldHp ?? 0) > 0
  return (
    <div className={`flex flex-col ${flip ? 'items-end' : 'items-start'} gap-0.5 ${ufo.isDead ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-1 text-sm tracking-wider font-bold" style={{ color: ufo.color, textShadow: glow }}>
        {active && !flip && <span style={{ fontSize: '10px' }}>▶</span>}
        <span>{ufo.name}{isLocal ? ' ◀' : ''}{ufo.isDead ? ' 💀' : ''}</span>
        {active && flip && <span style={{ fontSize: '10px' }}>◀</span>}
      </div>
      {!compact && (
        <div className="flex gap-0.5">
          {hearts.map((filled, i) => (
            <span key={i} style={{ color: filled ? ufo.color : '#333', fontSize: '10px', textShadow: filled ? `0 0 4px ${ufo.color}88` : 'none' }}>♥</span>
          ))}
        </div>
      )}
      <div className="text-sm font-bold tabular-nums" style={{ color: ufo.color, textShadow: glow }}>
        {ufo.isDead ? 'DEAD' : `${ufo.hp} HP`}
      </div>
      {hasShield && (
        <div className="flex items-center gap-1" style={{ fontSize: '10px', color: '#00aaff' }}>
          <span>🛡</span>
          <span className="tabular-nums">{ufo.shieldHp}</span>
        </div>
      )}
    </div>
  )
}
