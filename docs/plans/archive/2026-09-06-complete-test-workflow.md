# 完整測試流程開發計畫

## 目標

為花卉電商建立可重複執行的 Unit、Integration、E2E 與 Postman 驗證流程，涵蓋前端結帳、後端 API、SQLite 寫入、庫存與購物車 transaction，以及綠界 WebATM 測試付款。

## 安全邊界

- Integration Test 強制使用獨立的記憶體 SQLite，絕不讀寫專案根目錄的 `database.sqlite`。
- 每個整合測試自行重建需要的資料，並在測試後清除。
- E2E Test 只連線至已啟動的 `http://localhost:3001`，Playwright 設定不建立 `webServer`。
- 綠界流程使用 staging 環境與「網路 ATM／台灣土地銀行」。

## 實作項目

- [x] 讓資料庫模組支援由 `DATABASE_PATH` 指定測試資料庫，production 預設行為維持不變。
- [x] 將 Shipping 測試歸類為 Unit Test，新增 `test:unit`。
- [x] 建立 Integration 專用 Vitest 設定與訂單完整流程測試。
- [x] 驗證成功建立訂單時的訂單、品項、運費、總額、庫存與購物車狀態。
- [x] 以強制資料庫錯誤驗證 transaction rollback，不留下訂單且不扣庫存。
- [x] 建立不自動啟動 server 的 Playwright 設定與綠界付款 E2E 規格。
- [x] 成功返回商店後驗證 UI 與 API 的 `paid` 狀態並輸出截圖。
- [x] 重新產生 `openapi.json`，轉換成可提交的 Postman Collection。
- [x] Postman Collection 使用 `baseUrl`、`token`、`sessionId`，登入後自動保存 JWT。
- [x] 更新 `package.json` 與 `docs/`，執行所有可重複驗證。
- [x] 完成後將本計畫移至 `docs/plans/archive/`。

## 驗收指令

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run postman
```
