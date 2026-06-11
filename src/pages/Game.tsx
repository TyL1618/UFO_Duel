import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GameCanvas from '../components/GameCanvas'
import HUD from '../components/HUD'
import WeaponBar from '../components/WeaponBar'
import { generateMap, pickSpawn } from '../game/mapGenerator'
import { WEAPON_DEFS, WEAPON_MAP, WEAPON_TTL } from '../game/weapons'
import { createBullet, stepBullet, bulletHitsUFO } from '../game/physics'
import { TILE, UFO_RADIUS } from '../game/constants'
import { getReachableCells } from '../game/ufo'
import type { Bullet, GameState, StickyMine, TileType, WeaponId } from '../types/game'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerLoadout } from '../contexts/RoomContext'

const MAX_TURNS = 20
const TURN_SECONDS = 10
const SHOCKWAVE_RADIUS = TILE * 3
const TRACKING_RANGE_RATIO = 0.15
const TRACKING_TURN_RATE = 0.15

const DEFAULT_P1: PlayerLoadout = { name: 'P1', color: '#00d4ff', weapons: WEAPON_DEFS.filter(w => w.id !== 'normal' && w.id !== 'smoke').slice(0, 4).map(w => w.id) as WeaponId[] }
const DEFAULT_P2: PlayerLoadout = { name: 'P2', color: '#ff3366', weapons: [...(DEFAULT_P1.weapons)] }

function buildInitialState(
  seed: number,
  role: 'p1' | 'p2',
  p1Loadout: PlayerLoadout,
  p2Loadout: PlayerLoadout,
): GameState {
  const map = generateMap(seed)
  const p1Spawn = pickSpawn(map, 'left')
  const p2Spawn = pickSpawn(map, 'right')
  const toSlots = (l: PlayerLoadout) => l.weapons.map(id => ({ id, ammo: 2 as const }))
  return {
    map,
    ufos: {
      p1: { id: 'p1', name: p1Loadout.name, col: p1Spawn.col, row: p1Spawn.row, color: p1Loadout.color, hp: 100, maxHp: 100, weapons: toSlots(p1Loadout), dotStacks: [], smokeLeft: 0, hasStickyMine: false },
      p2: { id: 'p2', name: p2Loadout.name, col: p2Spawn.col, row: p2Spawn.row, color: p2Loadout.color, hp: 100, maxHp: 100, weapons: toSlots(p2Loadout), dotStacks: [], smokeLeft: 0, hasStickyMine: false },
    },
    currentTurn: 'p1', turnNumber: 1, phase: 'playing',
    localPlayer: role,
    winner: null,
    stickyMines: [],
  }
}

