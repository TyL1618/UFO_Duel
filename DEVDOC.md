# UFO Duel — 技術開發文件 (DEVDOC)

> 版本：v3.6 (Round 24.2)  
> 最後更新：2026-06-14  
> 平台：PWA（React + Vite + TypeScript）  
> 連線：Supabase Realtime  

---

## 〇、開發協作守則（最高優先，AI 助手必讀）

> **守則 1 — 預設只討論，不動工。**
> 只要用戶**沒有明確說「動工 / 開始 / 改吧 / 修」**，就一律**只做分析與提議，不得修改任何 code**。
> 用戶描述 bug、提出需求、列出問題清單，**那都只是討論**，不代表授權動手。判斷不確定時，先給分析或先問，**絕不擅自改檔**。
>
> **守則 2 — 一旦動工，強制收尾（缺一不可）：**
> 1. 遊戲內更新日誌 [`changelog.ts`](src/lib/changelog.ts)
> 2. 技術文件 `DEVDOC.md`
> 3. `git push`

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
│   ├── MainMenu.tsx        ← 主選單（私人連線、單機、技能表、快速配對、操控說明）
│   ├── PrivateLobby.tsx    ← 私人連線大廳（1v1 / 多人 FFA / 加入房號）
│   ├── CreateRoom.tsx      ← 創建 1v1 房間（可選密碼、顯示6位房號、等待對手）
│   ├── CreateRoomMulti.tsx ← 創建多人 FFA 房（選 3/4 人、可選密碼、等待滿員）
│   ├── JoinRoom.tsx        ← 加入房間（房號+密碼驗證；觀戰加入快捷鍵）
│   ├── Matchmaking.tsx     ← 快速配對（presence 撮合，低 UUID 當 P1）
│   ├── Profile.tsx         ← 建立角色頁（名稱 + 飛碟顏色；進房後第一頁，R22）
│   ├── Loadout.tsx         ← 整裝頁面（武器：隨機共識 / 自選兩階段；N 人同步；P1 可踢人）
│   ├── Game.tsx            ← 遊戲主體（所有邏輯、狀態管理）
│   ├── Spectate.tsx        ← 觀戰頁（read-only，request_sync 輪詢）
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
  ├─ 單機模式   → /game/solo（Bot AI 自動出手；不經 profile/ban/loadout）
  ├─ 技能說明   → /skills
  ├─ 快速配對   → /matchmaking → /profile/:roomId
  └─ 私人連線   → /private
        ├─ 1v1 對戰     → /create        → [可選密碼] → /profile/:roomId（P1）
        ├─ 多人 FFA     → /create-multi  → 選 3/4 人 → [可選密碼] → /profile/:roomId（P1）
        ├─ 輸入房號加入 → /join          → [密碼驗證] → /profile/:roomId（自動分配 p2..pN）
        └─ 觀戰加入    → /join          → [輸入房號後可點「觀戰加入」] → /spectate/:roomId
                               ↓
                     /profile/:roomId — 建立角色（名稱 + 飛碟顏色），各玩家進房後先各自設定（R22）
                               ↓
                     /ban/:roomId — 各禁用一種武器
                               ↓
                     /loadout/:roomId — 武器決策（R22 兩階段）：
                       階段1：全員表決「隨機一致 / 自己挑選」
                         · 全員同意隨機 → P1 抽 4 把共享武器（排除禁用）→ weaponReel=true
                         · 任一人選自選 → 全員進自選清單，各選 4 把
                       各自收集到 N 份 loadout + P1 的 seed 後 → 3 秒倒數
                               ↓
                     /map-reveal/:roomId — 拉霸機（R22 兩段）：
                       weaponReel=true 時先轉 4 個武器轉輪，再轉地圖轉輪
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
| split | 分裂彈 | 11×顆 | 2 | 第一次反彈分裂成 3 顆，各方向±60°（R22：8→11）|
| pierce | 穿透彈 | 15 | 2 | 穿透軟牆（不破壞），碰硬牆反彈 |
| sticky | 吸附雷 | 20/格 | 2 | 黏附軟牆/硬牆/飛碟，一回合後 3×3 爆炸（九宮格每格 20，自傷 50%）|
| tracking | 追蹤彈 | 20 | 2 | 進入敵機附近自動轉向 |
| shockwave | 衝擊波彈 | 25/18/14 | 2 | 碰任何目標觸發 5×5 爆炸（直擊 25、3×3 內圈 18、5×5 外圈 14）；摧毀範圍內所有軟牆；自傷 50% |
| burst | 連射彈 | 9×3 | 2 | 依序發射 3 顆，同角度，每顆獨立動畫（R22：7→9）|
| smoke | 煙霧彈 | 0 | 2 | 碰硬牆反彈停止或命中敵機機身展開 3×3 煙霧，持續 5 回合；在煙霧中的敵人對對手不可見，自己看自己半透明 |
| acid | 燃燒彈 | 6×3 回合 | 2 | 命中後每回合扣 6 點，持續 3 回合，可疊加（R22：5→6）|
| sniper | 狙擊彈 | 15 | 2 | 瞄準時顯示最多 3 段折射虛線預覽 |
| shield | 護盾 | — | 1 | 點選後彈出確認視窗；啟用後吸收最多 50 傷害，持續 5 回合；HUD 顯示剩餘 HP；Canvas 顯示弧形進度條 |
| teleport | 傳送槍 | 0 | 1 | 點兩格放置 A/B 傳送門；任何飛碟踩上即瞬移，同時移除兩門 |
| freeze | 凍結彈 | 15 | 2 | 命中後凍結目標 1 回合（整回合不可移動與射擊），護盾可阻擋凍結效果，Canvas 顯示冰藍光環（R22：傷害 30→15）|
| trap | 陷阱地雷 | 0→40 | 3 | 點格放置；任何飛碟踩上觸發 40 傷害爆炸（自傷 20）；持續 8 回合（R22：傷害 60→40、彈藥 2→3）|
| blackhole | 黑洞 | 0 | 1 | 點格放置；3×3 範圍引力彎曲子彈軌跡；進入中心格被吸收；持續 4 回合 |
| emp | 電磁脈衝 | 0 | 1 | 射出一顆子彈，命中 UFO 或軟牆時即時清除 5×5 範圍內所有護盾；碰硬牆正常反彈 |

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
- **FFA（playerCount > 2）：** presence leave → 啟動 60s 重連寬限計時器（`ffaReconnectTimers.current[role]`），期間顯示「XX 已斷線，60s 後淘汰」橫幅，遊戲繼續（回合計時器自動跳過斷線者）；計時到期才呼叫 `eliminatePlayer(role, 'disconnect')`；若玩家在時間內重連則 clearTimeout 並顯示「XX 已重新連線」。主動離開（`player_left` broadcast）→ 立即淘汰並顯示「XX 已離開戰場」。
- **防誤判：** `oppEverJoinedRef`（對手尚未加入 Game channel 前的 leave 忽略）；`rebuiltAt` grace period 3s（自己重建 channel 時不算斷線）

