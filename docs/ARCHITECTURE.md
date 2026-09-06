# ARCHITECTURE.md

## 整體架構

本專案採用**前後端同源（Same-Origin）全端架構**：

- Express 同時負責 **SSR 頁面渲染**（EJS 模板）與 **REST API**
- 前端頁面（`/`、`/products/:id` 等）由 Server 渲染 HTML 骨架後回傳，頁面邏輯透過 `public/js/pages/*.js` 在瀏覽器端呼叫 API
- API 路由前綴統一為 `/api`，可與頁面路由明確區分
- 正式環境使用 SQLite 檔案（`database.sqlite`），以 WAL 模式執行；Integration Test 以 `DATABASE_PATH=:memory:` 隔離資料

```
瀏覽器 → Express Server
          ├── 頁面路由（EJS → HTML）
          └── API 路由（JSON）
               └── better-sqlite3 → database.sqlite
```

---

## 目錄結構

```
.
├── server.js                    # 進入點：啟動 HTTP server，檢查 JWT_SECRET
├── app.js                       # Express 應用設定：middleware、路由掛載
├── src/
│   ├── database.js              # DB 連線、建表、seed 資料、orders 表欄位 migration
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT 驗證，成功後將 { userId, email, role } 掛到 req.user
│   │   ├── adminMiddleware.js   # 角色檢查，req.user.role 必須為 'admin'
│   │   ├── sessionMiddleware.js # 讀取 X-Session-Id header，掛到 req.sessionId
│   │   └── errorHandler.js     # 全域錯誤處理，過濾 500 錯誤細節,統一回應格式
│   ├── services/
│   │   └── ecpayService.js      # 綠界 AIO 金流服務模組（CheckMacValue、AIO 表單參數、QueryTradeInfo 主動查詢）
│   ├── utils/
│   │   └── shipping.js          # 配送規則常數與運費／訂單總額純函式
│   └── routes/
│       ├── authRoutes.js        # /api/auth：register、login、profile
│       ├── productRoutes.js     # /api/products：公開商品列表與詳情
│       ├── cartRoutes.js        # /api/cart：購物車（雙模式認證）
│       ├── orderRoutes.js       # /api/orders：用戶訂單（JWT 必須）；含 ECPay 表單產生、付款狀態主動查詢
│       ├── adminProductRoutes.js# /api/admin/products：後台商品 CRUD（admin 必須）
│       ├── adminOrderRoutes.js  # /api/admin/orders：後台訂單查詢（admin 必須）
│       ├── ecpayRoutes.js       # /ecpay：綠界瀏覽器導回與 Server Notify（免 auth）
│       └── pageRoutes.js        # 頁面路由：渲染 EJS 模板
├── views/
│   ├── layouts/
│   │   ├── front.ejs            # 前台版面（含 header、footer）
│   │   └── admin.ejs            # 後台版面（含 sidebar）
│   ├── pages/
│   │   ├── index.ejs            # 首頁（商品列表）
│   │   ├── product-detail.ejs   # 商品詳情
│   │   ├── cart.ejs             # 購物車
│   │   ├── checkout.ejs         # 結帳
│   │   ├── login.ejs            # 登入 / 註冊
│   │   ├── orders.ejs           # 我的訂單
│   │   ├── order-detail.ejs     # 訂單詳情
│   │   ├── 404.ejs              # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs     # 後台商品管理
│   │       └── orders.ejs       # 後台訂單管理
│   └── partials/
│       ├── head.ejs             # <head> 共用區塊（含 CSS 引用）
│       ├── header.ejs           # 前台導覽列
│       ├── footer.ejs           # 前台頁腳
│       ├── admin-header.ejs     # 後台頂部列
│       ├── admin-sidebar.ejs    # 後台側邊欄
│       └── notification.ejs     # 通知 toast UI 元件
├── public/
│   ├── css/
│   │   ├── input.css            # Tailwind 來源檔（@import tailwindcss）
│   │   └── output.css           # 編譯後的 CSS（git tracked，生產用）
│   ├── stylesheets/
│   │   └── style.css            # 額外自訂樣式
│   └── js/
│       ├── api.js               # 前端 fetch 封裝，自動附帶 JWT / Session header
│       ├── auth.js              # 前端認證工具（localStorage token 存取、登出）
│       ├── header-init.js       # 導覽列初始化（登入狀態 UI 切換）
│       ├── notification.js      # Toast 通知系統
│       └── pages/               # 頁面專屬 JS
│           ├── index.js         # 首頁：商品列表、分頁
│           ├── product-detail.js# 商品詳情：加入購物車
│           ├── cart.js          # 購物車：數量調整、移除
│           ├── checkout.js      # 結帳：填寫收件資訊、建立訂單
│           ├── login.js         # 登入 / 註冊表單
│           ├── orders.js        # 我的訂單列表
│           ├── order-detail.js  # 訂單詳情、ECPay 付款跳轉、主動確認付款狀態
│           ├── admin-products.js# 後台：商品 CRUD 操作
│           └── admin-orders.js  # 後台：訂單篩選與查看
├── tests/
│   ├── setup.js                 # 測試共用工具（getAdminToken、registerUser）
│   ├── sequencer.mjs            # Vitest 固定檔案執行順序
│   ├── unit/
│   │   └── shipping.test.js     # Shipping 純函式 unit tests
│   ├── integration/
│   │   ├── env.setup.js         # 強制使用記憶體 SQLite
│   │   └── order-flow.test.js   # 訂單、DB、庫存與 rollback 完整驗證
│   ├── e2e/
│   │   └── ecpay-payment.spec.js# Playwright 綠界 WebATM E2E
│   ├── auth.test.js
│   ├── products.test.js
│   ├── cart.test.js
│   ├── orders.test.js
│   ├── adminProducts.test.js
│   └── adminOrders.test.js
├── swagger-config.js            # OpenAPI 3.0.3 設定（security schemes）
├── generate-openapi.js          # 輸出 openapi.json 的腳本
├── scripts/generate-postman.js  # OpenAPI → Postman Collection
├── playwright.config.js         # E2E 設定（不自動啟動 server）
├── vitest.unit.config.js        # Unit Test 設定
├── vitest.integration.config.js # Integration Test 與記憶體 DB 設定
├── vitest.config.js             # 測試設定（固定執行順序）
├── database.sqlite              # SQLite 資料庫主檔
├── database.sqlite-shm          # WAL 模式共享記憶體檔
├── database.sqlite-wal          # WAL 模式預寫日誌
├── .env                         # 本機環境變數（不進 git）
└── .env.example                 # 環境變數範本
```

