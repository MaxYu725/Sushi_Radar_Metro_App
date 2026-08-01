# 擁有者部署與金鑰設定

此版本已填入以下非敏感資料：

- GitHub repository：`https://github.com/MaxYu725/queue-metro`
- Cloudflare Worker：`https://queue-metro-api.maxyu0725.workers.dev`
- D1 database：`queue-metro-auth`
- D1 database ID：`43651060-8766-4581-b4df-cf1677cb5755`
- 管理手機：Oppo Find X9 Ultra（PMA110）、Android 16、可使用指紋驗證

`maxyu0725` 是 `workers.dev` 子網域名稱，不是 GitHub Actions 所需的 Cloudflare Account ID。真正的 Account ID 是 Cloudflare 儀表板提供的 32 位十六進制識別碼。

## 1. 你需要先完成的帳戶設定

1. 安裝 GitHub CLI，然後在 PowerShell 執行 `gh auth login`。
2. 在 Cloudflare 儀表板的 Account home 複製真正的 Account ID。
3. 建立 Cloudflare API Token，權限至少涵蓋這個帳戶的 Workers Scripts 編輯及 D1 編輯；不要把 Token 貼在對話、文件或原始碼。
4. 在 GitHub repository 的 `Settings → Secrets and variables → Actions → Secrets` 新增：
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
   - `RATE_LIMIT_SALT`：由密碼管理器產生的獨立 24–32 字元隨機值
5. 在 `Settings → Secrets and variables → Actions → Variables` 新增 `ADMIN_API_BASE_URL`，值為 `https://queue-metro-api.maxyu0725.workers.dev`。App 已內置相同預設值，但保留 variable 方便日後更換網址。

## 2. 部署 Cloudflare Worker 與 D1

專案已在 `web/wrangler.jsonc` 聲明 Worker、D1 ID、`DB` binding 及 migration 位置。完成第 1 節後：

1. 開啟 GitHub repository 的 `Actions → Deploy Cloudflare Worker`。
2. 點擊 `Run workflow`。此流程會先驗證 Web、套用 `web/drizzle` 內尚未執行的 migration，再部署 Worker。
3. 完成後開啟 `https://queue-metro-api.maxyu0725.workers.dev`，新瀏覽器應只顯示有時限 QR，而不會直接顯示排隊資料。

如要從本機部署，可在 `web` 資料夾執行 `pnpm exec wrangler login`，再執行 `pnpm db:migrate:remote` 及 `pnpm deploy`。GitHub workflow 和本機部署二選一即可，避免同時操作。

## 3. 暫時設定首次 owner 啟動碼

1. 在 Cloudflare 儀表板開啟 Worker `queue-metro-api` 的 Settings／Variables and Secrets。
2. 暫時新增加密 secret `OWNER_BOOTSTRAP_CODE`，至少 12 字元，建議由密碼管理器產生 24–32 個隨機字元。
3. 不要把這個值放入 GitHub、`.env`、截圖或聊天記錄。
4. 完成下一節的首位 owner 初始化後，立即從 Cloudflare 刪除 `OWNER_BOOTSTRAP_CODE`；長期保留 `RATE_LIMIT_SALT`。

## 4. 首次 Android 擁有者初始化

1. 在 Oppo Find X9 Ultra 啟用指紋及 PIN／密碼，再安裝由你控制的簽署 APK。
2. 開啟 App → `settings` → 到最下方，在 `候位 Metro 1.2.1` 版本文字 3 秒內連點 5 次。
3. 通過 Android 16 系統指紋或裝置憑證驗證。管理 API 網址應已是正式 Worker URL；如有不同才修改。
4. 輸入管理員名稱及 `OWNER_BOOTSTRAP_CODE`，點擊「建立首位擁有者」。
5. 成功後立即刪除 Cloudflare 的 `OWNER_BOOTSTRAP_CODE`。

管理私鑰會在手機的 Android Keystore 中生成並保持不可匯出；伺服器只收到公開金鑰。這與 APK release `.jks` 是兩套不同金鑰。

## 5. 批准瀏覽器

1. 新瀏覽器開啟網站，只會看到 5 分鐘 QR。
2. Android 管理頁可使用「相機掃描」；遠程授權則保存對方 QR 截圖後使用「選取截圖」。
3. 核對瀏覽器描述及時間，填寫辨識備註，再選擇允許、取消或封鎖。
4. 允許後瀏覽器取得可續期工作階段；裝置授權本身沒有期限。封鎖後，同一瀏覽器身分不再生成 QR。
5. 對方清除瀏覽器資料後只會成為另一個未授權身分，仍須由管理員重新掃描批准，無法自行取得排隊資料。

## 6. 設定 GitHub APK release 簽署

你已生成 `queue-metro-release.jks`。它不應提交到 repository；專案的 `.gitignore` 已忽略 `.jks` 及 `.keystore`。

先把 `.jks`、alias、store password、key password 保存到密碼管理器，並保留至少一份離線備份。遺失 release keystore 後，已安裝 App 將不能直接更新到新的簽署版本。

在存放 `.jks` 的資料夾執行：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("queue-metro-release.jks")) | Set-Clipboard
```

在 GitHub Actions secrets 新增：

- `SIGNING_KEYSTORE_BASE64`：貼上剛複製的 Base64
- `SIGNING_STORE_PASSWORD`
- `SIGNING_KEY_ALIAS`
- `SIGNING_KEY_PASSWORD`

不要在對話貼出上述四個 secret。推送 `v1.2.1` 或其他 `v*` tag 後，Android workflow 會產生簽署 release APK artifact。

## 7. 管理手機遺失或 App 資料被清除

APK release keystore 可備份，但 App 內的管理私鑰不可匯出。移除 App 或清除 App 資料後，原管理員身分通常不能再簽署管理請求。

目前 MVP 復原方式是先備份 D1，再由 Cloudflare 管理端人工移除 `admins` 的 owner 記錄、暫時重新設定一次性 `OWNER_BOOTSTRAP_CODE`，最後用受控 Android 裝置重新初始化。這是高風險操作，不應交給一般使用者。小規模測試穩定後，優先升級雙管理員／復原金鑰、D1 備份及異常通知。