---

## 十一、地圖系統

- 尺寸：20×12 格（TILE = 48px → 960×576px canvas）
- seed-based 程序生成（所有玩家 seed 相同 → 地圖完全一致）
- 地形：`hard`（永久）、`soft`（可破壞）、`empty`（可行走）、`laser`（雷射：只有飛碟不可穿越，子彈可通過）
- **地圖類型（Round 12）：** `seed % 3` 決定 → 0=standard、1=laser、2=fortress
  - **standard：** 隨機硬/軟牆，兩側 3 欄清空
  - **laser：** 同隨機牆 + 中央 cols 9–10 全行設為 `laser`；飛碟無法停留，但子彈在 physics 中對 `laser` tile 不做碰撞
  - **fortress：** 四角各有 1 個硬牆空心碉堡（含 2 格開口），中央隨機軟/硬牆，生成點在碉堡內安全區
- 飛碟生成：
  - **2 人**：`pickSpawn(map, 'left'|'right')` — P1 左、P2 右
  - **FFA（3–4 人）**：`pickSpawnN(map, pid)` — 四角（p1 左上、p2 右下、p3 左下、p4 右上）
- 3×3 smoke 覆蓋視覺：煙霧中的敵人不可見；自己在煙霧中呈半透明（alpha 0.35）
- 縮圈（第 10 回合起）：每 2 回合清除最外一圈的 `hard`/`soft` 牆並標記為 `stormBurnedTiles`；`laser` 牆不受縮圈影響（永久存在）；玩家於燒毀地磚結束回合 -5 HP

---

## 十二、渲染層次（GameCanvas.tsx draw() 順序）

1. 背景格線
2. 地圖 tiles（hard = 藍色 / soft = 棕色 / **laser = 青色霓虹脈衝**）
3. 煙霧雲（對手的雲：不透明灰色；自己的雲：淡綠色提示）
4. Blast zone 覆蓋層（爆炸後 700ms 顯示）
5. 可移動格子（輪到自己且在移動模式）
6. **傳送門放置高亮**（selectedWeapon=teleport 時，空格綠/藍色光邊）
7. **傳送門閃光**（teleportFlash 陣列）
8. UFOs（含光暈、DOT 火焰、地雷閃爍指示、護盾光環）
9. **傳送門（portals）**：脈衝綠色同心圓 + 虛線外圈
10. 血包（綠色十字 + 脈衝光暈）
11. 地圖上的吸附雷（脈衝動畫）
12. 子彈殘影
13. 子彈本體
14. 粒子特效（tile 碎片、命中閃光、爆炸粒子）
15. 移動預覽（D-pad 虛線鬼影）
16. 狙擊彈軌跡預覽（最多 3 段折射）
17. 瞄準箭頭

**HTML 疊層（canvas 外）：** 傷害浮字、**表情符號浮字（activeEmotes）**、傳送模式說明文字

---

## 十三、音效系統

| 音效 | 觸發時機 |
|------|---------|
| `playShoot` | 射出子彈 |
| `playHit` | 命中 UFO |
| `playExplosion` | 吸附雷/衝擊波爆炸 |
| `playSmoke` | 煙霧展開 |
| `playRatchet` | 地圖拉霸轉輪每滾過一格（R21；方波點擊聲，轉速越快越密） |
| `playGameEnd` | 遊戲結束 |

使用 Web Audio API（`useAudio` hook），預載 base64 音效。

---

## 十四、結束畫面

- **死亡/勝利特寫（'ending' 階段）：** 遊戲結束時先進入 `phase: 'ending'`，Canvas 執行贏家飛碟 zoom-in 動畫（80 幀移至畫面中央並放大至 2.5×）；zoom 完成後 Canvas 疊加「贏家: [名字]!」文字淡入。平手時改顯示半透明 HTML overlay「平手！」。5 秒後切換到 `phase: 'ended'` 進入結算畫面。
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
- P2 改由 Bot AI 控制（`BOT_WEAPONS = ['split', 'pierce', 'sticky', 'tracking']`）：
  - 35% 機率移動（從可到達格中，優先靠近玩家的前半段）
  - 40% 機率使用特殊武器（有彈藥時）
  - 瞄準：以 ±0.3 rad 偏差對準 P1；20% 機率隨機方向
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
| 傷害吸收 | **所有傷害來源**（子彈直擊、shockwave 爆炸、地雷爆炸、燃燒 DOT、縮圈傷害）先扣護盾 HP，耗盡後剩餘才扣血 |
| 異常狀態阻擋 | R21 起護盾同時阻擋凍結彈的凍結效果（命中前有護盾 → 不施加 `frozenTurns`） |
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

---

