# FEATURES.md

## 功能完成狀態

| 功能模組 | 狀態 | 說明 |
|----------|------|------|
| 用戶認證（Auth） | 完成 | 註冊、登入、JWT 發放、個人資料 |
| 商品列表（Products） | 完成 | 公開分頁列表、商品詳情 |
| 購物車（Cart） | 完成 | 雙模式認證（訪客/登入）、數量累加、庫存檢查 |
| Shipping 配送費用 | 完成 | 宅配／超商、滿額免基本運費、偏遠與急件附加費 |
| 訂單（Orders） | 完成 | 從購物車建立、運費與金額快照、扣庫存 transaction |
| 綠界 ECPay 金流 | 完成 | AIO 信用卡付款（跳轉）、瀏覽器導回、`QueryTradeInfo` 主動查詢、使用者手動確認付款狀態 |
| 後台商品管理（Admin Products） | 完成 | CRUD、刪除前檢查未完成訂單 |
| 後台訂單管理（Admin Orders） | 完成 | 列表（含狀態篩選）、詳情 |
| 前台 SSR 頁面 | 完成 | EJS 渲染，JS 另行呼叫 API |
| OpenAPI 文件 | 完成 | swagger-jsdoc 從 JSDoc 生成 |

---

## 1. 用戶認證（Auth）

**路由前綴**：`/api/auth`

### POST /api/auth/register — 註冊

**請求 body（必填）**：

| 欄位 | 型別 | 規則 |
|------|------|------|
| email | string | 合法 email 格式（正規表達式驗證） |
| password | string | 最少 6 字元 |
| name | string | 非空字串 |

**業務邏輯**：
1. 驗證三欄位皆存在、email 格式正確、password 長度 ≥ 6
2. 查詢 DB 確認 email 未被使用，否則回 409
3. 以 bcrypt（10 rounds）hash 密碼
4. 插入 users 表，role 固定為 `'user'`
5. 簽發 JWT（7 天有效期），直接回傳 token

**成功回應（201）**：
```json
{
  "data": {
    "user": { "id": "...", "email": "...", "name": "...", "role": "user" },
    "token": "<JWT>"
  },
  "error": null,
  "message": "註冊成功"
}
```

**錯誤情境**：
- 400 `VALIDATION_ERROR`：欄位缺失、email 格式錯誤、密碼過短
- 409 `CONFLICT`：Email 已被註冊

---

### POST /api/auth/login — 登入

**請求 body（必填）**：`email`、`password`

**業務邏輯**：
1. 以 email 查 DB，用戶不存在也回 401（避免 email 枚舉攻擊）
2. `bcrypt.compareSync` 驗證密碼
3. 簽發 JWT，回傳 token 與用戶基本資料

**成功回應（200）**：`data.user`（id, email, name, role）+ `data.token`

**錯誤情境**：
- 400 `VALIDATION_ERROR`：缺少 email 或 password
- 401 `UNAUTHORIZED`：Email 或密碼錯誤（刻意不分開提示）

---

### GET /api/auth/profile — 取得個人資料

**認證**：JWT Bearer（必須）

回傳當前登入用戶的完整資料（id, email, name, role, created_at）。

**錯誤情境**：
- 401：未登入或 token 無效

---

## 2. 商品列表（Products）

**路由前綴**：`/api/products`  
**認證**：無（完全公開）

### GET /api/products — 商品列表

**查詢參數**：

| 參數 | 型別 | 預設值 | 限制 |
|------|------|--------|------|
| page | integer | 1 | 最小 1 |
| limit | integer | 10 | 最小 1，最大 100 |

**業務邏輯**：
- 依 `created_at DESC` 排序
- 回傳商品陣列與分頁資訊（total, page, limit, totalPages）

**成功回應（200）**：
```json
{
  "data": {
    "products": [
      {
        "id": "...", "name": "粉色玫瑰花束",
        "description": "...", "price": 1680, "stock": 30,
        "image_url": "...", "created_at": "...", "updated_at": "..."
      }
    ],
    "pagination": { "total": 8, "page": 1, "limit": 10, "totalPages": 1 }
  },
  "error": null,
  "message": "成功"
}
```

---

### GET /api/products/:id — 商品詳情

- 以 UUID 查單筆商品
- 404 `NOT_FOUND`：商品不存在

---

## 3. 購物車（Cart）

**路由前綴**：`/api/cart`  
**認證**：雙模式（JWT Bearer **或** `X-Session-Id` header）

### 雙模式認證行為

| 情境 | 行為 |
|------|------|
| Bearer token 有效 | 使用 `user_id` 作為 cart owner |
| Bearer token 存在但無效 | **立即 401**，不 fallback |
| 無 Bearer，有 X-Session-Id | 使用 `session_id` 作為 cart owner（訪客模式） |
| 兩者皆無 | 401 |

