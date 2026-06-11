import { useEffect, useRef, useCallback, useState } from 'react'
import type { Bullet, GameMap, GameState, WeaponId } from '../types/game'
import { getReachableCells } from '../game/ufo'
import { TILE, BULLET_SPEED, UFO_RADIUS } from '../game/constants'

interface Props {
  state: GameState
  bullets: Bullet[]
  animDestroyedTiles: { x: number; y: number }[]
  explosionEvents: { x: number; y: number }[]
  hitEvents: { x: number; y: number; id: number }[]
  onShoot: (angle: number) => void
  isMyTurn: boolean
  movingMode: boolean
  selectedWeapon: WeaponId
  previewPos?: { col: number; row: number } | null
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  alpha: number
  size: number
  color: string
}

const TRAIL_LEN = 10

// Simulates sniper bullet path for trajectory preview. Returns corner points (start, each bounce, end).
function simulatePath(
  startX: number, startY: number, angle: number,
  map: GameMap, tileSize: number,
  oppX: number, oppY: number
): { x: number; y: number }[] {
  const MAX_SIM_BOUNCES = 3
  const MAX_STEPS = 3000
  const points: { x: number; y: number }[] = [{ x: startX, y: startY }]
  let x = startX, y = startY
  let vx = Math.cos(angle) * BULLET_SPEED
  let vy = Math.sin(angle) * BULLET_SPEED
  let bounces = 0
  const mapW = map.cols * tileSize
  const mapH = map.rows * tileSize

  for (let step = 0; step < MAX_STEPS; step++) {
    x += vx; y += vy
    const dx = x - oppX, dy = y - oppY
    if (dx * dx + dy * dy <= UFO_RADIUS * UFO_RADIUS) { points.push({ x, y }); return points }
    let borderBounce = false
    if (x <= 0) { x = -x; vx = Math.abs(vx); borderBounce = true }
    if (x >= mapW) { x = 2 * mapW - x; vx = -Math.abs(vx); borderBounce = true }
    if (y <= 0) { y = -y; vy = Math.abs(vy); borderBounce = true }
    if (y >= mapH) { y = 2 * mapH - y; vy = -Math.abs(vy); borderBounce = true }
    if (borderBounce) {
      bounces++; points.push({ x, y })
      if (bounces >= MAX_SIM_BOUNCES) return points
      continue
    }
    const col = Math.floor(x / tileSize), row = Math.floor(y / tileSize)
    if (row >= 0 && row < map.rows && col >= 0 && col < map.cols) {
      const tile = map.tiles[row][col]
      if (tile === 'hard') {
        const px = x - vx, py = y - vy
        if (Math.floor(px / tileSize) !== col) vx = -vx
        if (Math.floor(py / tileSize) !== row) vy = -vy
        bounces++; points.push({ x, y })
        if (bounces >= MAX_SIM_BOUNCES) return points
      } else if (tile === 'soft') {
        points.push({ x, y }); return points
      }
    }
  }
  points.push({ x, y }); return points
}

function spawnTileParticles(col: number, row: number): Particle[] {
  const cx = (col + 0.5) * TILE
  const cy = (row + 0.5) * TILE
  return Array.from({ length: 12 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 1.2 + Math.random() * 3.5
    return {
      x: cx + (Math.random() - 0.5) * TILE * 0.6,
      y: cy + (Math.random() - 0.5) * TILE * 0.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 0.85 + Math.random() * 0.15,
      size: 2 + Math.random() * 4,
      color: Math.random() > 0.5 ? '#c07840' : '#e09050',
    }
  })
}

