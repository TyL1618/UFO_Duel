import { useEffect, useRef, useState } from 'react'
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
  const [copied, setCopied] = useState(false)
  const [p2Joined, setP2Joined] = useState(false)
  const navigatedRef = useRef(false)

  useEffect(() => {
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
      setTimeout(() => nav(`/loadout/${roomId}`), 600)
    }

    // Primary: Presence — reliable even if broadcast is missed
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ role: string }>()
      const all = Object.values(state).flat()
      if (all.some(u => u.role === 'p2')) goToLoadout()
    })

    // Backup: Broadcast
    ch.on('broadcast', { event: 'player_joined' }, goToLoadout)

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ role: 'p1' })
    })

    channelRef.current = ch
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-8 bg-dark-bg">
      <div className="text-gray-400 tracking-widest text-sm">房間號碼</div>

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