## 二十二、整裝室 Ready 系統（Round 12）

**舊流程：** 雙方在整裝室按 Ready → 跳轉到獨立的確認頁，再進遊戲。

**新流程（`Loadout.tsx`）：**
- 玩家名單（全員）永遠顯示，每欄即時顯示連線狀態與 Ready 狀態
- 按下「準備好！」→ 本地 `isLocked=true`，controls 加 `pointer-events-none`，廣播 `ready`
- 全員 Ready 後以 `setCountdown(3)` 啟動 3 秒倒數（全屏覆蓋層），不再跳頁
- **隨機一致武器投票（random_vote / random_loadout）：**
  - 任一玩家按「隨機一致武器」→ 廣播 `random_vote { role }`，本地加入 `randomVotes[]`
  - 全員投票後 P1 從 10 種特殊武器中隨機抽 4 種，廣播 `random_loadout { weapons }`
  - 雙端以廣播結果覆寫自己的 `selected[]`（保證相同）
  - 任何人 `isLocked` 後禁止投票

---

## 二十三、傳送門系統（Round 12）

**型別：**
```typescript
interface Portal { id: string; col: number; row: number; pairedId: string; owner: PlayerId }
// GameState.portals: Portal[]
```

**放置流程（本機玩家）：**
1. 選取傳送槍 → `handleShoot` 攔截，設 `selectedWeapon='teleport'`（不發子彈）
2. Canvas 顯示空格高亮（第 1 步綠色；選完第 1 個後，藍色提示第 2 步）
3. 點擊第 1 格 → `setTeleportFirst({col,row})`, `setTeleportStep(1)`
4. 點擊第 2 格（不同於第 1 格）→ 生成 `pA/pB` 傳送門 pair，廣播 `{ kind:'teleport', portals:[…] }`，更新 gs，`endTurn()`
5. `endTurn()` 重置 `teleportStep=0`, `teleportFirst=null`

**傳送邏輯（handleMove / opponent move handler）：**
- 飛碟最終降落座標若命中傳送門 → 改為停在 paired portal 座標，移除兩個傳送門
- 連鎖：傳送後的位置不再觸發傳送（只一次）
- 血包拾取以**傳送後**最終位置計算

**廣播同步：** 對手放置 → 接收方收到 `{ kind:'teleport', portals }` → 以相同 ID 邏輯重建兩個 Portal 物件 push 進 `gs.portals`

---

## 二十四、表情系統（Round 12）

- **基本表情集：** 😂 💀 👍 🔥 😤 🎉 😎（7 種）
- 左側面板「😊 表情」按鈕 → 開啟 4 列表情選擇器（`showEmotePicker` state）
- 選擇後廣播 `{ kind:'emote', emoji }` 並本地加入 `activeEmotes[]`
- 對手收到 `game_action { kind:'emote' }` → 加入 `activeEmotes[]`
- `activeEmotes[]` 中每個 entry 4 秒後移除（`setTimeout`）
- Canvas 以 HTML overlay（`emote-float` class，`emote-fade` 動畫）顯示於 UFO 正上方格

---

## 二十五、地圖拉霸動畫（Round 13）

- **路由：** `/map-reveal/:roomId`（`MapReveal.tsx`）
- **觸發：** `Loadout.tsx` 倒數歸 0 後導向 `/map-reveal/:roomId`（replace）；動畫結束倒數 3 秒後導向 `/game/:roomId`（replace）
- **轉盤邏輯：** `bigList = MAP_DEFS × (14+2)`，目標格 = `seed % 3`；動畫 3.2 秒
- **兩段緩動（`customEase`）：**
  - t ≤ 0.45：線性，覆蓋 82% 距離（快速旋轉）
  - t > 0.45：5 次方 ease-out，覆蓋剩餘 18%（劇烈減速）
- **DOM 直接操作：** `trackRef` via `requestAnimationFrame`，無 React re-render
- **後退守衛：** `window.history.pushState` + `popstate` listener 防止回退

## 二十六、Round 13 其他改動

- **傳送門顏色：** 改以擁有者飛碟顏色渲染（`ufos[portal.owner]?.color`），hex 轉 rgba 即時計算
- **取消傳送按鈕：** 左側面板在 `isMyTurn && selectedWeapon === 'teleport'` 時顯示「取消傳送」
- **地圖名稱提示：** 遊戲開始 2.5 秒內顯示地圖類型（標準/雷射/四堡）圖示＋名稱，`fadeInOut` CSS 動畫淡出

---

## 二十八、武器禁用系統（Round 14）

- **路由：** `/ban/:roomId`（`Ban.tsx`）
- **觸發：** 所有房間入口（CreateRoom / CreateRoomMulti / JoinRoom / Matchmaking）導向 `/ban/` 而非直接 `/loadout/`
- **流程：** 玩家選一種武器 → 確認 → 廣播 `ban_confirm { role, weapon }` → 所有人確認後顯示揭曉 2 秒 → 導向 `/loadout/`
- **30 秒自動選：** 若未選擇，倒數歸 0 時自動選已選的武器或第一個武器
- **禁用儲存：** `RoomContext.setBannedWeapons(weapons)` → `room.bannedWeapons: WeaponId[]`
- **整裝室呈現：** 被禁武器顯示 "BAN" 紅標 + `opacity-40 cursor-not-allowed`
- **單機模式：** 不走 Ban 頁面；Bot（p2）的 `weapons` 預設排除 `'teleport'`（`BOT_WEAPONS` 常數）

## 二十九、地圖系統擴充（Round 14）

- **種子取餘改為 `seed % 5`** → 0=standard, 1=laser, 2=fortress, 3=open, 4=diagonal
- **空曠地圖（open）：** 全空 tile，無任何牆壁，適合純準度對決
- **斜線地圖（diagonal）：** 反對角硬牆（左下 → 右上），2 tile 寬，三個缺口（col 4/10/16），雙方各守左上 / 右下區域
- MapReveal `MAP_DEFS` 更新為 5 種；Game.tsx 開始提示 `MAP_META` 也補全 5 種

