// ─── Tile / Map ───────────────────────────────────────────────────────────────

export type TileType = 'empty' | 'hard' | 'soft'

export interface Tile {
  x: number
  y: number
  type: TileType
}

export interface GameMap {
  cols: number
  rows: number
  tiles: TileType[][]  // [row][col]
  seed: number
}

// ─── Weapons ──────────────────────────────────────────────────────────────────

export type WeaponId =
  | 'normal'
  | 'split'
  | 'pierce'
  | 'sticky'
  | 'tracking'
  | 'shockwave'
  | 'burst'
  | 'smoke'
  | 'acid'

export interface WeaponDef {
  id: WeaponId
  label: string
  icon: string
  damage: number
  ammo: number   // 0 = infinite
}

// ─── UFO ──────────────────────────────────────────────────────────────────────

export type PlayerId = 'p1' | 'p2'

export interface UFOState {
  id: PlayerId
  name: string
  col: number
  row: number
  color: string
  hp: number
  maxHp: number
  weapons: { id: WeaponId; ammo: number }[]
  dotStacks: { damage: number; turnsLeft: number }[]
  smokeLeft: number   // rounds where smoke is active
  hasStickyMine: boolean
}

// ─── Bullet ───────────────────────────────────────────────────────────────────

export interface Bullet {
  id: string
  weapon: WeaponId
  owner: PlayerId
  x: number   // pixel position
  y: number
  vx: number
  vy: number
  bounces: number
  active: boolean
  ttl: number   // frames remaining before auto-expire
  hasSplit?: boolean   // split bullet: prevents double-split
  // sticky mine specific
  stuck?: boolean
  stuckTurnsLeft?: number
}

// ─── Sticky mine ──────────────────────────────────────────────────────────────

export interface StickyMine {
  id: string
  col: number
  row: number
}

// ─── Game State ───────────────────────────────────────────────────────────────

export type Phase = 'waiting' | 'playing' | 'ended'
export type TurnAction = 'idle' | 'moving' | 'shooting'

export interface GameState {
  map: GameMap
  ufos: { p1: UFOState; p2: UFOState }
  currentTurn: PlayerId
  turnNumber: number   // 1-based, max 20
  phase: Phase
  localPlayer: PlayerId
  winner: PlayerId | 'draw' | null
  stickyMines: StickyMine[]   // mines on tiles, explode at start of next turn
}

// ─── Network ──────────────────────────────────────────────────────────────────

export interface ActionPacket {
  type: 'action'
  action_type: 'shoot' | 'move'
  weapon?: WeaponId
  angle?: number
  move_to?: { x: number; y: number }
  result: {
    hit: boolean
    damage: number
    destroyed_tiles: { x: number; y: number }[]
    dot_applied: boolean
    smoke_applied: boolean
  }
}

export interface RoomRow {
  room_id: string
  player1_id: string | null
  player2_id: string | null
  status: 'waiting' | 'loadout' | 'playing' | 'ended'
  map_seed: number | null
}
