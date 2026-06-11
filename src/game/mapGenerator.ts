import type { GameMap, PlayerId, TileType } from '../types/game'

// Seeded pseudo-random (mulberry32)
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

export function generateMap(seed: number): GameMap {
  const rng = seededRng(seed)
  const tiles: TileType[][] = Array.from({ length: ROWS }, () =>
    Array(COLS).fill('empty' as TileType)
  )

  // Place hard walls (~17% of interior)
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (rng() < 0.17) tiles[r][c] = 'hard'
    }
  }

  // Place soft walls (~22% of remaining empty)
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (tiles[r][c] === 'empty' && rng() < 0.22) tiles[r][c] = 'soft'
    }
  }

  // Clear spawn zones (left & right side strips)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 3; c++) tiles[r][c] = 'empty'
    for (let c = COLS - 3; c < COLS; c++) tiles[r][c] = 'empty'
  }

  return { cols: COLS, rows: ROWS, tiles, seed }
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

// Four-corner spawn zones for FFA (3–4 players).
// p1 = top-left, p2 = bottom-right, p3 = bottom-left, p4 = top-right
const SPAWN_ZONES: Record<PlayerId, (map: GameMap) => { cols: number[]; rowMin: number; rowMax: number }> = {
  p1: m => ({ cols: [1, 2],                  rowMin: 1,                   rowMax: Math.floor(m.rows / 2) - 1 }),
  p2: m => ({ cols: [m.cols - 2, m.cols - 3], rowMin: Math.floor(m.rows / 2), rowMax: m.rows - 2 }),
  p3: m => ({ cols: [1, 2],                  rowMin: Math.floor(m.rows / 2), rowMax: m.rows - 2 }),
  p4: m => ({ cols: [m.cols - 2, m.cols - 3], rowMin: 1,                   rowMax: Math.floor(m.rows / 2) - 1 }),
}
const SPAWN_FALLBACK: Record<PlayerId, (map: GameMap) => { col: number; row: number }> = {
  p1: _m => ({ col: 1,          row: 2 }),
  p2: m => ({ col: m.cols - 2, row: m.rows - 3 }),
  p3: m  => ({ col: 1,          row: m.rows - 3 }),
  p4: m => ({ col: m.cols - 2, row: 2 }),
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
