import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRoom } from '../contexts/RoomContext'
import type { RoomInfo } from '../contexts/RoomContext'
import type { PlayerId, WeaponId } from '../types/game'
import { WEAPON_DEFS } from '../game/weapons'
import { playRatchet } from '../sounds'

const MAP_DEFS = [
  { name: '標準地圖', icon: '🗺', desc: '隨機障礙，兩側生成', color: '#00d4ff' },
  { name: '雷射地圖', icon: '⚡', desc: '中央雷射護網，無法穿越', color: '#00ff88' },
  { name: '四堡地圖', icon: '🏰', desc: '四角碉堡，一人一堡', color: '#ffdd00' },
  { name: '空曠地圖', icon: '🌌', desc: '全空地形，純粹準度對決', color: '#cc88ff' },
  { name: '斜線地圖', icon: '↗', desc: '對角硬牆，三個缺口互通', color: '#ff8844' },
]

const ROLE_COLOR: Record<PlayerId, string> = {
  p1: '#00d4ff', p2: '#ff3366', p3: '#00ff88', p4: '#ffdd00',
}

const SPECIALS = WEAPON_DEFS.filter(w => w.id !== 'normal')

function customEase(t: number): number {
  const split = 0.45, distAtSplit = 0.82
  if (t <= split) return (t / split) * distAtSplit
  const t2 = (t - split) / (1 - split)
  return distAtSplit + (1 - distAtSplit) * (1 - Math.pow(1 - t2, 5))
}

