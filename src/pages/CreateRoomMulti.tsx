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
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'count' | 'password' | 'lobby'>('count')
  const [roomId] = useState(generateRoomId)
  const [copied, setCopied] = useState(false)
  const [joinedRoles, setJoinedRoles] = useState<PlayerId[]>(['p1'])
  const navigatedRef = useRef(false)

  // Once a player count is chosen and password confirmed, open the room.
  useEffect(() => {
    if (step !== 'lobby' || count === null) return
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
      if (present.length >= count && !navigatedRef.current) {
        navigatedRef.current = true
        setTimeout(() => nav(`/profile/${roomId}`), 500)
      }
    }

    ch.on('presence', { event: 'sync' }, refresh)
    ch.on('presence', { event: 'join' }, refresh)
    ch.on('broadcast', { event: 'player_joined' }, refresh)

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const meta: Record<string, unknown> = { role: 'p1', playerCount: count }
        if (password) meta.password = password
        ch.track(meta)
      }
    })

    channelRef.current = ch
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ─── Step 1: choose player count ──────────────────────────────────────────
  if (step === 'count') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-8 bg-dark-bg px-4">
        <div className="text-neon-purple text-xl tracking-widest">多人 FFA — 選擇人數</div>
        <div className="flex gap-4">
          {([3, 4] as const).map(n => (
            <button
              key={n}
              onClick={() => { setCount(n); setStep('password') }}
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

  // ─── Step 1.5: optional password ──────────────────────────────────────────
  if (step === 'password') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg px-4">
        <div className="text-neon-purple text-xl tracking-widest">多人 FFA · {count} 人</div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <label className="text-gray-500 text-xs tracking-widest">房間密碼（選填）</label>
          <input
            type="text"
            maxLength={16}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setStep('lobby')}
            placeholder="不設密碼則留空"
            className="bg-dark-panel border-2 border-dark-border focus:border-neon-purple outline-none rounded px-4 py-3 text-center text-lg tracking-widest text-neon-purple w-full font-mono transition-colors"
            autoFocus
          />
          <button
            onClick={() => setStep('lobby')}
            className="w-full border-2 border-neon-purple text-neon-purple py-3 rounded tracking-widest hover:bg-neon-purple/10 transition-all"
          >
            {password ? '🔒 建立房間' : '建立房間'}
          </button>
        </div>
        <button onClick={() => setStep('count')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest">
          ← 重新選人數
        </button>
      </div>
    )
  }

  // ─── Step 2: room code + lobby ────────────────────────────────────────────
  const allReady = joinedRoles.length >= count!
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg px-4">
      <div className="text-gray-400 tracking-widest text-sm">
        房間號碼 · {count} 人 FFA{password && <span className="ml-2 text-neon-purple text-xs">🔒 已設密碼</span>}
      </div>

      <button
        onClick={copy}
        className="text-7xl font-bold tracking-[0.3em] text-neon-purple drop-shadow-[0_0_30px_#9d00ff] hover:scale-105 transition-transform"
      >
        {roomId}
      </button>
      <div className="text-gray-500 text-sm h-4">{copied ? '已複製！' : '點擊號碼複製'}</div>

      {/* Slot list */}
      <div className="flex gap-3">
        {ALL_ROLES.slice(0, count!).map(r => {
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
          等待玩家加入... ({joinedRoles.length}/{count!})
        </div>
      )}

      <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest mt-2">
        ← 返回私人連線
      </button>
    </div>
  )
}
