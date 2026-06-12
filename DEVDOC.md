# UFO Duel — 技術開發文件 (DEVDOC)

> 版本：v2.2 (Round 11)  
> 最後更新：2026-06-12  
> 平台：PWA（React + Vite + TypeScript）  
> 連線：Supabase Realtime  

---

## 一、專案概述

俯視角回合制射擊遊戲。2–4 名玩家操控飛碟，在隨機地圖上輪流移動或射擊。子彈在硬牆與邊界無限反彈，命中軟牆則破壞。支援 1v1 連線、多人 FFA（3–4 人混戰）、快速配對與單機練習模式。

**核心架構為 N 人泛化（Round 8）**：玩家身分為 `PlayerId = 'p1' | 'p2' | 'p3' | 'p4'`，回合順序由 `players: PlayerId[]` 決定，飛碟存於 `ufos: { [K in PlayerId]?: UFOState }`。2 人遊戲（單機 / 1v1）行為與舊版完全一致；FFA 模式下死亡玩家 `isDead=true` 留場觀戰並從回合輪替中跳過。

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
│   ├── MainMenu.tsx        ← 主選單（私人連線、單機、技能表、快速配對）
│   ├── PrivateLobby.tsx    ← 私人連線大廳（1v1 / 多人 FFA / 加入房號）
│   ├── CreateRoom.tsx      ← 創建 1v1 房間（顯示6位房號、等待對手）
│   ├── CreateRoomMulti.tsx ← 創建多人 FFA 房（選 3/4 人、等待滿員）
│   ├── JoinRoom.tsx        ← 加入房間（輸入房號，自動分配 p2..pN 空位）
│   ├── Matchmaking.tsx     ← 快速配對（presence 撮合，低 UUID 當 P1）
│   ├── Loadout.tsx         ← 整裝頁面（N 人同步：選顏色、武器、名稱）
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
  ├─ 單機模式   → /game/solo（Bot AI 自動出手）
  ├─ 技能說明   → /skills
  ├─ 快速配對   → /matchmaking → /loadout/:roomId
  └─ 私人連線   → /private
        ├─ 1v1 對戰     → /create        → /loadout/:roomId（P1）
        ├─ 多人 FFA     → /create-multi  → 選 3/4 人 → 等待滿員 → /loadout/:roomId（P1）
        └─ 輸入房號加入 → /join          → /loadout/:roomId（自動分配 p2..pN）
                               ↓
                     整裝頁面（選顏色、武器、名稱）
                               ↓
                     全部 N 人都按「準備好！」
                     P1 產生地圖 seed，寫入 presence + broadcast
                     其餘玩家從 presence/broadcast 取得 seed
                     各自收集到 N 份 loadout + seed 後跳轉
                               ↓
                     /game/:roomId（每人各自跳轉）
                               ↓
                     遊戲中（依 players[] 順序輪流；FFA 死亡者留場觀戰）
                               ↓
                     結束畫面（15s 倒數 → 返回首頁，或再來一局）
```

**返回導覽：** 私人連線子頁（創建 1v1 / 創建 FFA / 加入房號）的返回按鈕一律回到 `/private`，私人連線頁返回首頁 `/`。

---

## 五、核心狀態（GameState）

```typescript
type PlayerId = 'p1' | 'p2' | 'p3' | 'p4'

interface GameState {
  players: PlayerId[]                 // 回合順序（2 人 = [p1,p2]，FFA = 四角）
  map: GameMap                        // 地圖（tiles 二維陣列）
  ufos: { [K in PlayerId]?: UFOState } // 飛碟（可選 record，依 players 取用）
  currentTurn: PlayerId               // 當前行動方
  turnNumber: number                  // 第幾回合（最多 25）
  phase: 'playing' | 'ending' | 'ended'  // 'ending'：5s 死亡特寫；'ended'：結算畫面
  localPlayer: PlayerId               // 本機玩家身分
  winner: PlayerId | 'draw' | null
  stickyMines: StickyMine[]           // 已放置的吸附雷
  smokeClouds: SmokeCloud[]           // 活躍的煙霧雲
  stormBurnedTiles: { col; row }[]    // 縮圈已燒毀的地磚（危險地形）
  healthPacks: HealthPack[]           // 場上血包（每 5 回合生成一個）
}

