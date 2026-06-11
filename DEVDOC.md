# UFO Duel — 技術開發文件 (DEVDOC)

> 版本：v2.0  
> 最後更新：2026-06-11  
> 平台：PWA（React + Vite + TypeScript）  
> 連線：Supabase Realtime  

---

## 一、專案概述

俯視角回合制射擊遊戲。兩名玩家操控飛碟，在隨機地圖上輪流移動或射擊。子彈在硬牆與邊界無限反彈，命中軟牆則破壞。支援多人連線對戰與單機練習模式。

---

## 二、技術棧

| 層級 | 技術 |
|------|------|
| 框架 | React 18 + Vite + TypeScript |
| 渲染 | HTML5 Canvas（地圖/飛碟/子彈）+ React DOM（HUD/UI） |
| 樣式 | Tailwind CSS |
| PWA | vite-plugin-pwa（Service Worker + Manifest） |
| 連線 | Supabase Realtime（broadcast + presence） |
| 部署 | Cloudflare Pages |

---

## 三、專案資料夾結構

```
src/
├── pages/
│   ├── MainMenu.tsx        ← 主選單（創建/加入房間、單機、技能表）
│   ├── CreateRoom.tsx      ← 創建房間（顯示6位房間號、等待對手）
│   ├── JoinRoom.tsx        ← 加入房間（輸入房號）
│   ├── Loadout.tsx         ← 整裝頁面（選顏色、武器、輸入名稱）
│   ├── Game.tsx            ← 遊戲主體（所有邏輯、狀態管理）
│   └── Skills.tsx          ← 武器說明頁面
├── components/
│   ├── GameCanvas.tsx      ← Canvas 渲染（地圖/飛碟/子彈/特效）
│   ├── HUD.tsx             ← 血條、回合數、計時器
│   ├── WeaponBar.tsx       ← 底部武器選擇欄
│   └── RotatePrompt.tsx    ← 手機直屏提示
├── game/
│   ├── mapGenerator.ts     ← 地圖生成（seed-based，硬/軟牆）
│   ├── physics.ts          ← 子彈逐幀物理（stepBullet + bulletHitsUFO）
│   ├── weapons.ts          ← 武器定義（WEAPON_DEFS, WEAPON_TTL）
│   ├── constants.ts        ← TILE, BULLET_SPEED, UFO_RADIUS 等
│   └── ufo.ts              ← 飛碟移動範圍計算（getReachableCells）
├── contexts/
│   └── RoomContext.tsx     ← 全域房間狀態（room, channelRef, clearRoom）
├── lib/
│   └── supabase.ts         ← Supabase client
└── types/
    └── game.ts             ← 所有 TypeScript 型別定義
```

---

## 四、遊戲流程

```
主選單
  ├─ 單機模式 → /game/solo（Bot AI 自動出手）
  ├─ 技能說明 → /skills
  ├─ 創建房間 → /create → /loadout/:roomId（P1 role）
  └─ 加入房間 → /join → /loadout/:roomId（P2 role）
                               ↓
                     整裝頁面（選顏色、武器、名稱）
                               ↓
                     兩人都按「準備好！」
                     P1 產生地圖 seed，寫入 presence + broadcast
                     P2 從 broadcast 或 presence 取得 seed
                               ↓
                     /game/:roomId（兩人各自跳轉）
                               ↓
                     遊戲中（輪流操作）
                               ↓
                     結束畫面（15s 倒數 → 返回首頁，或再來一局）
```

---

## 五、核心狀態（GameState）

