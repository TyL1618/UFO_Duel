import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'
import type { PlayerId, WeaponId } from '../types/game'
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

const ALL_ROLES: PlayerId[] = ['p1', 'p2', 'p3', 'p4']
// Default colour per slot so each player starts visually distinct.
const ROLE_DEFAULT_COLOR: Record<PlayerId, string> = {
  p1: '#00d4ff', p2: '#ff3366', p3: '#00ff88', p4: '#ffdd00',
}

interface PresenceSlot { role: PlayerId; loadout: PlayerLoadout | null; seed?: number | null }

export default function Loadout() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, setLoadoutData, tryRestorePartialRoom } = useRoom()

  const playerCount = room?.playerCount ?? 2
  const myRole = room?.role ?? 'p1'
  const roles = ALL_ROLES.slice(0, playerCount)

  const [name, setName] = useState('')
  const [color, setColor] = useState('#00d4ff')
  const [selected, setSelected] = useState<WeaponId[]>([])
  const [waiting, setWaiting] = useState(false)
  // Mirror of who has submitted a loadout, for the waiting-room list.
  const [readyStates, setReadyStates] = useState<Partial<Record<PlayerId, { name: string; ready: boolean }>>>({})
  const [presentRoles, setPresentRoles] = useState<PlayerId[]>([myRole])
  const [roomExpired, setRoomExpired] = useState(false)

  const navigatedRef = useRef(false)
  const myLoadoutRef = useRef<PlayerLoadout | null>(null)
  const loadoutsRef = useRef<Partial<Record<PlayerId, PlayerLoadout>>>({})
  const seedRef = useRef<number | null>(null)
  const validityTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const specials = WEAPON_DEFS.filter(w => w.id !== 'normal')

  // Set default color based on role
  useEffect(() => {
    setColor(ROLE_DEFAULT_COLOR[myRole])
  }, [myRole])

  // Guard: redirect home if no room context and can't restore from localStorage
  useEffect(() => {
    if (!room && (!roomId || !tryRestorePartialRoom(roomId))) nav('/')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Collect everyone's loadout from presence (source of truth) + ready broadcasts.
  const ingest = useCallback((slots: PresenceSlot[]) => {
    const present: PlayerId[] = []
    const states: Partial<Record<PlayerId, { name: string; ready: boolean }>> = {}
    for (const s of slots) {
      if (!s?.role) continue
      present.push(s.role)
      if (s.loadout?.name) {
        loadoutsRef.current[s.role] = s.loadout
        states[s.role] = { name: s.loadout.name, ready: true }
      } else {
        states[s.role] = { name: '', ready: false }
      }
      // P1 owns the shared map seed; everyone else copies it.
      if (s.role === 'p1' && s.seed != null) seedRef.current = s.seed
    }
    setPresentRoles(prev => Array.from(new Set([...prev, ...present])))
    setReadyStates(prev => ({ ...prev, ...states }))
  }, [])

  useEffect(() => {
    if (!room) return  // wait for restore to populate room state

    // Supabase forbids .on() after subscribe(). The channel from Create/Join is
    // already subscribed, so tear it down and build a fresh one here — register
    // all listeners BEFORE subscribing.
    channelRef.current?.unsubscribe()
    const ch = supabase.channel(`room:${roomId}`)
    channelRef.current = ch

    const readPresence = () => {
      if (navigatedRef.current) return
      const state = ch.presenceState<PresenceSlot>()
      const slots = Object.values(state).flat()
      if (slots.some(s => s.role !== myRole)) clearTimeout(validityTimerRef.current)
      ingest(slots)
    }

    // A player pressed "準備好！" — their broadcast carries their loadout (+ seed if P1)
    ch.on('broadcast', { event: 'ready' }, ({ payload }) => {
      if (navigatedRef.current) return
      const { role, loadout, seed } = payload as { role: PlayerId; loadout: PlayerLoadout; seed?: number | null }
      if (loadout?.name) {
        loadoutsRef.current[role] = loadout
        setReadyStates(prev => ({ ...prev, [role]: { name: loadout.name, ready: true } }))
      }
      if (role === 'p1' && seed != null) seedRef.current = seed
    })

    ch.on('presence', { event: 'sync' }, readPresence)
    ch.on('presence', { event: 'join' }, readPresence)

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role: myRole, loadout: null })
        validityTimerRef.current = setTimeout(() => {
          setRoomExpired(true)
          setTimeout(() => nav('/'), 3000)
        }, 12000)
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
  const isP1 = myRole === 'p1'

  const handleReady = () => {
    const mine: PlayerLoadout = { name: name.trim(), color, weapons: selected }
    myLoadoutRef.current = mine
    loadoutsRef.current[myRole] = mine
    // P1 generates the shared seed and broadcasts it; everyone else copies it.
    if (isP1 && seedRef.current === null) seedRef.current = Math.floor(Math.random() * 1_000_000)
    setWaiting(true)
    setReadyStates(prev => ({ ...prev, [myRole]: { name: mine.name, ready: true } }))
    const ch = channelRef.current
    ch?.track({ role: myRole, loadout: mine, seed: seedRef.current })
    ch?.send({ type: 'broadcast', event: 'ready', payload: { role: myRole, loadout: mine, seed: seedRef.current } })
  }

  // Everyone navigates independently once all N loadouts + the seed are known.
  const tryNavigate = useCallback(() => {
    if (navigatedRef.current) return
    const seed = seedRef.current
    if (seed === null) return
    if (!roles.every(r => loadoutsRef.current[r]?.name)) return
    navigatedRef.current = true
    setLoadoutData({ ...loadoutsRef.current }, seed)
    // Delay so the last presence update propagates before we unsubscribe.
    setTimeout(() => nav(`/game/${roomId}`), 1200)
  }, [roles, setLoadoutData, nav, roomId])

  useEffect(() => {
    if (waiting) tryNavigate()
  }, [waiting, readyStates, tryNavigate])

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
        <span className="ml-3 text-sm" style={{ color: ROLE_DEFAULT_COLOR[myRole] }}>
          ({myRole.toUpperCase()}{playerCount > 2 ? ` · ${playerCount}人` : ''})
        </span>
      </div>

      {waiting ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-5">
          <div className="text-neon-green text-lg tracking-widest">準備完成！</div>
          <div className="flex flex-col gap-2 w-52">
            {roles.map(pid => {
              const isMe = pid === myRole
              const st = readyStates[pid]
              const isReady = st?.ready ?? false
              const isHere = presentRoles.includes(pid)
              const displayName = isMe ? (name.trim() || pid.toUpperCase()) : (st?.name || pid.toUpperCase())
              return (
                <div key={pid} className="flex items-center justify-between px-3 py-2 rounded border border-dark-border text-sm font-mono">
                  <span style={{ color: ROLE_DEFAULT_COLOR[pid] }}>
                    {pid.toUpperCase()} {displayName}
                  </span>
                  <span className={isReady ? 'text-neon-green' : isHere ? 'text-gray-600 animate-pulse' : 'text-gray-700 animate-pulse'}>
                    {isReady ? '✓ 準備' : isHere ? '整裝中...' : '未到...'}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="text-gray-400 text-xs animate-pulse tracking-wider">
            等待所有玩家 ({roles.filter(r => readyStates[r]?.ready).length}/{playerCount})...
          </div>
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