---

## 啟動流程

1. `server.js` 載入 `app.js`
2. `app.js` 在 `require('./src/database')` 時觸發 `initializeDatabase()`：
   - 以 `CREATE TABLE IF NOT EXISTS` 建立所有資料表
   - 若 admin 帳號不存在則 seed（email 從 `ADMIN_EMAIL` env 讀取）
   - 若 products 表為空則 seed 8 筆花卉商品
3. Express 掛載 middleware（cors、json parser、sessionMiddleware）
4. 掛載 API 路由與頁面路由
5. 掛載 404 handler（API 路徑回 JSON，其他回 EJS 404 頁面）
6. 掛載全域 errorHandler
7. `server.js` 在 `require.main === module` 條件下才呼叫 `app.listen()`（確保測試時不啟動 server）

---

## API 路由總覽

| 前綴 | 檔案 | 認證要求 | 說明 |
|------|------|----------|------|
| `/api/auth` | `authRoutes.js` | 無（profile 除外） | 註冊、登入、取個人資料 |
| `/api/products` | `productRoutes.js` | 無 | 公開商品列表與詳情 |
| `/api/cart` | `cartRoutes.js` | JWT **或** X-Session-Id | 購物車 CRUD |
| `/api/orders` | `orderRoutes.js` | JWT（必須） | 用戶訂單建立與查詢 |
| `/api/admin/products` | `adminProductRoutes.js` | JWT + admin role | 後台商品管理 |
| `/api/admin/orders` | `adminOrderRoutes.js` | JWT + admin role | 後台訂單查詢 |
| `/ecpay` | `ecpayRoutes.js` | 無（綠界回呼，以 CheckMacValue 驗證） | 綠界瀏覽器導回 / Server Notify |
| `/` | `pageRoutes.js` | 無（前端 JS 自行控制） | SSR 頁面渲染 |