---

### GET /api/cart — 查看購物車

回傳當前 owner 的購物車項目列表，每個 item 包含商品資訊快照（JOIN products），並計算總金額：

```json
{
  "data": {
    "items": [
      {
        "id": "cart-item-uuid",
        "product_id": "product-uuid",
        "quantity": 2,
        "product": {
          "name": "粉色玫瑰花束",
          "price": 1680,
          "stock": 30,
          "image_url": "..."
        }
      }
    ],
    "total": 3360
  }
}
```

---

### POST /api/cart — 加入購物車

**請求 body**：

| 欄位 | 型別 | 必填 | 規則 |
|------|------|------|------|
| productId | string | 是 | 必須為現有商品 UUID |
| quantity | integer | 否（預設 1） | 正整數 |

**業務邏輯（累加機制）**：
- 若購物車已有同商品：**累加**數量（`existingQty + qty`），不替換
- 累加後總數量不可超過庫存，否則回 400 `STOCK_INSUFFICIENT`
- 新商品加入時同樣檢查庫存

**錯誤情境**：
- 400 `VALIDATION_ERROR`：productId 缺失、quantity 非正整數
- 400 `STOCK_INSUFFICIENT`：庫存不足
- 404 `NOT_FOUND`：商品不存在

---

### PATCH /api/cart/:itemId — 修改數量

**請求 body**：`quantity`（正整數，必填）

- 只能修改屬於自己 owner 的購物車項目
- 直接**覆蓋**（非累加）數量
- 新數量不可超過庫存

---

### DELETE /api/cart/:itemId — 移除項目

- 只能刪除屬於自己 owner 的項目
- 成功回傳 `data: null`

---

## 4. 訂單（Orders）

**路由前綴**：`/api/orders`  
**認證**：JWT Bearer（全部路由必須，router 層級掛載 authMiddleware）

### POST /api/orders — 建立訂單

**請求 body**（前三項必填；配送欄位選填）：

| 欄位 | 型別 | 規則 |
|------|------|------|
| recipientName | string | 非空 |
| recipientEmail | string | 合法 email 格式 |
| recipientAddress | string | 非空 |
| shippingMethod | string | 選填；`home_delivery`（預設）或 `convenience_store` |
| isRemoteArea | boolean | 選填，預設 `false`；偏遠地區加收費 |
| isSameDayDelivery | boolean | 選填，預設 `false`；當日急件加收費 |

**Shipping 規則**（`src/utils/shipping.js`）：

| 條件 | 金額處理 |
|------|----------|
| 宅配 | 基本運費 120 元 |
| 超商取貨 | 取貨費 60 元，不屬於基本運費 |
| 商品小計 ≥ 1,500 元 | 免除宅配基本運費；不免超商取貨費 |
| 偏遠地區 | 加收 200 元 |
| 當日急件 | 加收 250 元 |

偏遠與急件可同時累加；滿額僅免宅配基本運費，成立的附加費仍計入 `shipping_fee`。

**業務邏輯（Transaction）**：

此操作在單一 SQLite transaction 內原子完成：

1. 讀取當前用戶的購物車（`user_id` 比對，不含 session_id 購物車）
2. 若購物車為空，回 400 `CART_EMPTY`
3. 逐項確認庫存，任一不足則回 400 `STOCK_INSUFFICIENT`（列出不足商品名稱）
4. 計算商品小計 `subtotal`（Σ price × quantity，以下單當時商品價格為準）
5. 呼叫 `calculateShipping` 計算 `shipping_fee` 與 `total_amount = subtotal + shipping_fee`
6. 以 `ecpayService.generateMerchantTradeNo()` 產生綠界交易編號（`EC` + Unix 秒 + 6 位 hex，共 18 字元）
7. **Transaction 內**：
   - INSERT orders（含配送條件、金額快照、訂單號與 `merchant_trade_no`）
   - INSERT order_items（每項商品的名稱、價格、數量**快照**，product_id 保留但無 FK）
   - UPDATE products SET stock = stock - quantity（每個商品）
   - DELETE FROM cart_items WHERE user_id = ?（清空購物車）

**成功回應（201）**：回傳訂單 id、order_no、merchant_trade_no、subtotal、shipping_fee、shipping_method、is_remote_area、is_same_day_delivery、total_amount、status、items、created_at。`total_amount` 是 ECPay 實際付款金額。

---

### GET /api/orders — 我的訂單列表

- 只回傳當前 JWT 用戶的訂單
- 依 `created_at DESC` 排序
- 回傳：id、order_no、配送與金額快照、status、created_at（不含商品明細）

---

### GET /api/orders/:id — 訂單詳情