interface UFOState {
  id: PlayerId
  name: string; color: string
  col: number; row: number            // 格子座標
  hp: number; maxHp: 100
  weapons: { id: WeaponId; ammo: number }[]
  dotStacks: { damage: number; turnsLeft: number }[]
  smokeLeft: number                   // （已棄用，改用 smokeClouds）
  hasStickyMine: number               // 倒數回合數，0=無，1=本回合爆炸
  stickyMineOwner: PlayerId | null    // 貼附飛碟的地雷是誰放的（自傷判斷）
  isDead: boolean                     // FFA：血量歸零後留場觀戰、跳過其回合
  shieldHp: number                    // 護盾剩餘 HP（最多 50）；0 = 無護盾
  shieldTurnsLeft: number             // 護盾剩餘回合數
}

interface HealthPack {
  id: string
  col: number; row: number
}

interface StickyMine {
  id: string
  col: number; row: number
  turnsLeft: number
  owner: PlayerId                     // 記錄誰放的（自傷用）
}

interface SmokeCloud {
  id: string
  col: number; row: number            // 中心格
  turnsLeft: number                   // 每回合結束遞減
  owner: PlayerId
}
```

**N 人回合輪替（endTurn）：** 以 `players.indexOf(currentTurn)` 取得目前索引，往後找下一位「非 isDead」玩家。回合數僅在輪到 `players` 最後一位之後 +1。勝負判定：存活數 ≤ 1 或回合 > 25 時，以血量最高者為勝（同高為平手）。

**N 人命中判定（animStep）：** 子彈每幀對**所有存活對手**（排除射手與 isDead 者）逐一做 `bulletHitsUFO` 檢測，命中誰就傷害誰 —— 修正 FFA 中子彈只認單一「最近目標」、會穿過其他玩家的 bug。追蹤彈仍以最近存活對手作為導引方向。

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
| smoke | 煙霧彈 | 0 | 2 | 碰硬牆反彈停止或命中敵機機身展開 3×3 煙霧，持續 5 回合；在煙霧中的敵人對對手不可見，自己看自己半透明 |
| acid | 燃燒彈 | 5×3 回合 | 2 | 命中後每回合扣 5 點，持續 3 回合，可疊加 |
| sniper | 狙擊彈 | 15 | 2 | 瞄準時顯示最多 3 段折射虛線預覽 |
| shield | 護盾 | — | 1 | 點選後彈出確認視窗；啟用後吸收最多 50 傷害，持續 5 回合（以飛碟行動計算）；HUD 顯示剩餘護盾 HP；Canvas 顯示藍色光環 |

**自傷規則：** shockwave 和 sticky mine 的爆炸波及到射擊方的飛碟時，傷害乘以 0.5（`Math.floor(base * 0.5)`）。

---

## 十、連線架構（Supabase Realtime）

### Channel 生命週期

```
CreateRoom      → channel('room:XXXXXX') → presence track { role:'p1' }
CreateRoomMulti → channel('room:XXXXXX') → presence track { role:'p1', playerCount }
JoinRoom        → channel('room:XXXXXX') → 讀 P1 的 playerCount，分配下一個空位
                  → presence track { role: 'p2'|'p3'|'p4' }
Loadout         → 重建 channel（避免 double-subscribe）
                  → presence track { role, loadout, seed }  ← P1 把 seed 放入 presence
