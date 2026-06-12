import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import GameCanvas from '../components/GameCanvas'
import type { GameState, MapType, PlayerId, TileType } from '../types/game'

type SyncPayload = {
  ufos: GameState['ufos']
  players: PlayerId[]
  currentTurn: PlayerId
  turnNumber: number
  phase: GameState['phase']
  winner: GameState['winner']
  stickyMines: GameState['stickyMines']
  smokeClouds: GameState['smokeClouds']
  mapTiles: TileType[][]
  mapRows: number
  mapCols: number
  mapSeed: number
  mapType: MapType
  stormBurnedTiles: GameState['stormBurnedTiles']
  healthPacks: GameState['healthPacks']
  portals: GameState['portals']
  trapMines: GameState['trapMines']
  blackHoles: GameState['blackHoles']
}

export default function Spectate() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const chRef = useRef(supabase.channel(`room:${roomId!}`))
  const [gs, setGs] = useState<GameState | null>(null)
  const [connected, setConnected] = useState(false)
  const [isEnded, setIsEnded] = useState(false)

  useEffect(() => {
    const ch = chRef.current

    ch.on('broadcast', { event: 'game_state_sync' }, ({ payload }) => {
      const p = payload as SyncPayload
      setGs({
        players: p.players,
        map: { rows: p.mapRows, cols: p.mapCols, tiles: p.mapTiles, seed: p.mapSeed ?? 0, mapType: p.mapType ?? 'standard' },
        ufos: p.ufos,
        currentTurn: p.currentTurn,
        turnNumber: p.turnNumber,
        phase: p.phase,
        localPlayer: (p.players[0] ?? 'p1') as PlayerId,
        winner: p.winner,
        stickyMines: p.stickyMines ?? [],
        smokeClouds: p.smokeClouds ?? [],
        stormBurnedTiles: p.stormBurnedTiles ?? [],
        healthPacks: p.healthPacks ?? [],
        portals: p.portals ?? [],
        trapMines: p.trapMines ?? [],
        blackHoles: p.blackHoles ?? [],
      })
      if (p.phase === 'ending' || p.phase === 'ended') setIsEnded(true)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true)
        ch.track({ role: 'spectator' })
        setTimeout(() => ch.send({ type: 'broadcast', event: 'request_sync', payload: {} }), 300)
      }
    })

    return () => { ch.unsubscribe() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for state updates every 5s while game is in progress
  useEffect(() => {
    if (!connected || isEnded) return
    const id = setInterval(() => {
      chRef.current.send({ type: 'broadcast', event: 'request_sync', payload: {} })
    }, 5000)
    return () => clearInterval(id)
  }, [connected, isEnded])

  if (!gs) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-4">
        <div className="text-neon-blue text-lg tracking-widest animate-pulse">連接觀戰頻道...</div>
        <div className="text-gray-600 text-xs tracking-widest">房號 {roomId}</div>
        <button onClick={() => nav('/')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest mt-8">
          ← 返回首頁
        </button>
      </div>
    )
  }

  const activePlayerName = gs.ufos[gs.currentTurn]?.name ?? gs.currentTurn.toUpperCase()

  return (
    <div className="w-full h-full flex flex-col bg-dark-bg overflow-hidden relative">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-dark-border bg-dark-panel/80">
        <div className="text-gray-500 text-xs tracking-widest">👁 觀戰 · {roomId}</div>
        <div className="text-gray-400 text-xs">R{gs.turnNumber} · {activePlayerName}</div>
        <button onClick={() => nav('/')} className="text-gray-700 hover:text-gray-500 text-xs tracking-widest">離開</button>
      </div>

      <div className="flex-1 min-h-0">
        <GameCanvas
          state={gs}
          bullets={[]}
          animDestroyedTiles={[]}
          explosionEvents={[]}
          hitEvents={[]}
          blastZone={[]}
          stormBurnedTiles={gs.stormBurnedTiles}
          damageFloats={[]}
          onShoot={() => {}}
          isMyTurn={false}
          movingMode={false}
          selectedWeapon="normal"
        />
      </div>

      {(gs.phase === 'ending' || gs.phase === 'ended') && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 select-none">
          <div className="text-gray-400 text-xs tracking-widest mb-3">觀戰結束</div>
          <div className="text-3xl font-bold tracking-widest mb-6"
            style={{ color: gs.winner === 'draw' ? '#888' : gs.ufos[gs.winner as PlayerId]?.color }}>
            {gs.winner === 'draw' ? '平手！' : `${gs.ufos[gs.winner as PlayerId]?.name ?? gs.winner} 獲勝！`}
          </div>
          <button onClick={() => nav('/')} className="border border-gray-600 text-gray-400 px-6 py-2 rounded tracking-widest text-sm hover:border-gray-400 hover:text-white transition-all">
            返回首頁
          </button>
        </div>
      )}
    </div>
  )
}
