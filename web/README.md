# Queue Metro Web

Vinext / Cloudflare D1 授權入口及香港壽司郎輪候資料代理。完整部署、初始化、安全邊界及 APK 金鑰流程見專案根目錄 `README.md`、`docs/OWNER_SETUP.zh-HK.md` 與 `docs/SECURITY.md`。

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm deploy:dry-run
```

正式部署設定在 `wrangler.jsonc`：Worker 名稱為 `queue-metro-api`，D1 binding 為 `DB`，資料庫為 `queue-metro-auth`。長期 secret 是 `RATE_LIMIT_SALT`；`OWNER_BOOTSTRAP_CODE` 只在首次 owner 初始化期間暫時加入，完成後立即刪除。完整操作見 `docs/OWNER_SETUP.zh-HK.md`。
