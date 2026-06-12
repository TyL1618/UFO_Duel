import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GameCanvas from '../components/GameCanvas'
import type { DamageFloat } from '../components/GameCanvas'
import HUD from '../components/HUD'
import WeaponBar from '../components/WeaponBar'
import { generateMap, pickSpawn, pickSpawnN } from '../game/mapGenerator'
import { WEAPON_DEFS, WEAPON_MAP, WEAPON_TTL } from '../game/weapons'
import { createBullet, stepBullet, bulletHitsUFO, applyBlackholeGravity } from '../game/physics'
import { TILE, UFO_RADIUS } from '../game/constants'
import { getReachableCells, getSteppableCells } from '../game/ufo'
import type { Bullet, BlackHole, GameState, HealthPack, PlayerId, Portal, SmokeCloud, StickyMine, TileType, TrapMine, WeaponId } from '../types/game'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerLoadout } from '../contexts/RoomContext'
import { playShoot, playHit, playTurnChange, playExplosion, playSmoke, playGameEnd, playShieldActivate, playShieldHit, playShieldBreak, playTeleport, playKill } from '../sounds'
import { recordGameResult } from '../lib/stats'

const MAX_TURNS = 25
const TURN_SECONDS = 15
const TRACKING_RANGE_RATIO = 0.15
const TRACKING_TURN_RATE = 0.15

const DEFAULT_WEAPONS = WEAPON_DEFS.filter(w => w.id !== 'normal').slice(0, 4).map(w => w.id) as WeaponId[]
const BOT_WEAPONS = WEAPON_DEFS.filter(w => w.id !== 'normal' && w.id !== 'teleport').slice(0, 4).map(w => w.id) as WeaponId[]
const DEFAULT_P1: PlayerLoadout = { name: 'P1', color: '#00d4ff', weapons: DEFAULT_WEAPONS }
const DEFAULT_P2: PlayerLoadout = { name: 'Bot', color: '#ff3366', weapons: BOT_WEAPONS }
const DEFAULT_LOADOUTS: Record<PlayerId, PlayerLoadout> = {
  p1: DEFAULT_P1,
  p2: DEFAULT_P2,
  p3: { name: 'P3', color: '#00ff88', weapons: [...DEFAULT_WEAPONS] },
  p4: { name: 'P4', color: '#ffdd00', weapons: [...DEFAULT_WEAPONS] },
}
const SOLO_LOADOUT: PlayerLoadout = { name: 'P1', color: '#00d4ff', weapons: WEAPON_DEFS.filter(w => w.id !== 'normal').map(w => w.id) as WeaponId[] }

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function computeSmokeLanding(
  startX: number, startY: number, angle: number,
  map: GameState['map'], ufos: GameState['ufos'], players: PlayerId[],
): { col: number; row: number } {
  let b = createBullet('sim', 'p1', 'smoke', startX, startY, angle, WEAPON_TTL['smoke'])
  for (let i = 0; i < 6000; i++) {
    const destroyed: { x: number; y: number }[] = []
    const next = stepBullet(b, map, TILE, destroyed)
    for (const pid of players) {
      const u = ufos[pid]
      if (!u) continue
      if (bulletHitsUFO(next, (u.col + 0.5) * TILE, (u.row + 0.5) * TILE, UFO_RADIUS))
        return { col: u.col, row: u.row }
    }
    if (next.bounces > b.bounces || !next.active)
      return { col: Math.floor(next.x / TILE), row: Math.floor(next.y / TILE) }
    b = next
  }
  return { col: Math.floor(b.x / TILE), row: Math.floor(b.y / TILE) }
}

function generateHealthPack(
  mapSeed: number, turnNumber: number,
  map: GameState['map'], players: PlayerId[],
  ufos: GameState['ufos'], existing: HealthPack[],
): HealthPack | null {
  const rng = mulberry32(mapSeed + turnNumber * 9999)
  const empty: { col: number; row: number }[] = []
  for (let r = 0; r < map.rows; r++)
    for (let c = 0; c < map.cols; c++) {
      if (map.tiles[r][c] !== 'empty') continue
      if (players.some(pid => ufos[pid]?.col === c && ufos[pid]?.row === r)) continue
      if (existing.some(p => p.col === c && p.row === r)) continue
      empty.push({ col: c, row: r })
    }
  if (empty.length === 0) return null
  const t = empty[Math.floor(rng() * empty.length)]
  return { id: `pack_t${turnNumber}`, col: t.col, row: t.row }
}

function buildInitialState(
  seed: number,
  players: PlayerId[],
  loadouts: Partial<Record<PlayerId, PlayerLoadout>>,
  localPlayer: PlayerId,
): GameState {
  const map = generateMap(seed)
  const is2p = players.length === 2
  const toSlots = (l: PlayerLoadout) => l.weapons.map(id => ({ id, ammo: 2 as const }))
  const ufos: GameState['ufos'] = {}
  for (const pid of players) {
    const l = loadouts[pid] ?? DEFAULT_LOADOUTS[pid]
    const spawn = is2p
      ? pickSpawn(map, pid === 'p1' ? 'left' : 'right')
      : pickSpawnN(map, pid)
    ufos[pid] = {
      id: pid, name: l.name, col: spawn.col, row: spawn.row,
      color: l.color, hp: 100, maxHp: 100,
      weapons: toSlots(l), dotStacks: [], smokeLeft: 0,
      hasStickyMine: 0, stickyMineOwner: null, isDead: false,
      shieldHp: 0, shieldTurnsLeft: 0, frozenTurns: 0,
    }
  }
  return {
    players,
    map,
    ufos,
    currentTurn: players[0],
    turnNumber: 1,
    phase: 'playing',
    localPlayer,
    winner: null,
    stickyMines: [],
    smokeClouds: [],
    stormBurnedTiles: [],
    healthPacks: [],
    portals: [],
    trapMines: [],
    blackHoles: [],
  }
}