type GameAction =
  | { kind: 'move'; col: number; row: number }
  | { kind: 'shoot'; angle: number; weapon: WeaponId }
  | { kind: 'skip' }

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, clearRoom, tryRestoreRoom } = useRoom()

  const isMultiplayer = room !== null
  const myRole = room?.role ?? 'p1'
  const mapSeed = room?.mapSeed ?? parseInt(roomId ?? '123456', 10)
  const p1Loadout = (myRole === 'p1' ? room?.myLoadout : room?.opponentLoadout) ?? DEFAULT_P1
  const p2Loadout = (myRole === 'p2' ? room?.myLoadout : room?.opponentLoadout) ?? DEFAULT_P2

  const [gs, setGs] = useState<GameState>(() => buildInitialState(mapSeed, myRole, p1Loadout, p2Loadout))

  // F5 recovery: if room context was lost on reload, try sessionStorage
  useEffect(() => {
    if (!room && roomId) tryRestoreRoom(roomId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reinitialize game state once restored room data is available
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    if (!room?.mapSeed || !room.myLoadout || !room.opponentLoadout) return
    restoredRef.current = true
    // Only request sync when this was an F5 restore (room was null on mount)
    needsSyncRef.current = roomWasNullOnMount.current
    const role = room.role
    const p1L = (role === 'p1' ? room.myLoadout : room.opponentLoadout)!
    const p2L = (role === 'p2' ? room.myLoadout : room.opponentLoadout)!
    setGs(buildInitialState(room.mapSeed, role, p1L, p2L))
  }, [room?.mapSeed]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('normal')
  const [movingMode, setMovingMode] = useState(false)
  const [timer, setTimer] = useState(TURN_SECONDS)
  const [isPaused, setIsPaused] = useState(false)
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [animDestroyedTiles, setAnimDestroyedTiles] = useState<{ x: number; y: number }[]>([])
  const [explosionEvents, setExplosionEvents] = useState<{ x: number; y: number }[]>([])
  const [hitEvents, setHitEvents] = useState<{ x: number; y: number; id: number }[]>([])
  const [oppDisconnected, setOppDisconnected] = useState(false)

  const needsSyncRef = useRef(false)
  const roomWasNullOnMount = useRef(!room)

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
  const prevMinesRef = useRef<StickyMine[]>([])
  const prevUFOMineRef = useRef({ p1: false, p2: false })

  useEffect(() => { gsRef.current = gs }, [gs])

  // ─── Mine explosion visual events ──────────────────────────────────────────
  useEffect(() => {
    const positions: { x: number; y: number }[] = []
    prevMinesRef.current
      .filter(m => !gs.stickyMines.some(m2 => m2.id === m.id))
      .forEach(m => positions.push({ x: (m.col + 0.5) * TILE, y: (m.row + 0.5) * TILE }))
    ;(['p1', 'p2'] as const).forEach(pid => {
      if (prevUFOMineRef.current[pid] && !gs.ufos[pid].hasStickyMine)
        positions.push({ x: (gs.ufos[pid].col + 0.5) * TILE, y: (gs.ufos[pid].row + 0.5) * TILE })
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

  // ─── End turn ──────────────────────────────────────────────────────────────
  const endTurn = useCallback((broadcastSkip = false) => {
    animating.current = false
    setMovingMode(false)
    setSelectedWeapon('normal')
    if (broadcastSkip) {
      channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'skip' } })
    }
    setGs(prev => {
      const nextTurn = prev.currentTurn === 'p1' ? 'p2' : 'p1'
      const nextNum = prev.currentTurn === 'p2' ? prev.turnNumber + 1 : prev.turnNumber
      const nextUfo = prev.ufos[nextTurn]
      const dotDmg = nextUfo.dotStacks.reduce((s, d) => s + d.damage, 0)
      const newDotStacks = nextUfo.dotStacks
        .map(d => ({ ...d, turnsLeft: d.turnsLeft - 1 })).filter(d => d.turnsLeft > 0)
      const MINE_RADIUS = TILE * 1.5
      const mineDmg: Record<'p1' | 'p2', number> = { p1: 0, p2: 0 }
      prev.stickyMines.forEach(mine => {
        const mx = (mine.col + 0.5) * TILE, my = (mine.row + 0.5) * TILE
        ;(['p1', 'p2'] as const).forEach(pid => {
          const ufo = prev.ufos[pid]
          if (Math.hypot((ufo.col + 0.5) * TILE - mx, (ufo.row + 0.5) * TILE - my) <= MINE_RADIUS) mineDmg[pid] += 25
        })
      })
      ;(['p1', 'p2'] as const).forEach(pid => { if (prev.ufos[pid].hasStickyMine) mineDmg[pid] += 25 })
      const p1Hp = Math.max(0, prev.ufos.p1.hp - mineDmg.p1 - (nextTurn === 'p1' ? dotDmg : 0))
      const p2Hp = Math.max(0, prev.ufos.p2.hp - mineDmg.p2 - (nextTurn === 'p2' ? dotDmg : 0))
      let updated: GameState = {
        ...prev, currentTurn: nextTurn, turnNumber: nextNum, stickyMines: [],
        ufos: {
          p1: { ...prev.ufos.p1, hp: p1Hp, hasStickyMine: false, dotStacks: nextTurn === 'p1' ? newDotStacks : prev.ufos.p1.dotStacks },
          p2: { ...prev.ufos.p2, hp: p2Hp, hasStickyMine: false, dotStacks: nextTurn === 'p2' ? newDotStacks : prev.ufos.p2.dotStacks },
        },
      }
      const isOver = nextNum > MAX_TURNS || updated.ufos.p1.hp <= 0 || updated.ufos.p2.hp <= 0
      if (!isOver) return updated
      const w = updated.ufos.p1.hp > updated.ufos.p2.hp ? 'p1'
              : updated.ufos.p2.hp > updated.ufos.p1.hp ? 'p2' : 'draw' as const
      return { ...updated, phase: 'ended', winner: w }
    })
    setTimer(TURN_SECONDS)
  }, [channelRef])

  // ─── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.phase !== 'playing' || isPaused) return
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          if (isMyTurn) endTurn(true)
          return TURN_SECONDS
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [gs.currentTurn, gs.phase, isPaused, isMyTurn, endTurn])

  // ─── Bullet animation loop ─────────────────────────────────────────────────
  const animStep = useCallback(() => {
    const game = gsRef.current
    const destroyed: { x: number; y: number }[] = []
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
      const tx = (tUfo.col + 0.5) * TILE, ty = (tUfo.row + 0.5) * TILE
      let stepped = stepBullet(b, effectiveMap, TILE, destroyed)

      if (b.weapon === 'sticky' && stepped.stuck) {
        pendingStickyMines.current.push({ id: `mine_${b.id}`, col: Math.floor(stepped.x / TILE), row: Math.floor(stepped.y / TILE) })
        return { ...stepped, active: false }
      }
      if (b.weapon === 'split' && !b.hasSplit && stepped.active && stepped.bounces > b.bounces) {
        const baseAngle = Math.atan2(stepped.vy, stepped.vx)
        for (let i = -1; i <= 1; i++) {
          const a = baseAngle + i * (Math.PI / 6)
          newBullets.push({ ...createBullet(`${b.id}_s${i}`, b.owner, 'split', stepped.x, stepped.y, a, stepped.ttl), hasSplit: true, bounces: stepped.bounces })
        }
        return { ...stepped, active: false }
      }
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
      if (b.weapon === 'shockwave' && stepped.bounces >= 1) {
        for (let r = 0; r < game.map.rows; r++) {
          for (let c = 0; c < game.map.cols; c++) {
            if (effectiveMap.tiles[r][c] !== 'soft') continue
            if (prevDestroyed.some(d => d.x === c && d.y === r)) continue
            if (Math.hypot((c + 0.5) * TILE - stepped.x, (r + 0.5) * TILE - stepped.y) <= SHOCKWAVE_RADIUS)
              if (!destroyed.find(d => d.x === c && d.y === r)) destroyed.push({ x: c, y: r })
          }
        }
        if (Math.hypot(tx - stepped.x, ty - stepped.y) <= SHOCKWAVE_RADIUS) {
          hitDamage += WEAPON_MAP['shockwave'].damage; pendingHitTarget.current = target
        }
        return { ...stepped, active: false }
      }
      if (stepped.active && bulletHitsUFO(stepped, tx, ty, UFO_RADIUS)) {
        if (b.weapon === 'sticky') {
          pendingUFOMineTargets.current.push(target)
        } else {
          hitDamage += WEAPON_MAP[b.weapon].damage
          pendingHitTarget.current = target
          if (b.weapon === 'acid') pendingDotStacks.current.push({ target, damage: 5, turns: 3 })
        }
        return { ...stepped, active: false }
      }
      return stepped
    })

    const allBullets = [...next, ...newBullets]
    bulletsRef.current = allBullets
    setBullets([...allBullets])
    if (destroyed.length > 0) { pendingTiles.current.push(...destroyed); setAnimDestroyedTiles([...pendingTiles.current]) }
    pendingDamage.current += hitDamage

    if (allBullets.every(b => !b.active)) {
      const totalTiles = [...pendingTiles.current]
      const totalDamage = pendingDamage.current
      const totalHitTarget = pendingHitTarget.current
      const totalDotStacks = [...pendingDotStacks.current]
      const totalStickyMines = [...pendingStickyMines.current]
      const totalUFOMines = [...pendingUFOMineTargets.current]
      pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null
      pendingDotStacks.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []
      setTimeout(() => setAnimDestroyedTiles([]), 0)

      if (totalDamage > 0 && totalHitTarget) {
        const hitUfo = gsRef.current.ufos[totalHitTarget]
        const hx = (hitUfo.col + 0.5) * TILE
        const hy = (hitUfo.row + 0.5) * TILE
        setHitEvents([{ x: hx, y: hy, id: Date.now() }])
        setTimeout(() => setHitEvents([]), 0)
      }

      setGs(g => {
        let updated = g
        if (totalTiles.length > 0) {
          const newTiles = g.map.tiles.map((row, r) => row.map((t, c) => totalTiles.some(d => d.x === c && d.y === r) ? 'empty' as TileType : t))
          const survivingMines = g.stickyMines.filter(m => !totalTiles.some(d => d.x === m.col && d.y === m.row))
          updated = { ...updated, map: { ...g.map, tiles: newTiles }, stickyMines: survivingMines }
        }
        if (totalDamage > 0 && totalHitTarget) {
          const ht = totalHitTarget
          updated = { ...updated, ufos: { ...updated.ufos, [ht]: { ...updated.ufos[ht], hp: Math.max(0, updated.ufos[ht].hp - totalDamage) } } }
        }
        for (const dot of totalDotStacks)
          updated = { ...updated, ufos: { ...updated.ufos, [dot.target]: { ...updated.ufos[dot.target], dotStacks: [...updated.ufos[dot.target].dotStacks, { damage: dot.damage, turnsLeft: dot.turns }] } } }
        if (totalStickyMines.length > 0) {
          const validMines = totalStickyMines.filter(m => !totalTiles.some(d => d.x === m.col && d.y === m.row))
          if (validMines.length > 0) updated = { ...updated, stickyMines: [...updated.stickyMines, ...validMines] }
        }
        for (const pid of totalUFOMines)
          updated = { ...updated, ufos: { ...updated.ufos, [pid]: { ...updated.ufos[pid], hasStickyMine: true } } }
        return updated
      })
      endTurn()
    } else {
      rafRef.current = requestAnimationFrame(animStep)
    }
  }, [endTurn])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ─── Multiplayer: listen for opponent actions ──────────────────────────────
  useEffect(() => {
    if (!isMultiplayer) return

    // Rebuild the channel: Supabase forbids .on() after subscribe(), and the
    // channel from Loadout is already subscribed. Register all listeners here
    // BEFORE subscribing.
    channelRef.current?.unsubscribe()
    const ch = supabase.channel(`room:${roomId}`)
    channelRef.current = ch
    const rebuiltAt = Date.now()

    ch.on('broadcast', { event: 'game_action' }, ({ payload }) => {
      const game = gsRef.current
      // Only apply when it's opponent's turn
      if (game.currentTurn === game.localPlayer) return
      const action = payload as GameAction
      const oppId = game.currentTurn  // currentTurn IS the opponent when we receive this

      if (action.kind === 'move') {
        clearInterval(timerRef.current)
        setGs(prev => ({ ...prev, ufos: { ...prev.ufos, [oppId]: { ...prev.ufos[oppId], col: action.col, row: action.row } } }))
        endTurn()
      } else if (action.kind === 'shoot') {
        clearInterval(timerRef.current)
        if (action.weapon !== 'normal') {
          setGs(prev => ({
            ...prev,
            ufos: { ...prev.ufos, [oppId]: { ...prev.ufos[oppId], weapons: prev.ufos[oppId].weapons.map(w => w.id === action.weapon ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
          }))
        }
        const oppUfo = gsRef.current.ufos[oppId]
        const sx = (oppUfo.col + 0.5) * TILE
        const sy = (oppUfo.row + 0.5) * TILE
        const newBullets = action.weapon === 'burst'
          ? [-0.08, 0, 0.08].map((off, i) => createBullet(`opp${Date.now()}_${i}`, oppId, 'burst', sx, sy, action.angle + off, WEAPON_TTL['burst']))
          : [createBullet(`opp${Date.now()}`, oppId, action.weapon, sx, sy, action.angle, WEAPON_TTL[action.weapon])]
        bulletsRef.current = newBullets; setBullets(newBullets)
        pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null
        pendingDotStacks.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []
        setAnimDestroyedTiles([])
        animating.current = true
        rafRef.current = requestAnimationFrame(animStep)
      } else if (action.kind === 'skip') {
        clearInterval(timerRef.current)
        endTurn()
      }
    })

    // When opponent reconnects (F5), they send request_sync; we reply with full state
    ch.on('broadcast', { event: 'request_sync' }, () => {
      const game = gsRef.current
      if (game.phase !== 'playing') return
      ch.send({
        type: 'broadcast',
        event: 'game_state_sync',
        payload: {
          ufos: game.ufos,
          currentTurn: game.currentTurn,
          turnNumber: game.turnNumber,
          phase: game.phase,
          winner: game.winner,
          stickyMines: game.stickyMines,
          mapTiles: game.map.tiles,
        },
      })
    })

    // We receive game_state_sync after our own F5 restore
    ch.on('broadcast', { event: 'game_state_sync' }, ({ payload }) => {
      if (!needsSyncRef.current) return
      needsSyncRef.current = false
      const p = payload as {
        ufos: GameState['ufos']
        currentTurn: 'p1' | 'p2'
        turnNumber: number
        phase: GameState['phase']
        winner: GameState['winner']
        stickyMines: GameState['stickyMines']
        mapTiles: GameState['map']['tiles']
      }
      setGs(prev => ({
        ...prev,
        ufos: p.ufos,
        currentTurn: p.currentTurn,
        turnNumber: p.turnNumber,
        phase: p.phase,
        winner: p.winner,
        stickyMines: p.stickyMines,
        map: { ...prev.map, tiles: p.mapTiles },
      }))
    })

    // Detect opponent disconnect via presence. Ignore churn right after the
    // rebuild (both clients briefly leave/rejoin while reconnecting).
    ch.on('presence', { event: 'leave' }, () => {
      if (Date.now() - rebuiltAt < 3000) return
      if (gsRef.current.phase === 'playing') setOppDisconnected(true)
    })
    ch.on('presence', { event: 'join' }, () => setOppDisconnected(false))

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role: myRole })
        if (needsSyncRef.current) {
          // Ask opponent for current game state (F5 restore path)
          setTimeout(() => ch.send({ type: 'broadcast', event: 'request_sync', payload: {} }), 300)
        }
      }
    })
  }, [isMultiplayer]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Solo bot ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMultiplayer) return
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
  }, [isMultiplayer, gs.currentTurn, gs.phase, isPaused, animStep, endTurn])

  // ─── Player actions ────────────────────────────────────────────────────────
  const handleMove = (col: number, row: number) => {
    clearInterval(timerRef.current)
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'move', col, row } })
    setGs(prev => ({ ...prev, ufos: { ...prev.ufos, [prev.localPlayer]: { ...prev.ufos[prev.localPlayer], col, row } } }))
    endTurn()
  }

  const handleShoot = (angle: number) => {
    clearInterval(timerRef.current)
    const myUfo = gs.ufos[gs.localPlayer]
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'shoot', angle, weapon: selectedWeapon } })
    if (selectedWeapon !== 'normal') {
      setGs(prev => ({
        ...prev,
        ufos: { ...prev.ufos, [prev.localPlayer]: { ...prev.ufos[prev.localPlayer], weapons: prev.ufos[prev.localPlayer].weapons.map(w => w.id === selectedWeapon ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
      }))
    }
    const sx = (myUfo.col + 0.5) * TILE
    const sy = (myUfo.row + 0.5) * TILE
    const newBullets = selectedWeapon === 'burst'
      ? [-0.08, 0, 0.08].map((off, i) => createBullet(`b${Date.now()}_${i}`, gs.localPlayer, 'burst', sx, sy, angle + off, WEAPON_TTL['burst']))
      : [createBullet(`b${Date.now()}`, gs.localPlayer, selectedWeapon, sx, sy, angle, WEAPON_TTL[selectedWeapon])]
    bulletsRef.current = newBullets; setBullets(newBullets)
    pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null
    pendingDotStacks.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []
    setAnimDestroyedTiles([])
    animating.current = true
    rafRef.current = requestAnimationFrame(animStep)
  }

  // ─── End screen ────────────────────────────────────────────────────────────
  if (gs.phase === 'ended') {
    const winColor = gs.winner === 'draw' ? '#888' : gs.ufos[gs.winner as 'p1' | 'p2']?.color
    const isWinner = gs.winner === gs.localPlayer
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-6">
        <div className="text-4xl font-bold tracking-widest" style={{ color: winColor }}>
          {gs.winner === 'draw' ? '平手！' : isWinner ? '你贏了！' : '你輸了...'}
        </div>
        {!isMultiplayer && (
          <button
            onClick={() => { setBullets([]); setAnimDestroyedTiles([]); setGs(buildInitialState(mapSeed, myRole, p1Loadout, p2Loadout)) }}
            className="border-2 border-neon-blue text-neon-blue px-8 py-2 rounded tracking-widest hover:bg-neon-blue/10"
          >
            再來一局
          </button>
        )}
        <button
          onClick={() => { clearRoom(); nav('/') }}
          className="border-2 border-gray-600 text-gray-400 px-8 py-2 rounded tracking-widest hover:bg-gray-600/10"
        >
          返回首頁
        </button>
      </div>
    )
  }

  const opponentName = (myRole === 'p1' ? room?.opponentLoadout : room?.myLoadout)?.name

  return (
    <div className="relative flex flex-col w-full h-full bg-dark-bg overflow-hidden">
      <HUD
        p1={gs.ufos.p1} p2={gs.ufos.p2}
        turn={gs.turnNumber} maxTurns={MAX_TURNS}
        timerSeconds={timer} currentTurn={gs.currentTurn}
        waitingFor={!isMyTurn && isMultiplayer && gs.phase === 'playing' ? (opponentName ?? '對手') : undefined}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left sidebar: weapons with names */}
        <div className="flex flex-col w-28 shrink-0 bg-dark-panel border-r border-dark-border overflow-y-auto">
          <WeaponBar vertical ufo={gs.ufos[gs.localPlayer]} selected={selectedWeapon}
            onSelect={w => { setSelectedWeapon(w); setMovingMode(false) }}
            disabled={!isMyTurn || movingMode} />
        </div>

        {/* Main area: canvas */}
        <div className="flex-1 flex items-center justify-center overflow-hidden min-w-0">
          <GameCanvas
            state={gs}
            bullets={bullets}
            animDestroyedTiles={animDestroyedTiles}
            explosionEvents={explosionEvents}
            hitEvents={hitEvents}
            onMove={handleMove}
            onShoot={handleShoot}
            isMyTurn={isMyTurn}
            movingMode={movingMode}
          />
        </div>

        {/* Right sidebar: action buttons */}
        <div className="flex flex-col w-14 shrink-0 bg-dark-panel border-l border-dark-border">
          {isMyTurn && (
            <div className="flex flex-col gap-2 p-2 pt-4">
              <button
                onClick={() => setMovingMode(m => !m)}
                className={`w-full py-2 rounded text-xs border transition-all ${movingMode ? 'border-neon-green text-neon-green bg-neon-green/10' : 'border-dark-border text-gray-500 hover:border-gray-400'}`}
              >
                移動
              </button>
              <button
                onClick={() => { clearInterval(timerRef.current); endTurn(true) }}
                className="w-full py-2 rounded text-xs border border-dark-border text-gray-500 hover:border-red-500 hover:text-red-400 transition-all"
              >
                跳過
              </button>
            </div>
          )}
        </div>
      </div>

      {isPaused && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm select-none">
          <div className="text-9xl text-white/80 leading-none">⏸</div>
          <div className="text-5xl font-bold tracking-[0.6em] text-white/90 mt-6">PAUSE</div>
          <div className="text-gray-400 text-sm mt-4 tracking-widest">返回頁面繼續遊戲</div>
        </div>
      )}

      {oppDisconnected && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm select-none">
          <div className="text-yellow-400 text-2xl tracking-widest animate-pulse">對手已離線</div>
          <div className="text-gray-400 text-sm mt-2">等待重新連線...</div>
          <button onClick={() => { clearRoom(); nav('/') }} className="mt-6 text-gray-500 hover:text-gray-300 text-sm tracking-widest">放棄並返回首頁</button>
        </div>
      )}
    </div>
  )
}
