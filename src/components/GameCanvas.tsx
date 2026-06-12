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
  variant?: 'lethal' | 'shield'
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
  trapMode?: boolean
  onTrapPlace?: (col: number, row: number) => void
  blackholeMode?: boolean
  onBlackholePlace?: (col: number, row: number) => void
  killEvents?: { x: number; y: number; id: number }[]
  shieldHitEvents?: { x: number; y: number; id: number }[]
  teleportTriggers?: { pid: PlayerId; fromCol: number; fromRow: number; id: number }[]
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  alpha: number
  size: number
  color: string
}

type TeleportAnim = { pid: PlayerId; phase: 'out' | 'in'; frame: number; fromCol: number; fromRow: number }
type Ripple = { cx: number; cy: number; frame: number; id: number }

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

function spawnKillParticles(cx: number, cy: number): Particle[] {
  const colors = ['#ffffff', '#ffffff', '#ffff80', '#ffdd00', '#ff8800', '#ff3300']
  return Array.from({ length: 42 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 9
    return {
      x: cx + (Math.random() - 0.5) * 10,
      y: cy + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      size: 3 + Math.random() * 9,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
  })
}

export default function GameCanvas({ state, bullets, animDestroyedTiles, explosionEvents, hitEvents, blastZone, stormBurnedTiles, damageFloats, onShoot, isMyTurn, movingMode, selectedWeapon, previewPos, teleportMode, teleportStep, teleportFirst, onTeleportPlace, teleportFlash, activeEmotes, trapMode, onTrapPlace, blackholeMode, onBlackholePlace, killEvents, shieldHitEvents, teleportTriggers }: Props) {
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

  // R16 new state
  const [isKillFlash, setIsKillFlash] = useState(false)
  const [teleportAnims, setTeleportAnims] = useState<TeleportAnim[]>([])
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [endingFrame, setEndingFrame] = useState(0)

  const { map, ufos } = state

  const hasDot = state.players.some(p => (ufos[p]?.dotStacks.length ?? 0) > 0)
  const hasMine = state.stickyMines.length > 0 || state.players.some(p => (ufos[p]?.hasStickyMine ?? 0) > 0)
  const hasSmoke = state.smokeClouds.length > 0
  const hasPortals = (state.portals ?? []).length > 0
  const hasLaser = map.mapType === 'laser'
  const hasTraps = (state.trapMines ?? []).length > 0
  const hasBlackholes = (state.blackHoles ?? []).length > 0
  const hasFreeze = state.players.some(p => (ufos[p]?.frozenTurns ?? 0) > 0)
  const hasShield = state.players.some(p => (ufos[p]?.shieldHp ?? 0) > 0)
  const isEnding = state.phase === 'ending'
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

  // ─── Kill flash + large explosion particles ────────────────────────────────
  const prevKillRef = useRef<{ x: number; y: number; id: number }[]>([])
  useEffect(() => {
    const newEvts = (killEvents ?? []).filter(e => !prevKillRef.current.some(p => p.id === e.id))
    if (newEvts.length > 0) {
      setParticles(ps => [...ps, ...newEvts.flatMap(e => spawnKillParticles(e.x, e.y))])
      setIsKillFlash(true)
      setTimeout(() => setIsKillFlash(false), 90)
    }
    prevKillRef.current = [...(killEvents ?? [])]
    if ((killEvents ?? []).length === 0) prevKillRef.current = []
  }, [killEvents])

  // ─── Shield hit ripple ─────────────────────────────────────────────────────
  const prevShieldHitRef = useRef<{ x: number; y: number; id: number }[]>([])
  useEffect(() => {
    const newEvts = (shieldHitEvents ?? []).filter(e => !prevShieldHitRef.current.some(p => p.id === e.id))
    if (newEvts.length > 0)
      setRipples(prev => [...prev, ...newEvts.map(e => ({ cx: e.x, cy: e.y, frame: 0, id: e.id }))])
    prevShieldHitRef.current = [...(shieldHitEvents ?? [])]
    if ((shieldHitEvents ?? []).length === 0) prevShieldHitRef.current = []
  }, [shieldHitEvents])

  // ─── Teleport trigger → animation ─────────────────────────────────────────
  const prevTeleportTriggersRef = useRef<{ id: number }[]>([])
  useEffect(() => {
    const newTriggers = (teleportTriggers ?? []).filter(t => !prevTeleportTriggersRef.current.some(p => p.id === t.id))
    if (newTriggers.length > 0)
      setTeleportAnims(prev => [...prev, ...newTriggers.map(t => ({ pid: t.pid, phase: 'out' as const, frame: 0, fromCol: t.fromCol, fromRow: t.fromRow }))])
    prevTeleportTriggersRef.current = [...(teleportTriggers ?? [])]
  }, [teleportTriggers])

  // ─── Ending zoom animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isEnding) { setEndingFrame(0); return }
    const raf = requestAnimationFrame(() => setEndingFrame(f => Math.min(f + 1, 240)))
    return () => cancelAnimationFrame(raf)
  }, [isEnding, endingFrame])

  // ─── Particle animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (particles.length === 0) return
    const raf = requestAnimationFrame(() => {
      setParticles(prev =>
        prev
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vx: p.vx * 0.88, vy: p.vy * 0.88 + 0.08, alpha: p.alpha - 0.022 }))
          .filter(p => p.alpha > 0.02)
      )
    })
    return () => cancelAnimationFrame(raf)
  }, [particles])

  // ─── Animation tick (DOT flames + mine pulse + smoke drift + laser + portals + shield + freeze) ─
  useEffect(() => {
    if (!hasDot && !hasMine && !hasSmoke && !hasPortals && !hasLaser && !hasTraps && !hasBlackholes
        && !hasFreeze && !hasShield && !isEnding && teleportAnims.length === 0 && ripples.length === 0) return
    const raf = requestAnimationFrame(() => setDotTick(t => t + 1))
    return () => cancelAnimationFrame(raf)
  }, [hasDot, hasMine, hasSmoke, hasPortals, hasLaser, hasTraps, hasBlackholes, hasFreeze, hasShield, isEnding, teleportAnims.length, ripples.length, dotTick])

  // ─── Advance teleport animations and ripples on dotTick ───────────────────
  useEffect(() => {
    if (teleportAnims.length > 0) {
      setTeleportAnims(prev => {
        const OUT = 8, IN = 8
        const next: TeleportAnim[] = []
        for (const a of prev) {
          if (a.phase === 'out') {
            if (a.frame < OUT - 1) next.push({ ...a, frame: a.frame + 1 })
            else next.push({ ...a, phase: 'in', frame: 0 })
          } else {
            if (a.frame < IN - 1) next.push({ ...a, frame: a.frame + 1 })
            // frame === IN-1: animation done, drop
          }
        }
        return next
      })
    }
    if (ripples.length > 0) {
      setRipples(prev => prev.map(r => ({ ...r, frame: r.frame + 1 })).filter(r => r.frame < 28))
    }
  }, [dotTick]) // eslint-disable-line react-hooks/exhaustive-deps

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

    // ── Move path line: UFO → preview position ──
    if (movingMode && previewPos && myUfo && (previewPos.col !== myUfo.col || previewPos.row !== myUfo.row)) {
      const fromX = (myUfo.col + 0.5) * TILE
      const fromY = (myUfo.row + 0.5) * TILE
      const toX = (previewPos.col + 0.5) * TILE
      const toY = (previewPos.row + 0.5) * TILE
      ctx.strokeStyle = myUfo.color + '70'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke()
      ctx.setLineDash([])
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

    // ── Trap placement highlights ──
    if (trapMode) {
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          if (map.tiles[r][c] === 'empty') {
            const occupied = state.players.some(p => ufos[p]?.col === c && ufos[p]?.row === r)
            if (!occupied) {
              ctx.fillStyle = 'rgba(255,80,0,0.13)'; ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
              ctx.strokeStyle = 'rgba(255,120,0,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
            }
          }
        }
      }
    }

    // ── Blackhole placement highlights ──
    if (blackholeMode) {
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          if (map.tiles[r][c] === 'empty') {
            const occupied = state.players.some(p => ufos[p]?.col === c && ufos[p]?.row === r)
            if (!occupied) {
              ctx.fillStyle = 'rgba(130,0,200,0.13)'; ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
              ctx.strokeStyle = 'rgba(180,60,255,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
            }
          }
        }
      }
    }

    // ── Teleport flash (portals activating) ──
    for (const pos of (teleportFlash ?? [])) {
      ctx.fillStyle = 'rgba(0,255,100,0.55)'
      ctx.fillRect(pos.col * TILE, pos.row * TILE, TILE, TILE)
    }

    // ── UFOs ──
    const isEndingAnim = state.phase === 'ending' && state.winner && state.winner !== 'draw'
    const winnerPid = isEndingAnim ? state.winner as PlayerId : null
    // Ending scale progress 0→1 over 80 frames
    const endT = Math.min(endingFrame / 80, 1)

    state.players.forEach(pid => {
      const ufo = ufos[pid]
      if (!ufo) return
      // Hide non-local UFOs that are inside smoke
      if (pid !== state.localPlayer && inSmoke(pid)) return

      // Teleport animation: scale and possibly remap draw position
      const teleportAnim = teleportAnims.find(a => a.pid === pid)
      let drawCx: number, drawCy: number, ufoScale: number

      if (teleportAnim?.phase === 'out') {
        drawCx = (teleportAnim.fromCol + 0.5) * TILE
        drawCy = (teleportAnim.fromRow + 0.5) * TILE
        ufoScale = Math.max(0, 1 - teleportAnim.frame / 8)
      } else if (teleportAnim?.phase === 'in') {
        drawCx = (ufo.col + 0.5) * TILE
        drawCy = (ufo.row + 0.5) * TILE
        ufoScale = Math.min(1, teleportAnim.frame / 8)
      } else {
        drawCx = (ufo.col + 0.5) * TILE
        drawCy = (ufo.row + 0.5) * TILE
        ufoScale = 1
      }

      // Ending zoom: winner grows toward center, others fade
      if (isEndingAnim) {
        if (pid === winnerPid) {
          // Move toward canvas center + scale up
          const targetX = W / 2
          const targetY = H / 2
          drawCx = drawCx + (targetX - drawCx) * endT
          drawCy = drawCy + (targetY - drawCy) * endT
          ufoScale *= 1 + endT * 1.5  // 1 → 2.5
        } else {
          // Other UFOs fade out
          ctx.globalAlpha = Math.max(0, 1 - endT * 1.4)
        }
      }

      const cx = drawCx
      const cy = drawCy
      const r = TILE * 0.38

      // Dead UFOs render as ghost; self semi-transparent when in smoke
      if (ufo.isDead) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.25)
      else if (pid === state.localPlayer && selfInSmoke) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.35)

      // Apply scale transform around UFO center
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(ufoScale, ufoScale)
      ctx.translate(-cx, -cy)

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
        const tNow = Date.now() / 300
        for (let i = 0; i < 3; i++) {
          const a = tNow + (i * Math.PI * 2) / 3
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
      // Frozen indicator: pulsing cyan ring when frozenTurns > 0
      if ((ufo.frozenTurns ?? 0) > 0) {
        const fp = 0.5 + Math.sin(Date.now() / 220) * 0.5
        const fr = r * 2.1
        ctx.strokeStyle = `rgba(0,220,255,${0.6 + fp * 0.4})`
        ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.arc(cx, cy, fr, 0, Math.PI * 2); ctx.stroke()
        const fig = ctx.createRadialGradient(cx, cy, fr * 0.7, cx, cy, fr)
        fig.addColorStop(0, `rgba(0,200,255,${fp * 0.22})`)
        fig.addColorStop(1, 'rgba(0,200,255,0)')
        ctx.fillStyle = fig; ctx.beginPath(); ctx.arc(cx, cy, fr, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(0,220,255,${0.5 + fp * 0.5})`
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(`❄️${ufo.frozenTurns}`, cx, cy - r * 2.5)
      }

      // Shield: glow + arc progress bar
      const shieldHp = ufo.shieldHp ?? 0
      if (shieldHp > 0) {
        const shieldAlpha = 0.3 + (shieldHp / 50) * 0.5
        const pulse = 0.8 + Math.sin(Date.now() / 400) * 0.2
        const sr = r * 2.2
        // Radial glow
        const sg = ctx.createRadialGradient(cx, cy, sr * 0.7, cx, cy, sr)
        sg.addColorStop(0, `rgba(0,170,255,${shieldAlpha * pulse * 0.6})`)
        sg.addColorStop(1, `rgba(0,170,255,0)`)
        ctx.fillStyle = sg
        ctx.beginPath(); ctx.arc(cx, cy, sr, 0, Math.PI * 2); ctx.fill()
        // Arc bar background (full circle, dim)
        const arcR = r * 2.6
        ctx.strokeStyle = 'rgba(0,80,180,0.38)'
        ctx.lineWidth = 3.5
        ctx.beginPath(); ctx.arc(cx, cy, arcR, -Math.PI / 2, Math.PI * 1.5); ctx.stroke()
        // Arc bar fill (proportional to shieldHp/50)
        const ratio = shieldHp / 50
        const endAngle = -Math.PI / 2 + Math.PI * 2 * ratio
        ctx.strokeStyle = `rgba(0,200,255,${0.65 + ratio * 0.3})`
        ctx.lineWidth = 3.5
        ctx.beginPath(); ctx.arc(cx, cy, arcR, -Math.PI / 2, endAngle); ctx.stroke()
      }

      // Winning aura: rotating halo when ending
      if (isEndingAnim && pid === winnerPid) {
        const haloR = r * (2.8 + endT * 0.6)
        const spinAngle = endingFrame * 0.05
        for (let arc = 0; arc < 4; arc++) {
          const a0 = spinAngle + (arc * Math.PI * 2) / 4
          ctx.strokeStyle = `rgba(255,220,80,${0.55 + Math.sin(endingFrame * 0.1 + arc) * 0.3})`
          ctx.lineWidth = 2.5
          ctx.beginPath(); ctx.arc(cx, cy, haloR, a0, a0 + Math.PI * 0.7); ctx.stroke()
        }
      }

      ctx.restore()  // end scale transform
      ctx.globalAlpha = 1
    })

    // ── Winner text (canvas-space, fades in after zoom completes at frame 80) ──
    if (isEndingAnim && winnerPid && endingFrame >= 80) {
      const textFade = Math.min((endingFrame - 80) / 30, 1)
      const winnerUfo = ufos[winnerPid]
      if (winnerUfo && textFade > 0) {
        const r = TILE * 0.38
        const haloDisplayR = r * (2.8 + 1 * 0.6) * (1 + 1 * 1.5)  // haloR * maxScale
        const textX = W / 2
        const textY = H / 2 - haloDisplayR - 14
        const fontSize = Math.round(TILE * 0.65)
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.font = `bold ${fontSize}px JetBrains Mono, monospace`
        ctx.shadowColor = winnerUfo.color
        ctx.shadowBlur = 20
        ctx.fillStyle = winnerUfo.color
        ctx.globalAlpha = textFade * 0.5
        ctx.fillText(`贏家: ${winnerUfo.name}!`, textX, textY)
        ctx.shadowBlur = 8
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = textFade
        ctx.fillText(`贏家: ${winnerUfo.name}!`, textX, textY)
        ctx.restore()
      }
    }

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
      const ownerColor = ufos[portal.owner]?.color ?? '#00ff88'
      const r = parseInt(ownerColor.slice(1, 3), 16)
      const g = parseInt(ownerColor.slice(3, 5), 16)
      const b = parseInt(ownerColor.slice(5, 7), 16)
      const rc = (a: number) => `rgba(${r},${g},${b},${a})`
      const pg = ctx.createRadialGradient(px, py, 0, px, py, TILE * 0.48)
      pg.addColorStop(0, rc(0.25 + pp * 0.15)); pg.addColorStop(1, rc(0))
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, TILE * 0.48, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = rc(0.55 + pp * 0.4); ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(px, py, TILE * 0.32, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = rc(0.35 + pp * 0.3); ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(px, py, TILE * 0.14, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = rc(0.6 + pp * 0.35); ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
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

    // ── Trap mines ──
    for (const trap of (state.trapMines ?? [])) {
      const tx = (trap.col + 0.5) * TILE
      const ty = (trap.row + 0.5) * TILE
      const pulse = 0.6 + Math.sin(Date.now() / 280) * 0.4
      const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, TILE * 0.48)
      tg.addColorStop(0, `rgba(255,120,0,${pulse * 0.3})`); tg.addColorStop(1, 'transparent')
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tx, ty, TILE * 0.48, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(255,100,0,${0.5 + pulse * 0.4})`; ctx.lineWidth = 1.5
      ctx.strokeRect(trap.col * TILE + 2, trap.row * TILE + 2, TILE - 4, TILE - 4)
      ctx.fillStyle = `rgba(255,160,50,${0.7 + pulse * 0.3})`
      ctx.font = `bold ${Math.round(TILE * 0.45)}px monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('⚠', tx, ty)
      ctx.fillStyle = `rgba(255,200,100,${pulse * 0.8})`
      ctx.font = 'bold 10px monospace'
      ctx.fillText(String(trap.turnsLeft), tx, ty + TILE * 0.35)
    }

    // ── Black holes ──
    for (const bh of (state.blackHoles ?? [])) {
      const bx = (bh.col + 0.5) * TILE
      const by = (bh.row + 0.5) * TILE
      const now = Date.now()
      const spin = (now / 600) % (Math.PI * 2)
      // Dark void fill
      const vg = ctx.createRadialGradient(bx, by, 0, bx, by, TILE * 0.4)
      vg.addColorStop(0, 'rgba(0,0,0,0.92)'); vg.addColorStop(0.6, 'rgba(60,0,100,0.7)'); vg.addColorStop(1, 'rgba(100,0,180,0)')
      ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(bx, by, TILE * 0.4, 0, Math.PI * 2); ctx.fill()
      // Gravity range ring
      const rangeR = 3 * TILE
      ctx.strokeStyle = 'rgba(140,0,220,0.18)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4])
      ctx.beginPath(); ctx.arc(bx, by, rangeR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      // Spinning swirl arcs
      for (let arc = 0; arc < 3; arc++) {
        const baseAngle = spin + (arc * Math.PI * 2) / 3
        ctx.strokeStyle = `rgba(180,60,255,${0.55 + Math.sin(now / 300 + arc) * 0.25})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(bx, by, TILE * (0.15 + arc * 0.07), baseAngle, baseAngle + Math.PI * 1.1)
        ctx.stroke()
      }
      // Center dot
      const cp = 0.7 + Math.sin(now / 180) * 0.3
      ctx.fillStyle = `rgba(220,100,255,${cp})`
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill()
      // Turns label
      ctx.fillStyle = 'rgba(200,100,255,0.85)'
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(bh.turnsLeft), bx, by + TILE * 0.38)
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

    // ── Shield hit ripples (blue expanding rings) ──
    for (const rip of ripples) {
      const progress = rip.frame / 28
      const rad = TILE * (0.5 + progress * 2.5)
      const alpha = (1 - progress) * 0.7
      ctx.strokeStyle = `rgba(0,180,255,${alpha})`
      ctx.lineWidth = 2.5 * (1 - progress * 0.7)
      ctx.beginPath(); ctx.arc(rip.cx, rip.cy, rad, 0, Math.PI * 2); ctx.stroke()
      // Second inner ring
      if (rip.frame < 18) {
        const rad2 = TILE * (0.3 + progress * 1.4)
        const alpha2 = (1 - rip.frame / 18) * 0.45
        ctx.strokeStyle = `rgba(100,220,255,${alpha2})`
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(rip.cx, rip.cy, rad2, 0, Math.PI * 2); ctx.stroke()
      }
    }

    // ── Preview UFO (D-pad ghost position) ──
    if (movingMode && previewPos) {
      const myUfoG = ufos[state.localPlayer]!
      if (previewPos.col !== myUfoG.col || previewPos.row !== myUfoG.row) {
        const px = (previewPos.col + 0.5) * TILE
        const py = (previewPos.row + 0.5) * TILE
        const r = TILE * 0.38
        ctx.globalAlpha = 0.45
        ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.45)
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.strokeStyle = myUfoG.color; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([])
        ctx.restore()
        ctx.globalAlpha = 1
        // Target tile fill
        ctx.fillStyle = myUfoG.color + '22'
        ctx.fillRect(previewPos.col * TILE, previewPos.row * TILE, TILE, TILE)
      }
    }

    // ── Sniper trajectory preview ──
    if (isMyTurn && !movingMode && aimRef.current && selectedWeapon === 'sniper') {
      const myUfoS = ufos[state.localPlayer]!
      const sx = (myUfoS.col + 0.5) * TILE
      const sy = (myUfoS.row + 0.5) * TILE
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
      const myUfoA = ufos[state.localPlayer]!
      const sx = (myUfoA.col + 0.5) * TILE
      const sy = (myUfoA.row + 0.5) * TILE
      const angle = Math.atan2(aimRef.current.y - sy, aimRef.current.x - sx)
      const arrowLen = 70
      ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 4; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(angle) * arrowLen, sy + Math.sin(angle) * arrowLen); ctx.stroke()
      ctx.setLineDash([])
      ctx.save(); ctx.translate(sx + Math.cos(angle) * arrowLen, sy + Math.sin(angle) * arrowLen); ctx.rotate(angle)
      ctx.fillStyle = '#ffdd00'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -4); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill()
      ctx.restore()
    }

    // ── Kill flash: brief white overlay ──
    if (isKillFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.fillRect(0, 0, W, H)
    }
  }, [state, bullets, animDestroyedTiles, explosionEvents, blastZone, stormBurnedTiles, particles, dotTick, isMyTurn, movingMode, selectedWeapon, previewPos, map, ufos, W, H, hasSmoke, teleportMode, teleportStep, teleportFirst, teleportFlash, trapMode, blackholeMode, isKillFlash, teleportAnims, ripples, endingFrame])

  useEffect(() => { draw() }, [draw])

  // ─── Pointer events ────────────────────────────────────────────────────────
  const getCanvasPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode) return
    if (teleportMode || trapMode || blackholeMode) return  // placement modes use pointerUp
    canvasRef.current!.setPointerCapture(e.pointerId)
    aimRef.current = getCanvasPos(e)
    draw()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMyTurn || movingMode || teleportMode || trapMode || blackholeMode || !aimRef.current) return
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
    // Trap mine placement mode
    if (isMyTurn && trapMode) {
      const col = Math.floor(pos.x / TILE)
      const row = Math.floor(pos.y / TILE)
      if (col >= 0 && col < map.cols && row >= 0 && row < map.rows && map.tiles[row][col] === 'empty') {
        const occupied = state.players.some(p => ufos[p]?.col === col && ufos[p]?.row === row)
        if (!occupied) onTrapPlace?.(col, row)
      }
      return
    }
    // Blackhole placement mode
    if (isMyTurn && blackholeMode) {
      const col = Math.floor(pos.x / TILE)
      const row = Math.floor(pos.y / TILE)
      if (col >= 0 && col < map.cols && row >= 0 && row < map.rows && map.tiles[row][col] === 'empty') {
        const occupied = state.players.some(p => ufos[p]?.col === col && ufos[p]?.row === row)
        if (!occupied) onBlackholePlace?.(col, row)
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
    const myUfoU = ufos[state.localPlayer]!
    const sx = (myUfoU.col + 0.5) * TILE
    const sy = (myUfoU.row + 0.5) * TILE
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
            color: f.variant === 'lethal' ? '#ffffff' : f.variant === 'shield' ? '#40c8ff' : f.color,
            textShadow: f.variant === 'lethal' ? '0 0 18px #ffffff, 0 0 30px #ff4400' : f.variant === 'shield' ? '0 0 14px #00aaff' : `0 0 8px ${f.color}`,
            fontSize: f.variant === 'lethal' ? '1.5em' : undefined,
            fontWeight: f.variant === 'lethal' ? 'bold' : undefined,
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
      {/* Trap mine placement instruction */}
      {trapMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded text-xs font-mono tracking-wider pointer-events-none select-none"
          style={{ background: 'rgba(0,0,0,0.75)', color: '#ff9040', border: '1px solid rgba(255,100,0,0.4)' }}>
          ⚠️ 點擊放置陷阱地雷
        </div>
      )}
      {/* Blackhole placement instruction */}
      {blackholeMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded text-xs font-mono tracking-wider pointer-events-none select-none"
          style={{ background: 'rgba(0,0,0,0.75)', color: '#c060ff', border: '1px solid rgba(160,60,255,0.4)' }}>
          🕳 點擊放置黑洞
        </div>
      )}
      </div>
    </div>
  )
}