function spawnHitParticles(cx: number, cy: number): Particle[] {
  const colors = ['#ffffff', '#ffffff', '#ff3366', '#ff6688', '#ffccdd']
  return Array.from({ length: 14 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 5
    return {
      x: cx + (Math.random() - 0.5) * 6,
      y: cy + (Math.random() - 0.5) * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      size: 1.5 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
  })
}

function spawnExplosionParticles(cx: number, cy: number): Particle[] {
  const colors = ['#ff4400', '#ff8800', '#ffcc00', '#ff2200']
  return Array.from({ length: 20 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 5
    return {
      x: cx + (Math.random() - 0.5) * TILE * 0.4,
      y: cy + (Math.random() - 0.5) * TILE * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 0.9 + Math.random() * 0.1,
      size: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
  })
}

export default function GameCanvas({ state, bullets, animDestroyedTiles, explosionEvents, hitEvents, onShoot, isMyTurn, movingMode, selectedWeapon, previewPos }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const aimRef = useRef<{ x: number; y: number } | null>(null)
  const trailRef = useRef<Map<string, { x: number; y: number }[]>>(new Map())

  const [particles, setParticles] = useState<Particle[]>([])
  const prevAnimDestroyedRef = useRef<{ x: number; y: number }[]>([])
  const prevExplosionRef = useRef<{ x: number; y: number }[]>([])
  // Animation tick — keeps canvas refreshing for DOT flames and mine pulse
  const [dotTick, setDotTick] = useState(0)

  const { map, ufos } = state

  const hasDot = ufos.p1.dotStacks.length > 0 || ufos.p2.dotStacks.length > 0
  const hasMine = state.stickyMines.length > 0 || ufos.p1.hasStickyMine || ufos.p2.hasStickyMine
  const hasSmoke = state.smokeClouds.length > 0
  const W = map.cols * TILE
  const H = map.rows * TILE

  // ─── Spawn particles for newly destroyed tiles ─────────────────────────────
  useEffect(() => {
    const prev = prevAnimDestroyedRef.current
    const newTiles = animDestroyedTiles.filter(t => !prev.some(p => p.x === t.x && p.y === t.y))
    if (newTiles.length > 0) {
      setParticles(ps => [...ps, ...newTiles.flatMap(t => spawnTileParticles(t.x, t.y))])
    }
    prevAnimDestroyedRef.current = [...animDestroyedTiles]
    if (animDestroyedTiles.length === 0) prevAnimDestroyedRef.current = []
  }, [animDestroyedTiles])

  // ─── Spawn hit particles when UFO is struck ───────────────────────────────
  const prevHitRef = useRef<{ x: number; y: number; id: number }[]>([])
  useEffect(() => {
    const newEvts = hitEvents.filter(e => !prevHitRef.current.some(p => p.id === e.id))
    if (newEvts.length > 0) setParticles(ps => [...ps, ...newEvts.flatMap(e => spawnHitParticles(e.x, e.y))])
    prevHitRef.current = [...hitEvents]
    if (hitEvents.length === 0) prevHitRef.current = []
  }, [hitEvents])

  // ─── Spawn explosion particles for mine detonations ───────────────────────
  useEffect(() => {
    const newEvts = explosionEvents.filter(
      e => !prevExplosionRef.current.some(p => p.x === e.x && p.y === e.y)
    )
    if (newEvts.length > 0) {
      setParticles(ps => [...ps, ...newEvts.flatMap(e => spawnExplosionParticles(e.x, e.y))])
    }
    prevExplosionRef.current = [...explosionEvents]
    if (explosionEvents.length === 0) prevExplosionRef.current = []
  }, [explosionEvents])

  // ─── Particle animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (particles.length === 0) return
    const raf = requestAnimationFrame(() => {
      setParticles(prev =>
        prev
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vx: p.vx * 0.88, vy: p.vy * 0.88 + 0.08, alpha: p.alpha - 0.024 }))
          .filter(p => p.alpha > 0.02)
      )
    })
    return () => cancelAnimationFrame(raf)
  }, [particles])

  // ─── Animation tick (DOT flames + mine pulse + smoke drift at ~60fps) ──────
  useEffect(() => {
    if (!hasDot && !hasMine && !hasSmoke) return
    const raf = requestAnimationFrame(() => setDotTick(t => t + 1))
    return () => cancelAnimationFrame(raf)
  }, [hasDot, hasMine, hasSmoke, dotTick])

  // ─── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Update bullet trails
    for (const b of bullets) {
      if (!b.active) { trailRef.current.delete(b.id); continue }
      const trail = trailRef.current.get(b.id) ?? []
      trail.push({ x: b.x, y: b.y })
      if (trail.length > TRAIL_LEN) trail.shift()
      trailRef.current.set(b.id, trail)
    }
    if (bullets.length === 0) trailRef.current.clear()

    ctx.clearRect(0, 0, W, H)

    // ── Background grid ──
    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 0.5
    for (let c = 0; c <= map.cols; c++) { ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H); ctx.stroke() }
    for (let r = 0; r <= map.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE); ctx.stroke() }

    // ── Tiles ──
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        // Mid-animation: treat animDestroyedTiles as empty
        const isDestroyed = animDestroyedTiles.some(d => d.x === c && d.y === r)
        const t = isDestroyed ? 'empty' : map.tiles[r][c]
        const tx = c * TILE
        const ty = r * TILE

        if (t === 'hard') {
          ctx.fillStyle = '#1a3050'
          ctx.fillRect(tx, ty, TILE, TILE)
          ctx.strokeStyle = '#2a4a70'
          ctx.lineWidth = 1
          const mid = Math.floor(TILE / 2)
          ctx.beginPath(); ctx.moveTo(tx + 2, ty + mid); ctx.lineTo(tx + TILE - 2, ty + mid); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(tx + mid, ty + 2); ctx.lineTo(tx + mid, ty + TILE - 2); ctx.stroke()
          ctx.strokeStyle = '#4a80b0'; ctx.lineWidth = 1.5
          ctx.strokeRect(tx + 1, ty + 1, TILE - 2, TILE - 2)
        } else if (t === 'soft') {
          ctx.fillStyle = '#3a2a10'
          ctx.fillRect(tx, ty, TILE, TILE)
          ctx.strokeStyle = '#a06030'; ctx.lineWidth = 1.5
          const pad = 6
          ctx.beginPath(); ctx.moveTo(tx + pad, ty + pad); ctx.lineTo(tx + TILE - pad, ty + TILE - pad); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(tx + TILE - pad, ty + pad); ctx.lineTo(tx + pad, ty + TILE - pad); ctx.stroke()
          ctx.strokeStyle = '#804020'; ctx.lineWidth = 1
          ctx.strokeRect(tx + 1, ty + 1, TILE - 2, TILE - 2)
        }
      }
    }

    // ── Smoke clouds (3×3 coverage each) ──
    const t = Date.now() / 1200
    for (const cloud of state.smokeClouds) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const cx = (cloud.col + dc + 0.5) * TILE
          const cy = (cloud.row + dr + 0.5) * TILE
          if (cloud.owner !== state.localPlayer) {
            // Opponent's cloud — opaque fog, 3×3 tiles
            const drift = Math.sin(t + cloud.col + dc) * 3
            const fg = ctx.createRadialGradient(cx + drift, cy, 0, cx + drift, cy, TILE * 0.95)
            fg.addColorStop(0, 'rgba(155,155,165,0.95)')
            fg.addColorStop(0.6, 'rgba(130,130,140,0.82)')
            fg.addColorStop(1, 'rgba(100,100,110,0.1)')
            ctx.fillStyle = fg
            ctx.beginPath(); ctx.arc(cx + drift, cy, TILE * 0.95, 0, Math.PI * 2); ctx.fill()
          } else {
            // Own cloud — subtle green tint so owner knows location
            const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE * 0.85)
            fg.addColorStop(0, 'rgba(0,255,136,0.20)')
            fg.addColorStop(1, 'rgba(0,255,136,0)')
            ctx.fillStyle = fg
            ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.85, 0, Math.PI * 2); ctx.fill()
          }
        }
      }
      // Center dot marker for own cloud
      if (cloud.owner === state.localPlayer) {
        const cx = (cloud.col + 0.5) * TILE; const cy = (cloud.row + 0.5) * TILE
        ctx.strokeStyle = 'rgba(0,255,136,0.4)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke()
      }
    }

    // Helper: opponent UFO hidden when inside any 3×3 fog area not owned by local player
    const oppId: 'p1' | 'p2' = state.localPlayer === 'p1' ? 'p2' : 'p1'
    const oppUfo = ufos[oppId]
    const oppInFog = state.smokeClouds.some(c =>
      c.owner !== state.localPlayer &&
      Math.abs(c.col - oppUfo.col) <= 1 &&
      Math.abs(c.row - oppUfo.row) <= 1
    )

    // ── Reachable cells ──
    if (isMyTurn && movingMode) {
      const myUfo = ufos[state.localPlayer]
      const cells = getReachableCells(myUfo, map)
      ctx.fillStyle = 'rgba(0,212,255,0.12)'
      cells.forEach(({ col, row }) => ctx.fillRect(col * TILE, row * TILE, TILE, TILE))
      ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.lineWidth = 1
      cells.forEach(({ col, row }) => ctx.strokeRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2))
    }

    // ── UFOs ──
    ;(['p1', 'p2'] as const).forEach(pid => {
      // Skip opponent UFO if it's hidden inside fog cloud
      if (pid !== state.localPlayer && oppInFog) return
      const ufo = ufos[pid]
      const cx = (ufo.col + 0.5) * TILE
      const cy = (ufo.row + 0.5) * TILE
      const r = TILE * 0.38

      const grd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2)
      grd.addColorStop(0, ufo.color + '66'); grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(cx, cy, r * 2, 0, Math.PI * 2); ctx.fill()

      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.45)
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = ufo.color + '22'; ctx.fill()
      ctx.strokeStyle = ufo.color; ctx.lineWidth = 2.5; ctx.stroke()
      ctx.restore()

      ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.42, Math.PI, 0)
      ctx.fillStyle = ufo.color + '44'; ctx.fill()
      ctx.strokeStyle = ufo.color; ctx.lineWidth = 1.5; ctx.stroke()

      for (let i = 0; i < 3; i++) {
        const lx = cx + (i / 2 - 0.5) * r * 1.2
        ctx.beginPath(); ctx.arc(lx, cy + r * 0.25, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = i === 1 ? '#00ff88' : '#ffdd00'; ctx.fill()
      }

      if (state.currentTurn === pid) {
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2)
        ctx.strokeStyle = ufo.color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([])
      }

      // DOT burn indicator: orange flame dots orbiting UFO
      if (ufo.dotStacks.length > 0) {
        const t = Date.now() / 300
        for (let i = 0; i < 3; i++) {
          const a = t + (i * Math.PI * 2) / 3
          const fx = cx + Math.cos(a) * (r * 1.5)
          const fy = cy + Math.sin(a) * (r * 1.5)
          const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 5)
          fg.addColorStop(0, '#ff8800'); fg.addColorStop(1, 'transparent')
          ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill()
        }
      }

      // Sticky mine attached to UFO
      if (ufo.hasStickyMine > 0) {
        const pulse = 0.55 + Math.sin(Date.now() / 160) * 0.45
        const mx = cx + r * 0.85
        const my = cy - r * 0.85
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 9)
        mg.addColorStop(0, `rgba(255,50,0,${pulse * 0.9})`); mg.addColorStop(1, 'transparent')
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = `rgba(255,70,0,${pulse})`; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = `rgba(255,160,0,${pulse})`
        ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill()
      }
    })

    // ── Sticky mines on tiles ──
    for (const mine of state.stickyMines) {
      const mx = (mine.col + 0.5) * TILE
      const my = (mine.row + 0.5) * TILE
      const pulse = 0.55 + Math.sin(Date.now() / 160) * 0.45
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, TILE * 0.5)
      grd.addColorStop(0, `rgba(255,50,0,${pulse * 0.35})`); grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(mx, my, TILE * 0.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(255,70,0,${pulse})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = `rgba(255,160,0,${pulse})`
      ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2); ctx.fill()
      const cs = 4.5
      ctx.strokeStyle = `rgba(255,70,0,${pulse})`; ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(mx - cs, my); ctx.lineTo(mx + cs, my)
      ctx.moveTo(mx, my - cs); ctx.lineTo(mx, my + cs)
      ctx.stroke()
    }

    // ── Bullet trails ──
    for (const b of bullets) {
      const trail = trailRef.current.get(b.id)
      if (!trail) continue
      const isTracking = b.weapon === 'tracking'
      for (let i = 0; i < trail.length - 1; i++) {
        const alpha = ((i + 1) / trail.length) * 0.6
        const size = ((i + 1) / trail.length) * 3
        ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2)
        ctx.fillStyle = isTracking ? `rgba(255,140,0,${alpha})` : `rgba(255,220,80,${alpha})`
        ctx.fill()
      }
    }

    // ── Bullets ──
    for (const b of bullets) {
      if (!b.active) continue
      const color = b.weapon === 'tracking'
        ? (b.owner === 'p1' ? '#ff9900' : '#ff6600')
        : (b.owner === 'p1' ? '#00d4ff' : '#ff3366')
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 10)
      g.addColorStop(0, color + 'cc'); g.addColorStop(1, 'transparent')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill()
    }

    // ── Particles ──
    for (const p of particles) {
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // ── Preview UFO (D-pad ghost position) ──
    if (movingMode && previewPos) {
      const myUfo = ufos[state.localPlayer]
      if (previewPos.col !== myUfo.col || previewPos.row !== myUfo.row) {
        const px = (previewPos.col + 0.5) * TILE
        const py = (previewPos.row + 0.5) * TILE
        const r = TILE * 0.38
        ctx.globalAlpha = 0.45
        ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.45)
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.strokeStyle = myUfo.color; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([])
        ctx.restore()
        ctx.globalAlpha = 1
        // Target tile fill
        ctx.fillStyle = myUfo.color + '22'
        ctx.fillRect(previewPos.col * TILE, previewPos.row * TILE, TILE, TILE)
      }
    }

    // ── Sniper trajectory preview ──
    if (isMyTurn && !movingMode && aimRef.current && selectedWeapon === 'sniper') {
      const myUfo = ufos[state.localPlayer]
      const sx = (myUfo.col + 0.5) * TILE
      const sy = (myUfo.row + 0.5) * TILE
      const angle = Math.atan2(aimRef.current.y - sy, aimRef.current.x - sx)
      const oppId: 'p1' | 'p2' = state.localPlayer === 'p1' ? 'p2' : 'p1'
      const oppUfo = ufos[oppId]
      const pathPts = simulatePath(sx, sy, angle, map, TILE, (oppUfo.col + 0.5) * TILE, (oppUfo.row + 0.5) * TILE)
      ctx.strokeStyle = 'rgba(255,200,0,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5])
      ctx.beginPath()
      pathPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      ctx.stroke(); ctx.setLineDash([])
    }

    // ── Aim arrow ──
    if (isMyTurn && !movingMode && aimRef.current) {
      const myUfo = ufos[state.localPlayer]
      const sx = (myUfo.col + 0.5) * TILE
      const sy = (myUfo.row + 0.5) * TILE
      const angle = Math.atan2(aimRef.current.y - sy, aimRef.current.x - sx)
      const arrowLen = 70
      ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 4; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(angle) * arrowLen, sy + Math.sin(angle) * arrowLen); ctx.stroke()
      ctx.setLineDash([])
      ctx.save(); ctx.translate(sx + Math.cos(angle) * arrowLen, sy + Math.sin(angle) * arrowLen); ctx.rotate(angle)
      ctx.fillStyle = '#ffdd00'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -4); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  }, [state, bullets, animDestroyedTiles, explosionEvents, particles, dotTick, isMyTurn, movingMode, selectedWeapon, previewPos, map, ufos, W, H, hasSmoke])

  useEffect(() => { draw() }, [draw])

  // ─── Pointer events ────────────────────────────────────────────────────────
  const getCanvasPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode) return
    // Capture pointer so move/up events fire even outside canvas bounds
    canvasRef.current!.setPointerCapture(e.pointerId)
    aimRef.current = getCanvasPos(e)
    draw()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode || !aimRef.current) return
    aimRef.current = getCanvasPos(e)
    draw()
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode || !aimRef.current) return
    const pos = getCanvasPos(e)
    const myUfo = ufos[state.localPlayer]
    const sx = (myUfo.col + 0.5) * TILE
    const sy = (myUfo.row + 0.5) * TILE
    const outsideCanvas = pos.x < 0 || pos.x > W || pos.y < 0 || pos.y > H
    const tooClose = Math.hypot(pos.x - sx, pos.y - sy) < TILE * 1.5
    if (outsideCanvas || tooClose) {
      aimRef.current = null
      draw()
      return
    }
    const angle = Math.atan2(pos.y - sy, pos.x - sx)
    aimRef.current = null
    onShoot(angle)
  }

  return (
    <div className="neon-map-border" style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }}>
      <canvas ref={canvasRef} width={W} height={H}
        className="max-w-full max-h-full object-contain"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  )
}
