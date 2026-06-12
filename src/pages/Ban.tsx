import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'
import type { PlayerId, WeaponId } from '../types/game'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'

const ALL_ROLES: PlayerId[] = ['p1', 'p2', 'p3', 'p4']
const ROLE_COLOR: Record<PlayerId, string> = {
  p1: '#00d4ff', p2: '#ff3366', p3: '#00ff88', p4: '#ffdd00',
}
const BAN_TIMER = 30

export default function Ban() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, setBannedWeapons, tryRestorePartialRoom } = useRoom()

  const playerCount = room?.playerCount ?? 2
  const myRole = room?.role ?? 'p1'
  const roles = ALL_ROLES.slice(0, playerCount)
  const specials = WEAPON_DEFS.filter(w => w.id !== 'normal')

  const [myChoice, setMyChoice] = useState<WeaponId | null>(null)
  const [myLocked, setMyLocked] = useState(false)
  // key = role, value = their banned weapon (only populated after reveal)
  const [confirms, setConfirms] = useState<Partial<Record<PlayerId, WeaponId>>>({})
  const [phase, setPhase] = useState<'choosing' | 'reveal' | 'done'>('choosing')
  const [timer, setTimer] = useState(BAN_TIMER)

  const navigatedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const confirmsRef = useRef<Partial<Record<PlayerId, WeaponId>>>({})
  const myChoiceRef = useRef<WeaponId | null>(null)

  useEffect(() => { myChoiceRef.current = myChoice }, [myChoice])
  useEffect(() => { confirmsRef.current = confirms }, [confirms])

  useEffect(() => {
    if (!room && (!roomId || !tryRestorePartialRoom(roomId!))) { nav('/'); return }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doNavigate = useCallback((banned: WeaponId[]) => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    setBannedWeapons(banned)
    setTimeout(() => nav(`/loadout/${roomId}`, { replace: true }), 2000)
  }, [roomId, setBannedWeapons, nav])

  const checkAllConfirmed = useCallback((current: Partial<Record<PlayerId, WeaponId>>) => {
    if (roles.every(r => current[r] != null)) {
      setPhase('reveal')
      const banned = Object.values(current) as WeaponId[]
      doNavigate(banned)
    }
  }, [roles, doNavigate])

  const lockIn = useCallback((weapon: WeaponId) => {
    if (myLocked) return
    setMyLocked(true)
    const updated = { ...confirmsRef.current, [myRole]: weapon }
    setConfirms(updated)
    confirmsRef.current = updated
    channelRef.current?.send({
      type: 'broadcast', event: 'ban_confirm',
      payload: { role: myRole, weapon },
    })
    checkAllConfirmed(updated)
  }, [myLocked, myRole, channelRef, checkAllConfirmed])

  // 30-second countdown → auto-lock if not yet done
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          const fallback = myChoiceRef.current ?? specials[0].id
          lockIn(fallback)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!room) return
    channelRef.current?.unsubscribe()
    const ch = supabase.channel(`room:${roomId}`)
    channelRef.current = ch

    ch.on('broadcast', { event: 'ban_confirm' }, ({ payload }) => {
      const { role, weapon } = payload as { role: PlayerId; weapon: WeaponId }
      setConfirms(prev => {
        const updated = { ...prev, [role]: weapon }
        confirmsRef.current = updated
        checkAllConfirmed(updated)
        return updated
      })
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ role: myRole })
    })
  }, [room?.roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const lockedCount = Object.keys(confirms).length
  const allLocked = lockedCount >= playerCount

  return (
    <div className="flex flex-col items-center w-full h-full bg-dark-bg py-4 px-4 gap-4 overflow-auto">

      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-sm shrink-0">
        <div className="text-neon-blue tracking-widest text-base font-mono">
          武器禁用 — {roomId}
        </div>
        <div className={`font-mono text-sm tabular-nums ${timer <= 5 ? 'text-red-400 animate-pulse' : 'text-gray-500'}`}>
          {timer}s
        </div>
      </div>

      {/* Subtitle */}
      <div className="text-gray-600 text-xs tracking-widest text-center">
        各選擇一種武器禁用，倒計時結束自動隨機
      </div>

      {/* Player status */}
      <div className="w-full max-w-sm flex gap-2 shrink-0">
        {roles.map(pid => {
          const locked = confirms[pid] != null
          const isMe = pid === myRole
          return (
            <div key={pid} className="flex-1 flex flex-col items-center gap-1 py-2 rounded border border-dark-border text-xs font-mono"
              style={{ borderColor: isMe ? ROLE_COLOR[pid] + '80' : undefined }}>
              <span style={{ color: ROLE_COLOR[pid] }}>{pid.toUpperCase()}</span>
              {phase === 'reveal' && confirms[pid] ? (
                <span className="text-red-400 font-bold text-xs">
                  {WEAPON_DEFS.find(w => w.id === confirms[pid])?.icon} 禁
                </span>
              ) : locked ? (
                <span className="text-neon-green text-xs">✓</span>
              ) : (
                <span className="text-gray-700 text-xs animate-pulse">選擇中</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Reveal overlay */}
      {phase === 'reveal' && (
        <div className="w-full max-w-sm shrink-0 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-center">
          <div className="text-red-400 text-xs tracking-widest mb-2">本局禁用武器</div>
          <div className="flex flex-wrap justify-center gap-2">
            {Object.entries(confirms).map(([pid, wid]) => {
              const w = WEAPON_DEFS.find(x => x.id === wid)
              return w ? (
                <div key={pid} className="flex items-center gap-1 px-2 py-1 rounded border border-red-500/40 text-xs font-mono">
                  <span style={{ color: ROLE_COLOR[pid as PlayerId] }}>{pid.toUpperCase()}</span>
                  <span className="text-gray-400">禁</span>
                  <span>{w.icon} {w.label}</span>
                </div>
              ) : null
            })}
          </div>
          <div className="text-gray-600 text-xs mt-2 tracking-wider animate-pulse">進入整裝室...</div>
        </div>
      )}

      {/* Weapon grid */}
      <div className={`flex-1 w-full max-w-sm overflow-auto ${myLocked ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-2 gap-2">
          {specials.map(w => {
            const chosen = myChoice === w.id
            return (
              <button key={w.id}
                onClick={() => !myLocked && setMyChoice(w.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-all
                  ${chosen
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : 'border-dark-border text-gray-400 hover:border-gray-500'
                  }`}
              >
                <span className="text-xl">{w.icon}</span>
                <div>
                  <div className="text-xs font-bold">{w.label}</div>
                  <div className="text-xs opacity-60">
                    {w.damage > 0 ? `傷害 ${w.damage}` : '特殊'} × {w.ammo > 0 ? `${w.ammo}發` : '∞'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Confirm button */}
      <div className="w-full max-w-sm shrink-0 pb-2">
        {!myLocked ? (
          <button
            onClick={() => myChoice && lockIn(myChoice)}
            disabled={!myChoice}
            className="w-full border-2 border-red-500 text-red-400 py-3 rounded tracking-widest text-base
              hover:bg-red-500/10 hover:shadow-[0_0_20px_#ff3333]
              disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {myChoice
              ? `禁用：${WEAPON_DEFS.find(w => w.id === myChoice)?.label ?? myChoice}`
              : '選擇要禁用的武器'}
          </button>
        ) : !allLocked ? (
          <div className="w-full border-2 border-red-500/40 text-red-400/60 py-3 rounded tracking-widest text-base text-center select-none">
            等待其他玩家...（{lockedCount}/{playerCount}）
          </div>
        ) : null}
      </div>
    </div>
  )
}
