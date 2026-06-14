import { useEffect, useRef } from 'react'
import { TILE } from '../game/constants'
import type { TileType } from '../types/game'

interface Props {
  path: { x: number; y: number }[]   // killing shot trace, in map-pixel coords
  color: string                       // shooter colour
  mapTiles: TileType[][]
  cols: number
  rows: number
  victimCol: number
  victimRow: number
}

// Replays the winning shot's trajectory on the result screen: a dimmed map,
// a glowing dot tracing the recorded path, then an impact burst, looping.
export default function KillCam({ path, color, mapTiles, cols, rows, victimCol, victimRow }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()

  const W = cols * TILE
  const H = rows * TILE
  const DISPLAY_W = 360
  const DISPLAY_H = Math.round(DISPLAY_W * (H / W))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || path.length < 2) return
    const ctx = canvas.getContext('2d')!

    const TRACE_MS = 1500   // time for the dot to traverse the whole path
    const BURST_MS = 700    // impact burst
    const HOLD_MS = 500     // pause before looping
    const TOTAL = TRACE_MS + BURST_MS + HOLD_MS
    const vx = (victimCol + 0.5) * TILE
    const vy = (victimRow + 0.5) * TILE
    let start = performance.now()

    function drawMap() {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#0a0a18'
      ctx.fillRect(0, 0, W, H)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = mapTiles[r]?.[c]
          if (t === 'hard') ctx.fillStyle = 'rgba(60,90,150,0.35)'
          else if (t === 'soft') ctx.fillStyle = 'rgba(150,110,60,0.30)'
          else if (t === 'laser') ctx.fillStyle = 'rgba(0,220,180,0.25)'
          else continue
          ctx.fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
        }
      }
    }

    function frame(now: number) {
      const elapsed = (now - start) % TOTAL
      drawMap()

      // Full path (faint)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
      ctx.stroke()

      if (elapsed < TRACE_MS) {
        // Tracing phase: bright segment up to the dot + glowing head
        const prog = elapsed / TRACE_MS
        const idx = Math.min(path.length - 1, Math.floor(prog * (path.length - 1)))
        ctx.save()
        ctx.shadowColor = color
        ctx.shadowBlur = 14
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i <= idx; i++) ctx.lineTo(path[i].x, path[i].y)
        ctx.stroke()
        const head = path[idx]
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      } else {
        // Burst phase: full bright path + expanding impact ring + sparks
        ctx.save()
        ctx.shadowColor = color; ctx.shadowBlur = 12
        ctx.strokeStyle = color; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
        ctx.stroke()
        ctx.restore()

        const bt = Math.min(1, (elapsed - TRACE_MS) / BURST_MS)
        const ringR = TILE * (0.4 + bt * 2.2)
        ctx.strokeStyle = `rgba(255,${Math.round(120 - bt * 120)},40,${(1 - bt) * 0.9})`
        ctx.lineWidth = 4
        ctx.beginPath(); ctx.arc(vx, vy, ringR, 0, Math.PI * 2); ctx.stroke()
        const flash = (1 - bt) * 0.9
        const fg = ctx.createRadialGradient(vx, vy, 0, vx, vy, TILE * 1.4)
        fg.addColorStop(0, `rgba(255,220,120,${flash})`); fg.addColorStop(1, 'transparent')
        ctx.fillStyle = fg
        ctx.beginPath(); ctx.arc(vx, vy, TILE * 1.4, 0, Math.PI * 2); ctx.fill()
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [path, color, mapTiles, cols, rows, victimCol, victimRow, W, H])

  if (path.length < 2) return null

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-xs font-mono tracking-widest text-gray-500">🎯 致命一擊</div>
      <div className="rounded-lg overflow-hidden border border-dark-border" style={{ boxShadow: `0 0 18px ${color}44` }}>
        <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block', width: DISPLAY_W, height: DISPLAY_H }} />
      </div>
    </div>
  )
}
