import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'

function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export default function CreateRoom() {
  const nav = useNavigate()
  const { channelRef, initRoom } = useRoom()
  const [roomId] = useState(generateRoomId)
  const [password, setPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [p2Joined, setP2Joined] = useState(false)
  const navigatedRef = useRef(false)

  const openRoom = () => {
    setReady(true)
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    initRoom(roomId, 'p1')
    const ch = supabase.channel(`room:${roomId}`)

    const goToLoadout = () => {
      if (navigatedRef.current) return
      navigatedRef.current = true
      setP2Joined(true)
      setTimeout(() => nav(`/profile/${roomId}`), 600)
    }

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ role: string }>()
      const all = Object.values(state).flat()
      if (all.some(u => u.role === 'p2')) goToLoadout()
    })
    ch.on('broadcast', { event: 'player_joined' }, goToLoadout)

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const meta: Record<string, unknown> = { role: 'p1' }
        if (password) meta.password = password
        ch.track(meta)
      }
    })

    channelRef.current = ch
  }

  const copy = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg px-4">
        <div className="text-neon-blue text-xl tracking-widest">1v1 對戰</div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <label className="text-gray-500 text-xs tracking-widest">房間密碼（選填）</label>
          <input
            type="text"
            maxLength={16}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && openRoom()}
            placeholder="不設密碼則留空"
            className="bg-dark-panel border-2 border-dark-border focus:border-neon-blue outline-none rounded px-4 py-3 text-center text-lg tracking-widest text-neon-blue w-full font-mono transition-colors"
            autoFocus
          />
          <button
            onClick={openRoom}
            className="w-full border-2 border-neon-blue text-neon-blue py-3 rounded tracking-widest hover:bg-neon-blue/10 transition-all"
          >
            {password ? '🔒 建立房間' : '建立房間'}
          </button>
        </div>
        <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest">
          ← 返回私人連線
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-8 bg-dark-bg">
      <div className="text-gray-400 tracking-widest text-sm">
        房間號碼{password && <span className="ml-2 text-neon-blue text-xs">🔒 已設密碼</span>}
      </div>

      <button
        onClick={copy}
        className="text-7xl font-bold tracking-[0.3em] text-neon-blue drop-shadow-[0_0_30px_#00d4ff] hover:scale-105 transition-transform"
      >
        {roomId}
      </button>
      <div className="text-gray-500 text-sm h-4">
        {copied ? '已複製！' : '點擊號碼複製'}
      </div>

      {p2Joined ? (
        <div className="text-neon-green text-sm tracking-widest animate-pulse">對手已加入，跳轉中...</div>
      ) : (
        <div className="text-gray-500 text-sm animate-pulse">等待對手加入...</div>
      )}

      <button onClick={() => nav('/private')} className="text-gray-600 hover:text-gray-400 text-sm tracking-widest mt-4">
        ← 返回私人連線
      </button>
    </div>
  )
}