type GameAction =
  | { kind: 'move'; col: number; row: number }
  | { kind: 'shoot'; angle: number; weapon: WeaponId }
  | { kind: 'skip' }
  | { kind: 'shield' }
  | { kind: 'smokeCloud'; col: number; row: number }
  | { kind: 'teleport'; portals: [{ col: number; row: number }, { col: number; row: number }] }
  | { kind: 'emote'; emoji: string }
  | { kind: 'trap'; col: number; row: number }
  | { kind: 'blackhole'; col: number; row: number }

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, clearRoom, tryRestoreRoom } = useRoom()

  const isSolo = roomId === 'solo'
  const isMultiplayer = room !== null && !isSolo
  const myRole = room?.role ?? 'p1'
  const soloSeedRef = useRef(Math.floor(Math.random() * 1_000_000))
  const mapSeed = isSolo ? soloSeedRef.current : (room?.mapSeed ?? parseInt(roomId ?? '123456', 10))

  // Turn order + loadouts generalize to N players (2 for solo/1v1, 3–4 for FFA).
  const playerCount = isSolo ? 2 : (room?.playerCount ?? 2)
  const players = useMemo<PlayerId[]>(
    () => (['p1', 'p2', 'p3', 'p4'] as PlayerId[]).slice(0, playerCount),
    [playerCount],
  )
  const loadouts = useMemo<Partial<Record<PlayerId, PlayerLoadout>>>(() => {
    if (isSolo) return { p1: SOLO_LOADOUT, p2: DEFAULT_P2 }
    const src = room?.loadouts ?? {}
    const out: Partial<Record<PlayerId, PlayerLoadout>> = {}
    for (const pid of players) out[pid] = src[pid] ?? DEFAULT_LOADOUTS[pid]
    return out
  }, [isSolo, room?.loadouts, players])

  const [gs, setGs] = useState<GameState>(() => buildInitialState(mapSeed, players, loadouts, myRole))

  // F5 recovery: if room context was lost on reload, try sessionStorage
  useEffect(() => {
    if (!room && roomId) tryRestoreRoom(roomId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reinitialize game state once restored room data is available
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    const loadoutCount = Object.keys(room?.loadouts ?? {}).length
    if (!room?.mapSeed || loadoutCount < playerCount) return
    restoredRef.current = true
    // Only request sync when this was an F5 restore (room was null on mount)
    needsSyncRef.current = roomWasNullOnMount.current
    setGs(buildInitialState(room.mapSeed, players, room.loadouts, room.role))
  }, [room?.mapSeed]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('normal')
  const [movingMode, setMovingMode] = useState(false)
  const [previewPos, setPreviewPos] = useState<{ col: number; row: number } | null>(null)
  const [timer, setTimer] = useState(TURN_SECONDS)
  const [isPaused, setIsPaused] = useState(false)
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [animDestroyedTiles, setAnimDestroyedTiles] = useState<{ x: number; y: number }[]>([])
  const [explosionEvents, setExplosionEvents] = useState<{ x: number; y: number }[]>([])
  const [hitEvents, setHitEvents] = useState<{ x: number; y: number; id: number }[]>([])
  const [blastZone, setBlastZone] = useState<{ col: number; row: number; tier: number }[]>([])
  const [oppDisconnected, setOppDisconnected] = useState(false)
  const [oppLeft, setOppLeft] = useState(false)
  const [eliminatedNotice, setEliminatedNotice] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [disconnectCountdown, setDisconnectCountdown] = useState(60)
  type StatEntry = { shots: number; hits: number; damage: number; weapons: Partial<Record<WeaponId, number>> }
  const emptyStatEntry = (): StatEntry => ({ shots: 0, hits: 0, damage: 0, weapons: {} })
  const freshStats = useCallback((): Partial<Record<PlayerId, StatEntry>> => {
    const o: Partial<Record<PlayerId, StatEntry>> = {}
    players.forEach(p => { o[p] = emptyStatEntry() })
    return o
  }, [players])
  const [playerStats, setPlayerStats] = useState<Partial<Record<PlayerId, StatEntry>>>(() => {
    const o: Partial<Record<PlayerId, StatEntry>> = {}
    players.forEach(p => { o[p] = { shots: 0, hits: 0, damage: 0, weapons: {} } })
    return o
  })
  const [showStormAlert, setShowStormAlert] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const [damageFloats, setDamageFloats] = useState<DamageFloat[]>([])
  const [endTimer, setEndTimer] = useState(15)
  const [wantRematch, setWantRematch] = useState(false)
  const [oppWantsRematch, setOppWantsRematch] = useState(false)
  const [showShieldConfirm, setShowShieldConfirm] = useState(false)
  const [endingCountdown, setEndingCountdown] = useState(5)
  const [teleportStep, setTeleportStep] = useState<0 | 1>(0)  // 0=waiting first portal, 1=waiting second
  const [teleportFirst, setTeleportFirst] = useState<{ col: number; row: number } | null>(null)
  const [teleportFlash, setTeleportFlash] = useState<{ col: number; row: number }[]>([])
  const [showEmotePicker, setShowEmotePicker] = useState(false)
  type EmoteEntry = { pid: PlayerId; emoji: string; id: number }
  const [activeEmotes, setActiveEmotes] = useState<EmoteEntry[]>([])
  const [showMapLabel, setShowMapLabel] = useState(true)
  const [killEvents, setKillEvents] = useState<{ x: number; y: number; id: number }[]>([])
  const [shieldHitEvents, setShieldHitEvents] = useState<{ x: number; y: number; id: number }[]>([])
  const [teleportTriggers, setTeleportTriggers] = useState<{ pid: PlayerId; fromCol: number; fromRow: number; id: number }[]>([])

  const statsRecordedRef = useRef(false)
  const needsSyncRef = useRef(false)
  const disconnectTimerRef = useRef<ReturnType<typeof setInterval>>()
  const endTimerRef = useRef<ReturnType<typeof setInterval>>()
  const endingTimerRef = useRef<ReturnType<typeof setInterval>>()
  const roomWasNullOnMount = useRef(!room)
  const burstRef = useRef<{ angle: number; owner: PlayerId; remaining: number } | null>(null)
  const pendingBroadcastSmoke = useRef<{ col: number; row: number } | null>(null)
  const isSoloRef = useRef(isSolo)

  const bulletsRef = useRef<Bullet[]>([])
  const gsRef = useRef(gs)
  const animating = useRef(false)
  const pendingTiles = useRef<{ x: number; y: number }[]>([])
  const pendingDamage = useRef(0)
  const pendingHitTarget = useRef<PlayerId | null>(null)
  const pendingShooterDamage = useRef(0)
  const pendingBlastZone = useRef<{ col: number; row: number; tier: number }[]>([])
  const pendingEmpClearCenter = useRef<{ col: number; row: number } | null>(null)
  const oppEverJoinedRef = useRef(false)
  const pendingDotStacks = useRef<{ target: PlayerId; damage: number; turns: number }[]>([])
  const pendingFreezeTargets = useRef<PlayerId[]>([])
  const pendingStickyMines = useRef<StickyMine[]>([])
  const pendingUFOMineTargets = useRef<{ target: PlayerId; owner: PlayerId }[]>([])
  const pendingSmokeClouds = useRef<SmokeCloud[]>([])
  const rafRef = useRef<number>()
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const botTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const prevMinesRef = useRef<StickyMine[]>([])
  const prevUFOMineRef = useRef<Partial<Record<PlayerId, number>>>({ p1: 0, p2: 0 })

  useEffect(() => { gsRef.current = gs }, [gs])
  useEffect(() => { isSoloRef.current = isSolo }, [isSolo])

  // ─── Map label dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setShowMapLabel(false), 2500)
    return () => clearTimeout(t)
  }, [])

  // ─── Storm alert ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.turnNumber === 10 && gs.phase === 'playing') {
      setShowStormAlert(true)
      const t = setTimeout(() => setShowStormAlert(false), 2000)
      return () => clearTimeout(t)
    }
  }, [gs.turnNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Mine explosion visual events ──────────────────────────────────────────
  useEffect(() => {
    const positions: { x: number; y: number }[] = []
    const cells: { col: number; row: number; tier: number }[] = []
    const addBlast3x3 = (col: number, row: number) => {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          cells.push({ col: col + dc, row: row + dr, tier: 2 })
    }
    prevMinesRef.current
      .filter(m => !gs.stickyMines.some(m2 => m2.id === m.id))
      .forEach(m => { positions.push({ x: (m.col + 0.5) * TILE, y: (m.row + 0.5) * TILE }); addBlast3x3(m.col, m.row) })
    gs.players.forEach(pid => {
      const ufo = gs.ufos[pid]
      if (!ufo) return
      if ((prevUFOMineRef.current[pid] ?? 0) > 0 && ufo.hasStickyMine === 0) {
        positions.push({ x: (ufo.col + 0.5) * TILE, y: (ufo.row + 0.5) * TILE })
        addBlast3x3(ufo.col, ufo.row)
      }
    })
    prevMinesRef.current = gs.stickyMines
    const newPrev: Partial<Record<PlayerId, number>> = {}
    gs.players.forEach(pid => { newPrev[pid] = gs.ufos[pid]?.hasStickyMine ?? 0 })
    prevUFOMineRef.current = newPrev
    if (positions.length === 0) return
    playExplosion()
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 180)
    setExplosionEvents(positions)
    setTimeout(() => setExplosionEvents([]), 0)
    setBlastZone(cells)
    setTimeout(() => setBlastZone([]), 700)
  }, [gs.stickyMines, gs.players, gs.ufos])

  // ─── Page visibility pause ─────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsPaused(document.hidden)
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  const isMyTurn = gs.phase === 'playing' && gs.currentTurn === gs.localPlayer && !animating.current
  const myUfoNow = gs.ufos[gs.localPlayer]
  // Landable cells (empty) → blue highlight + confirm validation.
  const reachableCells = (isMyTurn && movingMode && myUfoNow) ? getReachableCells(myUfoNow, gs.map) : []
  // Steppable cells (ignore walls) → D-pad can cross a wall to land beyond it.
  const validDpadPositions = movingMode && myUfoNow
    ? [...getSteppableCells(myUfoNow, gs.map), { col: myUfoNow.col, row: myUfoNow.row }]
    : []
  // The current preview cell is a valid landing spot only if it's empty.
  const canConfirmMove = !!previewPos && reachableCells.some(c => c.col === previewPos.col && c.row === previewPos.row)

  // ─── End turn ──────────────────────────────────────────────────────────────
  const endTurn = useCallback((broadcastSkip = false) => {
    burstRef.current = null
    animating.current = false
    setMovingMode(false)
    setPreviewPos(null)
    setSelectedWeapon('normal')
    setTeleportStep(0); setTeleportFirst(null)
    playTurnChange()
    if (broadcastSkip) {
      channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'skip' } })
    }
    setGs(prev => {
      const currentIdx = prev.players.indexOf(prev.currentTurn)
      const isLastPlayer = currentIdx === prev.players.length - 1
      // tentative next (may be dead; adjusted below after computing damage)
      const tentativeNextTurn = prev.players[(currentIdx + 1) % prev.players.length]
      const nextNum = isLastPlayer ? prev.turnNumber + 1 : prev.turnNumber

      const nextUfo = prev.ufos[tentativeNextTurn]
      const dotDmg = nextUfo?.dotStacks.reduce((s, d) => s + d.damage, 0) ?? 0
      const newDotStacks = (nextUfo?.dotStacks ?? [])
        .map(d => ({ ...d, turnsLeft: d.turnsLeft - 1 })).filter(d => d.turnsLeft > 0)

      // Mines with turnsLeft === 1 will expire this turn → explode
      const expiringMines = prev.stickyMines.filter(m => m.turnsLeft <= 1)
      const survivingMines = prev.stickyMines
        .filter(m => m.turnsLeft > 1)
        .map(m => ({ ...m, turnsLeft: m.turnsLeft - 1 }))

      const mineDmg: Partial<Record<PlayerId, number>> = {}
      const mineDestroyedTiles: { col: number; row: number }[] = []
      // Tile-placed mines: 3×3 grid, 25 damage, 50% self-damage, destroy soft tiles
      expiringMines.forEach(mine => {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const tc = mine.col + dc, tr = mine.row + dr
            if (tc >= 0 && tc < prev.map.cols && tr >= 0 && tr < prev.map.rows) {
              if (prev.map.tiles[tr][tc] === 'soft' && !mineDestroyedTiles.some(d => d.col === tc && d.row === tr))
                mineDestroyedTiles.push({ col: tc, row: tr })
              prev.players.forEach(pid => {
                const u = prev.ufos[pid]
                if (u && u.col === tc && u.row === tr)
                  mineDmg[pid] = (mineDmg[pid] ?? 0) + (pid === mine.owner ? Math.floor(25 * 0.5) : 25)
              })
            }
          }
        }
      })

      // UFO-attached mines: decrement countdown and explode when it hits 0
      const newMineCounts: Partial<Record<PlayerId, number>> = {}
      for (const pid of prev.players) {
        newMineCounts[pid] = Math.max(0, (prev.ufos[pid]?.hasStickyMine ?? 0) - 1)
      }
      const addUFOMineBlast = (ufoPid: PlayerId, ownerPid: PlayerId) => {
        const ufo = prev.ufos[ufoPid]
        if (!ufo) return
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const tc = ufo.col + dc, tr = ufo.row + dr
            if (tc >= 0 && tc < prev.map.cols && tr >= 0 && tr < prev.map.rows) {
              if (prev.map.tiles[tr][tc] === 'soft' && !mineDestroyedTiles.some(d => d.col === tc && d.row === tr))
                mineDestroyedTiles.push({ col: tc, row: tr })
              prev.players.forEach(pid => {
                const u = prev.ufos[pid]
                if (u && u.col === tc && u.row === tr)
                  mineDmg[pid] = (mineDmg[pid] ?? 0) + (pid === ownerPid ? Math.floor(40 * 0.5) : 40)
              })
            }
          }
        }
      }
      for (const pid of prev.players) {
        const ufo = prev.ufos[pid]
        if (ufo && ufo.hasStickyMine === 1)
          addUFOMineBlast(pid, ufo.stickyMineOwner ?? prev.players.find(p => p !== pid)!)
      }

      const newSmokeClouds = prev.smokeClouds
        .map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 }))
        .filter(c => c.turnsLeft > 0)
      const mapAfterMines = mineDestroyedTiles.length > 0
        ? prev.map.tiles.map((row, r) => row.map((t, c) => mineDestroyedTiles.some(d => d.col === c && d.row === r) ? 'empty' as TileType : t))
        : prev.map.tiles

      // Storm shrink: starting from round 10, clear outermost ring after last player's turn
      let finalMapTiles: TileType[][] = mapAfterMines
      let newStormBurnedTiles = [...(prev.stormBurnedTiles ?? [])]
      const stormClearedThisTurn: { col: number; row: number }[] = []
      if (isLastPlayer && nextNum >= 10 && (nextNum - 10) % 2 === 0) {
        const stormRing = (nextNum - 10) / 2
        for (let r = 0; r < prev.map.rows; r++)
          for (let c = 0; c < prev.map.cols; c++)
            if (Math.min(c, prev.map.cols - 1 - c, r, prev.map.rows - 1 - r) === stormRing)
              stormClearedThisTurn.push({ col: c, row: r })
        if (stormClearedThisTurn.length > 0) {
          finalMapTiles = finalMapTiles.map((row, r) => row.map((t, c) =>
            stormClearedThisTurn.some(rt => rt.col === c && rt.row === r) && (t === 'hard' || t === 'soft' || t === 'laser') ? 'empty' as TileType : t
          ))
          const freshBurned = stormClearedThisTurn.filter(t => !newStormBurnedTiles.some(b => b.col === t.col && b.row === t.row))
          newStormBurnedTiles = [...newStormBurnedTiles, ...freshBurned]
        }
      }

      // Storm hazard: 5 HP damage if current player ends turn on a burned tile
      const stormHazardDmg = newStormBurnedTiles.some(t =>
        t.col === prev.ufos[prev.currentTurn]?.col && t.row === prev.ufos[prev.currentTurn]?.row
      ) ? 5 : 0

      // Build updated UFOs with damage, mine countdown, DOT, storm, shield
      const updatedUfos: typeof prev.ufos = {}
      for (const pid of prev.players) {
        const ufo = prev.ufos[pid]
        if (!ufo) continue
        const newHp = Math.max(0, ufo.hp
          - (mineDmg[pid] ?? 0)
          - (tentativeNextTurn === pid ? dotDmg : 0)
          - (prev.currentTurn === pid ? stormHazardDmg : 0))
        const newMineCount = newMineCounts[pid] ?? 0
        // Shield: decrement when THIS player ends their turn
        const newShieldTurns = pid === prev.currentTurn ? Math.max(0, (ufo.shieldTurnsLeft ?? 0) - 1) : (ufo.shieldTurnsLeft ?? 0)
        const newShieldHp = newShieldTurns > 0 ? (ufo.shieldHp ?? 0) : 0
        const newFrozenTurns = pid === prev.currentTurn ? Math.max(0, (ufo.frozenTurns ?? 0) - 1) : (ufo.frozenTurns ?? 0)
        updatedUfos[pid] = {
          ...ufo,
          hp: newHp,
          hasStickyMine: newMineCount,
          stickyMineOwner: newMineCount > 0 ? ufo.stickyMineOwner : null,
          dotStacks: tentativeNextTurn === pid ? newDotStacks : ufo.dotStacks,
          isDead: ufo.isDead || newHp <= 0,
          shieldHp: newShieldHp,
          shieldTurnsLeft: newShieldTurns,
          frozenTurns: newFrozenTurns,
        }
      }

      // Skip dead players in turn advancement (FFA: dead players spectate)
      let finalNextIdx = (currentIdx + 1) % prev.players.length
      for (let i = 0; i < prev.players.length - 1; i++) {
        if (!updatedUfos[prev.players[finalNextIdx]]?.isDead) break
        finalNextIdx = (finalNextIdx + 1) % prev.players.length
      }
      const nextTurn = prev.players[finalNextIdx]

      const minesAfterDestruction = survivingMines
        .filter(m => !mineDestroyedTiles.some(d => d.col === m.col && d.row === m.row))
        .filter(m => !stormClearedThisTurn.some(rt => rt.col === m.col && rt.row === m.row))

      // Health pack spawn: once every 5 turns, at end of last player's turn
      let newHealthPacks = [...(prev.healthPacks ?? [])]
      if (isLastPlayer && nextNum % 5 === 0 && nextNum <= MAX_TURNS) {
        const pack = generateHealthPack(mapSeed, nextNum, { ...prev.map, tiles: finalMapTiles }, prev.players, updatedUfos, newHealthPacks)
        if (pack) newHealthPacks.push(pack)
      }

      // Trap and blackhole expiry (decrement each turn, remove when expired)
      const updatedTraps = (prev.trapMines ?? [])
        .map(t => ({ ...t, turnsLeft: t.turnsLeft - 1 }))
        .filter(t => t.turnsLeft > 0)
      const updatedBlackHoles = (prev.blackHoles ?? [])
        .map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
        .filter(b => b.turnsLeft > 0)

      const updated: GameState = {
        ...prev, currentTurn: nextTurn, turnNumber: nextNum, stickyMines: minesAfterDestruction,
        map: { ...prev.map, tiles: finalMapTiles },
        smokeClouds: newSmokeClouds,
        stormBurnedTiles: newStormBurnedTiles,
        trapMines: updatedTraps,
        blackHoles: updatedBlackHoles,
        ufos: updatedUfos,
        healthPacks: newHealthPacks,
      }

      const aliveCount = prev.players.filter(pid => (updatedUfos[pid]?.hp ?? 0) > 0).length
      const isOver = nextNum > MAX_TURNS || aliveCount <= 1
      if (!isOver) return updated

      const sortedByHp = [...prev.players].sort((a, b) => (updatedUfos[b]?.hp ?? 0) - (updatedUfos[a]?.hp ?? 0))
      const topHp = updatedUfos[sortedByHp[0]]?.hp ?? 0
      const topPlayers = sortedByHp.filter(pid => (updatedUfos[pid]?.hp ?? 0) === topHp)
      const w: PlayerId | 'draw' = topPlayers.length === 1 ? topPlayers[0] : 'draw'
      return { ...updated, phase: 'ending', winner: w }
    })
    setTimer(TURN_SECONDS)
  }, [channelRef])

  // ─── Eliminate a player (FFA: a disconnect/leave removes them from rotation) ──
  const eliminatePlayer = useCallback((pid: PlayerId) => {
    const u0 = gsRef.current.ufos[pid]
    if (!u0 || u0.isDead) return
    const wasTheirTurn = gsRef.current.currentTurn === pid
    setGs(prev => {
      const u = prev.ufos[pid]
      if (!u || u.isDead) return prev
      return { ...prev, ufos: { ...prev.ufos, [pid]: { ...u, isDead: true, hp: 0 } } }
    })
    // Notify the remaining players that someone left the battle.
    setEliminatedNotice(`${u0.name} 已離開戰場`)
    setTimeout(() => setEliminatedNotice(null), 4000)
    // If we just removed the active player, advance the turn so play continues.
    if (wasTheirTurn) endTurn()
  }, [endTurn])

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
      const aliveOpps = game.players.filter(p => p !== b.owner && !(game.ufos[p]?.isDead))
      const target = (aliveOpps[0] ?? game.players.find(p => p !== b.owner)!) as PlayerId
      const tUfo = game.ufos[target]
      if (!tUfo) return b
      const tx = (tUfo.col + 0.5) * TILE, ty = (tUfo.row + 0.5) * TILE
      const destroyedBefore = b.weapon === 'shockwave' ? destroyed.length : -1
      const bAfterGravity = applyBlackholeGravity(b, game.blackHoles ?? [], TILE)
      let stepped = stepBullet(bAfterGravity, effectiveMap, TILE, destroyed)

      if (b.weapon === 'sticky' && stepped.stuck) {
        pendingStickyMines.current.push({ id: `mine_${b.id}`, col: Math.floor(stepped.x / TILE), row: Math.floor(stepped.y / TILE), turnsLeft: 3, owner: b.owner })
        return { ...stepped, active: false }
      }
      if (b.weapon === 'emp' && stepped.stuck) {
        pendingEmpClearCenter.current = { col: Math.floor(stepped.x / TILE), row: Math.floor(stepped.y / TILE) }
        return { ...stepped, active: false }
      }
      // Smoke deployment — local player (or solo mode) simulates cloud position;
      // opponent smoke in multiplayer uses the broadcast position instead.
      if (b.weapon === 'smoke') {
        const isLocalSmoke = isSoloRef.current || b.owner === gsRef.current.localPlayer
        if (isLocalSmoke) {
          // Body hit → deploy smoke at UFO's tile
          const bodyHitPid = aliveOpps.find(p => {
            const u = game.ufos[p]
            return u && bulletHitsUFO(stepped, (u.col + 0.5) * TILE, (u.row + 0.5) * TILE, UFO_RADIUS)
          })
          if (bodyHitPid) {
            const hu = game.ufos[bodyHitPid]!
            pendingSmokeClouds.current.push({
              id: `smoke_${b.id}_body_${Date.now()}`,
              col: hu.col, row: hu.row, owner: b.owner, turnsLeft: 6,
            })
            return { ...stepped, active: false }
          }
          // Wall bounce → deploy smoke
          if (stepped.bounces > b.bounces) {
            pendingSmokeClouds.current.push({
              id: `smoke_${b.id}_${Date.now()}`,
              col: Math.floor(stepped.x / TILE), row: Math.floor(stepped.y / TILE),
              owner: b.owner, turnsLeft: 6,
            })
            return { ...stepped, active: false }
          }
        } else {
          // Opponent smoke in multiplayer: just animate, stop at first wall hit
          if (stepped.bounces > b.bounces) return { ...stepped, active: false }
          // Pass through everything else (no local cloud)
          return stepped
        }
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
      // Shockwave: 5×5 explosion on soft tile hit or any wall/border bounce
      if (b.weapon === 'shockwave') {
        const softHit = destroyedBefore >= 0 && destroyed.length > destroyedBefore
        const hardBounced = stepped.bounces > b.bounces && !softHit
        if (softHit || hardBounced) {
          const cx = Math.min(Math.max(Math.floor(stepped.x / TILE), 0), game.map.cols - 1)
          const cy = Math.min(Math.max(Math.floor(stepped.y / TILE), 0), game.map.rows - 1)
          const bz: { col: number; row: number; tier: number }[] = []
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const tc = cx + dc, tr = cy + dr
              if (tc < 0 || tc >= game.map.cols || tr < 0 || tr >= game.map.rows) continue
              const cheb = Math.max(Math.abs(dc), Math.abs(dr))
              bz.push({ col: tc, row: tr, tier: cheb === 0 ? 1 : cheb === 1 ? 2 : 3 })
              if (effectiveMap.tiles[tr][tc] === 'soft' && !prevDestroyed.some(d => d.x === tc && d.y === tr) && !destroyed.find(d => d.x === tc && d.y === tr))
                destroyed.push({ x: tc, y: tr })
              const base = cheb === 0 ? 25 : cheb === 1 ? 18 : 14
              game.players.forEach(pid => {
                const u = game.ufos[pid]
                if (u && u.col === tc && u.row === tr) {
                  if (pid === b.owner) pendingShooterDamage.current += Math.floor(base * 0.5)
                  else { hitDamage += base; pendingHitTarget.current = pid }
                }
              })
            }
          }
          pendingBlastZone.current = bz
          return { ...stepped, active: false }
        }
      }
      // Direct hit: test EVERY alive opponent, not just the nearest one, so in
      // FFA a bullet damages whoever it actually overlaps (no passing through).
      const hitPid = stepped.active
        ? aliveOpps.find(p => {
            const u = game.ufos[p]
            return u && bulletHitsUFO(stepped, (u.col + 0.5) * TILE, (u.row + 0.5) * TILE, UFO_RADIUS)
          })
        : undefined
      const hUfo = hitPid ? game.ufos[hitPid] : undefined
      if (hitPid && hUfo) {
        if (b.weapon === 'sticky') {
          pendingUFOMineTargets.current.push({ target: hitPid, owner: b.owner })
        } else if (b.weapon === 'shockwave') {
          // 5×5 centered on the struck UFO's tile
          const swBz: { col: number; row: number; tier: number }[] = []
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const tc = hUfo.col + dc, tr = hUfo.row + dr
              if (tc < 0 || tc >= game.map.cols || tr < 0 || tr >= game.map.rows) continue
              const cheb = Math.max(Math.abs(dc), Math.abs(dr))
              swBz.push({ col: tc, row: tr, tier: cheb === 0 ? 1 : cheb === 1 ? 2 : 3 })
              if (effectiveMap.tiles[tr][tc] === 'soft' && !prevDestroyed.some(d => d.x === tc && d.y === tr) && !destroyed.find(d => d.x === tc && d.y === tr))
                destroyed.push({ x: tc, y: tr })
              const base = cheb === 0 ? 25 : cheb === 1 ? 18 : 14
              game.players.forEach(pid => {
                const u = game.ufos[pid]
                if (u && u.col === tc && u.row === tr) {
                  if (pid === b.owner) pendingShooterDamage.current += Math.floor(base * 0.5)
                  else { hitDamage += base; pendingHitTarget.current = pid }
                }
              })
            }
          }
          pendingBlastZone.current = swBz
        } else if (b.weapon === 'emp') {
          pendingEmpClearCenter.current = { col: hUfo.col, row: hUfo.row }
        } else {
          hitDamage += WEAPON_MAP[b.weapon].damage
          pendingHitTarget.current = hitPid
          if (b.weapon === 'acid') pendingDotStacks.current.push({ target: hitPid, damage: 5, turns: 3 })
          if (b.weapon === 'freeze') pendingFreezeTargets.current.push(hitPid)
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
      const totalShooterDamage = pendingShooterDamage.current
      const totalDotStacks = [...pendingDotStacks.current]
      const totalFreezeTargets = [...pendingFreezeTargets.current]
      const totalStickyMines = [...pendingStickyMines.current]
      const totalUFOMines = [...pendingUFOMineTargets.current]
      // Opponent smoke cloud comes from broadcast position, not local simulation
      if (pendingBroadcastSmoke.current !== null) {
        const bc = pendingBroadcastSmoke.current
        pendingSmokeClouds.current.push({
          id: `smoke_opp_${Date.now()}`,
          col: bc.col, row: bc.row,
          owner: gsRef.current.currentTurn,
          turnsLeft: 6,
        })
        pendingBroadcastSmoke.current = null
      }
      const totalSmokeClouds = [...pendingSmokeClouds.current]
      const totalBlastZone = [...pendingBlastZone.current]
      const totalEmpClearCenter = pendingEmpClearCenter.current
      pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
      pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []
      pendingSmokeClouds.current = []; pendingBlastZone.current = []; pendingEmpClearCenter.current = null
      setTimeout(() => setAnimDestroyedTiles([]), 0)
      if (totalBlastZone.length > 0) {
        setIsFlashing(true)
        setTimeout(() => setIsFlashing(false), 180)
        setBlastZone(totalBlastZone)
        setTimeout(() => setBlastZone([]), 700)
      }

      const hitEvtList: { x: number; y: number; id: number }[] = []
      if (totalDamage > 0 && totalHitTarget) {
        const hitUfo = gsRef.current.ufos[totalHitTarget]
        if (hitUfo) hitEvtList.push({ x: (hitUfo.col + 0.5) * TILE, y: (hitUfo.row + 0.5) * TILE, id: Date.now() })
      }
      if (totalShooterDamage > 0) {
        const sUfo = gsRef.current.ufos[gsRef.current.currentTurn]
        if (sUfo) hitEvtList.push({ x: (sUfo.col + 0.5) * TILE, y: (sUfo.row + 0.5) * TILE, id: Date.now() + 1 })
      }
      if (hitEvtList.length > 0) {
        setHitEvents(hitEvtList)
        setTimeout(() => setHitEvents([]), 0)
        playHit()
      }
      const isSelfHit = totalHitTarget !== null && totalHitTarget === gsRef.current.currentTurn
      const actualDamage = isSelfHit ? Math.floor(totalDamage * 0.5) : totalDamage
      if (actualDamage > 0 && totalHitTarget) {
        const shooter = gsRef.current.currentTurn
        setPlayerStats(prev => { const s = prev[shooter] ?? { shots: 0, hits: 0, damage: 0, weapons: {} }; return { ...prev, [shooter]: { ...s, hits: s.hits + 1, damage: s.damage + actualDamage } } })
      }
      // Kill / shield hit detection
      let floatVariant: 'lethal' | 'shield' | undefined
      if (actualDamage > 0 && totalHitTarget) {
        const htUfo = gsRef.current.ufos[totalHitTarget]
        if (htUfo) {
          const shieldAbsorb = Math.min(htUfo.shieldHp ?? 0, actualDamage)
          const afterShield = actualDamage - shieldAbsorb
          const newShieldHp = (htUfo.shieldHp ?? 0) - shieldAbsorb
          const isLethal = (htUfo.hp - afterShield) <= 0 && !htUfo.isDead
          const isShielded = shieldAbsorb > 0
          floatVariant = isLethal ? 'lethal' : isShielded ? 'shield' : undefined
          if (isLethal) {
            playKill()
            const ke = { x: (htUfo.col + 0.5) * TILE, y: (htUfo.row + 0.5) * TILE, id: Date.now() + 10 }
            setKillEvents([ke]); setTimeout(() => setKillEvents([]), 0)
          } else if (isShielded) {
            if (newShieldHp <= 0) playShieldBreak()
            else playShieldHit()
            const se = { x: (htUfo.col + 0.5) * TILE, y: (htUfo.row + 0.5) * TILE, id: Date.now() + 11 }
            setShieldHitEvents([se]); setTimeout(() => setShieldHitEvents([]), 0)
          }
        }
      }
      // Damage floats
      const newFloats: DamageFloat[] = []
      const localPid = gsRef.current.localPlayer
      if (actualDamage > 0 && totalHitTarget) {
        const hitUfo = gsRef.current.ufos[totalHitTarget]
        if (hitUfo) newFloats.push({ id: Date.now(), x: (hitUfo.col + 0.5) * TILE, y: hitUfo.row * TILE, value: actualDamage, color: totalHitTarget === localPid ? '#ff8800' : '#ff3366', variant: floatVariant })
      }
      if (totalShooterDamage > 0) {
        const sUfo = gsRef.current.ufos[gsRef.current.currentTurn]
        if (sUfo) newFloats.push({ id: Date.now() + 1, x: (sUfo.col + 0.5) * TILE, y: sUfo.row * TILE, value: totalShooterDamage, color: '#ff8800' })
      }
      if (newFloats.length > 0) {
        const floatIds = newFloats.map(f => f.id)
        setDamageFloats(f => [...f, ...newFloats])
        setTimeout(() => setDamageFloats(f => f.filter(fl => !floatIds.includes(fl.id))), 1500)
      }
      // Screen shake when local player takes damage
      const localTookDamage = (actualDamage > 0 && totalHitTarget === localPid) || (totalShooterDamage > 0 && gsRef.current.currentTurn === localPid)
      if (localTookDamage) { setIsShaking(true); setTimeout(() => setIsShaking(false), 300) }
      if (totalSmokeClouds.length > 0) playSmoke()

      setGs(g => {
        let updated = g
        if (totalTiles.length > 0) {
          const newTiles = g.map.tiles.map((row, r) => row.map((t, c) => totalTiles.some(d => d.x === c && d.y === r) ? 'empty' as TileType : t))
          const survivingMines = g.stickyMines.filter(m => !totalTiles.some(d => d.x === m.col && d.y === m.row))
          updated = { ...updated, map: { ...g.map, tiles: newTiles }, stickyMines: survivingMines }
        }
        if (actualDamage > 0 && totalHitTarget) {
          const ht = totalHitTarget
          const htUfo = updated.ufos[ht]
          if (htUfo) {
            const shieldAbsorb = Math.min(htUfo.shieldHp ?? 0, actualDamage)
            const afterShield = actualDamage - shieldAbsorb
            const newShieldHp = (htUfo.shieldHp ?? 0) - shieldAbsorb
            updated = { ...updated, ufos: { ...updated.ufos, [ht]: {
              ...htUfo,
              hp: Math.max(0, htUfo.hp - afterShield),
              shieldHp: newShieldHp,
              shieldTurnsLeft: newShieldHp <= 0 ? 0 : (htUfo.shieldTurnsLeft ?? 0),
            } } }
          }
        }
        if (totalShooterDamage > 0) {
          const shooter = g.currentTurn
          const sUfo = updated.ufos[shooter]
          if (sUfo) updated = { ...updated, ufos: { ...updated.ufos, [shooter]: { ...sUfo, hp: Math.max(0, sUfo.hp - totalShooterDamage) } } }
        }
        for (const dot of totalDotStacks) {
          const du = updated.ufos[dot.target]
          if (du) updated = { ...updated, ufos: { ...updated.ufos, [dot.target]: { ...du, dotStacks: [...du.dotStacks, { damage: dot.damage, turnsLeft: dot.turns }] } } }
        }
        if (totalStickyMines.length > 0) {
          const validMines = totalStickyMines.filter(m => !totalTiles.some(d => d.x === m.col && d.y === m.row))
          if (validMines.length > 0) updated = { ...updated, stickyMines: [...updated.stickyMines, ...validMines] }
        }
        for (const { target: pid, owner } of totalUFOMines) {
          const pu = updated.ufos[pid]
          if (pu) updated = { ...updated, ufos: { ...updated.ufos, [pid]: { ...pu, hasStickyMine: 3, stickyMineOwner: owner } } }
        }
        if (totalSmokeClouds.length > 0)
          updated = { ...updated, smokeClouds: [...updated.smokeClouds, ...totalSmokeClouds] }
        for (const pid of totalFreezeTargets) {
          const fu = updated.ufos[pid]
          if (fu) updated = { ...updated, ufos: { ...updated.ufos, [pid]: { ...fu, frozenTurns: 2 } } }
        }
        if (totalEmpClearCenter) {
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const tc = totalEmpClearCenter.col + dc
              const tr = totalEmpClearCenter.row + dr
              if (tc < 0 || tc >= g.map.cols || tr < 0 || tr >= g.map.rows) continue
              for (const pid of g.players) {
                const eu = updated.ufos[pid]
                if (eu && eu.col === tc && eu.row === tr && (eu.shieldHp ?? 0) > 0) {
                  updated = { ...updated, ufos: { ...updated.ufos, [pid]: { ...eu, shieldHp: 0, shieldTurnsLeft: 0 } } }
                }
              }
            }
          }
        }
        return updated
      })

      // Burst: fire next bullet before ending turn
      if (burstRef.current && burstRef.current.remaining > 0) {
        const { angle, owner } = burstRef.current
        burstRef.current.remaining--
        const ufo = gsRef.current.ufos[owner]!
        const nb = createBullet(`b${Date.now()}`, owner, 'burst', (ufo.col + 0.5) * TILE, (ufo.row + 0.5) * TILE, angle, WEAPON_TTL['burst'])
        bulletsRef.current = [nb]; setBullets([nb])
        pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
        pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []; pendingBlastZone.current = []; pendingEmpClearCenter.current = null
        rafRef.current = requestAnimationFrame(animStep)
      } else {
        endTurn()
      }
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

      if (action.kind === 'smokeCloud') {
        // Store broadcast smoke position; applied during animStep settlement
        pendingBroadcastSmoke.current = { col: action.col, row: action.row }
        return
      }

      if (action.kind === 'move') {
        clearInterval(timerRef.current)
        setGs(prev => {
          const u = prev.ufos[oppId]
          if (!u) return prev
          let finalCol = action.col, finalRow = action.row
          let newPortals = prev.portals ?? []
          const landedPortal = newPortals.find(p => p.col === action.col && p.row === action.row)
          if (landedPortal) {
            const paired = newPortals.find(p => p.id === landedPortal.pairedId)
            if (paired) {
              finalCol = paired.col; finalRow = paired.row
              newPortals = newPortals.filter(p => p.id !== landedPortal.id && p.id !== paired.id)
              playTeleport()
              const tpId2 = Date.now()
              setTeleportTriggers([{ pid: oppId, fromCol: action.col, fromRow: action.row, id: tpId2 }])
              setTimeout(() => setTeleportTriggers([]), 300)
            }
          }
          let updated = { ...prev, portals: newPortals, ufos: { ...prev.ufos, [oppId]: { ...u, col: finalCol, row: finalRow } } }
          const pack = (prev.healthPacks ?? []).find(p => p.col === finalCol && p.row === finalRow)
          if (pack) {
            const pu = updated.ufos[oppId]!
            updated = { ...updated,
              ufos: { ...updated.ufos, [oppId]: { ...pu, hp: Math.min(100, pu.hp + 30) } },
              healthPacks: (prev.healthPacks ?? []).filter(p => p.id !== pack.id),
            }
          }
          // Trap mine trigger
          const oppTrap = (prev.trapMines ?? []).find(t => t.col === finalCol && t.row === finalRow)
          if (oppTrap) {
            const ou = updated.ufos[oppId]!
            const trapDmg = oppTrap.owner === oppId ? 30 : 60
            updated = { ...updated,
              ufos: { ...updated.ufos, [oppId]: { ...ou, hp: Math.max(0, ou.hp - trapDmg) } },
              trapMines: (prev.trapMines ?? []).filter(t => t.id !== oppTrap.id),
            }
          }
          return updated
        })
        endTurn()
      } else if (action.kind === 'shield') {
        clearInterval(timerRef.current)
        setGs(prev => {
          const u = prev.ufos[oppId]
          if (!u) return prev
          return { ...prev, ufos: { ...prev.ufos, [oppId]: {
            ...u,
            shieldHp: 50, shieldTurnsLeft: 5,
            weapons: u.weapons.map(w => w.id === 'shield' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w),
          } } }
        })
        playShieldActivate()
        endTurn()
      } else if (action.kind === 'trap') {
        clearInterval(timerRef.current)
        const newTrap: TrapMine = { id: `trap_${Date.now()}`, col: action.col, row: action.row, owner: oppId, turnsLeft: 8 }
        setGs(prev => {
          const u = prev.ufos[oppId]
          return u ? { ...prev,
            trapMines: [...(prev.trapMines ?? []), newTrap],
            ufos: { ...prev.ufos, [oppId]: { ...u, weapons: u.weapons.map(w => w.id === 'trap' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
          } : prev
        })
        endTurn()
      } else if (action.kind === 'blackhole') {
        clearInterval(timerRef.current)
        const newBH: BlackHole = { id: `bh_${Date.now()}`, col: action.col, row: action.row, owner: oppId, turnsLeft: 4 }
        setGs(prev => {
          const u = prev.ufos[oppId]
          return u ? { ...prev,
            blackHoles: [...(prev.blackHoles ?? []), newBH],
            ufos: { ...prev.ufos, [oppId]: { ...u, weapons: u.weapons.map(w => w.id === 'blackhole' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
          } : prev
        })
        endTurn()
      } else if (action.kind === 'teleport') {
        clearInterval(timerRef.current)
        const [a, b] = action.portals
        const pA: Portal = { id: `pa_${Date.now()}`, col: a.col, row: a.row, pairedId: `pb_${Date.now()}`, owner: oppId }
        const pB: Portal = { id: pA.pairedId, col: b.col, row: b.row, pairedId: pA.id, owner: oppId }
        setGs(prev => {
          const u = prev.ufos[oppId]
          return u ? { ...prev,
            portals: [...(prev.portals ?? []), pA, pB],
            ufos: { ...prev.ufos, [oppId]: { ...u, weapons: u.weapons.map(w => w.id === 'teleport' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
          } : prev
        })
        endTurn()
      } else if (action.kind === 'emote') {
        const entry: EmoteEntry = { pid: oppId, emoji: action.emoji, id: Date.now() }
        setActiveEmotes(prev => [...prev, entry])
        setTimeout(() => setActiveEmotes(prev => prev.filter(e => e.id !== entry.id)), 4000)
      } else if (action.kind === 'shoot') {
        clearInterval(timerRef.current)
        if (action.weapon !== 'normal') {
          setGs(prev => { const u = prev.ufos[oppId]; return u ? { ...prev, ufos: { ...prev.ufos, [oppId]: { ...u, weapons: u.weapons.map(w => w.id === action.weapon ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } } } : prev })
        }
        setPlayerStats(prev => { const s = prev[oppId] ?? { shots: 0, hits: 0, damage: 0, weapons: {} }; return { ...prev, [oppId]: { ...s, shots: s.shots + 1 } } })
        const oppUfo = gsRef.current.ufos[oppId]!
        const sx = (oppUfo.col + 0.5) * TILE
        const sy = (oppUfo.row + 0.5) * TILE
        if (action.weapon === 'burst') burstRef.current = { angle: action.angle, owner: oppId, remaining: 2 }
        const startBullets = [createBullet(`opp${Date.now()}`, oppId, action.weapon, sx, sy, action.angle, WEAPON_TTL[action.weapon])]
        bulletsRef.current = startBullets; setBullets([...startBullets])
        pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
        pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []; pendingBlastZone.current = []
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
          smokeClouds: game.smokeClouds,
          mapTiles: game.map.tiles,
          stormBurnedTiles: game.stormBurnedTiles,
          healthPacks: game.healthPacks ?? [],
          portals: game.portals ?? [],
          trapMines: game.trapMines ?? [],
          blackHoles: game.blackHoles ?? [],
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
        smokeClouds: GameState['smokeClouds']
        mapTiles: GameState['map']['tiles']
        stormBurnedTiles: GameState['stormBurnedTiles']
      }
      setGs(prev => ({
        ...prev,
        ufos: p.ufos,
        currentTurn: p.currentTurn,
        turnNumber: p.turnNumber,
        phase: p.phase,
        winner: p.winner,
        stickyMines: p.stickyMines,
        smokeClouds: p.smokeClouds ?? [],
        stormBurnedTiles: p.stormBurnedTiles ?? [],
        healthPacks: (p as { healthPacks?: HealthPack[]; portals?: Portal[]; trapMines?: TrapMine[]; blackHoles?: BlackHole[] }).healthPacks ?? [],
        portals: (p as { healthPacks?: HealthPack[]; portals?: Portal[]; trapMines?: TrapMine[]; blackHoles?: BlackHole[] }).portals ?? [],
        trapMines: (p as { trapMines?: TrapMine[] }).trapMines ?? [],
        blackHoles: (p as { blackHoles?: BlackHole[] }).blackHoles ?? [],
        map: { ...prev.map, tiles: p.mapTiles },
      }))
    })

    // A player explicitly left the game. In 1v1 this ends the match; in FFA the
    // leaver is just eliminated and the remaining players fight on.
    ch.on('broadcast', { event: 'player_left' }, ({ payload }) => {
      const role = (payload as { role?: PlayerId })?.role
      if (gsRef.current.players.length > 2) { if (role) eliminatePlayer(role) }
      else setOppLeft(true)
    })

    // Rematch coordination
    ch.on('broadcast', { event: 'rematch_want' }, () => setOppWantsRematch(true))
    ch.on('broadcast', { event: 'rematch_go' }, ({ payload }) => {
      const { seed } = payload as { seed: number }
      setBullets([]); setAnimDestroyedTiles([])
      setPlayerStats(freshStats())
      clearInterval(endTimerRef.current); setEndTimer(15)
      setWantRematch(false); setOppWantsRematch(false)
      statsRecordedRef.current = false
      burstRef.current = null; animating.current = false
      pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
      pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []; pendingSmokeClouds.current = []; pendingBlastZone.current = []
      setGs(buildInitialState(seed, players, loadouts, myRole))
    })

    // Detect unexpected disconnects (tab close, network drop) via presence.
    // Ignore brief churn right after channel rebuild. In 1v1 this opens the 60s
    // reconnect window; in FFA the dropped player is eliminated so play flows on.
    ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      if (!oppEverJoinedRef.current) return
      if (Date.now() - rebuiltAt < 3000) return
      if (gsRef.current.players.length > 2) {
        (leftPresences as { role?: PlayerId }[]).forEach(p => {
          if (p.role && p.role !== myRole) eliminatePlayer(p.role)
        })
      } else {
        setOppDisconnected(true)
      }
    })
    ch.on('presence', { event: 'join' }, () => {
      const state = ch.presenceState<{ role: string }>()
      const all = Object.values(state).flat()
      if (all.some(p => p.role !== myRole)) oppEverJoinedRef.current = true
      setOppDisconnected(false); setOppLeft(false)
    })

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
    if (!isSolo) return
    if (gs.phase !== 'playing') return
    if (gs.currentTurn !== 'p2' || gs.localPlayer !== 'p1') return
    if (animating.current || isPaused) return

    botTimerRef.current = setTimeout(() => {
      const game = gsRef.current
      const bot = game.ufos.p2!
      const player = game.ufos.p1!
      if (Math.random() < 0.35) {
        const cells = getReachableCells(bot, game.map)
        if (cells.length > 0) {
          const t = cells[Math.floor(Math.random() * cells.length)]
          setGs(prev => { const u = prev.ufos.p2; return u ? { ...prev, ufos: { ...prev.ufos, p2: { ...u, col: t.col, row: t.row } } } : prev })
          endTurn(); return
        }
      }
      const dx = (player.col - bot.col) * TILE
      const dy = (player.row - bot.row) * TILE
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * (Math.PI / 3)
      const b = createBullet(`bot${Date.now()}`, 'p2', 'normal', (bot.col + 0.5) * TILE, (bot.row + 0.5) * TILE, angle, WEAPON_TTL['normal'])
      bulletsRef.current = [b]; setBullets([b])
      pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
      pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []; pendingBlastZone.current = []
      setAnimDestroyedTiles([])
      animating.current = true
      rafRef.current = requestAnimationFrame(animStep)
    }, 1200)

    return () => clearTimeout(botTimerRef.current)
  }, [isSolo, gs.currentTurn, gs.phase, isPaused, animStep, endTurn])

  // ─── Disconnect 60s countdown ─────────────────────────────────────────────
  useEffect(() => {
    if (!oppDisconnected || gs.phase !== 'playing') {
      setDisconnectCountdown(60)
      clearInterval(disconnectTimerRef.current)
      return
    }
    disconnectTimerRef.current = setInterval(() => {
      setDisconnectCountdown(prev => {
        if (prev <= 1) {
          clearInterval(disconnectTimerRef.current)
          clearRoom()
          nav('/game-result', { state: { reason: 'opp_disconnected' } })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(disconnectTimerRef.current)
  }, [oppDisconnected, gs.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 'ending' → 5s death overlay → 'ended' ───────────────────────────────
  useEffect(() => {
    if (gs.phase !== 'ending') return
    playGameEnd(gs.winner === gs.localPlayer)
    if (!statsRecordedRef.current) {
      statsRecordedRef.current = true
      const result: 'win' | 'loss' | 'draw' = gs.winner === gs.localPlayer ? 'win' : gs.winner === 'draw' ? 'draw' : 'loss'
      recordGameResult(result, playerStats[gs.localPlayer] ?? { shots: 0, hits: 0, damage: 0, weapons: {} })
    }
    setEndingCountdown(5)
    endingTimerRef.current = setInterval(() => {
      setEndingCountdown(prev => {
        if (prev <= 1) {
          clearInterval(endingTimerRef.current)
          setGs(g => g.phase === 'ending' ? { ...g, phase: 'ended' } : g)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(endingTimerRef.current)
  }, [gs.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── End game timer + sound ────────────────────────────────────────────────
  useEffect(() => {
    if (gs.phase !== 'ended') return
    endTimerRef.current = setInterval(() => {
      setEndTimer(prev => {
        if (prev <= 1) {
          clearInterval(endTimerRef.current)
          leaveGame()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(endTimerRef.current)
  }, [gs.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Android back button → leave confirm ─────────────────────────────────
  useEffect(() => {
    window.history.pushState(null, '', window.location.pathname)
    const handlePop = () => {
      window.history.pushState(null, '', window.location.pathname)
      setShowLeaveConfirm(true)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // ─── Web: warn before tab close while game is active ─────────────────────
  useEffect(() => {
    if (gs.phase === 'ended') return
    const handle = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handle)
    return () => window.removeEventListener('beforeunload', handle)
  }, [gs.phase])

  // ─── Rematch: P1 triggers new game when both want rematch ─────────────────
  useEffect(() => {
    if (!wantRematch || !oppWantsRematch || myRole !== 'p1') return
    const newSeed = Math.floor(Math.random() * 1_000_000)
    channelRef.current?.send({ type: 'broadcast', event: 'rematch_go', payload: { seed: newSeed } })
    setBullets([]); setAnimDestroyedTiles([])
    setPlayerStats(freshStats())
    clearInterval(endTimerRef.current); setEndTimer(15)
    setWantRematch(false); setOppWantsRematch(false)
    burstRef.current = null; animating.current = false
    pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
    pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []; pendingSmokeClouds.current = []; pendingBlastZone.current = []
    setGs(buildInitialState(newSeed, players, loadouts, myRole))
  }, [wantRematch, oppWantsRematch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Leave game helper (broadcasts notification before clearing room) ────
  const leaveGame = useCallback(() => {
    setShowLeaveConfirm(false)
    if (isMultiplayer) {
      channelRef.current?.send({ type: 'broadcast', event: 'player_left', payload: { role: myRole } })
      setTimeout(() => { clearRoom(); nav('/game-result', { state: { reason: 'left' }, replace: true } as never) }, 120)
    } else {
      clearRoom(); nav('/', { replace: true })
    }
  }, [isMultiplayer, channelRef, clearRoom, nav])

  // Broadcast player_left when tab/PWA is closed (best-effort on mobile)
  useEffect(() => {
    if (!isMultiplayer) return
    const handle = () => channelRef.current?.send({ type: 'broadcast', event: 'player_left', payload: { role: myRole } })
    window.addEventListener('beforeunload', handle)
    return () => window.removeEventListener('beforeunload', handle)
  }, [isMultiplayer]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Player actions ────────────────────────────────────────────────────────
  const handleMove = (col: number, row: number) => {
    setPreviewPos(null)
    clearInterval(timerRef.current)
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'move', col, row } })
    setGs(prev => {
      const localPid = prev.localPlayer
      const u = prev.ufos[localPid]
      if (!u) return prev
      // Portal teleportation
      let finalCol = col, finalRow = row
      let newPortals = prev.portals ?? []
      const landedPortal = newPortals.find(p => p.col === col && p.row === row)
      if (landedPortal) {
        const paired = newPortals.find(p => p.id === landedPortal.pairedId)
        if (paired) {
          finalCol = paired.col; finalRow = paired.row
          newPortals = newPortals.filter(p => p.id !== landedPortal.id && p.id !== paired.id)
          setTeleportFlash([{ col, row }, { col: paired.col, row: paired.row }])
          setTimeout(() => setTeleportFlash([]), 500)
          playTeleport()
          const tpId = Date.now()
          setTeleportTriggers([{ pid: localPid, fromCol: col, fromRow: row, id: tpId }])
          setTimeout(() => setTeleportTriggers([]), 300)
        }
      }
      let updated = { ...prev, portals: newPortals, ufos: { ...prev.ufos, [localPid]: { ...u, col: finalCol, row: finalRow } } }
      // Health pack pickup at final landing position
      const pack = (prev.healthPacks ?? []).find(p => p.col === finalCol && p.row === finalRow)
      if (pack) {
        const pu = updated.ufos[localPid]!
        updated = { ...updated,
          ufos: { ...updated.ufos, [localPid]: { ...pu, hp: Math.min(100, pu.hp + 30) } },
          healthPacks: (prev.healthPacks ?? []).filter(p => p.id !== pack.id),
        }
      }
      // Trap mine trigger
      const trap = (prev.trapMines ?? []).find(t => t.col === finalCol && t.row === finalRow)
      if (trap) {
        const tu = updated.ufos[localPid]!
        const trapDmg = trap.owner === localPid ? 30 : 60  // self-damage halved
        updated = { ...updated,
          ufos: { ...updated.ufos, [localPid]: { ...tu, hp: Math.max(0, tu.hp - trapDmg) } },
          trapMines: (prev.trapMines ?? []).filter(t => t.id !== trap.id),
        }
        setDamageFloats(f => { const fl: DamageFloat = { id: Date.now(), x: (finalCol + 0.5) * TILE, y: finalRow * TILE, value: trapDmg, color: localPid === prev.localPlayer ? '#ff8800' : '#ff3366' }; setTimeout(() => setDamageFloats(f2 => f2.filter(x => x.id !== fl.id)), 1500); return [...f, fl] })
        playExplosion()
      }
      return updated
    })
    endTurn()
  }

  // Called when canvas is tapped in teleport-placement mode
  const handleTeleportPlace = (col: number, row: number) => {
    if (teleportStep === 0) {
      setTeleportFirst({ col, row })
      setTeleportStep(1)
    } else if (teleportFirst && !(teleportFirst.col === col && teleportFirst.row === row)) {
      // Place both portals, broadcast, end turn
      clearInterval(timerRef.current)
      const tsNow = Date.now()
      const pA: Portal = { id: `pa_${tsNow}`, col: teleportFirst.col, row: teleportFirst.row, pairedId: `pb_${tsNow}`, owner: gs.localPlayer }
      const pB: Portal = { id: `pb_${tsNow}`, col, row, pairedId: `pa_${tsNow}`, owner: gs.localPlayer }
      channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: {
        kind: 'teleport', portals: [{ col: pA.col, row: pA.row }, { col: pB.col, row: pB.row }],
      } })
      setGs(prev => {
        const u = prev.ufos[prev.localPlayer]
        return u ? { ...prev,
          portals: [...(prev.portals ?? []), pA, pB],
          ufos: { ...prev.ufos, [prev.localPlayer]: { ...u, weapons: u.weapons.map(w => w.id === 'teleport' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
        } : prev
      })
      setTeleportStep(0); setTeleportFirst(null); setSelectedWeapon('normal')
      endTurn()
    }
  }

  const handleTrapPlace = (col: number, row: number) => {
    clearInterval(timerRef.current)
    const newTrap: TrapMine = { id: `trap_${Date.now()}`, col, row, owner: gs.localPlayer, turnsLeft: 8 }
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'trap', col, row } })
    setGs(prev => {
      const u = prev.ufos[prev.localPlayer]
      return u ? { ...prev,
        trapMines: [...(prev.trapMines ?? []), newTrap],
        ufos: { ...prev.ufos, [prev.localPlayer]: { ...u, weapons: u.weapons.map(w => w.id === 'trap' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
      } : prev
    })
    setSelectedWeapon('normal')
    endTurn()
  }

  const handleBlackholePlace = (col: number, row: number) => {
    clearInterval(timerRef.current)
    const newBH: BlackHole = { id: `bh_${Date.now()}`, col, row, owner: gs.localPlayer, turnsLeft: 4 }
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'blackhole', col, row } })
    setGs(prev => {
      const u = prev.ufos[prev.localPlayer]
      return u ? { ...prev,
        blackHoles: [...(prev.blackHoles ?? []), newBH],
        ufos: { ...prev.ufos, [prev.localPlayer]: { ...u, weapons: u.weapons.map(w => w.id === 'blackhole' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } },
      } : prev
    })
    setSelectedWeapon('normal')
    endTurn()
  }

  const EMOTES = ['😂', '💀', '👍', '🔥', '😤', '🎉', '😎']

  const handleSendEmote = (emoji: string) => {
    setShowEmotePicker(false)
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'emote', emoji } })
    const entry: EmoteEntry = { pid: gs.localPlayer, emoji, id: Date.now() }
    setActiveEmotes(prev => [...prev, entry])
    setTimeout(() => setActiveEmotes(prev => prev.filter(e => e.id !== entry.id)), 4000)
  }

  const handleShoot = (angle: number) => {
    // Placement-mode weapons — enter tile-select mode instead of shooting
    if (selectedWeapon === 'teleport') {
      setTeleportStep(0); setTeleportFirst(null)
      return
    }
    if (selectedWeapon === 'trap' || selectedWeapon === 'blackhole') return
    // Shield is not a projectile — intercept and show confirm dialog
    if (selectedWeapon === 'shield') {
      setShowShieldConfirm(true)
      return
    }
    clearInterval(timerRef.current)
    playShoot()
    const myUfo = gs.ufos[gs.localPlayer]!
    setPlayerStats(prev => {
      const s = prev[gs.localPlayer] ?? { shots: 0, hits: 0, damage: 0, weapons: {} }
      return { ...prev, [gs.localPlayer]: { ...s, shots: s.shots + 1, weapons: { ...s.weapons, [selectedWeapon]: (s.weapons[selectedWeapon] ?? 0) + 1 } } }
    })
    // Pre-broadcast smoke landing position so opponent can place cloud deterministically
    if (selectedWeapon === 'smoke') {
      const sx = (myUfo.col + 0.5) * TILE, sy = (myUfo.row + 0.5) * TILE
      const landing = computeSmokeLanding(sx, sy, angle, gs.map, gs.ufos, gs.players)
      channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'smokeCloud', col: landing.col, row: landing.row } })
    }
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'shoot', angle, weapon: selectedWeapon } })
    if (selectedWeapon !== 'normal') {
      setGs(prev => { const u = prev.ufos[prev.localPlayer]; return u ? { ...prev, ufos: { ...prev.ufos, [prev.localPlayer]: { ...u, weapons: u.weapons.map(w => w.id === selectedWeapon ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w) } } } : prev })
    }
    const sx = (myUfo.col + 0.5) * TILE
    const sy = (myUfo.row + 0.5) * TILE
    if (selectedWeapon === 'burst') burstRef.current = { angle, owner: gs.localPlayer, remaining: 2 }
    const initBullets = [createBullet(`b${Date.now()}`, gs.localPlayer, selectedWeapon, sx, sy, angle, WEAPON_TTL[selectedWeapon])]
    bulletsRef.current = initBullets; setBullets([...initBullets])
    pendingTiles.current = []; pendingDamage.current = 0; pendingHitTarget.current = null; pendingShooterDamage.current = 0
    pendingDotStacks.current = []; pendingFreezeTargets.current = []; pendingStickyMines.current = []; pendingUFOMineTargets.current = []; pendingBlastZone.current = []
    setAnimDestroyedTiles([])
    animating.current = true
    rafRef.current = requestAnimationFrame(animStep)
  }

  const handleActivateShield = () => {
    setShowShieldConfirm(false)
    clearInterval(timerRef.current)
    const myPid = gs.localPlayer
    setPlayerStats(prev => {
      const s = prev[myPid] ?? { shots: 0, hits: 0, damage: 0, weapons: {} }
      return { ...prev, [myPid]: { ...s, shots: s.shots + 1, weapons: { ...s.weapons, shield: (s.weapons.shield ?? 0) + 1 } } }
    })
    setGs(prev => {
      const u = prev.ufos[myPid]
      if (!u) return prev
      return { ...prev, ufos: { ...prev.ufos, [myPid]: {
        ...u, shieldHp: 50, shieldTurnsLeft: 5,
        weapons: u.weapons.map(w => w.id === 'shield' ? { ...w, ammo: Math.max(0, w.ammo - 1) } : w),
      } } }
    })
    channelRef.current?.send({ type: 'broadcast', event: 'game_action', payload: { kind: 'shield' } })
    playShieldActivate()
    endTurn()
  }

  // ─── End screen ────────────────────────────────────────────────────────────
  if (gs.phase === 'ended') {
    const winColor = gs.winner === 'draw' ? '#888' : gs.ufos[gs.winner as PlayerId]?.color
    const isWinner = gs.winner === gs.localPlayer
    const statCols = `auto ${gs.players.map(() => '1fr').join(' ')}`
    const statRows: { label: string; key: 'shots' | 'hits' | 'damage' }[] = [
      { label: '射擊', key: 'shots' }, { label: '命中', key: 'hits' }, { label: '傷害', key: 'damage' },
    ]
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-4 px-4 py-6 overflow-auto">
        <div className="text-3xl font-bold tracking-widest" style={{ color: winColor }}>
          {gs.winner === 'draw' ? '平手！' : isWinner ? '你贏了！' : '你輸了...'}
        </div>

        {/* Stats table — dynamic columns for N players */}
        <div className="w-full max-w-xs border border-dark-border rounded overflow-hidden text-sm font-mono">
          <div className="grid bg-dark-panel text-gray-500 text-xs tracking-widest" style={{ gridTemplateColumns: statCols }}>
            <div className="px-2 py-1"></div>
            {gs.players.map(pid => (
              <div key={pid} className="px-2 py-1 text-center" style={{ color: gs.ufos[pid]?.color }}>{gs.ufos[pid]?.name}</div>
            ))}
          </div>
          {statRows.map(row => (
            <div key={row.label} className="grid border-t border-dark-border" style={{ gridTemplateColumns: statCols }}>
              <div className="px-2 py-1.5 text-gray-500 text-xs">{row.label}</div>
              {gs.players.map(pid => (
                <div key={pid} className="px-2 py-1.5 text-center text-white">{playerStats[pid]?.[row.key] ?? 0}</div>
              ))}
            </div>
          ))}
          <div className="grid border-t border-dark-border" style={{ gridTemplateColumns: statCols }}>
            <div className="px-2 py-1.5 text-gray-500 text-xs">武器</div>
            {gs.players.map(pid => {
              const e = Object.entries(playerStats[pid]?.weapons ?? {}).sort((a, b) => b[1] - a[1])
              return <div key={pid} className="px-2 py-1.5 text-center text-white">{e.length ? `${e[0][0]}×${e[0][1]}` : '—'}</div>
            })}
          </div>
        </div>

        <div className="text-gray-600 text-xs tracking-widest">{endTimer}s 後自動返回首頁</div>

        <div className="flex gap-3 mt-1">
          {isSolo ? (
            <button
              onClick={() => {
                const newSeed = Math.floor(Math.random() * 1_000_000)
                soloSeedRef.current = newSeed
                statsRecordedRef.current = false
                clearInterval(endTimerRef.current); setEndTimer(15)
                setPlayerStats(freshStats())
                setBullets([]); setAnimDestroyedTiles([])
                burstRef.current = null; animating.current = false
                pendingTiles.current = []; pendingSmokeClouds.current = []
                setGs(buildInitialState(newSeed, players, loadouts, myRole))
              }}
              className="border-2 border-neon-green text-neon-green px-6 py-2 rounded tracking-widest text-sm hover:bg-neon-green/10 transition-all"
            >
              再來一局
            </button>
          ) : (
            <button
              disabled={wantRematch}
              onClick={() => {
                setWantRematch(true)
                channelRef.current?.send({ type: 'broadcast', event: 'rematch_want', payload: {} })
              }}
              className="border-2 border-neon-green text-neon-green px-6 py-2 rounded tracking-widest text-sm hover:bg-neon-green/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {wantRematch ? (oppWantsRematch ? '準備中...' : '等待對手...') : '再來一局'}
            </button>
          )}
          <button
            onClick={() => { clearInterval(endTimerRef.current); leaveGame() }}
            className="border-2 border-gray-600 text-gray-400 px-6 py-2 rounded tracking-widest text-sm hover:bg-gray-600/10 transition-all"
          >
            返回首頁
          </button>
        </div>

        {!isSolo && oppWantsRematch && !wantRematch && (
          <div className="text-neon-green text-xs tracking-widest animate-pulse">對手想再來一局！</div>
        )}
      </div>
    )
  }

  const opponents = gs.players.filter(p => p !== gs.localPlayer)
  const opponentName = opponents.length > 0 ? (room?.loadouts?.[opponents[0]]?.name ?? '對手') : undefined

  return (
    <div className="relative flex flex-col w-full h-full bg-dark-bg overflow-hidden">
      <HUD
        players={gs.players} ufos={gs.ufos} localPlayer={gs.localPlayer}
        turn={gs.turnNumber} maxTurns={MAX_TURNS}
        timerSeconds={timer} currentTurn={gs.currentTurn}
        roomId={roomId}
        waitingFor={!isMyTurn && isMultiplayer && gs.phase === 'playing' ? (opponentName ?? '對手') : undefined}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel: weapons + action buttons */}
        <div className="flex flex-col w-40 shrink-0 bg-dark-panel border-r border-dark-border">
          <div className="flex-1 overflow-y-auto min-h-0">
            <WeaponBar vertical ufo={gs.ufos[gs.localPlayer]!} selected={selectedWeapon}
              onSelect={w => {
                setSelectedWeapon(w)
                setMovingMode(false)
                if (w === 'shield') setShowShieldConfirm(true)
              }}
              disabled={!isMyTurn || movingMode} />
          </div>
          <div className="shrink-0 border-t border-dark-border flex flex-col gap-2 p-2">
            {isMyTurn && (
              movingMode && previewPos ? (
                <>
                  <div className="grid grid-cols-3 gap-1">
                    <div />
                    <button
                      onClick={() => setPreviewPos(p => p ? { col: p.col, row: p.row - 1 } : p)}
                      disabled={!validDpadPositions.some(c => c.col === previewPos.col && c.row === previewPos.row - 1)}
                      className="py-2 rounded border border-dark-border text-gray-300 text-sm disabled:opacity-25 disabled:cursor-not-allowed hover:border-gray-400 transition-all"
                    >↑</button>
                    <div />
                    <button
                      onClick={() => setPreviewPos(p => p ? { col: p.col - 1, row: p.row } : p)}
                      disabled={!validDpadPositions.some(c => c.col === previewPos.col - 1 && c.row === previewPos.row)}
                      className="py-2 rounded border border-dark-border text-gray-300 text-sm disabled:opacity-25 disabled:cursor-not-allowed hover:border-gray-400 transition-all"
                    >←</button>
                    <div />
                    <button
                      onClick={() => setPreviewPos(p => p ? { col: p.col + 1, row: p.row } : p)}
                      disabled={!validDpadPositions.some(c => c.col === previewPos.col + 1 && c.row === previewPos.row)}
                      className="py-2 rounded border border-dark-border text-gray-300 text-sm disabled:opacity-25 disabled:cursor-not-allowed hover:border-gray-400 transition-all"
                    >→</button>
                    <div />
                    <button
                      onClick={() => setPreviewPos(p => p ? { col: p.col, row: p.row + 1 } : p)}
                      disabled={!validDpadPositions.some(c => c.col === previewPos.col && c.row === previewPos.row + 1)}
                      className="py-2 rounded border border-dark-border text-gray-300 text-sm disabled:opacity-25 disabled:cursor-not-allowed hover:border-gray-400 transition-all"
                    >↓</button>
                    <div />
                  </div>
                  <button
                    onClick={() => handleMove(previewPos.col, previewPos.row)}
                    disabled={!canConfirmMove}
                    className="w-full py-2.5 rounded text-xs border-2 border-neon-green text-neon-green bg-neon-green/10 tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >{canConfirmMove ? '確定' : '不可停留'}</button>
                  <button
                    onClick={() => { setMovingMode(false); setPreviewPos(null) }}
                    className="w-full py-2 rounded text-xs border border-dark-border text-gray-500 hover:border-gray-400 hover:text-gray-300 tracking-widest transition-all"
                  >取消</button>
                </>
              ) : (
                <>
                  {(gs.ufos[gs.localPlayer]?.frozenTurns ?? 0) > 0 ? (
                    <div className="w-full py-2.5 rounded text-xs border-2 border-cyan-800 text-cyan-600 tracking-widest text-center select-none">
                      ❄️ 凍結（{gs.ufos[gs.localPlayer]!.frozenTurns}回合）
                    </div>
                  ) : (
                    <button
                      onClick={() => { const u = gs.ufos[gs.localPlayer]; if (u) { setMovingMode(true); setPreviewPos({ col: u.col, row: u.row }) } }}
                      className="w-full py-2.5 rounded text-xs border-2 border-dark-border text-gray-500 hover:border-gray-400 tracking-widest transition-all"
                    >移動</button>
                  )}
                </>
              )
            )}
            {/* Placement mode cancel buttons */}
            {isMyTurn && selectedWeapon === 'teleport' && (
              <button onClick={() => { setSelectedWeapon('normal'); setTeleportStep(0); setTeleportFirst(null) }}
                className="w-full py-2 rounded text-xs border border-dark-border text-gray-500 hover:border-gray-400 hover:text-gray-300 tracking-widest transition-all">取消傳送</button>
            )}
            {isMyTurn && selectedWeapon === 'trap' && (
              <button onClick={() => setSelectedWeapon('normal')}
                className="w-full py-2 rounded text-xs border border-dark-border text-gray-500 hover:border-gray-400 hover:text-gray-300 tracking-widest transition-all">取消陷阱</button>
            )}
            {isMyTurn && selectedWeapon === 'blackhole' && (
              <button onClick={() => setSelectedWeapon('normal')}
                className="w-full py-2 rounded text-xs border border-dark-border text-gray-500 hover:border-gray-400 hover:text-gray-300 tracking-widest transition-all">取消黑洞</button>
            )}
            {/* Emote button */}
            <div className="relative">
              <button
                onClick={() => setShowEmotePicker(p => !p)}
                className="w-full py-2 rounded text-xs border border-dark-border text-gray-500 hover:border-gray-400 hover:text-gray-300 tracking-widest transition-all"
              >
                😊 表情
              </button>
              {showEmotePicker && (
                <div className="absolute bottom-full mb-1 left-0 right-0 z-30 bg-dark-panel border border-dark-border rounded p-1 grid grid-cols-4 gap-1">
                  {EMOTES.map(e => (
                    <button key={e} onClick={() => handleSendEmote(e)}
                      className="text-lg py-0.5 rounded hover:bg-white/10 transition-all"
                    >{e}</button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="w-full py-2 rounded text-xs border border-dark-border text-gray-600 hover:border-gray-500 hover:text-gray-400 tracking-widest transition-all"
            >
              主選單
            </button>
          </div>
        </div>

        {/* Main area: canvas */}
        <div className={`relative flex-1 flex items-center justify-center overflow-hidden min-w-0${isShaking ? ' shake' : ''}`}>
          {isFlashing && <div className="explosion-flash" />}
          <GameCanvas
            state={gs}
            bullets={bullets}
            animDestroyedTiles={animDestroyedTiles}
            explosionEvents={explosionEvents}
            hitEvents={hitEvents}
            blastZone={blastZone}
            stormBurnedTiles={gs.stormBurnedTiles}
            damageFloats={damageFloats}
            onShoot={handleShoot}
            isMyTurn={isMyTurn}
            movingMode={movingMode}
            selectedWeapon={selectedWeapon}
            previewPos={previewPos}
            teleportMode={isMyTurn && selectedWeapon === 'teleport'}
            teleportStep={teleportStep}
            teleportFirst={teleportFirst}
            onTeleportPlace={handleTeleportPlace}
            teleportFlash={teleportFlash}
            activeEmotes={activeEmotes}
            trapMode={isMyTurn && selectedWeapon === 'trap'}
            onTrapPlace={handleTrapPlace}
            blackholeMode={isMyTurn && selectedWeapon === 'blackhole'}
            onBlackholePlace={handleBlackholePlace}
            killEvents={killEvents}
            shieldHitEvents={shieldHitEvents}
            teleportTriggers={teleportTriggers}
          />
          {showMapLabel && (() => {
            const mt = gs.map.mapType
            const MAP_META: Record<string, { icon: string; name: string; color: string }> = {
              standard: { icon: '🗺', name: '標準地圖', color: '#00d4ff' },
              laser:    { icon: '⚡', name: '雷射地圖', color: '#00ff88' },
              fortress: { icon: '🏰', name: '四堡地圖', color: '#ffdd00' },
              open:     { icon: '🌌', name: '空曠地圖', color: '#cc88ff' },
              diagonal: { icon: '↗',  name: '斜線地圖', color: '#ff8844' },
            }
            const meta = MAP_META[mt]
            return (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                style={{ animation: 'fadeInOut 2.5s ease-out forwards' }}>
                <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl"
                  style={{ background: 'rgba(8,8,20,0.85)', border: `1px solid ${meta.color}44` }}>
                  <span style={{ fontSize: 32 }}>{meta.icon}</span>
                  <span className="font-mono font-bold tracking-widest text-lg"
                    style={{ color: meta.color, textShadow: `0 0 16px ${meta.color}88` }}>{meta.name}</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Leave confirmation dialog */}
      {showLeaveConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none">
          <div className="bg-dark-panel border border-dark-border rounded-lg px-8 py-6 flex flex-col gap-4 items-center mx-4">
            <div className="text-white tracking-widest text-base">確定要離開遊戲？</div>
            {isMultiplayer && <div className="text-gray-500 text-xs text-center tracking-wider">對手將會收到離開通知</div>}
            <div className="flex gap-3 mt-1">
              <button
                onClick={leaveGame}
                className="border-2 border-red-500 text-red-400 px-6 py-2 rounded tracking-widest text-sm hover:bg-red-500/10 transition-all"
              >
                確定離開
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="border border-dark-border text-gray-500 px-6 py-2 rounded tracking-widest text-sm hover:border-gray-500 hover:text-gray-300 transition-all"
              >
                繼續遊戲
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent explicitly left */}
      {oppLeft && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm select-none">
          <div className="text-yellow-400 text-xl tracking-widest mb-2">對手已離開遊戲</div>
          <button
            onClick={() => { clearRoom(); nav('/game-result', { state: { reason: 'opp_left' } }) }}
            className="mt-4 border-2 border-neon-blue text-neon-blue px-8 py-2 rounded tracking-widest text-sm hover:bg-neon-blue/10 transition-all"
          >
            確認
          </button>
        </div>
      )}

      {/* Opponent disconnected (unexpected) */}
      {oppDisconnected && !oppLeft && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm select-none">
          <div className="text-yellow-400 text-2xl tracking-widest animate-pulse">對手已離線</div>
          <div className="text-gray-400 text-sm mt-2">等待重新連線...</div>
          <div className="text-gray-500 text-xs mt-1 tracking-widest">{disconnectCountdown}s 後自動結束</div>
          <button onClick={() => { clearRoom(); nav('/game-result', { state: { reason: 'opp_disconnected' } }) }} className="mt-6 text-gray-500 hover:text-gray-300 text-sm tracking-widest">放棄並結束對戰</button>
        </div>
      )}

      {showStormAlert && (
        <div className="absolute inset-x-0 top-16 z-30 flex items-center justify-center pointer-events-none">
          <div className="bg-red-900/80 border border-red-500 text-red-300 px-6 py-3 rounded-lg tracking-widest text-lg font-bold animate-pulse">
            ⚠ 縮圈開始！
          </div>
        </div>
      )}

      {eliminatedNotice && (
        <div className="absolute inset-x-0 top-16 z-30 flex items-center justify-center pointer-events-none">
          <div className="bg-yellow-900/80 border border-yellow-500 text-yellow-200 px-6 py-2 rounded-lg tracking-widest text-sm font-bold">
            🚪 {eliminatedNotice}
          </div>
        </div>
      )}

      {isPaused && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm select-none">
          <div className="text-9xl text-white/80 leading-none">⏸</div>
          <div className="text-5xl font-bold tracking-[0.6em] text-white/90 mt-6">PAUSE</div>
          <div className="text-gray-400 text-sm mt-4 tracking-widest">返回頁面繼續遊戲</div>
        </div>
      )}

      {/* Death / victory overlay during 5-second 'ending' delay */}
      {gs.phase === 'ending' && (() => {
        const winColor = gs.winner === 'draw' ? '#888' : gs.ufos[gs.winner as PlayerId]?.color
        const isWinner = gs.winner === gs.localPlayer
        return (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm select-none pointer-events-none">
            <div
              className="text-4xl font-bold tracking-widest mb-3"
              style={{ color: winColor, textShadow: `0 0 24px ${winColor}` }}
            >
              {gs.winner === 'draw' ? '平手！' : isWinner ? '你贏了！' : '你輸了...'}
            </div>
            {gs.winner !== 'draw' && gs.winner && (
              <div className="text-lg tracking-widest mb-4" style={{ color: gs.ufos[gs.winner as PlayerId]?.color }}>
                {gs.ufos[gs.winner as PlayerId]?.name}
              </div>
            )}
            <div className="text-gray-500 text-sm tracking-widest tabular-nums">{endingCountdown}s</div>
          </div>
        )
      })()}

      {/* Shield activation confirm dialog */}
      {showShieldConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none">
          <div className="bg-dark-panel border border-dark-border rounded-lg px-8 py-6 flex flex-col gap-4 items-center mx-4">
            <div className="text-white tracking-widest text-base">是否啟用護盾？</div>
            <div className="text-gray-500 text-xs text-center tracking-wider">吸收最多 50 傷害，持續 5 回合</div>
            <div className="flex gap-3 mt-1">
              <button
                onClick={handleActivateShield}
                className="border-2 border-neon-blue text-neon-blue px-6 py-2 rounded tracking-widest text-sm hover:bg-neon-blue/10 transition-all"
              >
                是
              </button>
              <button
                onClick={() => setShowShieldConfirm(false)}
                className="border border-dark-border text-gray-500 px-6 py-2 rounded tracking-widest text-sm hover:border-gray-500 hover:text-gray-300 transition-all"
              >
                否
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
