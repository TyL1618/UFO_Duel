import { useEffect, useRef } from 'react'
import { TILE } from '../game/constants'
import type { TileType } from '../types/game'

interface Props {
  path: { x: number; y: number }[]   // killing shot trace, in map-pixel coords
  color: string                       // shooter colour
  victimColor: string                 // colour of the UFO that got killed
  mapTiles: TileType[][]
  cols: number
  rows: number
  victimCol: number
  victimRow: number
}

function drawUfo(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number) {
  if (alpha <= 0) return
  const r = TILE * 0.34
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.shadowColor = color
  ctx.shadowBlur = 16
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color); g.addColorStop(1, color + '55')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

// Replays the winning shot's trajectory on the result screen: a dimmed map,
// a glowing dot tracing the recorded path, then an impact burst, looping.
export default function KillCam({ path, color, victimColor, mapTiles, cols, rows, victimCol, victimRow }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()

  const W = cols * TILE
  const H = rows * TILE
  const DISPLAY_W = 300
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
    const start = performance.now()

    function drawMap() {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#0a0a18'
      ctx.fillRect(0, 0, W, H)
      // Faint grid for spatial context (works even on the empty/open map)
      ctx.strokeStyle = 'rgba(120,140,200,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 0; c <= cols; c++) { ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H) }
      for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE) }
      ctx.stroke()
      // Tiles (brighter than before so scenery reads)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = mapTiles[r]?.[c]
          if (t === 'hard') ctx.fillStyle = 'rgba(70,110,190,0.6)'
          else if (t === 'soft') ctx.fillStyle = 'rgba(170,120,60,0.5)'
          else if (t === 'laser') ctx.fillStyle = 'rgba(0,230,190,0.45)'
          else continue
          ctx.fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
        }
      }
    }

    function frame(now: number) {
      const elapsed = (now - start) % TOTAL
      drawMap()

      // Full path (faint guide)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
      ctx.stroke()

      const tracing = elapsed < TRACE_MS
      const burstT = tracing ? 0 : Math.min(1, (elapsed - TRACE_MS) / BURST_MS)

      // Shooter UFO at the launch point (always visible)
      drawUfo(ctx, path[0].x, path[0].y, color, 1)
      // Victim UFO at the impact cell — fades out as the burst consumes it
      drawUfo(ctx, vx, vy, victimColor, tracing ? 1 : 1 - burstT)

      if (tracing) {
        const prog = elapsed / TRACE_MS
        const idx = Math.min(path.length - 1, Math.floor(prog * (path.length - 1)))
        ctx.save()
        ctx.shadowColor = color; ctx.shadowBlur = 14
        ctx.strokeStyle = color; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i <= idx; i++) ctx.lineTo(path[i].x, path[i].y)
        ctx.stroke()
        const head = path[idx]
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      } else {
        // Full bright path + expanding impact ring + flash
        ctx.save()
        ctx.shadowColor = color; ctx.shadowBlur = 12
        ctx.strokeStyle = color; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
        ctx.stroke()
        ctx.restore()

        const ringR = TILE * (0.4 + burstT * 2.2)
        ctx.strokeStyle = `rgba(255,${Math.round(120 - burstT * 120)},40,${(1 - burstT) * 0.9})`
        ctx.lineWidth = 4
        ctx.beginPath(); ctx.arc(vx, vy, ringR, 0, Math.PI * 2); ctx.stroke()
        const flash = (1 - burstT) * 0.9
        const fg = ctx.createRadialGradient(vx, vy, 0, vx, vy, TILE * 1.4)
        fg.addColorStop(0, `rgba(255,220,120,${flash})`); fg.addColorStop(1, 'transparent')
        ctx.fillStyle = fg
        ctx.beginPath(); ctx.arc(vx, vy, TILE * 1.4, 0, Math.PI * 2); ctx.fill()
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [path, color, victimColor, mapTiles, cols, rows, victimCol, victimRow, W, H])

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
