export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'R11',
    date: '2026-06-12',
    items: [
      '新增護盾武器：吸收最多 50 傷害，持續 5 回合',
      '新增血包系統：每 5 回合在地圖隨機生成，踩到回復 30 HP',
      '修正煙霧彈同步問題：射擊方廣播落點座標，確保雙端一致',
      '煙霧彈新增機身觸發：命中敵機也會展開煙霧',
      '煙霧持續時間調整為 5 回合',
      '死亡/勝利後延遲 5 秒才跳結算畫面',
      '武器欄長按顯示技能說明',
      'Android 返回鍵攔截：遊戲中顯示離開確認，主選單顯示退出確認',
      '網頁關閉時顯示離開警告',
      '新增更新日誌頁面',
    ],
  },
  {
    version: 'R10',
    date: '2026-06-11',
    items: [
      '修正 FFA 命中判定：子彈正確傷害實際碰到的玩家',
      '地圖格數調整為正方形比例',
      'HUD 玩家身分識別強化',
    ],
  },
  {
    version: 'R9',
    date: '2026-06-10',
    items: [
      '多人 FFA 大廳（3–4 人）',
      '視角鎖定修正',
      '霓虹邊框調整 & 觸控修正',
    ],
  },
  {
    version: 'R8',
    date: '2026-06-09',
    items: [
      'N 人 FFA 架構泛化（p1–p4）',
      '死亡玩家留場觀戰',
    ],
  },
]
