// ─── Tile / Map ───────────────────────────────────────────────────────────────

export type TileType = 'empty' | 'hard' | 'soft' | 'laser'
export type MapType  = 'standard' | 'laser' | 'fortress'

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
  mapType: MapType
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
  | 'sniper'
  | 'shield'
  | 'teleport'

export interface WeaponDef {
  id: WeaponId
  label: string
  icon: string
  damage: number
  ammo: number   // 0 = infinite
  desc: string
}

// ─── UFO ──────────────────────────────────────────────────────────────────────

export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4'

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
  smokeLeft: number
  hasStickyMine: number          // 0 = none; >0 = countdown turns until explosion
  stickyMineOwner: PlayerId | null  // who placed the attached mine
  isDead: boolean                // eliminated; spectating only
  shieldHp: number               // remaining shield absorption; 0 = no shield
  shieldTurnsLeft: number        // turns until shield expires
}

// ─── Bullet ───────────────────────────────────────────────────────────────────

export interface Bullet {
  id: string
  weapon: WeaponId
  owner: PlayerId
  x: number
  y: number
  vx: number
  vy: number
  bounces: number
  active: boolean
  ttl: number
  hasSplit?: boolean
  stuck?: boolean
  stuckTurnsLeft?: number
}

// ─── Sticky mine ──────────────────────────────────────────────────────────────

export interface StickyMine {
  id: string
  col: number
  row: number
  turnsLeft: number
  owner: PlayerId
}

// ─── Smoke cloud ──────────────────────────────────────────────────────────────

export interface SmokeCloud {
  id: string
  col: number
  row: number
  owner: PlayerId
  turnsLeft: number
}

// ─── Health pack ──────────────────────────────────────────────────────────────

export interface HealthPack {
  id: string
  col: number
  row: number
}

// ─── Teleport portal ──────────────────────────────────────────────────────────

export interface Portal {
  id: string
  col: number
  row: number
  pairedId: string   // id of the linked portal
  owner: PlayerId
}

// ─── Game State ───────────────────────────────────────────────────────────────

export type Phase = 'waiting' | 'playing' | 'ending' | 'ended'
export type TurnAction = 'idle' | 'moving' | 'shooting'

export interface GameState {
  players: PlayerId[]                       // ordered turn sequence
  map: GameMap
  ufos: { [K in PlayerId]?: UFOState }      // only players in game are populated
  currentTurn: PlayerId
  turnNumber: number
  phase: Phase
  localPlayer: PlayerId
  winner: PlayerId | 'draw' | null
  stickyMines: StickyMine[]
  smokeClouds: SmokeCloud[]
  stormBurnedTiles: { col: number; row: number }[]
  healthPacks: HealthPack[]
  portals: Portal[]
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
