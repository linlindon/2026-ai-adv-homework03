# TESTING.md

## 測試分層

| 類型 | 工具 | 範圍 | 指令 |
|------|------|------|------|
| Unit | Vitest | `src/utils/shipping.js` 純函式 | `npm run test:unit` |
| Integration | Vitest + Supertest + better-sqlite3 | API、訂單 transaction、資料表、庫存與購物車 | `npm run test:integration` |
| E2E | Playwright | 瀏覽器結帳與綠界 WebATM staging 付款 | `npm run test:e2e` |
| API Collection | OpenAPI + Postman | 可匯入 Postman 的 API request 集合 | `npm run postman` |

`npm test` 會依序執行 Unit 與 Integration Test。

## 測試資料庫隔離

Integration Test 的 `tests/integration/env.setup.js` 會在載入 Express app 前設定：

```text
NODE_ENV=test
DATABASE_PATH=:memory:
```

`src/database.js` 因此會建立獨立的記憶體 SQLite。測試不會開啟或修改專案根目錄的 `database.sqlite`，程序結束後資料自動消失。新增測試時仍應只建立自己的資料，並於 `afterEach` 清除自己建立的 user、cart、order、order_items 與 product。

## Unit Test

`tests/unit/shipping.test.js` 涵蓋宅配與超商取貨費、商品小計 1,499／1,500 元邊界、偏遠地區、當日急件、多項附加費，以及滿額免基本運費與附加費同時成立。

## Integration Test

既有 API 測試與 `tests/integration/order-flow.test.js` 都由 `vitest.integration.config.js` 執行，並設定 `fileParallelism: false`；`tests/sequencer.mjs` 維持 auth → products → cart → orders → adminProducts → adminOrders → 完整訂單流程的固定順序。

完整訂單測試流程為：註冊測試會員 → 取得商品 → 加入購物車 → 建立包含配送資訊的訂單 → 直接查詢記憶體 SQLite。成功案例驗證 HTTP status、統一回應格式、`orders`、`order_items`、商品小計、運費、總額、庫存扣除與購物車清空。

失敗案例會建立暫時 SQLite trigger，刻意讓 `order_items` 寫入失敗，確認 transaction 不留下 order／order_items、不扣庫存，且購物車仍保留。

## E2E Test

`playwright.config.js` 沒有 `webServer` 設定，因此 `npm run test:e2e` **不會自行啟動站台**。執行前請先確認：

```bash
curl http://localhost:3001
npm run test:e2e
```

測試使用 `admin@hexschool.com`／`12345678` 登入，走完加入購物車、配送資料、建立訂單、綠界網路 ATM、台灣土地銀行與返回商店流程。成功後同時驗證頁面「已付款」、訂單 API `status: paid`，並覆寫 `docs/e2e-evidence/e2e-paid-latest.png`。

此流程會連線至綠界 staging；server 必須能對外連線至 `payment-stage.ecpay.com.tw`。若只想確認 Playwright 規格可被發現而不執行付款，可用 `npm run test:e2e -- --list`。

## Postman Collection

`npm run postman` 會先執行 OpenAPI 產生器，再輸出 `postman/flower-shop.postman_collection.json`。

| 變數 | 預設值 | 用途 |
|------|--------|------|
| `baseUrl` | `http://localhost:3001` | API 根網址 |
| `token` | 空字串 | 登入成功後自動保存 JWT |
| `sessionId` | `postman-guest-session` | 訪客購物車的 `X-Session-Id` |

OpenAPI 宣告 `bearerAuth` 的 request 會自動使用 `Bearer {{token}}`；購物車 request 也會帶 `X-Session-Id: {{sessionId}}`。

## 共用工具與規範

API 測試可從 `tests/setup.js` 引入：

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

每個 API 測試至少驗證統一回應格式：成功時 `error: null`，失敗時 `data: null` 且 `error` 為錯誤碼。需要跨步驟共享 ID 的測試應維持定義順序；不要平行執行會共享資料狀態的測試檔。
