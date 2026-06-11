import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'
import type { WeaponId } from '../types/game'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerLoadout } from '../contexts/RoomContext'

const UFO_COLORS = [
  { label: '藍', value: '#00d4ff' },
  { label: '紫', value: '#9d00ff' },
  { label: '綠', value: '#00ff88' },
  { label: '紅', value: '#ff3366' },
  { label: '黃', value: '#ffdd00' },
  { label: '白', value: '#ffffff' },
]

export default function Loadout() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, setLoadoutData, tryRestorePartialRoom } = useRoom()

  const [name, setName] = useState('')
  const [color, setColor] = useState('#00d4ff')
  const [selected, setSelected] = useState<WeaponId[]>([])
  const [waiting, setWaiting] = useState(false)
  const [oppReady, setOppReady] = useState(false)
  const [oppName, setOppName] = useState('')
  const [oppPresent, setOppPresent] = useState(false)  // true once opp tracked in presence

  const [roomExpired, setRoomExpired] = useState(false)

  const navigatedRef = useRef(false)
  const myLoadoutRef = useRef<PlayerLoadout | null>(null)
  const oppLoadoutRef = useRef<PlayerLoadout | null>(null)
  const seedRef = useRef<number | null>(null)
  const validityTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const specials = WEAPON_DEFS.filter(w => w.id !== 'normal')

  // Set default color based on role
  useEffect(() => {
    if (room?.role === 'p2') setColor('#ff3366')
  }, [room?.role])

  // Guard: redirect home if no room context and can't restore from localStorage
  useEffect(() => {
    if (!room && (!roomId || !tryRestorePartialRoom(roomId))) nav('/')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!room) return  // wait for restore to populate room state
    const role = room.role

    // Supabase forbids .on() after subscribe(). The channel from
    // Create/JoinRoom is already subscribed, so tear it down and build a
    // fresh one here — register all listeners BEFORE subscribing.
    channelRef.current?.unsubscribe()
    const ch = supabase.channel(`room:${roomId}`)
    channelRef.current = ch

    // Opponent clicked "準備好！"
    // P1's broadcast includes the shared seed; P2 extracts it so both can navigate independently
    ch.on('broadcast', { event: 'ready' }, ({ payload }) => {
      if (navigatedRef.current) return
      const { loadout, seed } = payload as { loadout: PlayerLoadout; seed?: number | null }
      if (loadout?.name) {
        setOppName(loadout.name)
        setOppReady(true)
        oppLoadoutRef.current = loadout
      }
      if (seed != null) seedRef.current = seed
    })

    // Presence fallback: catches late-arrivals / reconnects
    const checkOppPresence = () => {
      if (navigatedRef.current) return
      const state = ch.presenceState<{ role: string; loadout: PlayerLoadout | null; seed?: number | null }>()
      const all = Object.values(state).flat()
      const opp = role === 'p1' ? all.find(u => u.role === 'p2') : all.find(u => u.role === 'p1')
      if (opp) { clearTimeout(validityTimerRef.current); setOppPresent(true) }
      if (opp?.loadout?.name) {
        setOppName(opp.loadout.name)
        setOppReady(true)
        oppLoadoutRef.current = opp.loadout
      }
      // P2 reads seed from P1's presence (fallback if broadcast was missed)
      if (role === 'p2' && seedRef.current === null) {
        const p1Entry = all.find(u => u.role === 'p1')
        if (p1Entry?.seed != null) seedRef.current = p1Entry.seed
      }
    }
    ch.on('presence', { event: 'sync' }, checkOppPresence)
    ch.on('presence', { event: 'join' }, checkOppPresence)

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role, loadout: null })
        validityTimerRef.current = setTimeout(() => {
          setRoomExpired(true)
          setTimeout(() => nav('/'), 3000)
        }, 10000)
      }
    })
  }, [room?.roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: WeaponId) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(w => w !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  const ready = name.trim().length > 0 && selected.length === 4

  const isP1 = room?.role === 'p1'

  const handleReady = () => {
    const mine: PlayerLoadout = { name: name.trim(), color, weapons: selected }
    myLoadoutRef.current = mine
    // P1 generates the shared seed and includes it in the broadcast; P2 extracts it
    if (isP1) seedRef.current = Math.floor(Math.random() * 1_000_000)
    setWaiting(true)
    const ch = channelRef.current
    ch?.track({ role: room?.role ?? 'p1', loadout: mine, seed: seedRef.current })
    ch?.send({ type: 'broadcast', event: 'ready', payload: { loadout: mine, seed: seedRef.current } })
  }

  // Both P1 and P2 navigate independently once they have all data in refs
  const tryNavigate = useCallback(() => {
    if (navigatedRef.current) return
    const myL = myLoadoutRef.current
    const oppL = oppLoadoutRef.current
    const seed = seedRef.current
    if (!myL || !oppL || seed === null) return
    navigatedRef.current = true
    const myRole = room?.role ?? 'p1'
    const oppRole = myRole === 'p1' ? 'p2' : 'p1'
    setLoadoutData({ [myRole]: myL, [oppRole]: oppL }, seed)
    // Delay so the other player's presence update has time to propagate before
    // this side unsubscribes from the channel on navigate.
    setTimeout(() => nav(`/game/${roomId}`), 1500)
  }, [room?.role, setLoadoutData, nav, roomId])

  useEffect(() => {
    if (waiting && oppReady) tryNavigate()
  }, [waiting, oppReady, tryNavigate])

  return (
    <div className="flex flex-col items-center w-full h-full bg-dark-bg py-6 px-4 gap-5 overflow-auto">
      {roomExpired && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-red-400 text-lg tracking-widest text-center">
            房間不存在或已結束<br />
            <span className="text-gray-500 text-sm">3 秒後返回首頁...</span>
          </div>
        </div>
      )}
      <div className="text-neon-blue tracking-widest text-lg">
        整裝 — 房間 {roomId}
        {room?.role && (
          <span className="ml-3 text-sm" style={{ color: room.role === 'p1' ? '#00d4ff' : '#ff3366' }}>
            ({room.role.toUpperCase()})
          </span>
        )}
      </div>

      {waiting ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-5">
          <div className="text-neon-green text-lg tracking-widest">準備完成！</div>
          <div className="flex flex-col gap-2 w-48">
            {(['p1', 'p2'] as const).map(pid => {
              const isMe = pid === room?.role
              const isReady = isMe ? waiting : oppReady
              const displayName = isMe ? (name.trim() || pid.toUpperCase()) : (oppName || pid.toUpperCase())
              return (
                <div key={pid} className="flex items-center justify-between px-3 py-2 rounded border border-dark-border text-sm font-mono">
                  <span style={{ color: pid === 'p1' ? '#00d4ff' : '#ff3366' }}>
                    {pid.toUpperCase()} {displayName}
                  </span>
                  <span className={isReady ? 'text-neon-green' : isMe || oppPresent ? 'text-gray-600 animate-pulse' : 'text-gray-700 animate-pulse'}>
                    {isReady ? '✓ 準備' : isMe || oppPresent ? '等待...' : '未到...'}
                  </span>
                </div>
              )
            })}
          </div>
          {oppReady && <div className="text-gray-400 text-xs animate-pulse tracking-wider">跳轉中...</div>}
        </div>
      ) : (
        <>
          {/* Name */}
          <div className="w-full max-w-sm">
            <div className="text-gray-400 text-xs mb-1 tracking-widest">玩家名稱</div>
            <input
              type="text"
              maxLength={12}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="輸入名稱"
              className="w-full bg-dark-panel border border-dark-border focus:border-neon-blue outline-none rounded px-3 py-2 text-white font-mono tracking-wider transition-colors"
            />
          </div>

          {/* Color */}
          <div className="w-full max-w-sm">
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

          {/* Weapons */}
          <div className="w-full max-w-sm">
            <div className="text-gray-400 text-xs mb-2 tracking-widest">
              選擇 4 種特殊武器（{selected.length}/4）
            </div>
            <div className="grid grid-cols-2 gap-2">
              {specials.map(w => {
                const active = selected.includes(w.id)
                return (
                  <button key={w.id} onClick={() => toggle(w.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-all
                      ${active ? 'border-neon-green bg-neon-green/10 text-neon-green' : 'border-dark-border text-gray-400 hover:border-gray-500'}
                      ${!active && selected.length >= 4 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-xl">{w.icon}</span>
                    <div>
                      <div className="text-xs font-bold">{w.label}</div>
                      <div className="text-xs opacity-60">傷害 {w.damage} × 2發</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <button
            disabled={!ready}
            onClick={handleReady}
            className="mt-auto border-2 border-neon-green text-neon-green px-10 py-3 rounded tracking-widest text-lg hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            準備好！
          </button>
        </>
      )}
    </div>
  )
}