Game            → 重建 channel（只監聽 broadcast）
```

**角色分配（JoinRoom）：** 讀 presence 中 `role==='p1'` 的 `playerCount`（1v1 房未帶此欄 → 預設 2），計算 `['p1'..'pN']` 中尚未被佔用的最小空位指派給加入者；無空位則「房間已滿」。

**快速配對（Matchmaking）：** 全域 channel `matchmaking:global`，每人 track `{ uuid }`。較小 UUID 者為 P1，產生房號後**同時** `track({ matchRoom, matchWith })`（presence，可靠）與 broadcast（快速），並立即自我撮合。對方從 broadcast **或** presence fallback 取得房號。
> ⚠ 歷史 bug：Supabase broadcast 預設 `self:false`，提案方收不到自己的 broadcast → 原本會卡在「尋找中」。現由提案方自我 resolve + presence fallback 雙保險修正。

### Broadcast 事件（Game.tsx）

| 事件 | 方向 | 內容 |
|------|------|------|
| `game_action` | 操作方 → 其他人 | `{ kind: 'move'|'shoot'|'skip'|'shield'|'smokeCloud', col?, row?, angle?, weapon? }` |
| `rematch_want` | 任一方 | 表達再來意願 |
| `rematch_go` | P1 → 其他人 | `{ seed }` 開始新局 |
| `player_left` | 任一方 | `{ role }` 主動離開通知 |
| `request_sync` | F5 方 → 其他人 | 請求狀態同步 |
| `game_state_sync` | 其他人 → F5 方 | 完整 GameState 快照 |

> `game_action` 收訊端以 `currentTurn` 作為發訊者身分（只有當前回合者會行動並廣播），天然支援 N 人。

### Presence 事件（Loadout.tsx）

- 每人 track `{ role, loadout, seed }`；presence 為 loadout 的真實來源（broadcast 為加速備援）
- 各玩家收集到 `players` 全員的 loadout + P1 的 seed 後，各自獨立跳轉
- Game channel presence 用於斷線偵測（`oppEverJoinedRef` 防誤判）

### 斷線處理

- **1v1（playerCount = 2）：**
  - 正常離開：`player_left` broadcast → 對手看到「對手已離開」
  - 非正常斷線：presence leave → 啟動 60s 倒數（`disconnectCountdown`）；對手回來則取消
- **FFA（playerCount > 2）：** 任一玩家離開（`player_left` broadcast 或 presence leave）→ 呼叫 `eliminatePlayer(role)` 將其 `isDead=true` 淘汰；若正輪到該玩家則立即推進回合，其餘玩家繼續對戰，並以橫幅通知「XX 已離開戰場」（`eliminatedNotice`，4 秒）。
  > 限制：FFA 中 F5 重整目前會被視為離開而遭淘汰（缺少 1v1 的重連寬限）。
- **防誤判：** `oppEverJoinedRef`（對手尚未加入 Game channel 前的 leave 忽略）；`rebuiltAt` grace period 3s（自己重建 channel 時不算斷線）

---

## 十一、地圖系統

- 尺寸：20×12 格（TILE = 48px → 960×576px canvas）
- seed-based 程序生成（所有玩家 seed 相同 → 地圖完全一致）
- 地形：`hard`（永久）、`soft`（可破壞）、`empty`（可行走）
- 飛碟生成：
  - **2 人**：`pickSpawn(map, 'left'|'right')` — P1 左、P2 右
  - **FFA（3–4 人）**：`pickSpawnN(map, pid)` — 四角（p1 左上、p2 右下、p3 左下、p4 右上）
- 3×3 smoke 覆蓋視覺：煙霧中的敵人不可見；自己在煙霧中呈半透明（alpha 0.35）
- 縮圈（第 10 回合起）：每 2 回合清除最外一圈牆並標記為 `stormBurnedTiles`；玩家於燒毀地磚結束回合 -5 HP

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

- **死亡/勝利特寫（'ending' 階段）：** 遊戲結束時先進入 `phase: 'ending'`，Canvas 上覆蓋半透明勝者/平手文字並倒數 5 秒，再切換到 `phase: 'ended'` 進入結算畫面。
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

## 十六、行動裝置版面與視窗鎖定

### 視窗高度鎖定（main.tsx + index.css）

問題：Android PWA **強制橫屏**時，系統狀態列跑到實體螢幕的長側（右側），下拉狀態列會**同時**喚出底部導覽列，兩者一起出現使 `window.innerHeight` 縮小 → 遊戲畫面被擠壓。

解法：`main.tsx` 只在 `innerHeight` **變大**時更新 `--app-h`（取歷來最大值 = 系統列收合時的高度），縮小一律忽略。如此系統列出現時只是**疊在**畫面上，不觸發 reflow。
- `index.css`：`html { height: var(--app-h, 100lvh); overflow: hidden }`（fallback 用 `lvh` = large viewport height = 系統列收合狀態）
- `body { position: relative }` + `#root { position: absolute }`：讓 `#root` 錨定 body 尺寸而非 visual viewport
- `orientationchange` 時歸零 `--app-h` 再延遲 300ms 重新量測
- 桌機（`min-width: 768px`）走另一套：`#root` 用 `aspect-ratio: 960/540` 置中