export default function MapReveal() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, tryRestoreRoom } = useRoom()

  // Read synchronously from localStorage as a fallback so a direct load / F5
  // renders correctly on the first paint (incl. the initial phase decision).
  const ssRoom = useMemo<RoomInfo | null>(() => {
    if (room) return room
    try { const s = localStorage.getItem(`ufo_room_${roomId}`); return s ? JSON.parse(s) as RoomInfo : null } catch { return null }
  }, [room, roomId])

  // Reels scale with viewport height so they fill the (short) landscape screen.
  const vh = useRef(typeof window !== 'undefined' ? window.innerHeight : 600).current
  const ITEM_H = Math.max(74, Math.min(120, Math.round((vh * 0.66) / 3)))
  const REEL_H = ITEM_H * 3
  const CENTER_OFFSET = REEL_H / 2 - ITEM_H / 2
  const W_ITEM_H = Math.max(66, Math.min(104, Math.round((vh * 0.6) / 3)))
  const W_REEL_H = W_ITEM_H * 3
  const W_CENTER_OFFSET = W_REEL_H / 2 - W_ITEM_H / 2

  const trackRef = useRef<HTMLDivElement>(null)
  const wTrackRefs = useRef<(HTMLDivElement | null)[]>([])
  const animRef = useRef<number>()
  const ivRef = useRef<ReturnType<typeof setInterval>>()

  const myRole = ssRoom?.role ?? 'p1'
  const myWeapons = (ssRoom?.loadouts?.[myRole]?.weapons ?? []) as WeaponId[]
  const weaponReel = !!ssRoom?.weaponReel && myWeapons.length === 4

  const [phase, setPhase] = useState<'weapons' | 'weaponsResult' | 'spinning' | 'result'>(weaponReel ? 'weapons' : 'spinning')
  const [countdown, setCountdown] = useState(3)

  const seed = ssRoom?.mapSeed ?? 0
  const targetIdx = seed % 3
  const resultMap = MAP_DEFS[targetIdx]

  const LOOP_COUNT = 14
  const bigList = Array.from({ length: LOOP_COUNT + 2 }, () => MAP_DEFS).flat()
  const wBigList = Array.from({ length: LOOP_COUNT + 2 }, () => SPECIALS).flat()
  const myWeaponDefs = myWeapons.map(id => SPECIALS.find(w => w.id === id)).filter(Boolean) as typeof SPECIALS

  // Mount: route guard (restore on F5) + back-button guard + cleanup
  useEffect(() => {
    if (!room && roomId !== 'solo' && !ssRoom && !tryRestoreRoom(roomId!)) { nav('/'); return }
    if (!room && ssRoom) tryRestoreRoom(roomId!)  // hydrate context from storage
    window.history.pushState(null, '', location.pathname)
    const onPop = () => window.history.pushState(null, '', location.pathname)
    window.addEventListener('popstate', onPop)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (ivRef.current) clearInterval(ivRef.current)
      window.removeEventListener('popstate', onPop)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 1: weapon reels (only when weapons were randomized)
  useEffect(() => {
    if (phase !== 'weapons') return

    const targets = myWeapons.map(id => Math.max(0, SPECIALS.findIndex(w => w.id === id)))
    wTrackRefs.current.forEach(track => {
      if (track) track.style.transform = `translateY(${W_CENTER_OFFSET}px)`
    })

    const startDelay = setTimeout(() => {
      const duration = 2800
      const startTime = performance.now()
      const startY = -W_ITEM_H
      let lastItemIdx = -1
      const totals = targets.map(t => (SPECIALS.length * LOOP_COUNT + t) * W_ITEM_H)

      function animate(now: number) {
        const t = Math.min((now - startTime) / duration, 1)
        const eased = customEase(t)
        wTrackRefs.current.forEach((track, i) => {
          if (!track) return
          const y = -(startY + eased * totals[i] - W_CENTER_OFFSET)
          track.style.transform = `translateY(${y}px)`
        })
        const idx0 = Math.floor((eased * totals[0]) / W_ITEM_H)
        if (idx0 !== lastItemIdx) { lastItemIdx = idx0; playRatchet() }
        if (t < 1) {
          animRef.current = requestAnimationFrame(animate)
        } else {
          wTrackRefs.current.forEach((track, i) => {
            if (track) track.style.transform = `translateY(${-(totals[i] - W_CENTER_OFFSET + startY)}px)`
          })
          setPhase('weaponsResult')
        }
      }
      animRef.current = requestAnimationFrame(animate)
    }, 300)

    return () => { clearTimeout(startDelay); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 1.5: hold on the drawn weapons so players can read them
  useEffect(() => {
    if (phase !== 'weaponsResult') return
    const t = setTimeout(() => setPhase('spinning'), 2300)
    return () => clearTimeout(t)
  }, [phase])

  // Phase 2: map reel
  useEffect(() => {
    if (phase !== 'spinning') return

    const track = trackRef.current
    if (!track) return
    track.style.transform = `translateY(${CENTER_OFFSET}px)`

    const startDelay = setTimeout(() => {
      const totalScroll = (MAP_DEFS.length * LOOP_COUNT + targetIdx) * ITEM_H
      const duration = 3200
      const startTime = performance.now()
      const startY = -ITEM_H
      let lastItemIdx = -1

      function animate(now: number) {
        if (!track) return
        const t = Math.min((now - startTime) / duration, 1)
        const eased = customEase(t)
        const scrollOffset = eased * totalScroll
        const currentItemIdx = Math.floor(scrollOffset / ITEM_H)
        if (currentItemIdx !== lastItemIdx) { lastItemIdx = currentItemIdx; playRatchet() }
        const y = -(startY + scrollOffset - CENTER_OFFSET)
        track.style.transform = `translateY(${y}px)`
        if (t < 1) {
          animRef.current = requestAnimationFrame(animate)
        } else {
          track.style.transform = `translateY(${-(totalScroll - CENTER_OFFSET + startY)}px)`
          setPhase('result')
        }
      }
      animRef.current = requestAnimationFrame(animate)
    }, 350)

    return () => { clearTimeout(startDelay); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Result: countdown → game
  useEffect(() => {
    if (phase !== 'result') return
    let c = 3
    setCountdown(c)
    ivRef.current = setInterval(() => {
      c--
      if (c <= 0) {
        clearInterval(ivRef.current)
        nav(`/game/${roomId}`, { replace: true })
      } else {
        setCountdown(c)
      }
    }, 1000)
    return () => clearInterval(ivRef.current)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const players = Object.keys(ssRoom?.loadouts ?? {}) as PlayerId[]
  const showingWeapons = phase === 'weapons' || phase === 'weaponsResult'

  return (
    <div className="relative w-full h-full bg-dark-bg overflow-hidden select-none flex flex-col items-center justify-center">
      {/* Player chips — pinned to the top corners (left/right) so they clear the
          centered "本局地圖" heading instead of overlapping it */}
      <div className="absolute top-3 inset-x-4 flex justify-between items-start gap-2 z-20">
        {players.map(pid => {
          const loadout = ssRoom?.loadouts[pid]
          return (
            <div key={pid} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dark-border text-[11px] font-mono tracking-wider bg-dark-bg/70">
              <div className="w-2 h-2 rounded-full" style={{ background: ROLE_COLOR[pid] }} />
              <span style={{ color: ROLE_COLOR[pid] }}>{loadout?.name ?? pid.toUpperCase()}</span>
            </div>
          )
        })}
      </div>

      {/* Heading */}
      <div className="text-xs font-mono tracking-widest text-gray-500 mb-2">
        {showingWeapons ? '抽取武器' : '本局地圖'}
      </div>

      {showingWeapons ? (
        <>
          {/* Weapon reels — 4 side by side, scaled to fill height */}
          <div className="flex gap-2 sm:gap-3">
            {[0, 1, 2, 3].map(i => {
              const settled = phase === 'weaponsResult'
              return (
                <div key={i} className="relative overflow-hidden rounded-lg border bg-dark-panel transition-colors"
                  style={{ width: Math.round(W_ITEM_H * 1.05), height: W_REEL_H, borderColor: settled ? '#ffdd0080' : '#23233a' }}>
                  <div className="absolute inset-x-0 top-0 z-10 pointer-events-none"
                    style={{ height: W_ITEM_H * 0.8, background: 'linear-gradient(to bottom, #080814, transparent)' }} />
                  <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
                    style={{ height: W_ITEM_H * 0.8, background: 'linear-gradient(to top, #080814, transparent)' }} />
                  <div className="absolute inset-x-0 z-10 pointer-events-none"
                    style={{ top: W_CENTER_OFFSET, height: W_ITEM_H, borderTop: '1.5px solid rgba(255,221,0,0.35)', borderBottom: '1.5px solid rgba(255,221,0,0.35)', background: settled ? 'rgba(255,221,0,0.12)' : 'rgba(255,221,0,0.05)' }} />
                  <div ref={el => { wTrackRefs.current[i] = el }} className="absolute inset-x-0 top-0">
                    {wBigList.map((w, j) => (
                      <div key={j} className="flex flex-col items-center justify-center gap-1" style={{ height: W_ITEM_H }}>
                        <span style={{ fontSize: Math.round(W_ITEM_H * 0.34), lineHeight: 1 }}>{w.icon}</span>
                        <span className="font-mono tracking-wider text-gray-400" style={{ fontSize: 11 }}>{w.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Result caption while holding */}
          <div className="h-7 mt-3 flex items-center justify-center">
            {phase === 'weaponsResult' && (
              <div className="text-yellow-400 font-mono tracking-widest text-sm" style={{ textShadow: '0 0 16px #ffdd0066' }}>
                🎲 你的武器：{myWeaponDefs.map(w => w.label).join('、')}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Map reel */}
          <div className="relative overflow-hidden rounded-xl border border-dark-border bg-dark-panel"
            style={{ width: 300, height: REEL_H }}>
            <div className="absolute inset-x-0 top-0 z-10 pointer-events-none"
              style={{ height: ITEM_H * 0.8, background: 'linear-gradient(to bottom, #080814, transparent)' }} />
            <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
              style={{ height: ITEM_H * 0.8, background: 'linear-gradient(to top, #080814, transparent)' }} />
            <div className="absolute inset-x-0 z-10 pointer-events-none"
              style={{ top: CENTER_OFFSET, height: ITEM_H, borderTop: '1.5px solid rgba(0,212,255,0.25)', borderBottom: '1.5px solid rgba(0,212,255,0.25)', background: 'rgba(0,212,255,0.04)' }} />
            <div ref={trackRef} className="absolute inset-x-0 top-0">
              {bigList.map((m, i) => (
                <div key={i} className="flex flex-col items-center justify-center gap-1" style={{ height: ITEM_H }}>
                  <span style={{ fontSize: Math.round(ITEM_H * 0.3), lineHeight: 1 }}>{m.icon}</span>
                  <span className="font-mono tracking-wider text-gray-500" style={{ fontSize: 13 }}>{m.name}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Map result name */}
          <div className="h-9 mt-3 flex flex-col items-center justify-center">
            {phase === 'result' && (
              <div className="flex items-baseline gap-3">
                <span className="font-mono font-bold tracking-widest text-xl"
                  style={{ color: resultMap.color, textShadow: `0 0 20px ${resultMap.color}66` }}>
                  {resultMap.name}
                </span>
                <span className="text-gray-600 font-mono text-xs tracking-wider">{resultMap.desc}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Countdown — pinned bottom-right so it never pushes the reel down */}
      {phase === 'result' && (
        <div className="absolute bottom-4 right-6 font-mono font-bold tabular-nums text-gray-300"
          style={{ fontSize: 40 }}>
          {countdown}
        </div>
      )}
    </div>
  )
}
