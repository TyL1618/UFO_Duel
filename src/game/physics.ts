import type { Bullet, GameMap } from '../types/game'
import { BULLET_SPEED, MAX_BOUNCES } from './constants'

export function createBullet(
  id: string,
  owner: Bullet['owner'],
  weapon: Bullet['weapon'],
  startX: number,
  startY: number,
  angle: number,
  ttl = 360
): Bullet {
  return {
    id,
    weapon,
    owner,
    x: startX,
    y: startY,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    bounces: 0,
    active: true,
    ttl,
  }
}

// Steps bullet one frame. Pushes destroyed tile coords into `destroyedTiles`.
export function stepBullet(
  bullet: Bullet,
  map: GameMap,
  tileSize: number,
  destroyedTiles: { x: number; y: number }[]
): Bullet {
  if (!bullet.active || bullet.stuck) return bullet
  if (bullet.ttl <= 0) return { ...bullet, active: false }

  let { x, y, vx, vy, bounces } = bullet
  const ttl = bullet.ttl - 1
  x += vx
  y += vy

  const mapW = map.cols * tileSize
  const mapH = map.rows * tileSize

  // Border bounce
  if (x <= 0)    { x = -x;              vx =  Math.abs(vx); bounces++ }
  if (x >= mapW) { x = 2 * mapW - x;   vx = -Math.abs(vx); bounces++ }
  if (y <= 0)    { y = -y;              vy =  Math.abs(vy); bounces++ }
  if (y >= mapH) { y = 2 * mapH - y;   vy = -Math.abs(vy); bounces++ }

  // Tile collision
  const col = Math.floor(x / tileSize)
  const row = Math.floor(y / tileSize)

  if (row >= 0 && row < map.rows && col >= 0 && col < map.cols) {
    const tile = map.tiles[row][col]

    if (tile === 'hard') {
      if (bullet.weapon === 'sticky') {
        return { ...bullet, x, y, vx, vy, bounces, ttl, active: false, stuck: true }
      }
      const prevCol = Math.floor((x - vx) / tileSize)
      const prevRow = Math.floor((y - vy) / tileSize)
      if (prevCol !== col) vx = -vx
      if (prevRow !== row) vy = -vy
      bounces++
    } else if (tile === 'soft') {
      if (bullet.weapon === 'pierce') {
        // passes through — no effect
      } else if (bullet.weapon === 'smoke') {
        // Smoke stops at soft tile without destroying it; animStep deploys cloud
        bounces++
        return { ...bullet, x, y, vx, vy, bounces, ttl, active: false }
      } else if (bullet.weapon === 'sticky' || bullet.weapon === 'emp') {
        // Stick to soft wall without destroying it; mine/EMP AOE handled in Game.tsx
        return { ...bullet, x, y, vx, vy, bounces, ttl, active: false, stuck: true }
      } else {
        destroyedTiles.push({ x: col, y: row })
        return { ...bullet, x, y, vx, vy, bounces, ttl, active: false }
      }
    }
  }

  if (bounces > MAX_BOUNCES) return { ...bullet, x, y, vx, vy, bounces, ttl, active: false }
  return { ...bullet, x, y, vx, vy, bounces, ttl }
}

// Applies black-hole gravity to a bullet's velocity (call BEFORE stepBullet).
// Absorbs the bullet if it's on the black hole's center tile.
export function applyBlackholeGravity(
  bullet: Bullet,
  blackholes: { col: number; row: number }[],
  tileSize: number,
): Bullet {
  if (!bullet.active || bullet.stuck) return bullet
  const GRAVITY = 0.38
  const RANGE   = 3 * tileSize
  let { vx, vy } = bullet
  for (const bh of blackholes) {
    const cx = (bh.col + 0.5) * tileSize
    const cy = (bh.row + 0.5) * tileSize
    const dx = cx - bullet.x
    const dy = cy - bullet.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < RANGE && dist > 0) {
      const strength = GRAVITY * (1 - dist / RANGE)
      vx += (dx / dist) * strength
      vy += (dy / dist) * strength
    }
    // Center tile absorption
    const bCol = Math.floor(bullet.x / tileSize)
    const bRow = Math.floor(bullet.y / tileSize)
    if (bCol === bh.col && bRow === bh.row) {
      return { ...bullet, active: false }
    }
  }
  return { ...bullet, vx, vy }
}

export function bulletHitsUFO(
  bullet: Bullet,
  ufoX: number,
  ufoY: number,
  radius: number
): boolean {
  const dx = bullet.x - ufoX
  const dy = bullet.y - ufoY
  return dx * dx + dy * dy <= radius * radius
}