```typescript
interface GameState {
  map: GameMap                    // 地圖（tiles 二維陣列）
  ufos: { p1: UFO; p2: UFO }     // 兩台飛碟
  currentTurn: 'p1' | 'p2'       // 當前行動方
  turnNumber: number              // 第幾回合（最多 20）
  phase: 'playing' | 'ended'
  localPlayer: 'p1' | 'p2'       // 本機玩家身分
  winner: 'p1' | 'p2' | 'draw' | null
  stickyMines: StickyMine[]       // 已放置的吸附雷
  smokeClouds: SmokeCloud[]       // 活躍的煙霧雲
}

interface UFO {
  id: 'p1' | 'p2'
  name: string; color: string
  col: number; row: number        // 格子座標
  hp: number; maxHp: 100
  weapons: { id: WeaponId; ammo: 0|1|2 }[]
  dotStacks: { damage: number; turnsLeft: number }[]
  smokeLeft: number               // 剩餘煙霧回合數（已棄用，改用 smokeClouds）
  hasStickyMine: 0|1|2            // 0=無，1=即將爆炸，2=剛貼上
}

interface StickyMine {
  id: string
  col: number; row: number
  turnsLeft: number               // 2 放置時；0 時爆炸
  owner: 'p1' | 'p2'             // 記錄誰放的（自傷用）
}

interface SmokeCloud {
  id: string
  col: number; row: number        // 中心格
  turnsLeft: number               // 每回合結束遞減
  owner: 'p1' | 'p2'
}
```

---

## 六、子彈物理（physics.ts）

`stepBullet()` 每幀執行，接受 Bullet + GameMap + tileSize，回傳更新後的 Bullet，並把摧毀的格子 push 進 `destroyedTiles[]`。

**各武器在軟牆的行為：**

| 武器 | 碰到軟牆 |
|------|---------|
| normal / split / tracking / shockwave | 摧毀軟牆，active=false |
| pierce | 穿透（不破壞、不停止） |
| sticky | 貼附（active=false, stuck=true），不破壞軟牆 |
| smoke | bounces++，active=false，不破壞軟牆（animStep 見到 bounces 增加即展開雲） |
| acid / sniper / burst | 摧毀軟牆，active=false |

**硬牆碰撞：**
- 計算前幀的 col/row，只翻轉垂直於牆面的速度分量
- sticky 碰硬牆也貼附（active=false, stuck=true）

---

## 七、動畫循環（animStep in Game.tsx）

`requestAnimationFrame` 驅動，每幀：
1. 對所有 bullets 執行 `stepBullet()`，收集 `destroyedTiles`
2. 使用 `effectiveMap`（含已摧毀格）做碰撞（防止子彈跨幀穿牆）
3. 檢查 `bulletHitsUFO()`，累積 `pendingDamage` + `pendingHitTarget`
4. 處理各武器特殊邏輯：
   - **split**：第一次 bounces 增加時分裂成 3 顆
   - **tracking**：接近對手時把速度轉向對手
   - **smoke**：步進後 bounces 增加（軟牆/邊界）→ 展開 3×3 煙霧
   - **sticky**：stopped=true + 不在 UFO 上 → push 進 `pendingStickyMines`；在 UFO 上 → push 進 `pendingUFOMineTargets`
   - **shockwave**：偵測到軟牆摧毀（softHit）或硬牆反彈（hardBounced）→ 觸發 5×5 爆炸，收集 `pendingBlastZone`
5. 所有子彈停止後 → settlement：
   - 讀取所有 pending refs → 清空
   - 若有 blast zone → `setBlastZone(cells)` + 700ms 後清空
   - `setGs()` 更新地圖、HP、mines、smokeClouds
   - burst 還有剩餘 → 發射下一顆，繼續 animStep
   - 否則 `endTurn()`

**重要 refs（不需 re-render 的狀態）：**

| ref | 用途 |
|-----|------|
| `pendingTiles` | 當前動畫中摧毀的格子 |
| `pendingDamage` | 對目標 UFO 的累積傷害 |
| `pendingHitTarget` | 被打到的 UFO id |
| `pendingShooterDamage` | 對射擊方的自傷（area damage 50% 減半後） |
| `pendingBlastZone` | 爆炸影響格子（顯示覆蓋層用） |
| `pendingDotStacks` | 本回合新增的燃燒層 |
| `pendingStickyMines` | 本回合新貼上的地雷（tile 上） |
| `pendingUFOMineTargets` | 本回合新貼上飛碟的地雷 |
| `pendingSmokeClouds` | 本回合展開的煙霧 |

---

## 八、回合結算（endTurn in Game.tsx）

