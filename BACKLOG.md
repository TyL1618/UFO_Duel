# UFO Duel — 待實作清單（Round 6）

> 此文件由 2026-06-11 下班前的討論整理而來，下次開工直接丟給 Claude 繼續。

---

## 實作規格

### 1. 吸附雷重製
- `turnsLeft` 放置時從 2 改為 **3**（延長一回合）
- **傷害重製**：
  - 地雷黏在飛碟機身 → 爆炸直接造成 **40 傷害**（對被黏飛碟）
  - 地雷在地圖格上爆炸，波及範圍內的飛碟 → **25 傷害**（不分哪格都是 25）
  - 兩者互斥，不疊加
- **全域自傷減半**：整個遊戲任何傷害（子彈直擊、爆炸波及、地雷）打到自己一律減半，取代現有只針對 shockwave/mine 的個別邏輯
  - 實作方式：settlement 時若 `totalHitTarget === gsRef.current.currentTurn` → damage × 0.5
  - endTurn mine 爆炸同理：`pid === ownerPid` → × 0.5
  - 具體數值：tile 地雷自傷 = `Math.floor(25 * 0.5) = 12`，UFO 地雷自傷 = `Math.floor(40 * 0.5) = 20`

### 2. 縮圈風暴（Storm）
- 從第 **10 回合**起，每回合消滅當前最外一圈的所有**非空地**格子（hard + soft → empty）
- 計算公式：`ring(col, row) = Math.min(col, COLS-1-col, row, ROWS-1-row)`，第 N 回合（N≥10）消滅 ring === N-10 的格子
  - 20×11 地圖最大 ring = 5，第 10–15 回合清完所有牆壁，之後（16–20 回合）完全開放地形
- 若吸附雷在被消滅的格子上 → 直接消失，不觸發爆炸
- UFO 附著的地雷不受縮圈影響
- **第 10 回合觸發時**播放一次廣播通知（`showStormAlert` state），顯示「⚠ 縮圈開始！」2 秒後自動消失
  - 用 `useEffect(() => { if (gs.turnNumber === 10 && gs.phase === 'playing') { setShowStormAlert(true); setTimeout(() => setShowStormAlert(false), 2000) } }, [gs.turnNumber])` 觸發

### 3. 旋轉霓虹邊框
- 替換現有 `neon-border-cycle`（顏色輪流切換）
- 改為粉色 `#ff69b4` + 藍色 `#00d4ff` 混合，**順時針旋轉**的跑馬燈 neon 效果
- 實作方式（`src/index.css`）：
  ```css
  @property --border-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  @keyframes border-spin {
    to { --border-angle: 360deg; }
  }
  .neon-map-border {
    border: 3px solid transparent;
    border-radius: 4px;
    line-height: 0;
    background:
      linear-gradient(#0a0a1a, #0a0a1a) padding-box,
      conic-gradient(from var(--border-angle), #ff69b4, #00d4ff, #ff69b4, #00d4ff, #ff69b4) border-box;
    animation: border-spin 3s linear infinite;
    box-shadow: 0 0 16px #ff69b444, 0 0 32px #00d4ff33;
  }
  ```

### 4. 地雷倒數顯示
- 在 `GameCanvas.tsx` 的地雷繪製段落，額外繪製 `mine.turnsLeft` 數字在礦上
- 字體：白色粗體，約 12px，置中

### 5. 傷害浮現數字
- 新增 `damageFloats` state（array of `{id, x, y, value, color}`）
- 在 settlement 和 mine 爆炸時 push float（位置 = UFO canvas 座標）
- 顯示為 canvas 上方的絕對定位 div，使用 CSS animation 向上飄移後淡出（1.5s）
- 自傷顯示橙色，對手傷害顯示紅色

### 6. 命中畫面震動
- `isShaking` state（boolean）
- 收到命中事件時 `setIsShaking(true)`，300ms 後 `setIsShaking(false)`
- 遊戲 canvas 外層 div 套用 CSS class `.shake`
- CSS：
  ```css
  @keyframes hit-shake {
    0%,100% { transform: translate(0,0); }
    25% { transform: translate(-4px, 2px); }
    50% { transform: translate(4px, -2px); }
    75% { transform: translate(-2px, 4px); }
  }
  .shake { animation: hit-shake 0.3s ease; }
  ```

### 7. 計時器最後 5 秒警示
- `HUD.tsx` 現有邏輯：`timerSeconds <= 3` 變紅色 → 改為 `timerSeconds <= 5`
- Game.tsx 新增：計時器從 6 變 5 時播放 tick 音效（如有音效資源）或略過音效

### 8. 結束畫面武器使用統計
- 擴充 `playerStats` 加入 `weapons: Record<WeaponId, number>`（每種武器射擊次數）
- 在 `handleShoot` 時記錄
- 結束畫面統計表新增一行「武器」，顯示使用最多的武器（top 1）及次數

### 9. 電腦端 Letterbox（PWA 桌機）
- 在根 layout 加 `aspect-ratio: 960/540` + `max-height: 100vh` + `margin: auto`，使遊戲畫面保持 16:9，多餘空間留黑邊
- 只對 `min-width: 768px` 以上套用（手機不受影響）

### 10. 房間有效期（Loadout.tsx）
- 進入整裝頁面後，訂閱完成起計 **10 秒**內若 presence 偵測不到對方（另一個 role），顯示錯誤提示「房間不存在或已結束」
- 顯示提示後 3 秒自動導回首頁（`nav('/')`）
- 用 `setTimeout` 在 `ch.subscribe` 的 `SUBSCRIBED` callback 內啟動，若 `checkOppPresence` 已找到對手則 `clearTimeout`

---

## 改完後需要
1. `npx tsc --noEmit` 確認無型別錯誤
2. `npx vite build` 確認 build 成功
3. 更新 `DEVDOC.md`（§十、§十六 等受影響的章節）
4. `git add` + `git commit` + `git push`

---

## 其他已確認規格備忘

- `TURN_SECONDS = 15`（每回合 15 秒）
- 地圖：20 × 11 格，`TILE = 48px`
- 縮圈 ring 公式：`Math.min(col, 19-col, row, 10-row)` = R，R=0 最外圈
- 縮圈只消滅 hard/soft 格，empty 格跳過
- 縮圈後地圖最快於第 15 回合（R=5）全部清光，第 16–20 回合為全空地對決
- 全域自傷減半取代 `pendingShooterDamage` 的個別邏輯（shockwave area damage 已用 pendingShooterDamage，此邏輯保留；新增：settlement 的直接命中也加自傷判斷）
