import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import GameCanvas from '../components/GameCanvas'
import HUD from '../components/HUD'
import WeaponBar from '../components/WeaponBar'
import { generateMap, pickSpawn } from '../game/mapGenerator'
import { WEAPON_DEFS, WEAPON_MAP, WEAPON_TTL } from '../game/weapons'
import { createBullet, stepBullet, bulletHitsUFO } from '../game/physics'
import { TILE, UFO_RADIUS } from '../game/constants'
import { getReachableCells } from '../game/ufo'
import type { Bullet, GameState, StickyMine, TileType, WeaponId } from '../types/game'

const MAX_TURNS = 20
const TURN_SECONDS = 10
const SHOCKWAVE_RADIUS = TILE * 3
const TRACKING_RANGE_RATIO = 0.15
const TRACKING_TURN_RATE = 0.15  // radians per frame

function buildInitialState(seed: number): GameState {
  const map = generateMap(seed)
  const p1Spawn = pickSpawn(map, 'left')
  const p2Spawn = pickSpawn(map, 'right')
  const defaultWeapons = WEAPON_DEFS.filter(w => w.id !== 'normal').slice(0, 4).map(w => ({ id: w.id, ammo: 2 as const }))
  return {
    map,
    ufos: {
      p1: { id: 'p1', col: p1Spawn.col, row: p1Spawn.row, color: '#00d4ff', hp: 100, maxHp: 100, weapons: defaultWeapons, dotStacks: [], smokeLeft: 0, hasStickyMine: false },
      p2: { id: 'p2', col: p2Spawn.col, row: p2Spawn.row, color: '#ff3366', hp: 100, maxHp: 100, weapons: [...defaultWeapons], dotStacks: [], smokeLeft: 0, hasStickyMine: false },
    },
    currentTurn: 'p1', turnNumber: 1, phase: 'playing', localPlayer: 'p1', winner: null,
    stickyMines: [],
  }
}

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>()
  const seed = parseInt(roomId ?? '123456', 10)

  const [gs, setGs] = useState<GameState>(() => buildInitialState(seed))
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('normal')
  const [movingMode, setMovingMode] = useState(false)
  const [timer, setTimer] = useState(TURN_SECONDS)
  const [isPaused, setIsPaused] = useState(false)
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [animDestroyedTiles, setAnimDestroyedTiles] = useState<{ x: number; y: number }[]>([])
  const [explosionEvents, setExplosionEvents] = useState<{ x: number; y: number }[]>([])

  const bulletsRef = useRef<Bullet[]>([])
  const gsRef = useRef(gs)
  const animating = useRef(false)
  const pendingTiles = useRef<{ x: number; y: number }[]>([])
  const pendingDamage = useRef(0)
  const pendingHitTarget = useRef<'p1' | 'p2' | null>(null)
  const pendingDotStacks = useRef<{ target: 'p1' | 'p2'; damage: number; turns: number }[]>([])
  const pendingStickyMines = useRef<StickyMine[]>([])
  const pendingUFOMineTargets = useRef<('p1' | 'p2')[]>([])
  const rafRef = useRef<number>()
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const botTimerRef = useRef<ReturnType<typeof setTimeout>>()
  // Track previous mine state to detect explosions for visuals
  const prevMinesRef = useRef<StickyMine[]>([])
  const prevUFOMineRef = useRef({ p1: false, p2: false })

  useEffect(() => { gsRef.current = gs }, [gs])

  // ─── Mine explosion visual events ──────────────────────────────────────────
  useEffect(() => {
    const positions: { x: number; y: number }[] = []

    // Tile mines that just exploded (disappeared from stickyMines)
    prevMinesRef.current
      .filter(m => !gs.stickyMines.some(m2 => m2.id === m.id))
      .forEach(m => positions.push({ x: (m.col + 0.5) * TILE, y: (m.row + 0.5) * TILE }))

    // UFO mines that just exploded (hasStickyMine flipped to false)
    ;(['p1', 'p2'] as const).forEach(pid => {
      if (prevUFOMineRef.current[pid] && !gs.ufos[pid].hasStickyMine) {
        positions.push({ x: (gs.ufos[pid].col + 0.5) * TILE, y: (gs.ufos[pid].row + 0.5) * TILE })
      }
    })

    prevMinesRef.current = gs.stickyMines
    prevUFOMineRef.current = { p1: gs.ufos.p1.hasStickyMine, p2: gs.ufos.p2.hasStickyMine }

    if (positions.length === 0) return
    setExplosionEvents(positions)
    setTimeout(() => setExplosionEvents([]), 0)
  }, [gs.stickyMines, gs.ufos.p1.hasStickyMine, gs.ufos.p2.hasStickyMine])

  // ─── Page visibility pause ─────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsPaused(document.hidden)
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  const isMyTurn = gs.phase === 'playing' && gs.currentTurn === gs.localPlayer && !animating.current

  // ─── End turn (ticks DOT + explodes mines for next turn start) ───────────────
  const endTurn = useCallback(() => {
    animating.current = false
    setMovingMode(false)
    setSelectedWeapon('normal')
    setGs(prev => {
      const nextTurn = prev.currentTurn === 'p1' ? 'p2' : 'p1'
      const nextNum = prev.currentTurn === 'p2' ? prev.turnNumber + 1 : prev.turnNumber

      // DOT tick for the player whose turn is starting
      const nextUfo = prev.ufos[nextTurn]
      const dotDmg = nextUfo.dotStacks.reduce((s, d) => s + d.damage, 0)
      const newDotStacks = nextUfo.dotStacks
        .map(d => ({ ...d, turnsLeft: d.turnsLeft - 1 }))
        .filter(d => d.turnsLeft > 0)

      // Mine explosions — tile mines check radius, UFO mines deal direct damage
      const MINE_RADIUS = TILE * 1.5
      const mineDmg: Record<'p1' | 'p2', number> = { p1: 0, p2: 0 }

      prev.stickyMines.forEach(mine => {
        const mx = (mine.col + 0.5) * TILE
        const my = (mine.row + 0.5) * TILE
        ;(['p1', 'p2'] as const).forEach(pid => {
          const ufo = prev.ufos[pid]
          const ux = (ufo.col + 0.5) * TILE
          const uy = (ufo.row + 0.5) * TILE
          if (Math.hypot(ux - mx, uy - my) <= MINE_RADIUS) mineDmg[pid] += 25
        })
      })
      ;(['p1', 'p2'] as const).forEach(pid => {
        if (prev.ufos[pid].hasStickyMine) mineDmg[pid] += 25
      })

      const p1Hp = Math.max(0, prev.ufos.p1.hp - mineDmg.p1 - (nextTurn === 'p1' ? dotDmg : 0))
      const p2Hp = Math.max(0, prev.ufos.p2.hp - mineDmg.p2 - (nextTurn === 'p2' ? dotDmg : 0))

      let updated: GameState = {
        ...prev,
        currentTurn: nextTurn,
        turnNumber: nextNum,
        stickyMines: [],
        ufos: {
          p1: { ...prev.ufos.p1, hp: p1Hp, hasStickyMine: false, dotStacks: nextTurn === 'p1' ? newDotStacks : prev.ufos.p1.dotStacks },
          p2: { ...prev.ufos.p2, hp: p2Hp, hasStickyMine: false, dotStacks: nextTurn === 'p2' ? newDotStacks : prev.ufos.p2.dotStacks },
        },
      }

      const isOver = nextNum > MAX_TURNS || updated.ufos.p1.hp <= 0 || updated.ufos.p2.hp <= 0
      if (!isOver) return updated

      const w = updated.ufos.p1.hp > updated.ufos.p2.hp ? 'p1'
              : updated.ufos.p2.hp > updated.ufos.p1.hp ? 'p2'
              : 'draw' as const
      return { ...updated, phase: 'ended', winner: w }
    })
    setTimer(TURN_SECONDS)
  }, [])

  // ─── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.phase !== 'playing' || !isMyTurn || isPaused) return
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { endTurn(); return TURN_SECONDS }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [gs.currentTurn, gs.phase, isMyTurn, isPaused, endTurn])

  // ─── Bullet animation loop ─────────────────────────────────────────────────
  const animStep = useCallback(() => {
    const game = gsRef.current
    const destroyed: { x: number; y: number }[] = []

    // Effective map includes tiles already destroyed this animation
    const prevDestroyed = pendingTiles.current
    const effectiveTiles: TileType[][] = prevDestroyed.length === 0
      ? game.map.tiles
      : game.map.tiles.map((row, r) =>
          row.map((t, c) => prevDestroyed.some(d => d.x === c && d.y === r) ? 'empty' : t)
        )
    const effectiveMap = { ...game.map, tiles: effectiveTiles }
    const trackRange = game.map.cols * TILE * TRACKING_RANGE_RATIO

    let hitDamage = 0
    const newBullets: Bullet[] = []

    const next = bulletsRef.current.map(b => {
      if (!b.active) return b

      const target = b.owner === 'p1' ? 'p2' : 'p1'
      const tUfo = game.ufos[target]
      const tx = (tUfo.col + 0.5) * TILE
      const ty = (tUfo.row + 0.5) * TILE

      let stepped = stepBullet(b, effectiveMap, TILE, destroyed)

      // ── Weapon-specific mechanics ──────────────────────────────────────────

      // STICKY MINE: bullet stuck to soft wall → place mine (no tile destruction)
      if (b.weapon === 'sticky' && stepped.stuck) {
        pendingStickyMines.current.push({
          id: `mine_${b.id}`,
          col: Math.floor(stepped.x / TILE),
          row: Math.floor(stepped.y / TILE),
        })
        return { ...stepped, active: false }
      }

      // SPLIT: first bounce → deactivate + spawn 3 children
      if (b.weapon === 'split' && !b.hasSplit && stepped.active && stepped.bounces > b.bounces) {
        const baseAngle = Math.atan2(stepped.vy, stepped.vx)
        for (let i = -1; i <= 1; i++) {
          const a = baseAngle + i * (Math.PI / 6)
          newBullets.push({
            ...createBullet(`${b.id}_s${i}`, b.owner, 'split', stepped.x, stepped.y, a, stepped.ttl),
            hasSplit: true,
            bounces: stepped.bounces,
          })
        }
        return { ...stepped, active: false }
      }

      // TRACKING: curve toward enemy when within range
      if (b.weapon === 'tracking' && stepped.active) {
        const dist = Math.hypot(tx - stepped.x, ty - stepped.y)
        if (dist < trackRange) {
          const targetAngle = Math.atan2(ty - stepped.y, tx - stepped.x)
          const curAngle = Math.atan2(stepped.vy, stepped.vx)
          let diff = targetAngle - curAngle
          while (diff > Math.PI) diff -= 2 * Math.PI
          while (diff < -Math.PI) diff += 2 * Math.PI
          const newAngle = curAngle + Math.sign(diff) * Math.min(Math.abs(diff), TRACKING_TURN_RATE)
          const speed = Math.hypot(stepped.vx, stepped.vy)
          stepped = { ...stepped, vx: Math.cos(newAngle) * speed, vy: Math.sin(newAngle) * speed }
        }
      }

      // SHOCKWAVE: explode after first bounce — area damage + destroy all soft tiles in radius
      if (b.weapon === 'shockwave' && stepped.bounces >= 1) {
        for (let r = 0; r < game.map.rows; r++) {
          for (let c = 0; c < game.map.cols; c++) {
            if (effectiveMap.tiles[r][c] !== 'soft') continue
            if (prevDestroyed.some(d => d.x === c && d.y === r)) continue
            const cx = (c + 0.5) * TILE
            const cy = (r + 0.5) * TILE
            if (Math.hypot(cx - stepped.x, cy - stepped.y) <= SHOCKWAVE_RADIUS) {
              if (!destroyed.find(d => d.x === c && d.y === r)) destroyed.push({ x: c, y: r })
            }
          }
        }
        if (Math.hypot(tx - stepped.x, ty - stepped.y) <= SHOCKWAVE_RADIUS) {
          hitDamage += WEAPON_MAP['shockwave'].damage
          pendingHitTarget.current = target
        }
        return { ...stepped, active: false }
      }

      // ── UFO hit detection ──────────────────────────────────────────────────
      if (stepped.active && bulletHitsUFO(stepped, tx, ty, UFO_RADIUS)) {
        if (b.weapon === 'sticky') {
          // Mine attaches to enemy UFO — no immediate damage
          pendingUFOMineTargets.current.push(target)
        } else {
          hitDamage += WEAPON_MAP[b.weapon].damage
          pendingHitTarget.current = target
          if (b.weapon === 'acid') {
            pendingDotStacks.current.push({ target, damage: 5, turns: 3 })
          }
        }
        return { ...stepped, active: false }
      }

      return stepped
    })

    const allBullets = [...next, ...newBullets]
    bulletsRef.current = allBullets
    setBullets([...allBullets])

    if (destroyed.length > 0) {
      pendingTiles.current.push(...destroyed)
      setAnimDestroyedTiles([...pendingTiles.current])
    }
    pendingDamage.current += hitDamage

    if (allBullets.every(b => !b.active)) {
      const totalTiles = [...pendingTiles.current]
      const totalDamage = pendingDamage.current
      const totalHitTarget = pendingHitTarget.current
      const totalDotStacks = [...pendingDotStacks.current]
      const totalStickyMines = [...pendingStickyMines.current]
      const totalUFOMines = [...pendingUFOMineTargets.current]
      pendingTiles.current = []
      pendingDamage.current = 0
      pendingHitTarget.current = null
      pendingDotStacks.current = []
      pendingStickyMines.current = []
      pendingUFOMineTargets.current = []
      // Defer clear so React has one render cycle to spawn particles first
      setTimeout(() => setAnimDestroyedTiles([]), 0)

      setGs(g => {
        let updated = g

        if (totalTiles.length > 0) {
          const newTiles = g.map.tiles.map((row, r) =>
            row.map((t, c) => totalTiles.some(d => d.x === c && d.y === r) ? 'empty' as TileType : t)
          )
          // Remove any mines on destroyed tiles
          const survivingMines = g.stickyMines.filter(
            m => !totalTiles.some(d => d.x === m.col && d.y === m.row)
          )
          updated = { ...updated, map: { ...g.map, tiles: newTiles }, stickyMines: survivingMines }
        }

        if (totalDamage > 0 && totalHitTarget) {
          const ht = totalHitTarget
          updated = {
            ...updated,
            ufos: {
              ...updated.ufos,
              [ht]: { ...updated.ufos[ht], hp: Math.max(0, updated.ufos[ht].hp - totalDamage) },
            },
          }
        }

        // Apply acid DOT stacks
        for (const dot of totalDotStacks) {
          updated = {
            ...updated,
            ufos: {
              ...updated.ufos,
              [dot.target]: {
                ...updated.ufos[dot.target],
                dotStacks: [...updated.ufos[dot.target].dotStacks, { damage: dot.damage, turnsLeft: dot.turns }],
              },
            },
          }
        }

        // Apply sticky tile mines (skip any on tiles just destroyed)
        if (totalStickyMines.length > 0) {
          const validMines = totalStickyMines.filter(
            m => !totalTiles.some(d => d.x === m.col && d.y === m.row)
          )
          if (validMines.length > 0) {
            updated = { ...updated, stickyMines: [...updated.stickyMines, ...validMines] }
          }
        }

        // Apply UFO sticky mines
        for (const pid of totalUFOMines) {
          updated = {
            ...updated,
            ufos: { ...updated.ufos, [pid]: { ...updated.ufos[pid], hasStickyMine: true } },
          }
        }

        return updated
      })
      endTurn()
    } else {
      rafRef.current = requestAnimationFrame(animStep)
    }
  }, [endTurn])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ─── Local test bot ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.phase !== 'playing') return
    if (gs.currentTurn !== 'p2' || gs.localPlayer !== 'p1') return
    if (animating.current || isPaused) return

    botTimerRef.current = setTimeout(() => {
      const game = gsRef.current
      const bot = game.ufos.p2
      const player = game.ufos.p1

      if (Math.random() < 0.35) {
        const cells = getReachableCells(bot, game.map)
        if (cells.length > 0) {
          const t = cells[Math.floor(Math.random() * cells.length)]
          setGs(prev => ({ ...prev, ufos: { ...prev.ufos, p2: { ...prev.ufos.p2, col: t.col, row: t.row } } }))
          endTurn(); return
        }
      }

      const dx = (player.col - bot.col) * TILE
      const dy = (player.row - bot.row) * TILE
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * (Math.PI / 3)
      const b = createBullet(`bot${Date.now()}`, 'p2', 'normal', (bot.col + 0.5) * TILE, (bot.row + 0.5) * TILE, angle, WEAPON_TTL['normal'])
      bulletsRef.current = [b]; setBullets([b])
      pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null
      pendingDotStacks.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []
      setAnimDestroyedTiles([])
      animating.current = true
      rafRef.current = requestAnimationFrame(animStep)
    }, 1200)

    return () => clearTimeout(botTimerRef.current)
  }, [gs.currentTurn, gs.phase, isPaused, animStep, endTurn])

  // ─── Player actions ────────────────────────────────────────────────────────
  const handleMove = (col: number, row: number) => {
    clearInterval(timerRef.current)
    setGs(prev => ({ ...prev, ufos: { ...prev.ufos, [prev.localPlayer]: { ...prev.ufos[prev.localPlayer], col, row } } }))
    endTurn()
  }

  const handleShoot = (angle: number) => {
    clearInterval(timerRef.current)
    const myUfo = gs.ufos[gs.localPlayer]

    if (selectedWeapon !== 'normal') {
      setGs(prev => ({
        ...prev,
        ufos: {
          ...prev.ufos,
          [prev.localPlayer]: {
            ...prev.ufos[prev.localPlayer],
            weapons: prev.ufos[prev.localPlayer].weapons.map(w =>
              w.id === selectedWeapon ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w
            ),
          },
        },
      }))
    }

    const b = createBullet(`b${Date.now()}`, gs.localPlayer, selectedWeapon, (myUfo.col + 0.5) * TILE, (myUfo.row + 0.5) * TILE, angle, WEAPON_TTL[selectedWeapon])
    bulletsRef.current = [b]; setBullets([b])
    pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null
    pendingDotStacks.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []
    setAnimDestroyedTiles([])
    animating.current = true
    rafRef.current = requestAnimationFrame(animStep)
  }

  // ─── End screen ────────────────────────────────────────────────────────────
  if (gs.phase === 'ended') {
    const winColor = gs.winner === 'draw' ? '#888' : gs.ufos[gs.winner as 'p1' | 'p2']?.color
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-6">
        <div className="text-4xl font-bold tracking-widest" style={{ color: winColor }}>
          {gs.winner === 'draw' ? '平手！' : `${gs.winner?.toUpperCase()} 獲勝！`}
        </div>
        <button onClick={() => { setBullets([]); setAnimDestroyedTiles([]); setGs(buildInitialState(seed)) }}
          className="border-2 border-neon-blue text-neon-blue px-8 py-2 rounded tracking-widest hover:bg-neon-blue/10">
          再來一局
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col w-full h-full bg-dark-bg overflow-hidden">
      <HUD p1={gs.ufos.p1} p2={gs.ufos.p2} turn={gs.turnNumber} maxTurns={MAX_TURNS} timerSeconds={timer} currentTurn={gs.currentTurn} />

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <GameCanvas
          state={gs}
          bullets={bullets}
          animDestroyedTiles={animDestroyedTiles}
          explosionEvents={explosionEvents}
          onMove={handleMove}
          onShoot={handleShoot}
          isMyTurn={isMyTurn}
          movingMode={movingMode}
        />
      </div>

      <div className="flex flex-col">
        {isMyTurn && (
          <div className="flex justify-center gap-3 py-1 bg-dark-panel border-t border-dark-border">
            <button onClick={() => setMovingMode(m => !m)}
              className={`px-4 py-1 rounded text-xs tracking-widest border transition-all ${movingMode ? 'border-neon-green text-neon-green bg-neon-green/10' : 'border-dark-border text-gray-500 hover:border-gray-400'}`}>
              移動模式
            </button>
            <button onClick={() => { clearInterval(timerRef.current); endTurn() }}
              className="px-4 py-1 rounded text-xs tracking-widest border border-dark-border text-gray-500 hover:border-red-500 hover:text-red-400 transition-all">
              跳過回合
            </button>
          </div>
        )}
        <WeaponBar ufo={gs.ufos[gs.localPlayer]} selected={selectedWeapon}
          onSelect={w => { setSelectedWeapon(w); setMovingMode(false) }}
          disabled={!isMyTurn || movingMode} />
      </div>

      {isPaused && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm select-none">
          <div className="text-9xl text-white/80 leading-none">⏸</div>
          <div className="text-5xl font-bold tracking-[0.6em] text-white/90 mt-6">PAUSE</div>
          <div className="text-gray-400 text-sm mt-4 tracking-widest">返回頁面繼續遊戲</div>
        </div>
      )}
    </div>
  )
}