### 霓虹地圖邊框對齊 + 方格保持正方（GameCanvas.tsx）

問題：手機上霓虹邊框比實際地圖寬（邊框畫在會撐滿面板的容器上）。改用 CSS `aspect-ratio` 又會在兩軸都受限時把方格拉成長方形（地圖扁掉）。

解法：用 `ResizeObserver` 量測可用區域，**在 JS 計算能容納的最大「地圖比例盒」**（`min(cw, ch*ratio)`），把該尺寸（px）套在 neon 邊框上，canvas `width/height:100%` 填滿。如此：
- 方格永遠正方（不會被拉伸變形）
- 邊框精準貼齊地磚邊界
- 若有剩餘空間，留成對稱留白（置中），不硬拉地圖
- 用 `useLayoutEffect` 首次量測，避免首幀塌陷閃爍

### 觸控射擊取消（GameCanvas.tsx handlePointerUp）

問題：手指往地圖邊界回拉射擊時，超出 canvas 範圍即被當成取消，導致貼邊角度射不出去。

解法：`setPointerCapture` 已確保畫面外仍持續追蹤，超界座標算出的角度仍正確 → 移除 `outsideCanvas` 取消判定，只保留「鬆手點落在飛碟正上方（< 0.7 格）」時取消（角度無意義）。

### 移動 D-pad 可跨牆（ufo.ts + Game.tsx）

飛碟移動會「飛越」牆壁，故牆壁不應擋住方向鍵。拆成兩組格子：
- `getReachableCells`：可**降落**的格子（範圍內、邊界內、且為 empty）→ 藍色高亮 + 確認鍵驗證
- `getSteppableCells`：可**經過**的格子（範圍內、邊界內，**忽略牆壁**）→ D-pad 方向鍵可跨過牆壁移到後方空格

確認鍵（`canConfirmMove`）僅在預覽格為合法降落點（empty）時可按，否則顯示「不可停留」並 disabled。

### HUD 玩家識別（HUD.tsx）

名稱與 HP 數字一律用玩家自己的顏色（與飛碟、血條一致），加上 `text-shadow` 光暈提高對比；當前回合者光暈加強並顯示 ▶/◀ 箭頭，死亡者整體變暗。

---

## 十七、血包系統（Round 11）

每 5 回合（turnNumber = 5, 10, 15, 20, 25），在最後一位玩家結束回合後，於地圖上隨機空格生成一個血包：
- **確定性亂數：** `mulberry32(mapSeed + turnNumber * 9999)` → 兩台裝置產生同樣位置
- **選格邏輯：** 找出目前所有 `empty` 且未被玩家佔據、未有現存血包的格子（row-major 順序），用亂數選一格
- **自動拾取：** 玩家移動到血包格時自動 +30 HP（上限 100），移除該血包；對手移動的拾取在 `game_action 'move'` 處理端同步計算
- **無期限：** 血包不會消失（最多 25 回合 → 最多 5 個）
- **Canvas 渲染：** 綠色十字 + 外框 + 脈衝光暈（`GameCanvas.tsx`）

## 十八、護盾武器（Round 11）