## 三十、Round 15 — 新武器套件

### 凍結彈（freeze）

| 屬性 | 值 |
|------|----|
| ID | `freeze` |
| 傷害 | 15（命中）（R22：30→15）|
| 彈數 | 2 |
| 效果 | 命中後目標 `frozenTurns = 1`（R21 由 2 改為 1）；輪到被凍結者時**整個回合自動跳過**（移動、射擊均不可），下個回合即恢復 |
| 護盾互動 | R21 起護盾同時阻擋凍結效果：命中前 `shieldHp > 0` 時不施加 `frozenTurns`（HP 傷害仍由護盾吸收） |
| 跳過機制 | 輪到凍結玩家時顯示冰藍橫幅「❄ [名字] 被凍結，回合跳過」1.2 秒，接著自動呼叫 `endTurn(true)`；`frozenTurns` 隨每次跳過遞減 |
| Canvas | 被凍結 UFO 顯示脈衝冰藍光環 + 回合數 |

### 陷阱地雷（trap）

| 屬性 | 值 |
|------|----|
| ID | `trap` |
| 彈數 | 3（R22：2→3）|
| 放置流程 | 選取後地圖空格橘色高亮；點擊空格 → `handleTrapPlace(col,row)` → 廣播 `{ kind:'trap', col, row }` → endTurn |
| 觸發 | 任何飛碟（含擁有者）移動到該格：40 傷害；若為擁有者則 20 傷害（50%）；移除該地雷（R22：60→40）|
| 持續 | `turnsLeft: 8`，每回合結束 -1 |
| Canvas | 橘色 ⚠ 脈衝符號 + 剩餘回合數 |

### 黑洞（blackhole）

| 屬性 | 值 |
|------|----|
| ID | `blackhole` |
| 彈數 | 1 |
| 放置流程 | 選取後地圖空格紫色高亮；點擊空格 → `handleBlackholePlace(col,row)` → 廣播 `{ kind:'blackhole', col, row }` → endTurn |
| 引力範圍 | 中心 3×3 tiles（`RANGE = 3 * TILE`） |
| 物理 | `applyBlackholeGravity()` 在 `stepBullet` 之前呼叫：依距離衰減強度 (`GRAVITY=0.38`) 彎曲速度；進入中心格 → `active=false`（吸收） |
| 持續 | `turnsLeft: 4`，每回合結束 -1 |
| Canvas | 深色漩渦動畫（旋轉弧線）+ 引力範圍圓圈虛線 + 剩餘回合數 |

### 電磁脈衝（EMP）

| 屬性 | 值 |
|------|----|
| ID | `emp` |
| 傷害 | 0（傷害歸零，純護盾清除） |
| 彈數 | 1 |
| 效果 | 可自行瞄準的單顆子彈；命中後以命中格為中心 5×5 AOE 清除所有護盾（`shieldHp=0, shieldTurnsLeft=0`），傷害歸零 |
| 觸發 | `pendingEmpClearCenter.current = { col, row }` 在 settlement 套用 5×5 清除 |
| 重設計原因 | R15 四方脈衝版難以控制，R18 改為可瞄準 + 清盾功能，兼顧策略性 |

### 相關型別

```typescript
interface UFOState {
  // 新增
  frozenTurns: number   // 凍結剩餘回合，0=無凍結
}

interface TrapMine {
  id: string; col: number; row: number; owner: PlayerId; turnsLeft: number
}

interface BlackHole {
  id: string; col: number; row: number; owner: PlayerId; turnsLeft: number
}

// GameState 新增
trapMines: TrapMine[]
blackHoles: BlackHole[]
```

### GameAction 新增

```ts
| { kind: 'trap'; col: number; row: number }
| { kind: 'blackhole'; col: number; row: number }
```

---

## 三十一、已知待修

| 項目 | 說明 |
|------|------|
| `leaveGame` race condition | timer 歸零後 120ms 內 `rematch_go` 到達，navigation 仍會發射 |
| `endTimer` useEffect 未 reset | 若 `gs.phase` 在 'ended' 時 effect 跑兩次，timer 不會從 15 開始（目前靠 `rematch_go` 的 `setEndTimer(15)` 來補正）|
| FFA F5 重整 | FFA 現有 60s 重連寬限，但刷新太快仍可能被判斷為離開；1v1 無此問題 |
| FFA 再戰 | 目前再戰流程沿用 1v1 的「雙方意願」邏輯，尚未完整泛化到 N 人（R20 已改為 rematchVotes Set 全員投票）|
| 觀戰子彈動畫 | 觀戰模式只顯示快照（R20 已加入 bullets 同步，間隔縮短為 2s）|
| ~~版本不一致~~ | ✅ R21 已加版本驗證：整裝室偵測 `GAME_VERSION` 不符顯示警告橫幅 |

---

## 三十二、視覺與音效特效（Round 16）

- **擊殺特效：** 飛碟被摧毀時播放爆炸粒子動畫（`explosionEvents` state → `GameCanvas` 消費）
- **護盾受擊視覺：** 護盾被命中時顯示藍色衝擊波漣漪
- **傳送動畫：** 飛碟傳送時顯示粒子散射 + 目標位置閃光
- **傷害浮字（`damageFloats`）：** 命中時在命中位置顯示 `-XX` 紅字上浮 + 淡出（`hitEvents` 驅動）
- **移動路徑高亮：** 確認移動前預覽飛碟的移動軌跡
- **Web Audio API 音效：** 射擊、爆炸、盾牌、移動等程序性音效（無需音頻檔案）

---

## 三十三、房間管理功能（Round 17）

