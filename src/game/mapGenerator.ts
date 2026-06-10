import type { GameMap, TileType } from '../types/game'

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

const COLS = 30
const ROWS = 17

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