```
endTurn() 流程：
1. 清回合計時器
2. 計算 DOT 傷害（dotStacks 每層 -1 turnsLeft，= 0 移除）
3. 吸附雷倒數（turnsLeft--）
   → 到 0 者：3×3 爆炸，收集 mineDestroyedTiles
   → UFO 上的地雷（hasStickyMine=1）：以 UFO 為中心 3×3 爆炸
   → 爆炸傷害：20/格，命中自己 UFO 的地雷減半（owner 判斷）
4. 煙霧雲倒數（turnsLeft--），移除已失效的
5. 地圖 tiles 更新（mineDestroyedTiles 整批套用）
6. 計算勝負（血量歸零或回合 ≥ 20）
7. setGs() 更新所有狀態
8. 廣播 game_action（供對手重播動畫）
```

---

## 九、武器規格（完整）

| ID | 名稱 | 傷害 | 彈數 | 說明 |
|----|------|------|------|------|
| normal | 普通子彈 | 10 | ∞ | 無限反彈，命中軟牆爆炸 |
| split | 分裂彈 | 8×顆 | 2 | 第一次反彈分裂成 3 顆，各方向±60° |
| pierce | 穿透彈 | 15 | 2 | 穿透軟牆（不破壞），碰硬牆反彈 |
| sticky | 吸附雷 | 20/格 | 2 | 黏附軟牆/硬牆/飛碟，一回合後 3×3 爆炸（九宮格每格 20，自傷 50%）|
| tracking | 追蹤彈 | 20 | 2 | 進入敵機附近自動轉向 |
| shockwave | 衝擊波彈 | 25/18/14 | 2 | 碰任何目標觸發 5×5 爆炸（直擊 25、3×3 內圈 18、5×5 外圈 14）；摧毀範圍內所有軟牆；自傷 50% |
| burst | 連射彈 | 7×3 | 2 | 依序發射 3 顆，同角度，每顆獨立動畫 |
| smoke | 煙霧彈 | 0 | 2 | 碰牆/軟牆停止並展開 3×3 煙霧，持續 4 回合；在煙霧中的敵人對對手不可見，自己看自己半透明 |
| acid | 燃燒彈 | 5×3 回合 | 2 | 命中後每回合扣 5 點，持續 3 回合，可疊加 |
| sniper | 狙擊彈 | 15 | 2 | 瞄準時顯示最多 3 段折射虛線預覽 |

**自傷規則：** shockwave 和 sticky mine 的爆炸波及到射擊方的飛碟時，傷害乘以 0.5（`Math.floor(base * 0.5)`）。

---

## 十、連線架構（Supabase Realtime）

### Channel 生命週期

```
CreateRoom → supabase.channel('room:XXXXXX') → presence track { role:'p1' }
JoinRoom   → supabase.channel('room:XXXXXX') → presence track { role:'p2' }
Loadout    → 重建 channel（避免 double-subscribe）
             → presence track { role, loadout, seed }  ← P1 把 seed 放入 presence
Game       → 重建 channel（只監聽 broadcast）
```

### Broadcast 事件（Game.tsx）

| 事件 | 方向 | 內容 |
|------|------|------|
| `game_action` | 操作方 → 對手 | `{ kind: 'move'|'shoot'|'skip', col?, row?, angle?, weapon? }` |
| `rematch_want` | 任一方 | 表達再來意願 |
| `rematch_go` | P1 → P2 | `{ seed }` 開始新局 |
| `player_left` | 任一方 | 主動離開通知 |
| `request_sync` | F5 方 → 對手 | 請求狀態同步 |
| `game_state_sync` | 對手 → F5 方 | 完整 GameState 快照 |

### Presence 事件（Loadout.tsx）

- 每人 track `{ role, loadout, seed }`
- P2 從 P1 的 presence 讀 seed（broadcast 錯過時的備援）
- Game channel presence 用於斷線偵測（`oppEverJoinedRef` 防誤判）

### 斷線處理

