# 整合 ECPay 綠界金流（AIO + 主動查詢模式）

## Context

專案是一個 Node.js + Express + SQLite 的花卉電商，目前結帳後建立訂單的流程中，付款步驟僅為模擬（PATCH `/api/orders/:id/pay` 直接更新 status）。需要把這塊換成真實的 ECPay 綠界金流。

**關鍵限制**：本專案僅跑在本地端（`http://localhost:3001`），綠界的伺服器端回呼（Server Notify，即 `ReturnURL` 的 Server-to-Server POST）無法抵達本機。因此付款結果的確認必須改為：消費者付款完成後，綠界用**消費者瀏覽器**把人導回本地 `OrderResultURL`；本地收到這個前端導回後，**主動呼叫 ECPay `QueryTradeInfo` API** 去驗證付款狀態，然後更新訂單。

**目標**：使用者按「前往付款」→ 跳到綠界頁面 → 付款完成 → 瀏覽器導回本地 → 後端主動查詢驗證 → 訂單狀態更新為 `paid` / `failed`，並顯示結果。

## 方案選擇

- **金流產品**：AIO（全方位金流）— 最簡單、最標準的跳轉式付款頁，適合本次需求。
- **付款方式**：`ChoosePayment=Credit`（信用卡一次付清）— 信用卡為即時付款，消費者導回後即可立即 query 到最終結果；ATM/超商代碼等非同步付款在無 Server Notify 的環境下無法妥善處理，故先排除。
- **驗證機制**：
  - 主路徑：消費者瀏覽器透過 `OrderResultURL` 導回 → 後端主動呼叫 `QueryTradeInfo` 驗證並更新訂單。
  - 備援路徑：訂單詳情頁提供「重新確認付款狀態」按鈕，讓使用者可手動觸發 query（例如消費者關掉瀏覽器沒走完導回流程）。
  - `ReturnURL` 仍需填（AIO 必填參數），指向本地 `/ecpay/notify`；本地收不到，但實作 handler 以便未來部署上線可無縫啟用。

## 實作範圍

### 1. 環境變數（.env.example、新增說明）

- 既有的 `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV` 保留。
- `BASE_URL` 已存在（`http://localhost:3001`），作為 `ReturnURL`、`OrderResultURL`、`ClientBackURL` 的基底。

### 2. 資料庫 schema 變更 — `src/database.js`

為 `orders` 表新增欄位（使用 `ALTER TABLE ADD COLUMN` + `IF NOT EXISTS` 的慣用做法，SQLite 需 try/catch 包裹以兼容既有資料庫）：

- `merchant_trade_no TEXT UNIQUE` — 送給綠界的交易編號（≤ 20 字元英數字）
- `ecpay_trade_no TEXT` — 綠界回傳的交易編號（`TradeNo`）
- `payment_type TEXT` — 付款方式（綠界回傳值，例如 `Credit_CreditCard`）
- `paid_at TEXT` — 付款完成時間（`PaymentDate`）

### 3. ECPay 服務模組 — 新增 `src/services/ecpayService.js`

純函式模組，不依賴 Express。匯出：

- `ecpayUrlEncode(source)` — 依 `guides/13-checkmacvalue.md:211-225` Node.js 實作（`encodeURIComponent` → `%20→+` → `~→%7e` → `'→%27` → `toLowerCase` → .NET 七字元替換）。
- `generateCheckMacValue(params, hashKey, hashIv)` — SHA256，參考 `guides/13-checkmacvalue.md:227-244`。
- `verifyCheckMacValue(params, hashKey, hashIv)` — 使用 `crypto.timingSafeEqual`。
- `generateMerchantTradeNo()` — 產生 ≤ 20 字元英數字編號（格式：`EC` + 10 位 timestamp + 6 位亂數 = 18 字元）。
- `buildAioFormParams({ order, items, baseUrl })` — 組出 AIO `/Cashier/AioCheckOut/V5` 所需所有欄位（含 `CheckMacValue`），回傳 plain object。`ItemName` 以 `#` 串接商品名稱，合計截斷至 200 字元內（避免 400 字元截斷造成 CheckMacValue 不符）。`MerchantTradeDate` 以 UTC+8 格式化為 `yyyy/MM/dd HH:mm:ss`。
- `queryTradeInfo(merchantTradeNo)` — 呼叫 `/Cashier/QueryTradeInfo/V5`，回傳已驗證 CheckMacValue 的結果物件。內部使用 Node 18+ 內建 `fetch`；回應為 URL-encoded 字串，以 `URLSearchParams` 解析；失敗則 throw。`TimeStamp` 用當下 `Math.floor(Date.now() / 1000)`（3 分鐘內有效）。

環境網域切換：`ECPAY_ENV === 'production'` → `https://payment.ecpay.com.tw`，否則 `https://payment-stage.ecpay.com.tw`。

### 4. 後端路由變更 — `src/routes/orderRoutes.js`

- **修改 `POST /api/orders`**：建立訂單的 transaction 中同時產生並寫入 `merchant_trade_no`（呼叫 `generateMerchantTradeNo()`），並在回應中帶出。
- **新增 `POST /api/orders/:id/ecpay-form`**（需 auth）：
  - 檢查訂單屬於當前使用者且 `status === 'pending'`。
  - 呼叫 `buildAioFormParams`，回傳 `{ data: { action, params } }`（action 為 AIO 端點 URL，params 為欄位 map）。前端據此組一個 auto-submit form 跳轉。