---

## 統一回應格式

所有 `/api/*` 路由一律回傳以下結構：

```json
{
  "data": { ... },   // 成功時為實際資料，失敗時為 null
  "error": null,     // 成功時為 null，失敗時為錯誤碼字串（如 "VALIDATION_ERROR"）
  "message": "成功"  // 人類可讀的訊息
}
```

常見錯誤碼：

| 錯誤碼 | HTTP 狀態 | 情境 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 必填欄位缺失、格式錯誤 |
| `CART_EMPTY` | 400 | 結帳時購物車為空 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `INVALID_STATUS` | 400 | 訂單狀態不允許該操作 |
| `UNAUTHORIZED` | 401 | 未提供 token、token 無效或用戶不存在 |
| `FORBIDDEN` | 403 | 已登入但無管理員權限 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | Email 重複、商品有未完成訂單 |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤 |

---

## 認證與授權機制

### 標準 JWT 認證（authMiddleware）

適用路由：`/api/auth/profile`、`/api/orders/*`、`/api/admin/*`

1. 讀取 `Authorization: Bearer <token>` header
2. 以 `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` 驗證
3. 從 DB 確認 userId 仍存在
4. 將 `{ userId, email, role }` 掛到 `req.user`
5. 任一步驟失敗即回傳 401

### 管理員權限（adminMiddleware）

必須在 authMiddleware 之後使用：

- 檢查 `req.user.role === 'admin'`
- 不符合則回傳 403

### 購物車雙模式認證（dualAuth，僅 cartRoutes.js）

1. **優先嘗試 JWT**：若存在 `Authorization: Bearer` header，驗證 token
   - 驗證成功：設定 `req.user`，繼續
   - 驗證失敗：**立即回傳 401**，不 fallback
2. **Fallback 至 Session**：若無 Authorization header 且 `req.sessionId` 存在（由 sessionMiddleware 注入），繼續（guest 模式）
3. 若兩者皆無：回傳 401

#### 購物車所有者判斷

```javascript
function getOwnerCondition(req) {
  if (req.user) return { field: 'user_id', value: req.user.userId };
  return { field: 'session_id', value: req.sessionId };
}
```

SQL 查詢依此動態拼接 `WHERE` 條件，確保用戶只能操作自己的購物車。

### JWT 參數

- 演算法：HS256
- Payload：`{ userId, email, role }`
- 有效期：7 天（`expiresIn: '7d'`）
- 密鑰：`process.env.JWT_SECRET`

---

## 資料庫 Schema

正式資料庫路徑：`<專案根目錄>/database.sqlite`；設定 `DATABASE_PATH` 時改用指定路徑，Integration Test 固定使用 `:memory:`。
設定：WAL 模式（`PRAGMA journal_mode = WAL`）、外鍵約束啟用（`PRAGMA foreign_keys = ON`）

### users

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| email | TEXT | UNIQUE, NOT NULL | 登入用 email |
| password_hash | TEXT | NOT NULL | bcrypt hash（10 rounds） |
| name | TEXT | NOT NULL | 顯示名稱 |
| role | TEXT | NOT NULL, CHECK IN ('user','admin'), DEFAULT 'user' | 角色 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間（ISO 8601） |

### products

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 商品名稱 |
| description | TEXT | — | 商品描述（可為 NULL） |
| price | INTEGER | NOT NULL, CHECK > 0 | 單價（新台幣，正整數） |
| stock | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | 庫存數量 |
| image_url | TEXT | — | 商品圖片 URL（可為 NULL） |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | 最後更新時間（PUT 時手動更新） |

### cart_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| session_id | TEXT | — | 訪客 session（與 user_id 二擇一填入） |
| user_id | TEXT | FK → users.id | 登入用戶 ID |
| product_id | TEXT | NOT NULL, FK → products.id | 商品 ID |
| quantity | INTEGER | NOT NULL, DEFAULT 1, CHECK > 0 | 數量 |

> `session_id` 與 `user_id` 不同時存在；依認證模式決定哪個欄位有值。

