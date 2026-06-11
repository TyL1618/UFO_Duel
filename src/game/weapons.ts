import type { WeaponDef, WeaponId } from '../types/game'

export const WEAPON_DEFS: WeaponDef[] = [
  { id: 'normal',    label: '普通子彈', icon: '●',  damage: 10, ammo: 0 },
  { id: 'split',     label: '分裂彈',   icon: '✦',  damage: 8,  ammo: 2 },
  { id: 'pierce',    label: '穿透彈',   icon: '▶',  damage: 15, ammo: 2 },
  { id: 'sticky',    label: '吸附雷',   icon: '◉',  damage: 20, ammo: 2 },
  { id: 'tracking',  label: '追蹤彈',   icon: '⊕',  damage: 20, ammo: 2 },
  { id: 'shockwave', label: '衝擊波彈', icon: '◎',  damage: 25, ammo: 2 },
  { id: 'burst',     label: '連射彈',   icon: '⋮',  damage: 7,  ammo: 2 },
  { id: 'smoke',     label: '煙霧彈',   icon: '☁',  damage: 0,  ammo: 2 },
  { id: 'acid',      label: '燃燒彈',   icon: '🔥', damage: 5,  ammo: 2 },
  { id: 'sniper',    label: '狙擊彈',   icon: '⊙',  damage: 15, ammo: 2 },
]

export const WEAPON_MAP: Record<WeaponId, WeaponDef> = Object.fromEntries(
  WEAPON_DEFS.map(w => [w.id, w])
) as Record<WeaponId, WeaponDef>

// TTL in frames at 60fps. Pierce is shorter because soft walls can't stop it.
export const WEAPON_TTL: Record<WeaponId, number> = {
  normal:    360,
  split:     360,
  pierce:    300,
  sticky:    360,
  tracking:  360,
  shockwave: 360,
  burst:     360,
  smoke:     360,
  acid:      360,
  sniper:    360,
}