- **正常離開**：`player_left` broadcast → 對手看到「對手已離開」
- **非正常斷線**：presence leave 事件 → 啟動 60s 倒數（`disconnectCountdown`）；對手回來則取消
- **防誤判**：`oppEverJoinedRef`（對手尚未加入 Game channel 前的 leave 事件忽略）；`rebuiltAt` grace period 3s（自己重建 channel 時不算斷線）

---

## 十一、地圖系統

- 尺寸：20×11 格（TILE = 48px → 960×528px canvas）
- seed-based 程序生成（兩人 seed 相同 → 地圖完全一致）
- 地形：`hard`（永久）、`soft`（可破壞）、`empty`（可行走）
- 飛碟生成：P1 左側、P2 右側，確保出生點為 empty
- 3×3 smoke 覆蓋視覺：煙霧中的敵人不可見；自己在煙霧中呈半透明（alpha 0.35）

---

## 十二、渲染層次（GameCanvas.tsx draw() 順序）

1. 背景格線
2. 地圖 tiles（hard = 藍色 / soft = 棕色）
3. 煙霧雲（對手的雲：不透明灰色；自己的雲：淡綠色提示）
4. Blast zone 覆蓋層（爆炸後 700ms 顯示）
   - tier 1（直擊格）：`rgba(255,30,0,0.50)`
   - tier 2（3×3 內圈）：`rgba(255,100,0,0.35)`
   - tier 3（5×5 外圈）：`rgba(255,180,30,0.22)`
5. 可移動格子（輪到自己且在移動模式）
6. UFOs（含光暈、DOT 火焰、地雷閃爍指示）
7. 地圖上的吸附雷（脈衝動畫）
8. 子彈殘影
9. 子彈本體
10. 粒子特效（tile 碎片、命中閃光、爆炸粒子）
11. 移動預覽（D-pad 虛線鬼影）
12. 狙擊彈軌跡預覽（最多 3 段折射）
13. 瞄準箭頭

---

## 十三、音效系統

| 音效 | 觸發時機 |
|------|---------|
| `playShoot` | 射出子彈 |
| `playHit` | 命中 UFO |
| `playExplosion` | 吸附雷/衝擊波爆炸 |
| `playSmoke` | 煙霧展開 |
| `playGameEnd` | 遊戲結束 |

使用 Web Audio API（`useAudio` hook），預載 base64 音效。

---

## 十四、結束畫面

- 勝負結果 + 傷害/命中/爆炸統計表
- 15 秒倒數自動返回首頁（`endTimer` state + `setInterval`）
- 多人：「再來一局」按鈕 → `rematch_want` broadcast，P1 收齊雙方意願後發 `rematch_go` + 新 seed
- 單機：「再來一局」按鈕 → 直接 `buildInitialState(newSeed)` 重置

**Timer 設計說明：**
- `endTimer` 在 `rematch_go` 接收時會 reset 到 15（為第二局結束做準備）
- 兩局連打時，第二局結束後 timer 從 15 開始是正確行為
- 潛在邊角案例：timer 恰好歸零（`leaveGame` 的 120ms timeout 已啟動）時 `rematch_go` 到達，會重置遊戲但 navigation timeout 仍會發射 → 待修

---

## 十五、單機模式（Solo）

- roomId = `'solo'`，`isSolo = true`
- P2 改由 Bot AI 控制：`endTurn` 後 1200ms 延遲，以隨機角度對 P1 射出普通子彈
- 使用固定 loadout（`SOLO_LOADOUT` / `DEFAULT_P2`）
- 不使用 Supabase channel
- 結束畫面有直接「再來一局」按鈕

---

## 十六、已知待修

| 項目 | 說明 |
|------|------|
| `leaveGame` race condition | timer 歸零後 120ms 內 `rematch_go` 到達，navigation 仍會發射 |
| `endTimer` useEffect 未 reset | 若 `gs.phase` 在 'ended' 時 effect 跑兩次，timer 不會從 15 開始（目前靠 `rematch_go` 的 `setEndTimer(15)` 來補正）|
| 酸蝕/狙擊彈 | 邏輯框架已定義，部分效果待確認平衡 |
