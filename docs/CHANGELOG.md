# CHANGELOG.md

## [Unreleased]

### Added

- Shipping 配送費用純函式模組 `src/utils/shipping.js`
  - 宅配基本運費 120 元、商品小計滿 1,500 元免基本運費
  - 超商取貨 60 元（不適用滿額免基本運費）
  - 偏遠地區加收 200 元、當日急件加收 250 元，附加費可累加
- `tests/shipping.test.js` unit tests，涵蓋門檻前後、配送方式及附加費組合
- 綠界 ECPay AIO 金流整合（信用卡一次付清）
  - `src/services/ecpayService.js`：提供 `ecpayUrlEncode`、`generateCheckMacValue`、`verifyCheckMacValue`、`generateMerchantTradeNo`、`buildAioFormParams`、`queryTradeInfo` 等純函式
  - `POST /api/orders/:id/ecpay-form`（JWT）：產生 AIO 付款表單參數，供前端 auto-submit 跳轉綠界
  - `POST /api/orders/:id/verify-payment`（JWT）：主動呼叫綠界 `QueryTradeInfo` 驗證付款狀態（本地無 Server Notify 的權威確認機制）
- 綠界回呼路由 `src/routes/ecpayRoutes.js`（掛載於 `/ecpay`，免 auth，以 `CheckMacValue` 驗證）
  - `POST /ecpay/result`（OrderResultURL）：瀏覽器導回後觸發主動查詢並導回訂單詳情頁
  - `POST /ecpay/notify`（ReturnURL）：預留實作，供未來部署公開環境啟用（回應 `1|OK`）
  - `GET /ecpay/client-back`（ClientBackURL）：消費者取消時導回訂單詳情頁
- 訂單詳情頁支援綠界付款流程：新增「前往綠界付款」與「重新確認付款狀態」按鈕；依 `?payment=success|failed|cancel` 顯示結果橫幅

### Changed

- `POST /api/orders` 接受配送選項，由 Shipping 模組計算並回傳 `subtotal`、`shipping_fee` 與含運費的 `total_amount`
- `orders` 表新增配送選項及金額快照欄位，啟動時自動 migration 既有資料庫
- 購物車、結帳、訂單詳情及後台訂單詳情頁顯示一致的配送費用資訊
- `orders` 表新增四個 ECPay 相關欄位：`merchant_trade_no`（partial unique index）、`ecpay_trade_no`、`payment_type`、`paid_at`；啟動時以 `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` 做相容性 migration
- `POST /api/orders` 在 transaction 內同時產生並寫入 `merchant_trade_no`，並於回應中帶出
- `views/pages/order-detail.ejs` 與 `public/js/pages/order-detail.js` 移除「付款成功／付款失敗」測試按鈕與對應處理函式，改用 ECPay 跳轉流程；`PATCH /api/orders/:id/pay` 端點保留供測試使用

---

## [1.0.0] - 2026-04-18

### 新增

- 用戶認證系統（註冊、登入、JWT 發放、個人資料）
- 公開商品列表與詳情 API（分頁支援）
- 購物車功能（雙模式認證：JWT 登入用戶 + X-Session-Id 訪客）
- 訂單建立（Transaction：建立訂單、快照商品價格、扣庫存、清空購物車）
- 模擬付款（pending → paid / failed 狀態流）
- 後台商品 CRUD（含刪除保護：有 pending 訂單時拒絕刪除）
- 後台訂單管理（列表含狀態篩選、詳情含用戶資訊）
- SSR 頁面渲染（EJS）：前台購物流程 + 後台管理介面
- Tailwind CSS v4 整合
- OpenAPI 3.0.3 文件（swagger-jsdoc，從 JSDoc 自動生成）
- Vitest + Supertest 整合測試套件
- SQLite WAL 模式 + 外鍵約束
- 8 筆花卉商品 seed 資料
