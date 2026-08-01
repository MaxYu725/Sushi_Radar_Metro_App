# 候位 Metro 1.2.1

香港壽司郎輪候資料查詢工具，包含全螢幕原生 Android App，以及須經 Android 管理員批准才可使用的網頁端。介面重新設計成 Windows Phone / Metro UI 風格；專案不包含示範分店、假叫號或硬編碼管理密碼。

> 本專案並非壽司郎官方產品。資料可能延遲，上游端點、格式與使用條款亦可能改變；請以店內及官方服務為準，並自行確認部署及資料使用權限。

## 已完成範圍

- Android 全螢幕 immersive mode，隱藏狀態列及導覽列。
- 四頁無限循環 Pivot：`home`、`search`、`nearby`、`settings`。
- 固定分店、60 秒自動更新、手動更新、隨機幾何 Tile、長按釘選操作、分區／細區、裝置端附近距離。
- Android 直接使用原版已驗證的香港壽司郎分店及叫號端點，設記憶體／磁碟快取、每店節流及最多 3 個並行請求。
- 網頁首次使用只顯示 5 分鐘 QR；管理員可用 Android 相機或相簿截圖掃描。
- 管理員可允許、取消或封鎖，加入備註，按狀態／日期排序及搜尋，並可撤銷或解封。
- 瀏覽器身分被封鎖後不再產生 QR；清除瀏覽器資料只會產生新的未授權身分，仍須重新掃描批准。
- Android 管理入口：在 `settings` 最下方連續點擊版本號 5 次（3 秒內），再通過裝置螢幕鎖／生物辨識。
- Android 管理請求以不可匯出的 Android Keystore P-256 私鑰簽署；伺服器使用 60 秒一次性挑戰防重播。
- Cloudflare D1 儲存裝置、審批、工作階段及審計記錄；GitHub Actions 同時驗證 Android 與 Web，並上傳構建產物。

## 真實資料來源與請求限制

- 分店：`https://sushipass.sushiro.com.hk/api/2.0/info/storelist?latitude=22&longitude=114&numresults=100&region=HK`
- 叫號：`https://sushipass.sushiro.com.hk/api/2.0/remote/groupqueues?region=HK&storeid={分店ID}`

叫號按 `mixedQueue`、`storeQueue`，最後合併 `boothQueue` 與 `counterQueue`。Android 每店自動更新最短 45 秒、手動最短 10 秒；網頁代理設 60 秒邊緣快取且每批最多 3 個並行上游請求。個別分店失敗時保留舊資料，不會改用假資料。

## 專案結構

- `app/`：Kotlin、Jetpack Compose Android App；管理功能在 `admin/`。
- `web/`：Vinext / React 網頁、Worker API、Drizzle D1 schema 與 migration。
- `.github/workflows/android.yml`：Android lint、測試、debug artifact 及 tag release APK。
- `.github/workflows/web.yml`：Web lint、安全測試、生產建置及 deployable artifact。
- `.github/workflows/cloudflare.yml`：手動套用 D1 migration 並部署到 Cloudflare Workers。
- `docs/OWNER_SETUP.zh-HK.md`：你需要執行的部署、初始化、APK 簽署流程。
- `docs/SECURITY.md`：MVP 安全邊界、風險與日後升級建議。

## 本機要求

- Android：JDK 17、Android SDK 36、已接受 SDK licenses。Android Studio Ladybug 或更新版本屬可選，但最省事。
- Web：Node.js 24、pnpm 11.9.0。
- 部署：GitHub 帳戶、Cloudflare Workers 與 D1；正式 Worker 已預設為 `https://queue-metro-api.maxyu0725.workers.dev`。
- 實機：Android 6.0（API 23）或以上；管理裝置須設定螢幕鎖或生物辨識。

## 驗證命令

```powershell
# Android
.\gradlew.bat lint testDebugUnitTest assembleDebug

# Web
cd web
pnpm install --frozen-lockfile
pnpm check
pnpm deploy:dry-run
```

完整首次設定請依照 [擁有者設定指引](docs/OWNER_SETUP.zh-HK.md)。