- 查詢條件：`id = ? AND user_id = ?`（確保只能查自己的訂單）
- 404 若不存在或不屬於自己
- 回傳完整訂單資料 + order_items 陣列

---

### POST /api/orders/:id/ecpay-form — 取得綠界 AIO 付款表單參數

**認證**：JWT（必須）；訂單必須屬於當前用戶

**業務邏輯**：
1. 確認訂單存在、屬於當前用戶、`status === 'pending'`，否則回 400 `INVALID_STATUS`
2. 呼叫 `ecpayService.buildAioFormParams({ order, items, baseUrl })` 組出 AIO 欄位與 `CheckMacValue`
3. 回傳 `{ data: { action, params } }`，前端據此動態建立隱藏 `<form>` 並 `submit()` 跳轉至綠界付款頁

**成功回應（200）**：
```json
{
  "data": {
    "action": "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    "params": {
      "MerchantID": "3002607",
      "MerchantTradeNo": "EC1713423456A3F2B1",
      "MerchantTradeDate": "2026/04/18 14:30:45",
      "TotalAmount": "3360",
      "TradeDesc": "...",
      "ItemName": "粉色玫瑰花束 x 2",
      "ReturnURL": "http://localhost:3001/ecpay/notify",
      "OrderResultURL": "http://localhost:3001/ecpay/result",
      "ClientBackURL": "http://localhost:3001/ecpay/client-back?orderId=...",
      "ChoosePayment": "Credit",
      "EncryptType": "1",
      "CheckMacValue": "..."
    }
  },
  "error": null,
  "message": "成功"
}
```

**錯誤情境**：
- 400 `INVALID_STATUS`：訂單已非 pending（例如已付款、已失敗）
- 404 `NOT_FOUND`：訂單不存在或不屬於自己

---

### POST /api/orders/:id/verify-payment — 主動查詢付款狀態

**認證**：JWT（必須）；訂單必須屬於當前用戶

**用途**：本專案僅運行於本地端，無法接收綠界 Server Notify，故付款狀態以此端點主動呼叫綠界 `QueryTradeInfo` 為權威。用於：
1. `/ecpay/result` 收到瀏覽器導回時內部呼叫（交由 `ecpayRoutes.js` 的共用邏輯）
2. 使用者在訂單詳情頁按下「重新確認付款狀態」時呼叫（例如消費者關瀏覽器未完成導回）

**業務邏輯**：
1. 讀取訂單，確認屬於當前用戶
2. 若尚未有 `merchant_trade_no`，回 400 `INVALID_STATUS`
3. 呼叫 `ecpayService.queryTradeInfo(merchant_trade_no)` 取得綠界交易資訊（含 CheckMacValue 驗證）
4. 依 `TradeStatus` 以 `UPDATE ... WHERE id=? AND status='pending'` 做**冪等**更新：
   - `'1'` → `status='paid'`，寫入 `ecpay_trade_no`、`payment_type`、`paid_at`
   - `'10200095' / '10100248' / '10100254'` → `status='failed'`
   - `'0'` → 維持 `pending`，`message: '尚未付款'`
5. 回傳最新訂單資料

**錯誤情境**：
- 400 `INVALID_STATUS`：訂單尚未送往綠界（無 `merchant_trade_no`）
- 404 `NOT_FOUND`：訂單不存在或不屬於自己
- 502/5xx：與綠界 API 通訊異常

---

### PATCH /api/orders/:id/pay — 模擬付款（僅供測試）

> **開發測試用途**：此端點在 ECPay 整合完成後仍保留，tests/orders.test.js 仍依賴它驗證狀態轉換邏輯。前台 UI 已移除觸發入口，正式付款請走 `POST /:id/ecpay-form` 與 `POST /:id/verify-payment`。

**請求 body**：

| 欄位 | 型別 | 值 |
|------|------|----|
| action | string | `"success"` 或 `"fail"` |

**業務邏輯**：
- 只能對 `status === 'pending'` 的訂單操作，否則 400 `INVALID_STATUS`
- `action: 'success'` → status 更新為 `'paid'`
- `action: 'fail'` → status 更新為 `'failed'`
- 確認訂單屬於自己（`user_id` 比對）

---

## 5. 後台商品管理（Admin Products）

**路由前綴**：`/api/admin/products`  
**認證**：JWT Bearer + admin role（router 層級雙重 middleware）

### GET /api/admin/products — 後台商品列表

與公開列表相同，支援 `page`、`limit` 分頁查詢，差異僅在於需要 admin 認證。

---

### POST /api/admin/products — 新增商品

**請求 body**：

| 欄位 | 型別 | 必填 | 規則 |
|------|------|------|------|
| name | string | 是 | 非空 |
| description | string | 否 | |
| price | integer | 是 | 正整數 |
| stock | integer | 是 | 非負整數（≥ 0） |
| image_url | string | 否 | |

