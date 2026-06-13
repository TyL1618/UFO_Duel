import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRoom } from '../contexts/RoomContext'
import { supabase } from '../lib/supabase'
import LeftNotice from '../components/LeftNotice'
import type { PlayerId } from '../types/game'

const UFO_COLORS = [
  { label: '藍', value: '#00d4ff' },
  { label: '紫', value: '#9d00ff' },
  { label: '綠', value: '#00ff88' },
  { label: '紅', value: '#ff3366' },
  { label: '黃', value: '#ffdd00' },
  { label: '白', value: '#ffffff' },
]

const ROLE_DEFAULT_COLOR: Record<PlayerId, string> = {
  p1: '#00d4ff', p2: '#ff3366', p3: '#00ff88', p4: '#ffdd00',
}

// First page after entering a room: each player sets their name + UFO color
// before weapon selection. Keeps "who am I" separate from "what do I bring".
export default function Profile() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, setProfile, clearRoom, tryRestorePartialRoom } = useRoom()

  const myRole = room?.role ?? 'p1'
  const [name, setName] = useState(room?.profile?.name ?? '')
  const [color, setColor] = useState(room?.profile?.color ?? ROLE_DEFAULT_COLOR[myRole])
  const [oppLeft, setOppLeft] = useState(false)
  const navigatedRef = useRef(false)

  useEffect(() => {
    if (!room && (!roomId || !tryRestorePartialRoom(roomId))) nav('/')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!room?.profile) setColor(ROLE_DEFAULT_COLOR[myRole])
  }, [myRole]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe so we can hear the other player leaving (room_closed), and tell
  // them if we close the tab. Solo never reaches this page.
  useEffect(() => {
    if (!roomId || roomId === 'solo') return
    channelRef.current?.unsubscribe()
    const ch = supabase.channel(`room:${roomId}`)
    channelRef.current = ch
    ch.on('broadcast', { event: 'room_closed' }, () => {
      if (navigatedRef.current) return
      navigatedRef.current = true
      setOppLeft(true)
      setTimeout(() => { clearRoom(); nav('/') }, 1600)
    })
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ role: myRole }) })
    const onUnload = () => ch.send({ type: 'broadcast', event: 'room_closed', payload: { role: myRole } })
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const canConfirm = name.trim().length > 0

  const confirm = () => {
    if (!canConfirm) return
    navigatedRef.current = true
    setProfile(name.trim(), color)
    nav(`/ban/${roomId}`, { replace: true })
  }

  const leaveRoom = () => {
    navigatedRef.current = true
    channelRef.current?.send({ type: 'broadcast', event: 'room_closed', payload: { role: myRole } })
    clearRoom()
    nav('/')
  }

  return (
    <div className="relative w-full h-full bg-dark-bg overflow-y-auto">
      <LeftNotice show={oppLeft} />
      <button onClick={leaveRoom} className="absolute top-4 left-4 z-20 text-gray-600 hover:text-gray-300 text-xs tracking-widest transition-colors">
        ← 主選單
      </button>

      {/* Two-column landscape layout: preview on the left, form on the right */}
      <div className="w-full h-full flex items-center justify-center gap-10 px-6 py-4">
        {/* Left: preview */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="text-neon-blue tracking-widest text-base font-mono mb-1">
            建立角色 <span className="text-xs" style={{ color: ROLE_DEFAULT_COLOR[myRole] }}>({myRole.toUpperCase()})</span>
          </div>
          <div
            className="w-24 h-24 rounded-full border-2 transition-all"
            style={{ background: color, borderColor: '#fff', boxShadow: `0 0 28px ${color}` }}
          />
          <div className="text-sm font-mono tracking-wider" style={{ color }}>
            {name.trim() || myRole.toUpperCase()}
          </div>
        </div>

        {/* Right: form */}
        <div className="flex flex-col gap-4 w-full max-w-xs shrink-0">
          <div>
            <div className="text-gray-400 text-xs mb-1 tracking-widest">玩家名稱</div>
            <input
              type="text" maxLength={12} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              placeholder="輸入名稱"
              autoFocus
              className="w-full bg-dark-panel border border-dark-border focus:border-neon-blue outline-none rounded px-3 py-2 text-white font-mono tracking-wider transition-colors"
            />
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-2 tracking-widest">飛碟顏色</div>
            <div className="flex gap-3">
              {UFO_COLORS.map(c => (
                <button key={c.value} onClick={() => setColor(c.value)} title={c.label}
                  className="w-9 h-9 rounded-full border-2 transition-all"
                  style={{ background: c.value, borderColor: color === c.value ? '#fff' : 'transparent', boxShadow: color === c.value ? `0 0 12px ${c.value}` : 'none' }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className="w-full border-2 border-neon-green text-neon-green py-3 rounded tracking-widest text-lg
              hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88]
              disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  )
}
