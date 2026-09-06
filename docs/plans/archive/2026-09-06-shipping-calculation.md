# Shipping 配送費用開發計畫

## User Story

作為準備結帳的顧客，我想依配送方式、商品小計與附加服務得到正確運費，以便在建立訂單與付款前清楚知道應付總額。

## Spec（規格）

### Shipping 模組

- 在 `src/utils/shipping.js` 提供不依賴 Express 或 SQLite 的純函式與常數。
- 配送方式：`home_delivery`（宅配）與 `convenience_store`（超商取貨）。
- 宅配基本運費 120 元；商品小計達 1,500 元時免除宅配基本運費。
- 超商取貨費 60 元，不屬於「基本運費」，不套用滿額免基本運費規則。
- 偏遠地區加收 200 元；當日急件加收 250 元；附加費可累加且不受滿額免運影響。
- 輸出商品小計、基本／取貨費、附加費、總運費與訂單總額，供路由與 unit test 共用。

### 建立訂單 API

- `POST /api/orders` 接受 `shippingMethod`、`isRemoteArea`、`isSameDayDelivery`。
- 驗證配送方式與 boolean 欄位；錯誤時維持 `{ data, error, message }` 回應格式。
- 由購物車快照計算 `subtotal`，再由 Shipping 模組計算 `shipping_fee` 與 `total_amount`。
- 在既有 SQLite transaction 內保存配送選項與金額快照，並照常完成訂單、明細、扣庫存及清空購物車。
- 建立訂單、訂單列表、訂單詳情與後台訂單 API 均可回傳配送金額欄位；ECPay 使用包含運費的 `total_amount`。

### 前端

- 結帳頁可選宅配／超商取貨、偏遠地區與當日急件，摘要即時計算運費與總額。
- 購物車頁將提示修正為宅配基本運費 120 元、滿 1,500 元免基本運費。
- 訂單詳情顯示配送選項、商品小計與運費快照。

### 資料庫相容性

- 新資料庫直接建立 Shipping 欄位。
- 既有資料庫啟動時以欄位 migration 補上 `subtotal`、`shipping_fee`、`shipping_method`、`is_remote_area`、`is_same_day_delivery`，既有訂單使用安全預設值。

### 測試

- 新增 `tests/shipping.test.js`，涵蓋宅配、超商、1,499／1,500 邊界、偏遠、急件、多附加費、滿額與附加費並存。
- 擴充 `tests/orders.test.js` 驗證建立訂單 API 的運費、總額與配送快照，並驗證無效配送資料。
- 更新 Vitest 固定執行清單，維持既有有狀態測試的相對順序。

## Tasks

- [x] 建立 Shipping 純函式模組與 unit tests
- [x] 新增訂單 Shipping 欄位與相容性 migration
- [x] 整合建立訂單流程、回應與 OpenAPI JSDoc
- [x] 更新結帳、購物車及訂單詳情 UI
- [x] 更新 `docs/` 說明與產生 `openapi.json`
- [x] 依固定順序執行完整測試
- [x] 完成後勾選任務並移至 `docs/plans/archive/`
