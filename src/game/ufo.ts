import type { GameMap, UFOState } from '../types/game'

const MOVE_RANGE = 2

// Cells the UFO may LAND on: within range, in bounds, and empty (can't stop on
// a wall). Used for the blue movement highlight and to validate a confirmed move.
export function getReachableCells(
  ufo: UFOState,
  map: GameMap
): { col: number; row: number }[] {
  const result: { col: number; row: number }[] = []
  for (let dr = -MOVE_RANGE; dr <= MOVE_RANGE; dr++) {
    for (let dc = -MOVE_RANGE; dc <= MOVE_RANGE; dc++) {
      if (dr === 0 && dc === 0) continue
      if (Math.abs(dr) + Math.abs(dc) > MOVE_RANGE) continue
      const r = ufo.row + dr
      const c = ufo.col + dc
      if (r < 0 || r >= map.rows || c < 0 || c >= map.cols) continue
      if (map.tiles[r][c] !== 'empty') continue
      result.push({ col: c, row: r })
    }
  }
  return result
}

// Cells the D-pad preview may STEP through: within range and in bounds, ignoring
// walls — the UFO flies over walls, so the preview must be able to cross a wall
// to reach an empty cell beyond it (intermediate wall tiles aren't blockers).
export function getSteppableCells(
  ufo: UFOState,
  map: GameMap
): { col: number; row: number }[] {
  const result: { col: number; row: number }[] = []
  for (let dr = -MOVE_RANGE; dr <= MOVE_RANGE; dr++) {
    for (let dc = -MOVE_RANGE; dc <= MOVE_RANGE; dc++) {
      if (dr === 0 && dc === 0) continue
      if (Math.abs(dr) + Math.abs(dc) > MOVE_RANGE) continue
      const r = ufo.row + dr
      const c = ufo.col + dc
      if (r < 0 || r >= map.rows || c < 0 || c >= map.cols) continue
      result.push({ col: c, row: r })
    }
  }
  return result
}