### 私人房間密碼
- 創房時可選填密碼（`CreateRoom.tsx` / `CreateRoomMulti.tsx`）
- 密碼存於 P1 的 Supabase presence metadata（`{ role, password?, playerCount }`）
- 加入時（`JoinRoom.tsx`）比對 `p1.password`；不符 → 回傳 `'wrong_password'` 錯誤
- 安全性：client-side enforcement，適合休閒遊戲場景

### 房主踢人
- `Loadout.tsx` P1 可見其他玩家旁的 ✕ 按鈕
- 點擊 → 廣播 `{ event: 'kick', payload: { role } }`
- 被踢者：`nav('/')` 返回首頁
- 其他人：從 `presentRoles` / `readyStates` 移除該玩家

### FFA 斷線寬限
- `ffaReconnectTimers = useRef<Partial<Record<PlayerId, ReturnType<typeof setTimeout>>>>({})`
- presence leave → 啟動 60s setTimeout → 倒數後 `eliminatePlayer(role, 'disconnect')`
- presence join → 清除計時器 → 顯示「{name} 已重新連線」橫幅 3 秒

### 觀戰模式
- 路由：`/spectate/:roomId`（`Spectate.tsx`）
- 加入方式：`JoinRoom.tsx` 中輸入 6 位房號後 → 「👁 觀戰加入」按鈕
- 技術：訂閱 `game_state_sync` 廣播快照，初始 request_sync 拉取，每 5s 輪詢
- 限制：只顯示靜態快照（子彈動畫為空陣列），read-only（`isMyTurn=false`）

### 結算統計
- MVP 稱號（最高傷害玩家）
- 命中率（命中發數 / 總發數）
- 武器使用分佈

---

## 三十四、優化與 UX 改進（Round 18）

### Bot AI 升級
- 見「十五、單機模式」一節

### 手機觸控優化
- D-pad 按鈕：`py-3 min-h-[44px]`
- 確認 / 取消 / 移動按鈕：`min-h-[44px]`
- 武器欄（`WeaponBar.tsx`）：`py-2.5 → py-3 min-h-[44px]`

### 斷線提示改進
- **1v1：** 對手斷線 overlay → "⚠ 對手已斷線"、原因文字、大型倒數計時、"秒後自動獲勝"
- **FFA：** 玩家斷線 / 重連顯示橫幅提示

### 載入畫面（Splash Screen）
- 進入 `Game.tsx` 時顯示 z-[60] overlay：`UFO DUEL` 標題 + 進度條
- `splashPhase: 'in'|'out'|'gone'`：1.1s 後淡出，1.6s 後移除 DOM

### 操作說明
- 主選單新增「操作說明」入口
- 首次啟動自動顯示 5 頁引導卡片（`localStorage` 標記已看過）

### 代碼分割（Code Splitting）
- `App.tsx`：所有路由改用 `React.lazy()` + `<Suspense fallback={<PageLoader />}>`
- `vite.config.ts`：`build.rollupOptions.output.manualChunks: { vendor: [...], supabase: [...] }`
- 初始包體積：508KB → 15KB gzip（按需載入）

---

## 三十六、Round 22 — 進場流程重構 + 武器平衡 + HUD 修正

### 建立角色頁（Profile.tsx）
- 新路由 `/profile/:roomId`，所有房間入口（create / create-multi / join / matchmaking）改為先導向此頁，再進 `/ban`
- 設定名稱 + 飛碟顏色，存入 `RoomContext.setProfile()`（持久化 localStorage）
- `RoomInfo` 新增 `profile?: { name; color }`；Loadout 不再有名稱/顏色欄，改由 profile 帶入
- 不訂閱 channel（純本地表單）；channel 在 entry 頁建立、由 Ban/Loadout 重建，presence 在導航間由 `channelRef` 維持

### 整裝室兩階段（Loadout.tsx 重構）
- `phase: 'deciding' | 'manual'`
- **階段 1（deciding）：** 每位玩家表決 `weapon_mode`（random / manual）廣播
  - 全員投票完成且全為 random → P1 從未禁用特殊武器抽 4 把，廣播 `random_loadout`；各端收到後 `commitLoadout(weapons, true)`
  - 任一人選 manual → 全員 `setPhase('manual')`
- **階段 2（manual）：** 自選 4 把 → `commitLoadout(selected, false)`
- 守衛：`resolveOnceRef`（決策只解析一次）與 `committedRef`（loadout 只提交一次）分離，避免非 P1 端收到 `random_loadout` 時被決策守衛擋掉而無法提交
- 解決舊版 bug：舊設計隨機投票與自選清單同頁，一方隨機一方自選都按準備時，隨機方湊不齊全員票、隨機永不觸發且 selected 為空 → 卡在整裝室
- `commitLoadout` 把 name/color（來自 profile）+ weapons 包成 loadout，track presence + 廣播 ready；沿用既有「收齊全員 loadout → 倒數 → 導航」機制
- 導航時 `setLoadoutData(loadouts, seed, weaponReelRef.current)` 帶入是否隨機旗標

### 武器拉霸機（MapReveal.tsx 兩段）
- `RoomInfo.weaponReel` 為 true 時，phase 由 `'weapons'` 起：4 個轉輪各轉到本機 `loadouts[myRole].weapons[i]`，沿用 `customEase` + `playRatchet`
- 武器段結束後 `setPhase('spinning')` 接地圖轉輪；`weaponReel` 為 false 時直接從地圖段開始（自選玩家已知武器，不重複轉）
- 以 `mapStartedRef` / `wStartedRef` 守衛各段只啟動一次

### 武器平衡
- 分裂 8→11、連射 7→9（`weapons.ts` 的 `damage`，命中傷害走 `WEAPON_MAP`）
- 燃燒 DOT 每回合 5→6（`weapons.ts` 顯示 + `Game.tsx` `pendingDotStacks` 的 `damage: 6`）
- 陷阱 60→40、自傷 30→20（`Game.tsx` 本機與對手 move handler 兩處 `trapDmg`）；彈藥 2→3（`weapons.ts` 顯示 + `toSlots` 中 `id === 'trap' ? 3 : 2`）
- 凍結傷害 30→15（`weapons.ts`）

