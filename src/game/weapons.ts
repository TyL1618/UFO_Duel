import type { WeaponDef, WeaponId } from '../types/game'

export const WEAPON_DEFS: WeaponDef[] = [
  { id: 'normal',    label: '普通子彈', icon: '●',  damage: 10, ammo: 0, desc: '無限彈藥，碰牆無限反彈，命中軟牆爆炸停止' },
  { id: 'split',     label: '分裂彈',   icon: '✦',  damage: 8,  ammo: 2, desc: '碰牆時分裂成三顆，各方向 ±60° 展開' },
  { id: 'pierce',    label: '穿透彈',   icon: '▶',  damage: 15, ammo: 2, desc: '穿透軟牆不破壞地形，碰硬牆反彈，射程較短' },
  { id: 'sticky',    label: '吸附雷',   icon: '◉',  damage: 20, ammo: 2, desc: '黏附軟牆、硬牆或 UFO，一回合後 3×3 範圍爆炸，每格 20 傷害，自傷減半' },
  { id: 'tracking',  label: '追蹤彈',   icon: '⊕',  damage: 20, ammo: 2, desc: '進入追蹤範圍時自動轉向敵機' },
  { id: 'shockwave', label: '衝擊波彈', icon: '◎',  damage: 25, ammo: 2, desc: '碰到任何目標觸發 5×5 爆炸：中心 25、內圈 18、外圈 14 傷害，自傷減半' },
  { id: 'burst',     label: '連射彈',   icon: '⋮',  damage: 7,  ammo: 2, desc: '連發三顆，逐一射出，每顆 7 傷害' },
  { id: 'smoke',     label: '煙霧彈',   icon: '☁',  damage: 0,  ammo: 2, desc: '碰牆或命中敵機後展開 3×3 煙霧，持續 5 回合，遮蔽敵方視野' },
  { id: 'acid',      label: '燃燒彈',   icon: '🔥', damage: 5,  ammo: 2, desc: '命中後施加燃燒：每回合 5 傷害，持續 3 回合' },
  { id: 'sniper',    label: '狙擊彈',   icon: '⊙',  damage: 15, ammo: 2, desc: '命中傷害 15，瞄準時顯示虛線彈道預覽（最多 3 段硬牆折射）' },
  { id: 'shield',    label: '護盾',     icon: '🛡', damage: 0,  ammo: 1, desc: '架起護盾，吸收最多 50 傷害，持續 5 回合或護盾耗盡為止' },
  { id: 'teleport',  label: '傳送槍',   icon: '🌀', damage: 0,  ammo: 1, desc: '在地圖上放置兩個傳送門，任何飛碟踩上其中一個即瞬移到另一個，使用一次後消失' },
  { id: 'freeze',    label: '凍結彈',   icon: '❄️', damage: 30, ammo: 2, desc: '命中後凍結目標 1 回合，整回合無法移動與射擊，護盾可阻擋凍結效果' },
  { id: 'trap',      label: '陷阱地雷', icon: '⚠️', damage: 0,  ammo: 2, desc: '在地圖格子上放置陷阱，任何飛碟踩上即觸發 60 傷害爆炸，持續 8 回合' },
  { id: 'blackhole', label: '黑洞',     icon: '🕳', damage: 0,  ammo: 1, desc: '在地圖格子放置黑洞，3×3 範圍內的子彈軌跡被引力彎曲朝向中心，進入中心格被吸收，持續 4 回合' },
  { id: 'emp',       label: '電磁脈衝', icon: '⚡', damage: 0,  ammo: 1, desc: '射出一顆電磁彈，命中 UFO 或軟牆時立即清除 5×5 範圍內所有護盾，碰硬牆正常反彈' },
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
  shield:    0,
  teleport:  0,
  freeze:    360,
  trap:      0,
  blackhole: 0,
  emp:       360,
}