成功回傳 201 + 完整商品資料。

---

### PUT /api/admin/products/:id — 編輯商品

**請求 body**（所有欄位皆為選填，只更新提供的欄位）：

- `name`：若提供不能為空字串
- `price`：若提供必須為正整數
- `stock`：若提供必須為非負整數

更新時同步更新 `updated_at = datetime('now')`。

---

### DELETE /api/admin/products/:id — 刪除商品

**刪除保護機制**：刪除前查詢 `order_items JOIN orders WHERE product_id = ? AND status = 'pending'`，若有未完成訂單則回 409 `CONFLICT`，拒絕刪除。

`paid` 或 `failed` 訂單中的商品可以刪除（因訂單已結束）。

---

## 6. 後台訂單管理（Admin Orders）

**路由前綴**：`/api/admin/orders`  
**認證**：JWT Bearer + admin role

### GET /api/admin/orders — 後台訂單列表

**查詢參數**：

| 參數 | 型別 | 說明 |
|------|------|------|
| page | integer | 頁碼（預設 1） |
| limit | integer | 每頁筆數（預設 10，最大 100） |
| status | string | 篩選狀態：`pending`、`paid`、`failed`（選填，不提供則回傳全部） |

回傳所有用戶的訂單（不限 user_id），包含用戶 ID、收件資訊。

---

### GET /api/admin/orders/:id — 後台訂單詳情

- 回傳完整訂單 + order_items + 下單用戶資訊（name, email）
- 404 若不存在

---

## 7. 前台 SSR 頁面

| URL | pageScript | 說明 |
|-----|-----------|------|
| `/` | `index` | 首頁，商品列表 |
| `/products/:id` | `product-detail` | 商品詳情，productId 由 EJS locals 傳入 |
| `/cart` | `cart` | 購物車 |
| `/checkout` | `checkout` | 結帳頁面 |
| `/login` | `login` | 登入／註冊（同一頁面） |
| `/orders` | `orders` | 我的訂單列表 |
| `/orders/:id` | `order-detail` | 訂單詳情；`paymentResult` 由 query param `?payment=` 傳入 |
| `/admin/products` | `admin-products` | 後台商品管理（admin layout） |
| `/admin/orders` | `admin-orders` | 後台訂單管理（admin layout） |

---

## 8. 綠界 ECPay 回呼路由

**路由前綴**：`/ecpay`
**認證**：免 auth（綠界側發出的請求，以 `CheckMacValue` 驗證來源）

本專案僅運行於本地端，無法接收綠界 Server Notify。付款狀態的權威來源為後端主動呼叫 `QueryTradeInfo`；以下端點均會觸發該主動查詢作為最終確認，避免偽造回呼。

### POST /ecpay/result — 消費者瀏覽器導回（OrderResultURL）

由綠界付款頁透過瀏覽器以 Form POST 導回。

**業務邏輯**：
1. 以 `MerchantTradeNo` 找到訂單；找不到則直接導回 `/orders`
2. 以 `ecpayService.verifyCheckMacValue` 驗證參數（`crypto.timingSafeEqual`）；驗證失敗僅 log warning，不中斷流程（仍以主動查詢為權威）
3. 呼叫 `reconcileByMerchantTradeNo` → 內部呼叫 `queryTradeInfo` 並以冪等 SQL 更新訂單狀態
4. 依最終狀態 `res.redirect('/orders/:id?payment=success|failed|cancel')`

### POST /ecpay/notify — 伺服器回呼（ReturnURL，預留）

**本機環境不會被觸發**，實作保留供未來部署至公開環境時啟用：

1. 驗證 `CheckMacValue`
2. 驗證成功 → 呼叫 `reconcileByMerchantTradeNo` 主動查詢與更新
3. 固定回應 `Content-Type: text/plain`、body `1|OK`、HTTP 200

### GET /ecpay/client-back — 消費者取消返回（ClientBackURL）

消費者在綠界頁面按「取消／返回」時導回。

- 僅將瀏覽器導回訂單詳情頁 `/orders/:id?payment=cancel`
- **不觸發** `QueryTradeInfo`（消費者未完成付款）

### 前端 UI 呈現

`views/pages/order-detail.ejs` 依 `order.status` 顯示不同按鈕：

| 訂單狀態 | 顯示按鈕 |
|---------|---------|
| `pending` | 「前往綠界付款」（`handleEcpayPay`） + 「重新確認付款狀態」（`handleVerifyPayment`） |
| `failed` | 「重新確認付款狀態」 |
| `paid` | 無操作按鈕 |

同時依 `?payment=` query param 顯示付款結果橫幅（`success` / `failed` / `cancel`）。
