import type { GameMap, MapType, PlayerId, TileType } from '../types/game'

function seededRng(seed: number) {
  let s = seed
  return () => {
    s |= 0; s = s + 0x6d2b79f5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff
  }
}

const COLS = 20
const ROWS = 12

// ─── Standard map ─────────────────────────────────────────────────────────────

function generateStandardMap(seed: number): GameMap {
  const rng = seededRng(seed)
  const tiles: TileType[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('empty' as TileType))
  for (let r = 1; r < ROWS - 1; r++)
    for (let c = 1; c < COLS - 1; c++)
      if (rng() < 0.17) tiles[r][c] = 'hard'
  for (let r = 1; r < ROWS - 1; r++)
    for (let c = 1; c < COLS - 1; c++)
      if (tiles[r][c] === 'empty' && rng() < 0.22) tiles[r][c] = 'soft'
  // Clear spawn corridors
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 3; c++) tiles[r][c] = 'empty'
    for (let c = COLS - 3; c < COLS; c++) tiles[r][c] = 'empty'
  }
  return { cols: COLS, rows: ROWS, tiles, seed, mapType: 'standard' }
}

// ─── Laser-divider map ────────────────────────────────────────────────────────
// A two-column neon laser fence at cols 9–10 splits the map in half.
// Bullets pass through laser tiles; UFOs cannot land on them.
// Storm shrink will eventually clear the laser columns too.

function generateLaserMap(seed: number): GameMap {
  const rng = seededRng(seed)
  const tiles: TileType[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('empty' as TileType))

  // Random hard walls on each half (skip the laser columns)
  for (let r = 1; r < ROWS - 1; r++)
    for (let c = 1; c < COLS - 1; c++)
      if (c !== 9 && c !== 10 && rng() < 0.17) tiles[r][c] = 'hard'
  for (let r = 1; r < ROWS - 1; r++)
    for (let c = 1; c < COLS - 1; c++)
      if (tiles[r][c] === 'empty' && c !== 9 && c !== 10 && rng() < 0.22) tiles[r][c] = 'soft'

  // Laser fence: cols 9–10, all rows
  for (let r = 0; r < ROWS; r++) {
    tiles[r][9]  = 'laser'
    tiles[r][10] = 'laser'
  }

  // Clear spawn corridors (left cols 0–2, right cols 17–19)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 3; c++) tiles[r][c] = 'empty'
    for (let c = COLS - 3; c < COLS; c++) tiles[r][c] = 'empty'
  }
  return { cols: COLS, rows: ROWS, tiles, seed, mapType: 'laser' }
}

// ─── Fortress map ─────────────────────────────────────────────────────────────
// Four corner bunkers (hard-wall boxes with openings) + soft walls in the open
// centre. Each player spawns inside their own fortress.

function generateFortressMap(seed: number): GameMap {
  const rng = seededRng(seed)
  const tiles: TileType[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('empty' as TileType))

  // Draw a hollow box at each corner; then punch exit openings.
  type Box = { r0: number; r1: number; c0: number; c1: number; exitSide: 'right' | 'left' | 'bottom' | 'top' }
  const boxes: Box[] = [
    { r0: 0, r1: 4, c0: 0, c1: 5,      exitSide: 'right'  }, // top-left    (p1)
    { r0: 7, r1: 11, c0: 14, c1: 19,   exitSide: 'left'   }, // bottom-right (p2)
    { r0: 7, r1: 11, c0: 0, c1: 5,     exitSide: 'right'  }, // bottom-left  (p3)
    { r0: 0, r1: 4, c0: 14, c1: 19,    exitSide: 'left'   }, // top-right    (p4)
  ]

  for (const b of boxes) {
    for (let r = b.r0; r <= b.r1; r++) {
      for (let c = b.c0; c <= b.c1; c++) {
        if (r === b.r0 || r === b.r1 || c === b.c0 || c === b.c1) {
          tiles[r][c] = 'hard'
        }
      }
    }
    // Punch a 2-tile opening
    const midR = Math.floor((b.r0 + b.r1) / 2)
    const midC = Math.floor((b.c0 + b.c1) / 2)
    if (b.exitSide === 'right')  { tiles[midR][b.c1] = 'empty'; tiles[midR + 1][b.c1] = 'empty' }
    if (b.exitSide === 'left')   { tiles[midR][b.c0] = 'empty'; tiles[midR + 1][b.c0] = 'empty' }
    if (b.exitSide === 'bottom') { tiles[b.r1][midC] = 'empty'; tiles[b.r1][midC + 1] = 'empty' }
    if (b.exitSide === 'top')    { tiles[b.r0][midC] = 'empty'; tiles[b.r0][midC + 1] = 'empty' }
  }

  // Random soft + hard walls in the open centre (cols 6–13, rows 4–7)
  for (let r = 3; r < 9; r++) {
    for (let c = 6; c < 14; c++) {
      const roll = rng()
      if (roll < 0.18) tiles[r][c] = 'hard'
      else if (roll < 0.40) tiles[r][c] = 'soft'
    }
  }

  // Guarantee spawn tiles inside each fortress are clear
  const clearZones = [
    [1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2],           // p1 top-left
    [8, 17], [8, 18], [9, 17], [9, 18], [10, 17], [10, 18],    // p2 bottom-right
    [8, 1], [8, 2], [9, 1], [9, 2], [10, 1], [10, 2],          // p3 bottom-left
    [1, 17], [1, 18], [2, 17], [2, 18], [3, 17], [3, 18],      // p4 top-right
  ] as [number, number][]
  for (const [r, c] of clearZones) tiles[r][c] = 'empty'

  return { cols: COLS, rows: ROWS, tiles, seed, mapType: 'fortress' }
}

