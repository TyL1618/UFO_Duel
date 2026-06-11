import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerId } from '../types/game'

const ALL_ROLES: PlayerId[] = ['p1', 'p2', 'p3', 'p4']

export default function JoinRoom() {
  const nav = useNavigate()
  const { channelRef, initRoom } = useRoom()
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async () => {
    const roomId = code.trim()
    if (roomId.length !== 6 || !/^\d+$/.test(roomId)) return

    setJoining(true)
    setError('')

    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    const ch = supabase.channel(`room:${roomId}`)

    // Subscribe first (without tracking), read presence to find P1's player count
    // and the next free role. P1 from a 1v1 room tracks no playerCount → defaults
    // to 2 (only the p2 slot). FFA rooms expose playerCount on P1's presence.
    type Slot = { role: string; playerCount?: number }
    const result = await new Promise<{ ok: true; role: PlayerId; count: number } | { ok: false; reason: 'full' | 'empty' | 'error' }>((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, reason: 'error' }), 2500)
      ch.on('presence', { event: 'sync' }, () => {
        clearTimeout(timeout)
        const state = ch.presenceState<Slot>()
        const all = Object.values(state).flat()
        const p1 = all.find(u => u.role === 'p1')
        if (!p1) { resolve({ ok: false, reason: 'empty' }); return }
        const count = p1.playerCount ?? 2
        const taken = new Set(all.map(u => u.role))
        const freeRole = ALL_ROLES.slice(0, count).find(r => !taken.has(r))
        if (!freeRole) { resolve({ ok: false, reason: 'full' }); return }
        resolve({ ok: true, role: freeRole, count: count as 2 | 3 | 4 })
      })
      ch.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') { clearTimeout(timeout); resolve({ ok: false, reason: 'error' }) }
      })
    })

    if (!result.ok) {
      ch.unsubscribe()
      setError(result.reason === 'full' ? '房間已滿，無法加入'
        : result.reason === 'empty' ? '房間不存在或房主已離開'
        : '無法加入房間，請確認房間號碼')
      setJoining(false)
      return
    }

    // Slot confirmed available — now claim it
    channelRef.current = ch
    initRoom(roomId, result.role, result.count as 2 | 3 | 4)
    ch.track({ role: result.role })
    await ch.send({ type: 'broadcast', event: 'player_joined', payload: { role: result.role } })
    nav(`/loadout/${roomId}`)
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg">
      <div className="text-neon-purple text-2xl tracking-widest">加入房間</div>

      <input
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => e.key === 'Enter' && handleJoin()}
        placeholder="輸入6位數房間號碼"
        disabled={joining}
        className="bg-dark-panel border-2 border-dark-border focus:border-neon-purple outline-none rounded px-4 py-3 text-center text-3xl tracking-[0.4em] text-neon-purple w-64 font-mono transition-colors disabled:opacity-50"
        autoFocus
      />

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        onClick={handleJoin}
        disabled={code.length !== 6 || joining}
        className="border-2 border-neon-purple text-neon-purple px-8 py-2 rounded tracking-widest hover:bg-neon-purple/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        {joining ? '連線中...' : '確認加入'}
      </button>

      <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest">
        ← 返回私人連線
      </button>
    </div>
  )
}
