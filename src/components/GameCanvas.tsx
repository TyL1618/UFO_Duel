import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react'
import type { Bullet, GameMap, GameState, PlayerId, WeaponId } from '../types/game'
import { getReachableCells } from '../game/ufo'
import { TILE, BULLET_SPEED, UFO_RADIUS } from '../game/constants'

export interface DamageFloat {
  id: number
  x: number
  y: number
  value: number
  color: string
}

interface EmoteEntry { pid: PlayerId; emoji: string; id: number }

interface Props {
  state: GameState
  bullets: Bullet[]
  animDestroyedTiles: { x: number; y: number }[]
  explosionEvents: { x: number; y: number }[]
  hitEvents: { x: number; y: number; id: number }[]
  blastZone: { col: number; row: number; tier: number }[]
  stormBurnedTiles: { col: number; row: number }[]
  damageFloats: DamageFloat[]
  onShoot: (angle: number) => void
  isMyTurn: boolean
  movingMode: boolean
  selectedWeapon: WeaponId
  previewPos?: { col: number; row: number } | null
  teleportMode?: boolean
  teleportStep?: 0 | 1
  teleportFirst?: { col: number; row: number } | null
  onTeleportPlace?: (col: number, row: number) => void
  teleportFlash?: { col: number; row: number }[]
  activeEmotes?: EmoteEntry[]
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  alpha: number
  size: number
  color: string
}

const TRAIL_LEN = 10

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

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

