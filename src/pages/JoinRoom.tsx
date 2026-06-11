import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'

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

    // Subscribe first (without tracking), wait for presence sync to check if P2 slot is taken
    const result = await new Promise<'ok' | 'full' | 'error'>((resolve) => {
      const timeout = setTimeout(() => resolve('ok'), 2000)
      ch.on('presence', { event: 'sync' }, () => {
        clearTimeout(timeout)
        const state = ch.presenceState<{ role: string }>()
        const all = Object.values(state).flat()
        resolve(all.some(u => u.role === 'p2') ? 'full' : 'ok')
      })
      ch.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') { clearTimeout(timeout); resolve('error') }
      })
    })

    if (result === 'full') {
      ch.unsubscribe()
      setError('房間已滿，無法加入')
      setJoining(false)
      return
    }
    if (result === 'error') {
      ch.unsubscribe()
      setError('無法加入房間，請確認房間號碼')
      setJoining(false)
      return
    }

    // P2 slot confirmed available — now claim it
    channelRef.current = ch
    initRoom(roomId, 'p2')
    ch.track({ role: 'p2' })
    await ch.send({ type: 'broadcast', event: 'p2_joined', payload: {} })
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

      <button onClick={() => nav('/')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest">
        ← 返回
      </button>
    </div>
  )
}
