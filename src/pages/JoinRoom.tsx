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
  const [password, setPassword] = useState('')
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

    type Slot = { role: string; playerCount?: number; password?: string }
    const result = await new Promise<
      { ok: true; role: PlayerId; count: number } |
      { ok: false; reason: 'full' | 'empty' | 'error' | 'wrong_password' }
    >((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, reason: 'error' }), 2500)
      ch.on('presence', { event: 'sync' }, () => {
        clearTimeout(timeout)
        const state = ch.presenceState<Slot>()
        const all = Object.values(state).flat()
        const p1 = all.find(u => u.role === 'p1')
        if (!p1) { resolve({ ok: false, reason: 'empty' }); return }
        // Password check
        if (p1.password && p1.password !== password) {
          resolve({ ok: false, reason: 'wrong_password' }); return
        }
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
      setError(
        result.reason === 'full' ? '房間已滿，無法加入' :
        result.reason === 'empty' ? '房間不存在或房主已離開' :
        result.reason === 'wrong_password' ? '密碼錯誤，請再試一次' :
        '無法加入房間，請確認房間號碼'
      )
      setJoining(false)
      return
    }

    channelRef.current = ch
    initRoom(roomId, result.role, result.count as 2 | 3 | 4)
    ch.track({ role: result.role })
    await ch.send({ type: 'broadcast', event: 'player_joined', payload: { role: result.role } })
    nav(`/ban/${roomId}`)
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-5 bg-dark-bg px-4">
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

      <input
        type="text"
        maxLength={16}
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleJoin()}
        placeholder="密碼（如有）"
        disabled={joining}
        className="bg-dark-panel border-2 border-dark-border focus:border-neon-purple outline-none rounded px-4 py-2 text-center text-base tracking-widest text-neon-purple w-64 font-mono transition-colors disabled:opacity-50"
      />

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        onClick={handleJoin}
        disabled={code.length !== 6 || joining}
        className="border-2 border-neon-purple text-neon-purple px-8 py-3 min-h-[44px] rounded tracking-widest hover:bg-neon-purple/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        {joining ? '連線中...' : '確認加入'}
      </button>

      <div className="flex gap-6 items-center">
        <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest">
          ← 返回私人連線
        </button>
        <button
          onClick={() => { if (code.length === 6) nav(`/spectate/${code}`) }}
          disabled={code.length !== 6}
          className="text-gray-700 hover:text-gray-500 text-xs tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          👁 觀戰加入
        </button>
      </div>
    </div>
  )
}
