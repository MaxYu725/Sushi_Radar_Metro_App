# 安全邊界（低成本 MVP）

## 已提供

- Browser identity 使用 144-bit 隨機 ID 與 288-bit secret；伺服器只存 secret 的 SHA-256 雜湊。
- QR 分成 approval token 與只交給原瀏覽器的 poll token，兩者只存雜湊，5 分鐘失效且每裝置只保留一個有效待批申請。
- Web 工作階段 token 只以 `HttpOnly; SameSite=Strict; Secure`（HTTPS）cookie 傳送，伺服器只存雜湊，24 小時後重新簽發。
- 所有排隊代理路由先驗證允許狀態；封鎖／撤銷同時刪除工作階段。
- Android 管理要求系統鎖屏／生物辨識；Keystore P-256 私鑰不可匯出。
- 管理 API 每次先取得 60 秒一次性 challenge，簽章綁定 method、path、timestamp 及 exact body hash；challenge 使用後失效。
- 首次 owner 只可在資料庫沒有管理員時建立，並同時驗證 runtime bootstrap code 與裝置簽章。
- D1 記錄管理動作；申請為每 IP 5 次／10 分鐘，管理 challenge 為每 IP 120 次／10 分鐘。
- Worker 加入 `nosniff`、禁止 frame、no-referrer、camera／geolocation permissions policy；敏感 API 回應 `no-store`。
- Android 與 Web 都不包含示範排隊資料，且限制官方上游請求頻率。

## 明確限制

- 網站不能可靠辨識「真正裝置」；清除瀏覽器資料會建立新身分。保護目標是令新身分仍須管理員批准，而不是阻止重新申請。
- 已授權瀏覽器如受到惡意擴充套件、XSS 或作業系統入侵，裝置 secret 仍可能外洩。
- 遠程 QR 截圖可被轉發；管理員必須核對來源及備註，QR 的安全依賴短時限與人工批准。
- MVP 沒有多 owner、硬體復原金鑰、推送通知、遠端證明、憑證釘選或自動 D1 備份。
- User-Agent 只供管理員辨識及介面提示，絕不作授權依據。
- 上游服務並非由本專案控制；cache 只能降低讀取量，不能保證不會被限制或改版。

## 小規模測試後的升級次序

1. 增加第二 owner、離線復原碼與定期 D1 export。
2. 管理操作加入 WebAuthn passkey／硬體安全金鑰及角色權限。
3. 增加申請通知、地理／ASN 異常提示與細緻 rate limit。
4. 加入 Content Security Policy nonce、依賴掃描、SBOM 與簽署 release provenance。
5. 視實際使用量評估自建資料聚合排程，以免每位網頁使用者各自觸發上游查詢。