### HUD 修正（HUD.tsx）
- 「▶ 對手」`waitingFor` 指示器原本條件渲染，出現/消失改變 Center 欄高度 → 每回合推擠下方 canvas 造成跳動
- 改為固定高度（13px）的 slot 永遠保留空間，僅切換內容，消除 reflow

### 版本號
- `GAME_VERSION` 升至 `'R22'`（整裝室版本驗證用）

---

## 三十七、Round 23 — 進場流程 bug 修正 + 手機拉霸機優化

### 禁用武器即時同步（Ban.tsx）
- 舊問題：選擇只存本地、按確認才廣播 `ban_confirm`，對方看不到 → 兩人可能禁同一把（浪費一個 ban）
- 改法：選擇當下即 `ch.track({ role, sel })`（presence）+ 廣播 `ban_select`；presence sync 重建 `othersSel`
- 其他玩家已選（pending 或已鎖）的武器 → 在我方畫面 disable 並顯示「對方已選」

### 整裝室隨機模式改 presence（Loadout.tsx）— 卡死根因修正
- 舊問題：`weapon_mode` 投票與 `random_loadout` 都只用 broadcast；broadcast 是一次性的，若對方尚未訂閱（仍在 ban→loadout 切換）就永遠收不到 → 一方湊不齊票，卡在「1/2 已選擇模式」，名字也很晚才顯示
- 改法：presence 成為真實來源。`pushPresence()` track `{ role, name, loadout, seed, mode, version }`；`ingest()` 從 presence 重建 modeVotes / readyStates / loadouts / seed / 版本驗證。broadcast 僅作加速
- 名稱：track 從訂閱起就帶 `name`（來自 profile），故一進整裝室即顯示對方名稱
- 隨機武器分發：P1 抽出後寫入自己 presence 的 loadout（可靠）；非 P1 在解析 effect 中讀 `loadoutsRef['p1'].weapons` 採用（broadcast `random_loadout` 僅加速）。守衛：`committedRef`（只提交一次）、`randomGenRef`（P1 只抽一次）

### 返回主選單 + room_closed（Profile / Ban / Loadout）
- 三頁皆加「← 主選單」鍵：送出 `room_closed` 廣播 → `clearRoom()` → `nav('/')`
- Ban / Loadout 監聽 `room_closed`：對手離開時自己也 `clearRoom()` 返回主選單
- Profile 無訂閱頻道（純表單），透過既有 `channelRef`（entry 頁建立、仍訂閱中）送出 room_closed

### 手機拉霸機優化（MapReveal.tsx）
- 反覆問題：手機橫向（寬夠、高擠）卻把物件垂直堆疊、輪盤太小
- 改法：
  - 輪盤尺寸依 `window.innerHeight` 計算（約 60~66% 高），`ITEM_H = clamp(74,120, vh*0.66/3)`、武器 `W_ITEM_H = clamp(66,104, vh*0.6/3)`，貼合螢幕高度
  - 玩家 chips 改 `absolute` 釘在頂端、倒數改 `absolute` 釘在右下角 → 不再佔垂直流、不擠壓輪盤
  - 地圖名稱與說明改同一行（baseline 對齊）而非再往下疊
- 武器抽取停留：新增 `weaponsResult` phase，武器轉輪停下後 hold 2.3s 顯示「🎲 你的武器：…」，再進地圖轉輪
- 動畫守衛移除：原 `wStartedRef`/`mapStartedRef` 與 StrictMode 的「mount 期 effect 雙呼叫 + cleanup 清掉 startDelay」衝突會導致 dev 下動畫不啟動；改為純 `[phase]` 依賴（每個 phase 跑一次），cleanup 同時 `cancelAnimationFrame`
- F5 韌性：MapReveal 改以 `ssRoom`（context room → localStorage 同步 fallback）取值，首次 paint 即正確（含初始 phase 判斷），並 `tryRestoreRoom` 水合 context

### 吸附雷單顆化（Game.tsx）
- 舊問題：UFO 身上的吸附雷以單一倒數 `hasStickyMine`（3→1）表示，黏第二顆直接 `hasStickyMine: 3` 覆蓋 → 第一顆倒數被重置、形同失效
- 改法：settlement 套用 `totalUFOMines` 時，僅在 `hasStickyMine === 0` 才黏附；已有雷則忽略新的（一場頂多黏一顆，維持單顆模型不做疊加）

### 拉霸機 ID 重疊修正（MapReveal.tsx）
- R23 把玩家 chips 改 `absolute` 置中於頂端，與置中的「本局地圖」標題在短螢幕上重疊
- 改為 `absolute top-3 inset-x-4 flex justify-between` → 兩個 ID 分置左右兩側，中央標題不再被擋

### iOS 移動問題（暫緩）
- 朋友回報 iOS「移動動不了」。最可能根因：[main.tsx](src/main.tsx) 的 `--app-h`「只增不減」視窗鎖定（為 Android 調校）在 iOS 可能鎖過高，配合 `overflow:hidden` 使左側面板底部的「移動/D-pad/確定」按鈕被切到可見區外
- 因無 iOS 裝置可實測、僅能臆測，**本輪不處理**，待有裝置實測再修（候選方案：改用 `svh`/`dvh` 或 iOS 改以 visualViewport 量測）

### 版本號
- `GAME_VERSION` 維持 `'R23'`（本批與 R23 同版發布，未部署前併入）

---

## 三十八、Round 24 — 技術感 / 刺激感特效（9 項，killcam 待做）

> 規劃見 [r22-r23-plan] 記憶。原規劃 10 項，本輪實作 9 項；**殺招回放 killcam（#10）暫緩**，因需在結束流程加入錄製+重播系統、風險較高，留作後續獨立實作。