export default function GameCanvas({ state, bullets, animDestroyedTiles, explosionEvents, hitEvents, blastZone, stormBurnedTiles, damageFloats, onShoot, isMyTurn, movingMode, selectedWeapon, previewPos, teleportMode, teleportStep, teleportFirst, onTeleportPlace, teleportFlash, activeEmotes }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fitRef = useRef<HTMLDivElement>(null)
  const aimRef = useRef<{ x: number; y: number } | null>(null)
  const trailRef = useRef<Map<string, { x: number; y: number }[]>>(new Map())

  // Largest map-ratio box that fits the available area, computed in JS so tiles
  // stay perfectly square (CSS aspect-ratio can distort when both axes bind).
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [particles, setParticles] = useState<Particle[]>([])
  const prevAnimDestroyedRef = useRef<{ x: number; y: number }[]>([])
  const prevExplosionRef = useRef<{ x: number; y: number }[]>([])
  // Animation tick — keeps canvas refreshing for DOT flames and mine pulse
  const [dotTick, setDotTick] = useState(0)

  const { map, ufos } = state

  const hasDot = state.players.some(p => (ufos[p]?.dotStacks.length ?? 0) > 0)
  const hasMine = state.stickyMines.length > 0 || state.players.some(p => (ufos[p]?.hasStickyMine ?? 0) > 0)
  const hasSmoke = state.smokeClouds.length > 0
  const hasPortals = (state.portals ?? []).length > 0
  const hasLaser = map.mapType === 'laser'
  const W = map.cols * TILE
  const H = map.rows * TILE

  // ─── Fit the map box to the available area (keeps tiles square) ─────────────
  useLayoutEffect(() => {
    const el = fitRef.current
    if (!el) return
    const recompute = () => {
      const cw = el.clientWidth, ch = el.clientHeight
      if (cw === 0 || ch === 0) return
      const ratio = W / H
      let w = cw, h = cw / ratio
      if (h > ch) { h = ch; w = ch * ratio }
      setBox({ w: Math.round(w), h: Math.round(h) })
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [W, H])

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

  // ─── Animation tick (DOT flames + mine pulse + smoke drift + laser + portals) ─
  useEffect(() => {
    if (!hasDot && !hasMine && !hasSmoke && !hasPortals && !hasLaser) return
    const raf = requestAnimationFrame(() => setDotTick(t => t + 1))
    return () => cancelAnimationFrame(raf)
  }, [hasDot, hasMine, hasSmoke, hasPortals, hasLaser, dotTick])

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
        } else if (t === 'laser') {
          const lp = 0.55 + Math.sin(Date.now() / 200 + r * 0.4) * 0.3
          ctx.fillStyle = `rgba(0,230,255,0.07)`
          ctx.fillRect(tx, ty, TILE, TILE)
          const lg = ctx.createLinearGradient(tx, ty, tx + TILE, ty)
          lg.addColorStop(0, `rgba(0,230,255,0)`)
          lg.addColorStop(0.5, `rgba(0,230,255,${lp * 0.5})`)
          lg.addColorStop(1, `rgba(0,230,255,0)`)
          ctx.fillStyle = lg; ctx.fillRect(tx, ty, TILE, TILE)
          ctx.strokeStyle = `rgba(0,220,255,${0.6 + lp * 0.3})`; ctx.lineWidth = 1
          ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1)
          // vertical center glow line
          const cx2 = tx + TILE / 2
          const vg = ctx.createLinearGradient(cx2 - 2, ty, cx2 + 2, ty)
          vg.addColorStop(0, `rgba(0,255,255,0)`); vg.addColorStop(0.5, `rgba(0,255,255,${lp})`); vg.addColorStop(1, `rgba(0,255,255,0)`)
          ctx.fillStyle = vg; ctx.fillRect(cx2 - 2, ty, 4, TILE)
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

    const myUfo = ufos[state.localPlayer]
    const inSmoke = (pid: PlayerId): boolean => {
      const u = ufos[pid]
      if (!u) return false
      return state.smokeClouds.some(c => Math.abs(c.col - u.col) <= 1 && Math.abs(c.row - u.row) <= 1)
    }
    const selfInSmoke = myUfo ? inSmoke(state.localPlayer) : false

    // ── Storm burned tiles (hazard ground) ──
    for (const bt of stormBurnedTiles) {
      const tx = bt.col * TILE, ty = bt.row * TILE
      ctx.fillStyle = 'rgba(220,50,0,0.13)'
      ctx.fillRect(tx, ty, TILE, TILE)
      ctx.strokeStyle = 'rgba(255,70,0,0.22)'
      ctx.lineWidth = 1
      ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1)
    }

    // ── Blast zone overlays (mine / shockwave affected tiles) ──
    for (const cell of blastZone) {
      const color = cell.tier === 1 ? 'rgba(255,30,0,0.50)' : cell.tier === 2 ? 'rgba(255,100,0,0.35)' : 'rgba(255,180,30,0.22)'
      ctx.fillStyle = color
      ctx.fillRect(cell.col * TILE, cell.row * TILE, TILE, TILE)
    }

    // ── Reachable cells ──
    if (isMyTurn && movingMode) {
      const myUfoR = ufos[state.localPlayer]
      if (myUfoR) {
        const cells = getReachableCells(myUfoR, map)
        ctx.fillStyle = 'rgba(0,212,255,0.12)'
        cells.forEach(({ col, row }) => ctx.fillRect(col * TILE, row * TILE, TILE, TILE))
        ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.lineWidth = 1
        cells.forEach(({ col, row }) => ctx.strokeRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2))
      }
    }

    // ── Teleport placement highlights ──
    if (teleportMode) {
      const green1 = teleportStep === 0 ? 'rgba(0,255,100,0.15)' : 'rgba(0,200,255,0.12)'
      const green2 = teleportStep === 0 ? 'rgba(0,255,100,0.5)' : 'rgba(0,200,255,0.45)'
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          if (map.tiles[r][c] === 'empty') {
            const occupied = state.players.some(p => ufos[p]?.col === c && ufos[p]?.row === r)
            if (!occupied) {
              ctx.fillStyle = green1; ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
              ctx.strokeStyle = green2; ctx.lineWidth = 1; ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
            }
          }
        }
      }
      if (teleportFirst) {
        const fx = (teleportFirst.col + 0.5) * TILE, fy = (teleportFirst.row + 0.5) * TILE
        ctx.fillStyle = 'rgba(0,255,100,0.3)'; ctx.fillRect(teleportFirst.col * TILE, teleportFirst.row * TILE, TILE, TILE)
        ctx.strokeStyle = 'rgba(0,255,100,0.9)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(fx, fy, TILE * 0.32, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = 'rgba(180,255,180,0.6)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(fx, fy, TILE * 0.16, 0, Math.PI * 2); ctx.stroke()
      }
    }

    // ── Teleport flash (portals activating) ──
    for (const pos of (teleportFlash ?? [])) {
      ctx.fillStyle = 'rgba(0,255,100,0.55)'
      ctx.fillRect(pos.col * TILE, pos.row * TILE, TILE, TILE)
    }

    // ── UFOs ──
    state.players.forEach(pid => {
      const ufo = ufos[pid]
      if (!ufo) return
      // Hide non-local UFOs that are inside smoke
      if (pid !== state.localPlayer && inSmoke(pid)) return
      const cx = (ufo.col + 0.5) * TILE
      const cy = (ufo.row + 0.5) * TILE
      const r = TILE * 0.38
      // Dead UFOs render as ghost; self semi-transparent when in smoke
      if (ufo.isDead) ctx.globalAlpha = 0.25
      else if (pid === state.localPlayer && selfInSmoke) ctx.globalAlpha = 0.35

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
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(ufo.hasStickyMine), mx, my - 11)
      }
      // Shield aura
      const shieldHp = ufo.shieldHp ?? 0
      if (shieldHp > 0) {
        const shieldAlpha = 0.3 + (shieldHp / 50) * 0.5
        const pulse = 0.8 + Math.sin(Date.now() / 400) * 0.2
        const sr = r * 2.2
        const sg = ctx.createRadialGradient(cx, cy, sr * 0.7, cx, cy, sr)
        sg.addColorStop(0, `rgba(0,170,255,${shieldAlpha * pulse * 0.6})`)
        sg.addColorStop(1, `rgba(0,170,255,0)`)
        ctx.fillStyle = sg
        ctx.beginPath(); ctx.arc(cx, cy, sr, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = `rgba(0,200,255,${shieldAlpha * pulse})`
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(cx, cy, sr * 0.88, 0, Math.PI * 2); ctx.stroke()
      }

      ctx.globalAlpha = 1
    })

    // ── Health packs ──
    for (const pack of (state.healthPacks ?? [])) {
      const hx = (pack.col + 0.5) * TILE
      const hy = (pack.row + 0.5) * TILE
      const pulse = 0.7 + Math.sin(Date.now() / 600) * 0.3
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, TILE * 0.45)
      hg.addColorStop(0, `rgba(0,255,100,${pulse * 0.25})`); hg.addColorStop(1, 'transparent')
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, TILE * 0.45, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(0,255,100,${pulse})`; ctx.lineWidth = 1.5
      const cs = TILE * 0.18
      ctx.beginPath()
      ctx.moveTo(hx - cs, hy); ctx.lineTo(hx + cs, hy)
      ctx.moveTo(hx, hy - cs); ctx.lineTo(hx, hy + cs)
      ctx.stroke()
      ctx.strokeStyle = `rgba(0,200,80,${pulse * 0.6})`; ctx.lineWidth = 1
      ctx.strokeRect(hx - TILE * 0.3, hy - TILE * 0.3, TILE * 0.6, TILE * 0.6)
    }

    // ── Portals ──
    for (const portal of (state.portals ?? [])) {
      const px = (portal.col + 0.5) * TILE
      const py = (portal.row + 0.5) * TILE
      const pp = 0.5 + Math.sin(Date.now() / 400 + portal.id.charCodeAt(2)) * 0.5
      const pg = ctx.createRadialGradient(px, py, 0, px, py, TILE * 0.48)
      pg.addColorStop(0, `rgba(0,255,100,${0.25 + pp * 0.15})`); pg.addColorStop(1, 'rgba(0,255,100,0)')
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, TILE * 0.48, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(0,255,100,${0.55 + pp * 0.4})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(px, py, TILE * 0.32, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = `rgba(180,255,180,${0.35 + pp * 0.3})`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(px, py, TILE * 0.14, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = `rgba(0,255,100,${0.6 + pp * 0.35})`; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.arc(px, py, TILE * 0.44, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    }

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
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(mine.turnsLeft), mx, my - 12)
    }

    // ── Bullet trails ──
    for (const b of bullets) {
      const trail = trailRef.current.get(b.id)
      if (!trail) continue
      const ownerColor = ufos[b.owner]?.color ?? '#ffffff'
      for (let i = 0; i < trail.length - 1; i++) {
        const alpha = ((i + 1) / trail.length) * 0.6
        const size = ((i + 1) / trail.length) * 3
        ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2)
        ctx.fillStyle = hexAlpha(ownerColor, alpha)
        ctx.fill()
      }
    }

    // ── Bullets ──
    for (const b of bullets) {
      if (!b.active) continue
      const color = ufos[b.owner]?.color ?? '#ffffff'
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
      const myUfo = ufos[state.localPlayer]!
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
      const myUfo = ufos[state.localPlayer]!
      const sx = (myUfo.col + 0.5) * TILE
      const sy = (myUfo.row + 0.5) * TILE
      const angle = Math.atan2(aimRef.current.y - sy, aimRef.current.x - sx)
      const aliveOpps = state.players
        .filter(p => p !== state.localPlayer && !ufos[p]?.isDead)
        .sort((a, b) => {
          const ua = ufos[a]!, ub = ufos[b]!, my = ufos[state.localPlayer]!
          return ((ua.col - my.col) ** 2 + (ua.row - my.row) ** 2) - ((ub.col - my.col) ** 2 + (ub.row - my.row) ** 2)
        })
      const sniperTarget = aliveOpps[0] ? ufos[aliveOpps[0]] : undefined
      if (sniperTarget) {
        const pathPts = simulatePath(sx, sy, angle, map, TILE, (sniperTarget.col + 0.5) * TILE, (sniperTarget.row + 0.5) * TILE)
        ctx.strokeStyle = 'rgba(255,200,0,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5])
        ctx.beginPath()
        pathPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
        ctx.stroke(); ctx.setLineDash([])
      }
    }

    // ── Aim arrow ──
    if (isMyTurn && !movingMode && aimRef.current) {
      const myUfo = ufos[state.localPlayer]!
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
  }, [state, bullets, animDestroyedTiles, explosionEvents, blastZone, stormBurnedTiles, particles, dotTick, isMyTurn, movingMode, selectedWeapon, previewPos, map, ufos, W, H, hasSmoke, teleportMode, teleportStep, teleportFirst, teleportFlash])

  useEffect(() => { draw() }, [draw])

  // ─── Pointer events ────────────────────────────────────────────────────────
  const getCanvasPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode) return
    if (teleportMode) return   // teleport uses pointerUp for placement
    canvasRef.current!.setPointerCapture(e.pointerId)
    aimRef.current = getCanvasPos(e)
    draw()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode || teleportMode || !aimRef.current) return
    aimRef.current = getCanvasPos(e)
    draw()
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const pos = getCanvasPos(e)
    // Teleport tile placement mode
    if (isMyTurn && teleportMode) {
      const col = Math.floor(pos.x / TILE)
      const row = Math.floor(pos.y / TILE)
      if (col >= 0 && col < map.cols && row >= 0 && row < map.rows && map.tiles[row][col] === 'empty') {
        const occupied = state.players.some(p => ufos[p]?.col === col && ufos[p]?.row === row)
        if (!occupied) onTeleportPlace?.(col, row)
      }
      return
    }
    // Shield doesn't need a direction — any tap on the canvas triggers the confirm dialog
    if (isMyTurn && !movingMode && selectedWeapon === 'shield') {
      aimRef.current = null
      onShoot(0)
      return
    }
    if (!isMyTurn || movingMode || !aimRef.current) return
    const myUfo = ufos[state.localPlayer]!
    const sx = (myUfo.col + 0.5) * TILE
    const sy = (myUfo.row + 0.5) * TILE
    // Pointer capture keeps tracking past the canvas edge, so an out-of-bounds
    // release still yields a valid firing angle (e.g. aiming hard left). Only
    // cancel when the release lands right on top of the UFO (ambiguous angle).
    const tooClose = Math.hypot(pos.x - sx, pos.y - sy) < TILE * 0.7
    if (tooClose) {
      aimRef.current = null
      draw()
      return
    }
    const angle = Math.atan2(pos.y - sy, pos.x - sx)
    aimRef.current = null
    onShoot(angle)
  }

  return (
    <div ref={fitRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, minHeight: 0 }}>
      {/* Border sized to the JS-fitted box (exact map ratio) so the neon edge
          traces the tile boundary and tiles stay square — empty space, if any,
          stays as symmetric margin rather than stretching the map. */}
      <div className="neon-map-border" style={{ width: box.w || undefined, height: box.h || undefined, maxWidth: '100%', maxHeight: '100%' }}>
      <canvas ref={canvasRef} width={W} height={H}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {damageFloats.map(f => (
        <div
          key={f.id}
          className="damage-float"
          style={{
            left: `${(f.x / W) * 100}%`,
            top: `${(f.y / H) * 100}%`,
            color: f.color,
            textShadow: `0 0 8px ${f.color}`,
          }}
        >
          -{f.value}
        </div>
      ))}
      {(activeEmotes ?? []).map(e => {
        const ufo = state.ufos[e.pid]
        if (!ufo) return null
        return (
          <div key={e.id} className="emote-float"
            style={{
              left: `${((ufo.col + 0.5) / map.cols) * 100}%`,
              top: `${((ufo.row - 0.8) / map.rows) * 100}%`,
              fontSize: '1.6rem',
            }}>
            {e.emoji}
          </div>
        )
      })}
      {/* Teleport mode instruction */}
      {teleportMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded text-xs font-mono tracking-wider pointer-events-none select-none"
          style={{ background: 'rgba(0,0,0,0.75)', color: '#00ff88', border: '1px solid rgba(0,255,100,0.4)' }}>
          {teleportStep === 0 ? '點擊選擇傳送門 A' : '點擊選擇傳送門 B'}
        </div>
      )}
      </div>
    </div>
  )
}