### orders

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_no | TEXT | UNIQUE, NOT NULL | 訂單編號（格式：`ORD-YYYYMMDD-XXXXX`） |
| user_id | TEXT | NOT NULL, FK → users.id | 下單用戶 |
| recipient_name | TEXT | NOT NULL | 收件人姓名 |
| recipient_email | TEXT | NOT NULL | 收件人 Email |
| recipient_address | TEXT | NOT NULL | 收件地址 |
| subtotal | INTEGER | NOT NULL, DEFAULT 0 | 商品小計快照 |
| shipping_fee | INTEGER | NOT NULL, DEFAULT 0 | 總運費快照（配送費與所有附加費） |
| shipping_method | TEXT | NOT NULL, DEFAULT 'home_delivery', CHECK | `home_delivery` 或 `convenience_store` |
| is_remote_area | INTEGER | NOT NULL, DEFAULT 0, CHECK IN (0,1) | 是否加收偏遠地區費（SQLite boolean） |
| is_same_day_delivery | INTEGER | NOT NULL, DEFAULT 0, CHECK IN (0,1) | 是否加收當日急件費（SQLite boolean） |
| total_amount | INTEGER | NOT NULL | 訂單總額快照（`subtotal + shipping_fee`） |
| status | TEXT | NOT NULL, DEFAULT 'pending', CHECK IN ('pending','paid','failed') | 訂單狀態 |
| merchant_trade_no | TEXT | UNIQUE（partial index，NULL 除外） | 送給綠界的交易編號（≤ 20 字元，格式：`EC` + 10 位 Unix 秒 + 6 位 hex） |
| ecpay_trade_no | TEXT | — | 綠界回傳的交易編號（`TradeNo`），付款成功後寫入 |
| payment_type | TEXT | — | 綠界回傳的付款方式（例如 `Credit_CreditCard`） |
| paid_at | TEXT | — | 綠界回傳的付款完成時間（`PaymentDate`，格式 `yyyy/MM/dd HH:mm:ss`） |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |

訂單狀態流：`pending` → `paid`（付款成功）或 `pending` → `failed`（付款失敗）。一旦離開 pending 狀態即不可再變更。

> **Orders 欄位 migration**：為相容既有資料庫，`src/database.js` 於啟動時以 `PRAGMA table_info(orders)` 檢查並補齊 Shipping 與 ECPay 欄位。舊訂單的 `subtotal` 以原 `total_amount` 回填、`shipping_fee` 為 0；`merchant_trade_no` 採 partial unique index，避免多筆 NULL 相互衝突。

### Shipping 計算資料流

```text
購物車商品價格 × 數量 → subtotal
                         ↓
src/utils/shipping.js::calculateShipping
  配送方式 + 滿額門檻 + 偏遠地區 + 當日急件
                         ↓
shipping_fee + total_amount
                         ↓
orders transaction 保存快照 → ECPay TotalAmount
```

`calculateShipping` 不存取 HTTP 或資料庫，因此可直接 unit test。API 僅信任伺服器端從購物車重新計算的 `subtotal`，不接受用戶端傳入的金額。

### order_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_id | TEXT | NOT NULL, FK → orders.id | 所屬訂單 |
| product_id | TEXT | NOT NULL | 商品 ID（快照，商品刪除後仍保留） |
| product_name | TEXT | NOT NULL | 商品名稱快照（下單當時） |
| product_price | INTEGER | NOT NULL | 商品單價快照（下單當時） |
| quantity | INTEGER | NOT NULL | 購買數量 |

> `order_items.product_id` **無** FK 約束，是設計上的刻意決定：允許商品被刪除後訂單紀錄仍完整保留商品快照。

---

## 頁面渲染機制

### EJS 版面層次

```
layouts/front.ejs   ← 包裹 body 變數（前台）
    ↑
pages/index.ejs     ← 渲染成 body 後注入版面

layouts/admin.ejs   ← 包裹 body 變數（後台）
    ↑
pages/admin/products.ejs
```

`pageRoutes.js` 中的渲染流程：
1. 先 render 內頁 EJS，產生 `body` 字串
2. 再 render layout，將 `body` 注入
3. 傳遞 `title`、`pageScript` 等 locals

### pageScript 機制

每個頁面渲染時傳入 `pageScript` 字串（如 `'index'`、`'cart'`），layout 用此值動態引入對應的頁面 JS：