### 命中卡頓 hit-stop（#2，Game.tsx animStep）
- `hitStopRef`（剩餘凍結幀）、`hitStopDoneRef`（本回合已凍過）。animStep 頂端：`hitStopRef>0` 則遞減並 re-rAF、不步進
- settlement 前的 gate：`pendingDamage>0 && !hitStopDoneRef` → 設 `hitStopRef`、re-rAF return；凍結結束後該幀無新傷害 → 正常結算
- 每次新一輪射擊（handleShoot / 對手 shoot / burst 續發）重置 `hitStopDoneRef`、`pendingLethalRef`

### 致命慢動作 + 鏡頭震幅（#1）
- 直擊命中點估算致命：`hUfo.hp - max(0, dmg - shield) <= 0` → `pendingLethalRef = true`
- 致命時 hit-stop 拉長為 14 幀（一般 4 幀）→ 慢動作感
- `isPunching` state + `.cam-punch`（scale 1→1.06→1）套在 canvas 外層，擊殺時觸發 420ms

### 計時器心跳（#3，sounds.ts + 倒數）
- `playHeartbeat()`：120→55Hz sine thump。倒數 `t<=6` 時每秒播放

### 反彈火花（#4，GameCanvas）
- `bounceRef: Map<id, bounces>`，每幀比對 `b.bounces` 增加 → `spawnBounceSparks(x,y,色)`（6 顆，owner 色/白）

### 低血量紅暈（#5）+ CRT 掃描線（#6）+ 受擊故障（#7）
- CSS：`.low-hp-vignette`（inset 紅光 box-shadow + 脈動）、`.crt-overlay`（repeating-linear-gradient 掃描線 + flicker，mix-blend multiply）、`.glitch`（translate+skew+hue-rotate）
- Game.tsx canvas 外層：永遠掛 `.crt-overlay`；`hp<=30 && playing` 掛 `.low-hp-vignette`；本機受傷時 `isGlitching` 280ms
- 外層 class 優先序：punch > glitch > shake（同一 `animation` 屬性只能一個生效，故以 className 三選一）

### 霓虹輝光（#8，GameCanvas 子彈）
- 子彈繪製加 `ctx.shadowColor/shadowBlur=18`（核心 8），暈染更濃

### 武器專屬命中特效（#9）
- `hitEvents` 加選用 `weapon`；Game.tsx 以 `pendingHitWeapon` 記錄直擊武器、結算帶入
- `spawnHitParticles(x,y,weapon)`：freeze→冰藍系、acid→火橙系、其餘→原白紅系

### 殺招回放 killcam（#10，2026-06-14 完成）
- 錄製：`shotPathRef` 在 animStep 每幀記錄主子彈座標（每輪射擊重置，上限 800 點）
- 快照：settlement 偵測 `isLethal` 時，把當前 `shotPathRef` + 射手顏色（`currentTurn` 的 color）+ 被擊者格存進 `killcamRef`
- 清除：`gs.phase==='playing' && turnNumber===1` 的 effect 清空（涵蓋所有再戰路徑）
- 顯示：[KillCam.tsx](src/components/KillCam.tsx) 在 `phase==='ended' && winner!==draw && killcamRef` 時渲染——縮小地圖（dim tiles）上以射手色描出軌跡光線 + 移動光點，到終點放環形爆炸，循環（TRACE 1.5s + BURST 0.7s + HOLD 0.5s）
- 正確性：1v1 任何擊殺即結束 → killcamRef 必為致勝一擊；FFA 最後一殺＝致勝；純超時(無人陣亡)→killcamRef 為 null → 不顯示
- 多人：雙端都在本機重播該致命射擊動畫，故都會記到 killcamRef，雙方結算都看得到
- 修正（2026-06-14）：
  - 軌跡改為**依子彈 id 分別記錄**（`bulletPathsRef: Map`），命中致命時取「真正擊殺那顆子彈」的 id 路徑 + 在結尾接上被擊者中心點。修正分裂彈用 `find(active)` 會在子彈間跳動、導致回放路徑跨越硬牆的可能
  - KillCam 補畫：背景**格線**（空曠地圖也有空間感）、加亮地圖磚、**雙方飛碟**（射手色畫在起點、被擊者色畫在命中格，被擊者隨爆炸淡出）。`killcamRef` 增存 `victimColor`
  - 穿牆結論：單發武器路徑＝真實彈道（已反彈過，不穿牆）；分裂彈改取致命子彈自身路徑後亦不再跳動穿牆

### R24 後續微調（同版併入）
- **吸附雷彈藥 1 發**：`toSlots` 改 `id==='trap'?3 : id==='sticky'?1 : 2`；weapons.ts 顯示 ammo 1
- **震幅減半**：`.shake`（4px→2px）、`.glitch`（位移 3→1.5px、skew 6°→3°、filter 強度下調）
- **建立角色頁雙欄**：[Profile.tsx](src/pages/Profile.tsx) 改 `flex-row`，左預覽圈、右名稱+顏色+確定；root `overflow-y-auto` 保險。修正橫向矮螢幕確定鈕被 `overflow:hidden` 切掉
- **離開通知全流程一致（room_closed）**：
  - 統一以 `room_closed` 廣播為可靠訊號（返回鍵 + `beforeunload` 關分頁都送），**不依賴 presence-leave**（頁面切換 churn 會誤判）
  - Profile / MapReveal 原本無頻道 → 新增訂閱 + 監聽 room_closed + beforeunload；Ban / Loadout 補 beforeunload
  - 收到 room_closed → 顯示共用 [LeftNotice](src/components/LeftNotice.tsx)「對方已離開房間」1.6s 後 `clearRoom()` 返回主選單
  - MapReveal 收到後設 `leftRef`，倒數結束不再進 /game
  - 取捨：lobby 階段 F5 會觸發 beforeunload→room_closed，對方因此被退回主選單（lobby F5-reconnect 屬邊角，以用戶要求的「關遊戲要通知」為優先）；硬斷線（無 beforeunload）不在涵蓋範圍