| 屬性 | 值 |
|------|----|
| ID | `shield` |
| 彈數 | 1 |
| 啟用方式 | 選取後點擊/射擊 → 彈出「是否啟用護盾？」確認視窗 |
| 效果 | 護盾 HP = 50，每回合（護盾持有者自己的回合）遞減 1 回合 |
| 傷害吸收 | 受傷時先扣護盾 HP，護盾耗盡後剩餘傷害才扣血 |
| 結束條件 | 護盾 HP 歸零 **或** 5 回合到期（`shieldTurnsLeft = 0`） |
| HUD | `🛡 {shieldHp}` 藍色顯示於玩家血量旁 |
| Canvas | 飛碟周圍脈衝藍色光環，透明度隨護盾 HP 比例變化 |
| 多人同步 | 廣播 `{ kind: 'shield' }`，對手端套用相同狀態 |

## 十九、煙霧彈同步修正（Round 11）

**原有 bug：** 兩台裝置各自執行子彈物理模擬，浮點數若有細微差異，煙霧著陸位置不同 → 一方有煙、另一方無煙。

**修正架構（射擊方為權威）：**
1. 射擊方在 `handleShoot` 同步呼叫 `computeSmokeLanding()`（同步模擬物理直到第一次牆壁反彈或機身命中）取得精確位置
2. 射擊方廣播 `{ kind: 'smokeCloud', col, row }` **先於** `{ kind: 'shoot' }`（Supabase channel 依序處理）
3. 接收方收到 `smokeCloud` 事件 → 存入 `pendingBroadcastSmoke` ref
4. `animStep` 處理對手煙霧彈時（`b.owner !== localPlayer`）**跳過**本地煙霧雲部署
5. Animation 結算（所有子彈停止）時從 `pendingBroadcastSmoke` 取得位置並套用

**機身命中（新功能）：** 煙霧彈擊中敵機機身時，在敵機所在格展開煙霧（不再穿透）。

**持續時間：** 設定 `turnsLeft: 6`，在 `endTurn` 立即遞減一次，實際持續 5 個完整回合。

**單機模式：** `isSoloRef.current === true` 時所有子彈（包含 bot）走本地模擬路徑，不受上述架構影響。

## 二十、Android 返回按鈕 + Web 關閉警告（Round 11）

| 頁面 | 行為 |
|------|------|
| 主選單 | `popstate` → 顯示「確定要離開遊戲？」確認視窗（`window.close()`） |
| 遊戲中 | `popstate` → 顯示「確定要離開遊戲？」確認視窗（`leaveGame()`） |
| 其他頁面 | 不攔截，瀏覽器正常返回 |
| 所有遊戲頁（開中） | `beforeunload` → 瀏覽器原生關閉確認 |

**實作：** 頁面掛載時 `window.history.pushState(null, '', location.pathname)`，`popstate` 監聽器立即 re-push 相同 state（防止返回成功）並顯示確認對話框。`leaveGame` 改用 `navigate('/', { replace: true })` 防止返回後重入遊戲。

## 二十一、更新日誌（Round 11）

- 新增 `src/lib/changelog.ts`：`CHANGELOG: ChangelogEntry[]` 陣列，由 Claude 每輪部署時更新
- 主選單底部「更新日誌」按鈕 → 開啟 Modal，列出所有版本變更紀錄
- Modal 樣式：neon 標題、捲動列表、版本號（綠色）+ 日期（灰色）+ 條列變更

---

## 二十二、已知待修

| 項目 | 說明 |
|------|------|
| `leaveGame` race condition | timer 歸零後 120ms 內 `rematch_go` 到達，navigation 仍會發射 |
| `endTimer` useEffect 未 reset | 若 `gs.phase` 在 'ended' 時 effect 跑兩次，timer 不會從 15 開始（目前靠 `rematch_go` 的 `setEndTimer(15)` 來補正）|
| FFA F5 重整 | 多人模式重整會被當成離開而遭淘汰（無 1v1 的 60s 重連寬限）|
| FFA 再戰 | 目前再戰流程沿用 1v1 的「雙方意願」邏輯，尚未完整泛化到 N 人 |
| 酸蝕/狙擊彈 | 邏輯框架已定義，部分效果待確認平衡 |
