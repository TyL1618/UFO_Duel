# UFO Duel — 營運收費策略討論紀錄

> 最後更新：2026-06-12

---

## 一、帳號系統架構

### 結論：Supabase Auth + Google OAuth + 匿名帳號升級路徑

**技術選型：**
- 使用 **Supabase Auth**（已在用 Supabase Realtime，同一個 SDK）
- 主要登入方式：Google OAuth（Android 用戶一鍵登入）
- 備選方式：Email + 密碼（需驗證信箱，防濫用，Supabase 預設開啟）
- 不強制 Google 帳號，保留 web 用戶彈性

**匿名帳號流程：**
```
訪客進入 → Supabase signInAnonymously() → UUID + 顯示名稱「匿名XXXXX」
     ↓
玩幾局後提示「綁定帳號可保留戰績」
     ↓
Google 登入 / Email 升級 → UUID 不變，戰績全留
```

**分層權限：**
- 訪客（匿名帳號）：可加入一般房間、自訂房、單機 Bot
- 已驗證帳號：額外解鎖排位/競技匹配、排行榜、個人戰績頁

**資料表設計（Phase 1）：**
```sql
profiles (user_id UUID, nickname TEXT, avatar_color TEXT, created_at TIMESTAMPTZ)
match_history (id UUID, winner_id UUID, players JSONB, created_at TIMESTAMPTZ)
```

---

## 二、Supabase 擴容問題

**免費版上限：**
- Realtime：200 concurrent connections（≈ 100 場 1v1 同時進行）
- Database：500MB
- Auth：50,000 MAU

**什麼時候升級：** 碰到上限才升。Pro 方案 $25/月，升至 500 concurrent connections。  
**現階段：** 完全不需要擔心。早期用戶量遠不到這個門檻。

**換後端的時機：** 暫時不考慮。只要 Schema 用乾淨的 UUID 主鍵設計，未來要換也只是 export/import。不是架構重寫。

---

## 三、Google Play 上架方式

**方案：TWA（Trusted Web Activity）+ Bubblewrap CLI**

- PWA 包成 Android APK，不需要重寫成 Native
- 本質是 Chrome 全螢幕跑你的 web app URL
- 需要在 server 放 `/.well-known/assetlinks.json`（證明 domain 信任此 APK）
- Google Play Billing API 可透過 TWA 橋接層接 IAP

**上架步驟（等帳號系統完成後再做）：**
1. `npm install -g @bubblewrap/cli`
2. `bubblewrap init --manifest https://your-domain.com/manifest.json`
3. 設定 assetlinks.json
4. `bubblewrap build` → 產生 APK/AAB
5. 上傳 Google Play Console

---

## 四、收費模型設計

### 核心框架：免費遊玩 + 廣告 + 選購強化

#### 廣告機制（AdMob Interstitial）

| 觸發時機 | 說明 |
|----------|------|
| 單機 Bot 對局結束，返回首頁 | ✅ 安全，無同步問題 |
| 連線對戰結束，返回大廳 | ✅ 在結算畫面中，對方不需等待 |
| **禁止時機** | 對局進行中、等待對手時 |

#### 廣告換武器槽

- 配對前主動觀看廣告 → 本場 +1 武器槽（最多看 2 次，+2 槽）
- 本場結束後歸零，下場重新算
- 設計邏輯：玩家主動選擇，不是強制插播，情緒體驗佳

#### 付費解鎖

| 商品 | 定價（TWD）| 內容 |
|------|-----------|------|
| 第 6 武器槽 | NT$49 | 永久解鎖第 6 個武器欄位 |
| 第 7 武器槽 | NT$59 | 永久解鎖第 7 個武器欄位 |
| 太空旅行證 | NT$99 | 永久關閉廣告 + 永久全武器槽（第 6、7 號）+ 未來造型優惠 |

**「付費不等於勝利」定位：**
- 額外槽只是更多選擇，不是數值加成
- 技術差、多帶武器也是白帶（符合現有禁武邏輯）
- 歐美市場接受度較低，台灣/日本/東南亞接受度高

#### 造型系統（未來）

- UFO 外觀皮膚
- 子彈特效
- 擊殺特效
- 不影響遊戲平衡

---

## 五、推進時序

```
現在    → 修剩餘 Bug（R20）
↓
Phase 1 → Supabase Auth + Google OAuth + profiles table + 暱稱/顏色同步雲端
↓
Phase 2 → TWA 打包 → Google Play 內部測試版
↓
Phase 3 → AdMob 廣告 + Google Play Billing（IAP）
↓
Phase 4 → 造型系統 cosmetics
```

---

## 六、待確認事項

- [ ] 排位賽規則（ELO 分數？還是勝場數？）
- [ ] 造型設計稿（等 Phase 3-4 再討論）
- [ ] 廣告看完後是否顯示獎勵動畫（+1 槽提示）
- [ ] 太空旅行證命名最終確認