### R24.1 Bug 修正（2026-06-14）
- **連射彈間隔縮短**：改用 `releaseFrame` 讓三發子彈同時存入 `bulletsRef`，第 0/12/24 幀釋放（原本等上一發停止才送出下一發，間隔過長）。`stepBullet` 在 `releaseFrame > 0` 時跳過移動並遞減計數器；`animStep` 路徑追蹤和 `GameCanvas` 渲染均跳過 `releaseFrame > 0` 的子彈以避免在出膛位置出現多餘光點。
- **斜角縫隙穿透修正**：`stepBullet` 當子彈斜向移動至空格但 `prevCol !== col && prevRow !== row` 時，檢查 `tiles[prevRow][col]`（橫向相鄰格）和 `tiles[row][prevCol]`（縱向相鄰格）；任一為硬牆則反轉對應速度分量，穿透彈忽略軟牆的角反彈。
- **手機版垂直截斷修正**：結局畫面改用外層 `overflow-y-auto` + 內層 `min-h-full justify-center`，頁面內容短時維持置中、超出螢幕時可向上捲動，不再被 `justify-center h-full` 的 overflow 裁切。`KillCam` 縮圖寬由 360→300 以節省高度。已檢查所有其他頁面（Profile/Skills/Ban/Loadout/MainMenu/GameResult/MapReveal），均有適當 `overflow-y-auto` 或內容高度無風險。

### R24.2 Bug 修正（2026-06-14）
- **角落震盪修正**：R24.1 的角落修法只反轉速度卻沒讓子彈離開角落口袋，導致子彈卡在兩牆共用角點（從任何方向看兩個正交鄰居都是牆）反覆全反轉、`bounces++` 直到 `MAX_BOUNCES` 而消失。修法：[physics.ts](src/game/physics.ts) 角落分支在 `bH`/`bV` 成立時，除反轉對應分量外，把該軸位置退回踏步前（`x=bullet.x` / `y=bullet.y`），子彈這幀不前進、下一幀朝反向離開角落，不再自我觸發。
- **傳送同格修正**：傳送門出口從不檢查占用（一般移動以 `getReachableCells` 排除占用格，但 portal warp 直接覆寫 `finalCol/finalRow`）。本機 [Game.tsx handleMove](src/pages/Game.tsx) 與對手 broadcast 兩條路徑都加 `exitTaken` 檢查：若出口已有其他存活飛碟，**取消傳送**（留在踩門那格、門保留）。確立「兩台飛碟永不同格」為所有位置變更點的硬規則。註：BOT 武器池排除 teleport，故此 bug 來源是玩家自己 warp 到靜止 BOT 身上。
- **連射逐發疊字（方案 A）**：傷害數字原本累積在 `pendingDamage`，待整波子彈 inactive 才在結算時跳一個合併數字（連射＝-27）。改為在每發直接命中分支（[Game.tsx](src/pages/Game.tsx) 約 L774）當下 emit 各自的傷害 float，並依該點現有 float 數量往上堆疊（`y - stack*TILE*0.5`），各自 1200ms 後移除（先出現先消失＝FIFO）。新增 `directFloatShownRef`：直接命中已逐發顯示則跳過結算合併 float；AOE（震波/地雷/爆風）不走該分支，仍由結算 float 顯示。HP 扣血與擊殺/慢動作判定維持結算時合併處理（不動 R24 擊殺演出）。`floatSeqRef` 提供單調遞增 id 避免堆疊碰撞。

### 版本號
- `GAME_VERSION` 升至 `'R24'`

---

## 三十五、Round 21 — 凍結平衡、護盾異常阻擋、轉輪音效、版本驗證

### 凍結彈平衡
- `frozenTurns` 初始值由 `2` 改為 `1`（`Game.tsx` settlement 套用處）
- 設計理由：原本凍結 2 回合等於對手連續損失 2 個行動回合（命中那回合 + 下一回合），過強。改為 1 回合後語意正確：「命中那回合不能動，下回合恢復」

### 護盾阻擋凍結
- settlement 套用 `totalFreezeTargets` 時，先以**命中前**的 `g.ufos[pid]?.shieldHp` 判斷是否有護盾
- 有護盾（`shieldHp > 0`）→ 不施加 `frozenTurns`（HP 傷害仍照常由護盾吸收）
- 用「命中前」狀態判斷，避免同一發傷害先擊破護盾又同時讓凍結生效

### 地圖轉輪音效（`playRatchet`）
- `sounds.ts` 新增 `playRatchet()`：25ms 方波，90→45Hz 下滑，模擬拉霸機棘輪喀聲
- `MapReveal.tsx` animate loop 內計算 `Math.floor(scrollOffset / ITEM_H)`，每當格子 index 變化播一次 → 轉速快時密集、減速時稀疏

### 版本驗證機制
- `constants.ts` 新增 `GAME_VERSION` 常數（目前 `'R21'`），每次部署遞增
- `Loadout.tsx` presence track 帶 `version: GAME_VERSION`；`ingest` 偵測到其他玩家 `version !== GAME_VERSION` → `setVersionMismatch(true)`
- 整裝室頂部顯示黃色警告橫幅，提示對手強制重整（Ctrl+Shift+R）
- **背景：** 朋友用舊版（無凍結 auto-skip）對戰，凍結時舊版不會 endTurn → 新版端 `isMyTurn=false` 永遠等不到對手行動 → 計時器歸零重置成 15 無限循環。計時器設計（只有 `isMyTurn` 才 endTurn）本身正確、不應加 fallback（否則 desync），根因是版本不一致，故以版本驗證解決
