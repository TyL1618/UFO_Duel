import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'
import { GAME_VERSION } from '../game/constants'
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
const ROLE_DEFAULT_COLOR: Record<PlayerId, string> = {
  p1: '#00d4ff', p2: '#ff3366', p3: '#00ff88', p4: '#ffdd00',
}

interface PresenceSlot { role: PlayerId; loadout: PlayerLoadout | null; seed?: number | null; version?: string }

export default function Loadout() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, setLoadoutData, tryRestorePartialRoom } = useRoom()
  const bannedWeapons = room?.bannedWeapons ?? []

  const playerCount = room?.playerCount ?? 2
  const myRole = room?.role ?? 'p1'
  const roles = ALL_ROLES.slice(0, playerCount)
  const isP1 = myRole === 'p1'

  const [name, setName] = useState('')
  const [color, setColor] = useState(ROLE_DEFAULT_COLOR[myRole])
  const [selected, setSelected] = useState<WeaponId[]>([])
  const [isLocked, setIsLocked] = useState(false)          // I pressed ready
  const [readyStates, setReadyStates] = useState<Partial<Record<PlayerId, { name: string; ready: boolean }>>>({})
  const [presentRoles, setPresentRoles] = useState<PlayerId[]>([myRole])
  const [roomExpired, setRoomExpired] = useState(false)
  const [randomVotes, setRandomVotes] = useState<PlayerId[]>([])
  const [randomLocked, setRandomLocked] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const [versionMismatch, setVersionMismatch] = useState(false)

  const navigatedRef = useRef(false)
  const myLoadoutRef = useRef<PlayerLoadout | null>(null)
  const loadoutsRef = useRef<Partial<Record<PlayerId, PlayerLoadout>>>({})
  const seedRef = useRef<number | null>(null)
  const validityTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const countdownRef = useRef<ReturnType<typeof setInterval>>()

  const specials = WEAPON_DEFS.filter(w => w.id !== 'normal')
  const canReady = name.trim().length > 0 && selected.length === 4
  // Voting for random is disabled once any player is already locked (ready)
  const anyLocked = Object.values(readyStates).some(s => s?.ready)
  const alreadyVoted = randomVotes.includes(myRole)

  useEffect(() => {
    setColor(ROLE_DEFAULT_COLOR[myRole])
  }, [myRole])

  useEffect(() => {
    if (!room && (!roomId || !tryRestorePartialRoom(roomId))) nav('/')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ingest = useCallback((slots: PresenceSlot[]) => {
    const present: PlayerId[] = []
    const states: Partial<Record<PlayerId, { name: string; ready: boolean }>> = {}
    const hasVersionMismatch = slots.some(s => s?.version && s.role !== myRole && s.version !== GAME_VERSION)
    setVersionMismatch(hasVersionMismatch)
    for (const s of slots) {
      if (!s?.role) continue
      present.push(s.role)
      if (s.loadout?.name) {
        loadoutsRef.current[s.role] = s.loadout
        states[s.role] = { name: s.loadout.name, ready: true }
      } else {
        states[s.role] = { name: '', ready: false }
      }
      if (s.role === 'p1' && s.seed != null) seedRef.current = s.seed
    }
    setPresentRoles(prev => Array.from(new Set([...prev, ...present])))
    setReadyStates(prev => ({ ...prev, ...states }))
  }, [])

  useEffect(() => {
    if (!room) return

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

    ch.on('broadcast', { event: 'ready' }, ({ payload }) => {
      if (navigatedRef.current) return
      const { role, loadout, seed } = payload as { role: PlayerId; loadout: PlayerLoadout; seed?: number | null }
      if (loadout?.name) {
        loadoutsRef.current[role] = loadout
        setReadyStates(prev => ({ ...prev, [role]: { name: loadout.name, ready: true } }))
      }
      if (role === 'p1' && seed != null) seedRef.current = seed
    })

    // Random-unified voting
    ch.on('broadcast', { event: 'random_vote' }, ({ payload }) => {
      const { role } = payload as { role: PlayerId }
      setRandomVotes(prev => prev.includes(role) ? prev : [...prev, role])
    })

    // P1 broadcasts the agreed random weapon set
    ch.on('broadcast', { event: 'random_loadout' }, ({ payload }) => {
      const { weapons } = payload as { weapons: WeaponId[] }
      setSelected(weapons)
      setRandomVotes([])
      setRandomLocked(true)
    })

    // Host kick
    ch.on('broadcast', { event: 'kick' }, ({ payload }) => {
      const { role } = payload as { role: PlayerId }
      if (role === myRole) {
        nav('/')
      } else {
        setPresentRoles(prev => prev.filter(r => r !== role))
        setReadyStates(prev => { const next = { ...prev }; delete next[role]; return next })
      }
    })

    ch.on('presence', { event: 'sync' }, readPresence)
    ch.on('presence', { event: 'join' }, readPresence)

    ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      if (navigatedRef.current) return
      const leftRoles = (leftPresences as { role?: PlayerId }[])
        .map(p => p.role).filter((r): r is PlayerId => !!r)
      leftRoles.forEach(role => {
        if (role === myRole) return
        delete loadoutsRef.current[role]
        setReadyStates(prev => { const next = { ...prev }; delete next[role]; return next })
        setPresentRoles(prev => prev.filter(r => r !== role))
      })
      if (leftRoles.some(r => r !== myRole)) setIsLocked(false)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role: myRole, loadout: null, version: GAME_VERSION })
        validityTimerRef.current = setTimeout(() => {
          setRoomExpired(true)
          setTimeout(() => nav('/'), 3000)
        }, 12000)
      }
    })
  }, [room?.roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When all random votes in: P1 generates + broadcasts the weapon set
  useEffect(() => {
    if (randomVotes.length < playerCount) return
    if (!isP1) return
    const pool = WEAPON_DEFS.filter(w => w.id !== 'normal')
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const weapons = shuffled.slice(0, 4).map(w => w.id) as WeaponId[]
    channelRef.current?.send({ type: 'broadcast', event: 'random_loadout', payload: { weapons } })
    setSelected(weapons)
    setRandomVotes([])
    setRandomLocked(true)
  }, [randomVotes.length, playerCount, isP1]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: WeaponId) => {
    if (isLocked || randomLocked) return
    setSelected(prev =>
      prev.includes(id) ? prev.filter(w => w !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  const handleReady = () => {
    if (!canReady || isLocked) return
    const mine: PlayerLoadout = { name: name.trim(), color, weapons: selected }
    myLoadoutRef.current = mine
    loadoutsRef.current[myRole] = mine
    if (isP1 && seedRef.current === null) seedRef.current = Math.floor(Math.random() * 1_000_000)
    setIsLocked(true)
    setReadyStates(prev => ({ ...prev, [myRole]: { name: mine.name, ready: true } }))
    const ch = channelRef.current
    ch?.track({ role: myRole, loadout: mine, seed: seedRef.current, version: GAME_VERSION })
    ch?.send({ type: 'broadcast', event: 'ready', payload: { role: myRole, loadout: mine, seed: seedRef.current } })
  }

  const handleRandomVote = () => {
    if (alreadyVoted || anyLocked || randomLocked) return
    setRandomVotes(prev => prev.includes(myRole) ? prev : [...prev, myRole])
    channelRef.current?.send({ type: 'broadcast', event: 'random_vote', payload: { role: myRole } })
  }

  // Start countdown when all players are ready
  const tryNavigate = useCallback(() => {
    if (navigatedRef.current) return
    const seed = seedRef.current
    if (seed === null) return
    if (!roles.every(r => loadoutsRef.current[r]?.name)) return
    // Start 3-second countdown
    if (countdown !== null) return  // already counting
    setCountdown(3)
  }, [roles, countdown])

  useEffect(() => {
    if (isLocked) tryNavigate()
  }, [isLocked, readyStates, tryNavigate])

  // Countdown tick: navigate when it hits 0
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      if (!navigatedRef.current) {
        navigatedRef.current = true
        setLoadoutData({ ...loadoutsRef.current }, seedRef.current!)
        setTimeout(() => nav(`/map-reveal/${roomId}`, { replace: true }), 200)
      }
      return
    }
    countdownRef.current = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000)
    return () => clearTimeout(countdownRef.current)
  }, [countdown]) // eslint-disable-line react-hooks/exhaustive-deps

  const readyCount = roles.filter(r => readyStates[r]?.ready).length

  return (
    <div className="flex flex-col items-center w-full h-full bg-dark-bg py-4 px-4 gap-4 overflow-auto">
      {roomExpired && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-red-400 text-lg tracking-widest text-center">
            房間不存在或已結束<br />
            <span className="text-gray-500 text-sm">3 秒後返回首頁...</span>
          </div>
        </div>
      )}

      {/* Version mismatch warning */}
      {versionMismatch && (
        <div className="w-full max-w-sm shrink-0 px-3 py-2 rounded border border-yellow-500/60 bg-yellow-500/10 text-yellow-400 text-xs font-mono tracking-wider text-center">
          ⚠️ 版本不符 — 請對手重新整理頁面（Ctrl+Shift+R）後再試，否則對局可能出現異常
        </div>
      )}

      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 select-none pointer-events-none">
          <div className="text-neon-green text-2xl tracking-widest mb-3">全員準備完成！</div>
          <div className="text-8xl font-bold text-white tabular-nums"
            style={{ textShadow: '0 0 40px #00ff88' }}>{countdown}</div>
        </div>
      )}

      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-sm shrink-0">
        <div className="text-neon-blue tracking-widest text-base font-mono">
          整裝 — {roomId}
          <span className="ml-2 text-sm" style={{ color: ROLE_DEFAULT_COLOR[myRole] }}>
            ({myRole.toUpperCase()}{playerCount > 2 ? ` · ${playerCount}人` : ''})
          </span>
        </div>
      </div>

      {/* Player list — always visible */}
      <div className="w-full max-w-sm shrink-0">
        <div className="flex flex-col gap-1.5">
          {roles.map(pid => {
            const isMe = pid === myRole
            const st = readyStates[pid]
            const isReady = st?.ready ?? false
            const isHere = presentRoles.includes(pid)
            const displayName = isMe ? (name.trim() || pid.toUpperCase()) : (st?.name || pid.toUpperCase())
            return (
              <div key={pid} className="flex items-center justify-between px-3 py-2 rounded border border-dark-border text-xs font-mono"
                style={{ borderColor: isMe ? ROLE_DEFAULT_COLOR[pid] + '80' : undefined }}>
                <span style={{ color: ROLE_DEFAULT_COLOR[pid] }}>
                  {pid.toUpperCase()} {displayName}{isMe ? ' ◀' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <span className={isReady ? 'text-neon-green font-bold' : isHere ? 'text-gray-600 animate-pulse' : 'text-gray-700 animate-pulse'}>
                    {isReady ? '✓ 準備' : isHere ? '整裝中' : '未連線'}
                  </span>
                  {isP1 && !isMe && (
                    <button
                      onClick={() => {
                        channelRef.current?.send({ type: 'broadcast', event: 'kick', payload: { role: pid } })
                        setPresentRoles(prev => prev.filter(r => r !== pid))
                        setReadyStates(prev => { const next = { ...prev }; delete next[pid]; return next })
                      }}
                      className="text-gray-700 hover:text-red-400 transition-colors text-sm leading-none"
                      title="踢出玩家"
                    >✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-gray-600 text-xs text-right mt-1 tracking-wider">{readyCount}/{playerCount} 準備完成</div>
      </div>

      {/* ── Editing area (locked when isLocked) ── */}
      <div className={`flex flex-col gap-4 w-full max-w-sm flex-1 ${isLocked ? 'opacity-40 pointer-events-none' : ''}`}>
        {/* Name */}
        <div>
          <div className="text-gray-400 text-xs mb-1 tracking-widest">玩家名稱</div>
          <input
            type="text" maxLength={12} value={name} onChange={e => setName(e.target.value)}
            placeholder="輸入名稱"
            className="w-full bg-dark-panel border border-dark-border focus:border-neon-blue outline-none rounded px-3 py-2 text-white font-mono tracking-wider transition-colors"
          />
        </div>

        {/* Color */}
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

        {/* Weapons */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-gray-400 text-xs tracking-widest">
              選擇 4 種特殊武器（{selected.length}/4）
              {randomLocked && <span className="ml-2 text-yellow-500">🎲 已隨機鎖定</span>}
            </div>
          </div>
          <div className={`grid grid-cols-2 gap-2 ${randomLocked && !isLocked ? 'opacity-60 pointer-events-none' : ''}`}>
            {specials.map(w => {
              const active = selected.includes(w.id)
              const banned = bannedWeapons.includes(w.id)
              return (
                <button key={w.id} onClick={() => !banned && toggle(w.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-all relative
                    ${banned ? 'border-red-900/40 opacity-40 cursor-not-allowed' : ''}
                    ${!banned && active ? 'border-neon-green bg-neon-green/10 text-neon-green' : ''}
                    ${!banned && !active ? 'border-dark-border text-gray-400 hover:border-gray-500' : ''}
                    ${!banned && !active && selected.length >= 4 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <span className="text-xl">{w.icon}</span>
                  <div className="flex-1">
                    <div className="text-xs font-bold">{w.label}</div>
                    <div className="text-xs opacity-60">
                      {banned ? '已禁用' : w.damage > 0 ? `傷害 ${w.damage}` : '特殊'} × {banned ? '—' : w.ammo > 0 ? `${w.ammo}發` : '∞'}
                    </div>
                  </div>
                  {banned && <span className="text-red-500 text-xs font-bold">BAN</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm flex flex-col gap-2 shrink-0 pb-2">
        {/* Random unified vote */}
        <button
          onClick={handleRandomVote}
          disabled={alreadyVoted || anyLocked || isLocked || randomLocked}
          className="w-full py-2 rounded text-xs border border-dark-border text-gray-500
            hover:border-gray-400 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed
            tracking-widest transition-all"
        >
          {alreadyVoted
            ? `隨機一致 ✓ (${randomVotes.length}/${playerCount})`
            : `隨機一致武器 (${randomVotes.length}/${playerCount} 同意)`}
        </button>

        {/* Ready button */}
        {!isLocked ? (
          <button
            disabled={!canReady}
            onClick={handleReady}
            className="w-full border-2 border-neon-green text-neon-green py-3 rounded tracking-widest text-lg
              hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88]
              disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            準備好！
          </button>
        ) : (
          <div className="w-full border-2 border-neon-green/40 text-neon-green/60 py-3 rounded tracking-widest text-lg text-center select-none">
            等待其他玩家...
          </div>
        )}
      </div>
    </div>
  )
}