- **新增 `POST /api/orders/:id/verify-payment`**（需 auth）：
  - 查訂單 → 呼叫 `ecpayService.queryTradeInfo(order.merchant_trade_no)`。
  - 依 `TradeStatus`：`'1'` → `status='paid'` 並寫入 `ecpay_trade_no`、`payment_type`、`paid_at`；`'10200095'` → `status='failed'`；`'0'` → 維持 `pending` 並回 `message: '尚未付款'`。
  - 狀態變更使用 SQL `UPDATE ... WHERE id = ? AND status = 'pending'`（冪等；已 paid 的訂單不會被覆寫）。
  - 回傳標準 `{ data, error, message }` 格式。
- 保留 `PATCH /api/orders/:id/pay`（模擬付款）以避免破壞既有測試。

### 5. ECPay 前台/回呼頁面路由 — 新增 `src/routes/ecpayRoutes.js`（掛載於 `/ecpay`，免 auth）

- `POST /ecpay/result`（對應 `OrderResultURL`）：
  - 接收綠界瀏覽器導回的 Form POST。
  - 驗證 CheckMacValue（失敗仍回應並 log）。
  - 依 `MerchantTradeNo` 找到訂單，呼叫 `queryTradeInfo` 做**權威確認**（綠界 callback body 只是訊號，以主動查詢為準）。
  - 更新訂單狀態，接著 `res.redirect('/orders/:id?payment=success|failed')` 回到訂單詳情頁，讓前端顯示結果橫幅（`paymentResult` 已存在於 order-detail.ejs）。
- `POST /ecpay/notify`（對應 `ReturnURL`）：
  - 本地收不到，但仍實作：驗證 CheckMacValue → 主動查詢 → 更新訂單 → 回應純文字 `1|OK`（HTTP 200）。
- `GET /ecpay/client-back`（對應 `ClientBackURL`）：
  - 單純 `res.redirect('/orders/:id')`，不觸發 query。

`app.js` 中加入 `app.use('/ecpay', require('./src/routes/ecpayRoutes'))`。

### 6. 前端變更

- **`views/pages/order-detail.ejs`**：
  - 把「付款成功」「付款失敗」兩顆測試按鈕改為：
    - `pending` 狀態：一顆「前往綠界付款」主按鈕 + 一顆「重新確認付款狀態」輔助按鈕。
- **`public/js/pages/order-detail.js`**：
  - `handleEcpayPay()`：`apiFetch('/api/orders/:id/ecpay-form', { method: 'POST' })` → 動態建立隱藏 form，appendChild 後 `form.submit()` 跳轉到綠界。
  - `handleVerifyPayment()`：`apiFetch('/api/orders/:id/verify-payment', { method: 'POST' })`，成功後重載訂單資料。

## 關鍵檔案清單

| 檔案 | 動作 |
|------|------|
| `src/database.js` | 修改：`orders` 表新增 4 個欄位 |
| `src/services/ecpayService.js` | **新增** |
| `src/routes/orderRoutes.js` | 修改 |
| `src/routes/ecpayRoutes.js` | **新增** |
| `app.js` | 修改：掛載 ecpayRoutes |
| `views/pages/order-detail.ejs` | 修改 |
| `public/js/pages/order-detail.js` | 修改 |

## 重要實作細節

- **URL encode**：CMV（AIO）必須用 `ecpayUrlEncode`。
- **CheckMacValue 比對**：用 `crypto.timingSafeEqual`，禁止 `==`。
- **`RtnCode` 型別**：AIO Callback 為字串 `'1'`；`TradeStatus` 同為字串。
- **MerchantTradeNo**：≤ 20 字元英數字，永久唯一。
- **MerchantTradeDate**：UTC+8 格式 `yyyy/MM/dd HH:mm:ss`。
- **ItemName**：截斷至 200 字元內。
- **TimeStamp**：Unix 秒，3 分鐘有效期。
- **Callback 回應**：`/ecpay/notify` 必須回 `text/plain`、body 為 `1|OK`、HTTP 200。
- **HashKey/HashIV**：僅從 `process.env` 讀取。
- **付款結果以 `QueryTradeInfo` 為權威**。

## 驗證方式（end-to-end）

1. `cp .env.example .env`，確認變數存在。
2. `npm start` 啟動於 `http://localhost:3001`。
3. 註冊/登入 → 加購物車 → 結帳 → 建立訂單（DB 應有 `merchant_trade_no`）。
4. 訂單詳情頁按「前往綠界付款」→ 跳轉 `payment-stage.ecpay.com.tw`。
5. 使用測試卡號 `4311-9522-2222-2222`、任意未來月年、CVV `222`、3DS 碼 `1234`。
6. 綠界導回 `/ecpay/result` → 主動 query → `paid` → 重導 `/orders/:id?payment=success`。
7. DB 應有 `ecpay_trade_no`、`payment_type=Credit_CreditCard`、`paid_at`。
8. 按「重新確認付款狀態」應冪等（回「訂單已付款」，狀態不變）。
9. `npm test` 應全部通過。
