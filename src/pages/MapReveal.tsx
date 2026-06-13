import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerId } from '../types/game'
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

const ITEM_H = 72
const REEL_H = 216
const CENTER_OFFSET = REEL_H / 2 - ITEM_H / 2

function customEase(t: number): number {
  const split = 0.45, distAtSplit = 0.82
  if (t <= split) return (t / split) * distAtSplit
  const t2 = (t - split) / (1 - split)
  return distAtSplit + (1 - distAtSplit) * (1 - Math.pow(1 - t2, 5))
}

export default function MapReveal() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room } = useRoom()

  const trackRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>()
  const ivRef = useRef<ReturnType<typeof setInterval>>()

  const [phase, setPhase] = useState<'spinning' | 'result'>('spinning')
  const [countdown, setCountdown] = useState(3)

  const seed = room?.mapSeed ?? 0
  const targetIdx = seed % 3
  const resultMap = MAP_DEFS[targetIdx]

  const LOOP_COUNT = 14
  const bigList = Array.from({ length: LOOP_COUNT + 2 }, () => MAP_DEFS).flat()

  useEffect(() => {
    if (!room && roomId !== 'solo') { nav('/'); return }

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
        if (currentItemIdx !== lastItemIdx) {
          lastItemIdx = currentItemIdx
          playRatchet()
        }
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

    // Back button guard
    window.history.pushState(null, '', location.pathname)
    const onPop = () => window.history.pushState(null, '', location.pathname)
    window.addEventListener('popstate', onPop)

    return () => {
      clearTimeout(startDelay)
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (ivRef.current) clearInterval(ivRef.current)
      window.removeEventListener('popstate', onPop)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const players = Object.keys(room?.loadouts ?? {}) as PlayerId[]

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-7 select-none">
      {/* Player chips */}
      <div className="flex gap-3">
        {players.map(pid => {
          const loadout = room?.loadouts[pid]
          return (
            <div key={pid} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-dark-border text-xs font-mono tracking-wider">
              <div className="w-2 h-2 rounded-full" style={{ background: ROLE_COLOR[pid] }} />
              <span style={{ color: ROLE_COLOR[pid] }}>{loadout?.name ?? pid.toUpperCase()}</span>
            </div>
          )
        })}
      </div>

      <div className="text-xs font-mono tracking-widest text-gray-600">本局地圖</div>

      {/* Reel */}
      <div className="relative overflow-hidden rounded-xl border border-dark-border bg-dark-panel"
        style={{ width: 280, height: REEL_H }}>
        {/* Fade top/bottom */}
        <div className="absolute inset-x-0 top-0 z-10 pointer-events-none"
          style={{ height: 64, background: 'linear-gradient(to bottom, #080814, transparent)' }} />
        <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{ height: 64, background: 'linear-gradient(to top, #080814, transparent)' }} />
        {/* Center highlight */}
        <div className="absolute inset-x-0 z-10 pointer-events-none"
          style={{ top: CENTER_OFFSET, height: ITEM_H, borderTop: '1.5px solid rgba(0,212,255,0.25)', borderBottom: '1.5px solid rgba(0,212,255,0.25)', background: 'rgba(0,212,255,0.04)' }} />
        {/* Reel track */}
        <div ref={trackRef} className="absolute inset-x-0 top-0">
          {bigList.map((m, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-1"
              style={{ height: ITEM_H }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{m.icon}</span>
              <span className="font-mono tracking-wider text-gray-500" style={{ fontSize: 13 }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Result + countdown */}
      <div className="flex flex-col items-center gap-1.5 min-h-[60px] justify-center">
        {phase === 'result' && (
          <>
            <div className="font-mono font-bold tracking-widest text-xl"
              style={{ color: resultMap.color, textShadow: `0 0 20px ${resultMap.color}66` }}>
              {resultMap.name}
            </div>
            <div className="text-gray-600 font-mono text-xs tracking-wider">{resultMap.desc}</div>
          </>
        )}
      </div>

      <div className="font-mono font-bold tabular-nums"
        style={{ fontSize: 36, minHeight: 48, color: phase === 'result' ? '#aaa' : 'transparent' }}>
        {phase === 'result' ? countdown : '　'}
      </div>
    </div>
  )
}