// ─── Open (no-wall) map ───────────────────────────────────────────────────────
// Pure empty field. Spawns use standard left/right corridors.

function generateOpenMap(seed: number): GameMap {
  const tiles: TileType[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('empty' as TileType))
  return { cols: COLS, rows: ROWS, tiles, seed, mapType: 'open' }
}

// ─── Diagonal-barrier map ─────────────────────────────────────────────────────
// Anti-diagonal hard wall from top-right to bottom-left, 2 tiles wide.
// Three gaps let bullets and UFOs cross the barrier.
// P1 uses top-left spawn zone; P2 uses bottom-right spawn zone.

function generateDiagonalMap(seed: number): GameMap {
  const rng = seededRng(seed)
  const tiles: TileType[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('empty' as TileType))

  // Anti-diagonal wall: r = (ROWS-1) - c*(ROWS-1)/(COLS-1)
  for (let c = 0; c < COLS; c++) {
    const dRow = Math.round((ROWS - 1) - c * (ROWS - 1) / (COLS - 1))
    if (dRow >= 0 && dRow < ROWS)     tiles[dRow][c]     = 'hard'
    if (dRow + 1 >= 0 && dRow + 1 < ROWS) tiles[dRow + 1][c] = 'hard'
  }
  // Punch 3 gaps (col 4, 10, 16)
  for (const gc of [4, 10, 16]) {
    const dRow = Math.round((ROWS - 1) - gc * (ROWS - 1) / (COLS - 1))
    if (dRow >= 0 && dRow < ROWS)     tiles[dRow][gc]     = 'empty'
    if (dRow + 1 >= 0 && dRow + 1 < ROWS) tiles[dRow + 1][gc] = 'empty'
  }

  // Light soft-wall scatter on each side (avoid spawn corridors and wall itself)
  for (let r = 1; r < ROWS - 1; r++)
    for (let c = 3; c < COLS - 3; c++)
      if (tiles[r][c] === 'empty' && rng() < 0.10) tiles[r][c] = 'soft'

  // Clear spawn corridors
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 3; c++) tiles[r][c] = 'empty'
    for (let c = COLS - 3; c < COLS; c++) tiles[r][c] = 'empty'
  }

  return { cols: COLS, rows: ROWS, tiles, seed, mapType: 'diagonal' }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getMapType(seed: number): MapType {
  const types: MapType[] = ['standard', 'laser', 'fortress', 'open', 'diagonal']
  return types[seed % 5]
}

export function generateMap(seed: number): GameMap {
  const t = getMapType(seed)
  if (t === 'laser')    return generateLaserMap(seed)
  if (t === 'fortress') return generateFortressMap(seed)
  if (t === 'open')     return generateOpenMap(seed)
  if (t === 'diagonal') return generateDiagonalMap(seed)
  return generateStandardMap(seed)
}

export function pickSpawn(map: GameMap, side: 'left' | 'right'): { col: number; row: number } {
  const rng = seededRng(map.seed + (side === 'left' ? 1 : 2))
  const cols = side === 'left' ? [1, 2] : [map.cols - 2, map.cols - 3]
  for (let attempt = 0; attempt < 50; attempt++) {
    const c = cols[Math.floor(rng() * cols.length)]
    const r = 1 + Math.floor(rng() * (map.rows - 2))
    if (map.tiles[r][c] === 'empty') return { col: c, row: r }
  }
  return side === 'left' ? { col: 1, row: Math.floor(map.rows / 2) } : { col: map.cols - 2, row: Math.floor(map.rows / 2) }
}

const SPAWN_ZONES: Record<PlayerId, (map: GameMap) => { cols: number[]; rowMin: number; rowMax: number }> = {
  p1: m => ({ cols: [1, 2],                  rowMin: 1,                   rowMax: Math.floor(m.rows / 2) - 1 }),
  p2: m => ({ cols: [m.cols - 2, m.cols - 3], rowMin: Math.floor(m.rows / 2), rowMax: m.rows - 2 }),
  p3: m => ({ cols: [1, 2],                  rowMin: Math.floor(m.rows / 2), rowMax: m.rows - 2 }),
  p4: m => ({ cols: [m.cols - 2, m.cols - 3], rowMin: 1,                   rowMax: Math.floor(m.rows / 2) - 1 }),
}
const SPAWN_FALLBACK: Record<PlayerId, (map: GameMap) => { col: number; row: number }> = {
  p1: _m => ({ col: 1,          row: 2 }),
  p2: m  => ({ col: m.cols - 2, row: m.rows - 3 }),
  p3: m  => ({ col: 1,          row: m.rows - 3 }),
  p4: m  => ({ col: m.cols - 2, row: 2 }),
}

export function pickSpawnN(map: GameMap, pid: PlayerId): { col: number; row: number } {
  const zone = SPAWN_ZONES[pid](map)
  const rng = seededRng(map.seed + (['p1','p2','p3','p4'] as const).indexOf(pid) + 1)
  for (let attempt = 0; attempt < 50; attempt++) {
    const c = zone.cols[Math.floor(rng() * zone.cols.length)]
    const r = zone.rowMin + Math.floor(rng() * (zone.rowMax - zone.rowMin + 1))
    if (map.tiles[r]?.[c] === 'empty') return { col: c, row: r }
  }
  return SPAWN_FALLBACK[pid](map)
}