```html
<script src="/js/pages/<%= pageScript %>.js"></script>
```

---

## 訂單號生成格式

```javascript
function generateOrderNo() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // '20260418'
  const random = uuidv4().slice(0, 5).toUpperCase(); // 'A3F2B'
  return `ORD-${dateStr}-${random}`; // 'ORD-20260418-A3F2B'
}
```

---

## 綠界 ECPay 金流整合架構

本專案運行於本地端（`http://localhost:3001`），無法接收綠界的 Server Notify（`ReturnURL` 的 S2S POST）。付款狀態的權威來源改為**主動呼叫綠界 `QueryTradeInfo` API**。

### 整體資料流

```
建立訂單時已寫入 merchant_trade_no
                ↓
[前端] 按「前往綠界付款」
                ↓
POST /api/orders/:id/ecpay-form
    → buildAioFormParams 組出 AIO 參數 + CheckMacValue
    → 回傳 { action, params }
                ↓
[前端] 動態 <form> auto-submit 至 payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5
                ↓
[綠界頁面] 消費者完成付款
                ↓
[綠界] 瀏覽器導回 POST /ecpay/result（OrderResultURL）
    → 驗證 CheckMacValue（crypto.timingSafeEqual）
    → reconcileByMerchantTradeNo() 呼叫 QueryTradeInfo 作為權威確認
    → UPDATE orders SET status=... WHERE id=? AND status='pending'（冪等）
    → redirect /orders/:id?payment=success|failed|cancel
                ↓
[前端] order-detail 頁面依 ?payment= 顯示結果橫幅
```

### 三個回呼端點

| 端點 | 綠界對應 | 用途 | 於本地是否會被觸發 |
|------|---------|------|-------------------|
| `POST /ecpay/result` | `OrderResultURL` | 消費者瀏覽器導回 | ✅ 主要流程 |
| `POST /ecpay/notify` | `ReturnURL` | Server-to-Server 通知 | ❌（本地收不到，預留供未來部署公開環境） |
| `GET /ecpay/client-back` | `ClientBackURL` | 消費者按「取消/返回」 | ✅ 單純導回訂單頁 |

### 備援：使用者主動查詢

若消費者關閉瀏覽器沒走完 `OrderResultURL` 導回流程，訂單詳情頁提供「重新確認付款狀態」按鈕，呼叫 `POST /api/orders/:id/verify-payment` 觸發 `QueryTradeInfo` 主動同步。此端點冪等，重複呼叫不影響已更新狀態。

### 關鍵實作細節

- **CheckMacValue（CMV-SHA256）**：`src/services/ecpayService.js` 提供 `ecpayUrlEncode`（實作 `encodeURIComponent` → `%20→+` → `~→%7e` → `'→%27` → `.toLowerCase()` → .NET 七字元替換）與 `generateCheckMacValue` / `verifyCheckMacValue`（以 `crypto.timingSafeEqual` 比對）。
- **`MerchantTradeNo`**：格式 `EC` + 10 位 Unix 秒 + 6 位 hex，共 18 字元，符合綠界 ≤ 20 字元英數字限制，訂單建立 transaction 內產生並寫入 DB。
- **`ItemName`**：多品項以 `#` 分隔，並截斷至 200 字元內以避免觸發綠界 400 字元截斷造成 CheckMacValue 不符。
- **`MerchantTradeDate`**：UTC+8 格式 `yyyy/MM/dd HH:mm:ss`。
- **`QueryTradeInfo`**：`TimeStamp` 使用 `Math.floor(Date.now()/1000)`（3 分鐘內有效），回應為 URL-encoded 字串，以 `URLSearchParams` 解析並驗證 CheckMacValue。
- **狀態對應**：`TradeStatus='1'` → `paid`；`'10200095' / '10100248' / '10100254'` → `failed`；`'0'` → 維持 `pending`。
- **環境切換**：`ECPAY_ENV === 'production'` → `https://payment.ecpay.com.tw`，其餘 → `https://payment-stage.ecpay.com.tw`。
- **HashKey/HashIV 只在 Server**：僅透過 `process.env` 讀取，絕不出現在前端或版本控制。
