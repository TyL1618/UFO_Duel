import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerId } from '../types/game'

function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

const ROLE_COLORS: Record<PlayerId, string> = {
  p1: '#00d4ff', p2: '#ff3366', p3: '#00ff88', p4: '#ffdd00',
}
const ALL_ROLES: PlayerId[] = ['p1', 'p2', 'p3', 'p4']

export default function CreateRoomMulti() {
  const nav = useNavigate()
  const { channelRef, initRoom } = useRoom()
  const [count, setCount] = useState<3 | 4 | null>(null)
  const [roomId] = useState(generateRoomId)
  const [copied, setCopied] = useState(false)
  const [joinedRoles, setJoinedRoles] = useState<PlayerId[]>(['p1'])
  const navigatedRef = useRef(false)

  // Once a player count is chosen, open the room and wait for joiners.
  useEffect(() => {
    if (count === null) return
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    initRoom(roomId, 'p1', count)
    const ch = supabase.channel(`room:${roomId}`)

    const refresh = () => {
      const state = ch.presenceState<{ role: string }>()
      const all = Object.values(state).flat()
      const present = ALL_ROLES.filter(r => all.some(u => u.role === r))
      setJoinedRoles(present)
      // All slots filled → everyone proceeds to loadout (joiners are already there)
      if (present.length >= count && !navigatedRef.current) {
        navigatedRef.current = true
        setTimeout(() => nav(`/ban/${roomId}`), 500)
      }
    }

    ch.on('presence', { event: 'sync' }, refresh)
    ch.on('presence', { event: 'join' }, refresh)
    ch.on('broadcast', { event: 'player_joined' }, refresh)

    ch.subscribe((status) => {
      // P1 advertises playerCount so JoinRoom can assign p2..pN slots.
      if (status === 'SUBSCRIBED') ch.track({ role: 'p1', playerCount: count })
    })

    channelRef.current = ch
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ─── Step 1: choose player count ──────────────────────────────────────────
  if (count === null) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-8 bg-dark-bg px-4">
        <div className="text-neon-purple text-xl tracking-widest">多人 FFA — 選擇人數</div>
        <div className="flex gap-4">
          {([3, 4] as const).map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className="border-2 border-neon-purple text-neon-purple w-28 h-28 rounded-lg text-4xl font-bold tracking-widest hover:bg-neon-purple/10 hover:shadow-[0_0_20px_#9d00ff] transition-all flex flex-col items-center justify-center gap-1"
            >
              {n}
              <span className="text-xs tracking-widest opacity-70">人對戰</span>
            </button>
          ))}
        </div>
        <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest mt-2">
          ← 返回私人連線
        </button>
      </div>
    )
  }

  // ─── Step 2: room code + lobby ────────────────────────────────────────────
  const allReady = joinedRoles.length >= count
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg px-4">
      <div className="text-gray-400 tracking-widest text-sm">房間號碼 · {count} 人 FFA</div>

      <button
        onClick={copy}
        className="text-7xl font-bold tracking-[0.3em] text-neon-purple drop-shadow-[0_0_30px_#9d00ff] hover:scale-105 transition-transform"
      >
        {roomId}
      </button>
      <div className="text-gray-500 text-sm h-4">{copied ? '已複製！' : '點擊號碼複製'}</div>

      {/* Slot list */}
      <div className="flex gap-3">
        {ALL_ROLES.slice(0, count).map(r => {
          const here = joinedRoles.includes(r)
          return (
            <div
              key={r}
              className="w-16 h-16 rounded-lg border-2 flex flex-col items-center justify-center text-xs font-mono tracking-widest transition-all"
              style={{
                borderColor: here ? ROLE_COLORS[r] : '#2a2a40',
                color: here ? ROLE_COLORS[r] : '#444',
                boxShadow: here ? `0 0 12px ${ROLE_COLORS[r]}44` : 'none',
              }}
            >
              {r.toUpperCase()}
              <span className="text-[9px] mt-0.5">{here ? '已加入' : '等待'}</span>
            </div>
          )
        })}
      </div>

      {allReady ? (
        <div className="text-neon-green text-sm tracking-widest animate-pulse">人數已滿，進入整裝室...</div>
      ) : (
        <div className="text-gray-500 text-sm animate-pulse">
          等待玩家加入... ({joinedRoles.length}/{count})
        </div>
      )}

      <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest mt-2">
        ← 返回私人連線
      </button>
    </div>
  )
}
