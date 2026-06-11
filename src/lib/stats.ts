import type { WeaponId } from '../types/game'

export interface LocalStats {
  wins: number
  losses: number
  draws: number
  totalDamage: number
  totalShots: number
  totalHits: number
  weaponShots: Partial<Record<WeaponId, number>>
}

const KEY = 'ufo_duel_stats'

function defaults(): LocalStats {
  return { wins: 0, losses: 0, draws: 0, totalDamage: 0, totalShots: 0, totalHits: 0, weaponShots: {} }
}

export function getStats(): LocalStats {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    return { ...defaults(), ...JSON.parse(raw) }
  } catch {
    return defaults()
  }
}

export function recordGameResult(
  result: 'win' | 'loss' | 'draw',
  myStats: { shots: number; hits: number; damage: number; weapons: Partial<Record<WeaponId, number>> }
): void {
  const s = getStats()
  if (result === 'win') s.wins++
  else if (result === 'loss') s.losses++
  else s.draws++
  s.totalDamage += myStats.damage
  s.totalShots += myStats.shots
  s.totalHits += myStats.hits
  for (const [wid, shots] of Object.entries(myStats.weapons)) {
    const existing = s.weaponShots[wid as WeaponId] ?? 0
    s.weaponShots[wid as WeaponId] = existing + (shots ?? 0)
  }
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearStats(): void {
  localStorage.removeItem(KEY)
}
