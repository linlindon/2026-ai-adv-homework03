---
name: e2e-payment-test
description: >
  花漾生活電商「結帳 + 綠界金流」端到端（e2e）測試流程，使用 Playwright MCP。
  觸發詞：e2e、e2e 測試、結帳測試、付款測試、綠界、綠界金流、ECPay、WebATM、網路ATM、playwright 測試。
  完整路徑：啟動 server → 登入 → 加入購物車 → 結帳 → 綠界收銀台 → 網路ATM/台灣土地銀行 → 付款成功 → 截圖存證。
metadata:
  type: project
  requires: Playwright MCP（mcp__playwright__*）
---

# E2E 付款測試（綠界 WebATM 全流程）

用 Playwright MCP 跑通「登入 → 加購物車 → 結帳 → 綠界網路ATM（台灣土地銀行）→ 付款成功」，
並在結束時**把最終結果截圖存到 `docs/e2e-evidence/`**。本 skill 的選擇器與步驟皆已實測通過。

## ⚠️ 開始前必讀（最常見的失敗原因）

1. **Server 必須能對外連到 `payment-stage.ecpay.com.tw`。**
   你的 `/ecpay/result` 是靠**後端主動查詢綠界**（`ecpayService.queryTradeInfo`）來判定付款成功；
   只要 server 在沙箱 / 防火牆 / Proxy 後面連不到綠界，即使消費者實際付款成功，也會 fallback 成
   「付款已取消」。→ **跑 `node server.js` 時不要關在網路沙箱裡。**
2. **付款方式要選「網路ATM (WebATM)」，不是「ATM虛擬帳號」。**
   - 網路ATM = **同步**付款，按 Save 當場成交，會看到「付款成功」。
   - ATM虛擬帳號 = **非同步**取號，只給虛擬帳號要事後轉帳，**永遠不會當場顯示付款成功**。
3. **綠界要顯示 ATM 選項，`src/services/ecpayService.js` 的 `ChoosePayment` 必須是 `'ALL'`。**
   若是 `'Credit'`，綠界只會出信用卡頁，到不了 ATM。
4. **Playwright MCP 點擊/輸入的參數是 `target`（element ref 或 selector），不是 `ref`。**

## 前置資料

| 項目 | 值 / 來源 |
|------|-----------|
| 網站 | `http://localhost:3001` |
| 帳號 | `.env` 的 `ADMIN_EMAIL`（admin@hexschool.com） |
| 密碼 | `.env` 的 `ADMIN_PASSWORD`（12345678） |
| 綠界 | `.env` 的 `ECPAY_*`（staging 測試帳號 3002607） |
| 登入後 token | localStorage 的 `flower_token`（API 呼叫帶 `Authorization: Bearer <flower_token>`） |
| 截圖輸出 | `docs/e2e-evidence/` |

## 測試步驟

### 0. 檢查 / 啟動 server（非沙箱）
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
```
- 回 `200` → 已在跑，直接下一步。
- 沒回應 → 啟動（**務必非沙箱、能連外**）：`node server.js`（背景執行）。
- 順手確認連得到綠界：`curl -s -o /dev/null -w "%{http_code}" https://payment-stage.ecpay.com.tw/`（應為 200）。

### 1. 登入
- `browser_navigate` → `http://localhost:3001/login`
- `browser_snapshot` 取得欄位 ref
- 在「請輸入 Email」填 `admin@hexschool.com`、「請輸入密碼」填 `12345678`
- 點「登入」按鈕 → 會導回首頁，右上角出現「Admin / 登出」即成功

### 2. 加入購物車
- 在首頁商品區，任一商品點「加入購物車」（例：粉色玫瑰花束）。
- 或用 API（較穩定，避免重複加）：
  ```js
  // browser_evaluate
  const token = localStorage.getItem('flower_token');
  const pd = await (await fetch('/api/products')).json();
  const p = pd.data.products ? pd.data.products[0] : pd.data[0];
  await fetch('/api/cart', { method:'POST',
    headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body: JSON.stringify({ productId: p.id, quantity: 1 }) });
  ```
- 導覽列「購物車」應顯示數量。

### 3. 結帳
- `browser_navigate` → `http://localhost:3001/checkout`
- 填三欄（placeholder 選擇器即可）：
  - `input[placeholder="請輸入收件人姓名"]` → 王小明
  - `input[placeholder="請輸入 Email"]` → a31420o@gmail.com
  - `input[placeholder="請輸入收件地址"]` → 台北市中正區重慶南路一段122號
  - （頁面上的「綠界信用卡付款 / ATM 轉帳」只是靜態裝飾，**不影響**實際付款方式，不用管它）
- 點「確認送出訂單」→ 導向 `/orders/:id`（訂單詳情，狀態「待付款」）

### 4. 進入綠界
- 點「前往綠界付款」→ 跳轉 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`

### 5. 選網路ATM + 台灣土地銀行
- 付款方式列點 **網路ATM**：`target` 用 list item（snapshot 裡的 `WebATM`），或 selector `li:has-text("網路ATM")`
- 選銀行（WebATM 的下拉是 `#selWebATMBank`）：
  ```js
  // browser_select_option, target: "#selWebATMBank", values: ["台灣土地銀行"]
  ```
- **強制啟用「前往付款」按鈕**（它在選銀行前是 `pointer-events:none`）：
  ```js
  // browser_evaluate
  const b = document.querySelector('#WebATMPaySubmit');
  if (b) { b.style.pointerEvents='auto'; b.style.cursor='pointer'; }
  ```
- 點 `#WebATMPaySubmit`（前往付款）

### 6. 關閉提醒彈窗 → 銀行頁 Save
- 會跳「綠界科技貼心提醒您，將跳轉至銀行頁面…」彈窗 → 點 **關閉**（`button:has-text("關閉")`）
- 跳到銀行頁 `https://pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm`
  （表單 `LandWebATMClientReturn`，`RC=0`、`MSG=交易成功`）
- 點該頁的 **Save** 按鈕：先 `browser_snapshot` 取得 Save 的 element ref 再以 ref 點擊
  （CSS `button:has-text("Save")` 在這頁不一定 match，用 snapshot ref 最穩）

### 7. 驗證結果
- 自動導回 `http://localhost:3001/orders/:id?payment=success`
- 頁面應顯示綠色徽章「**已付款**」+「**付款成功！感謝您的購買。**」
- 若想用 API 再次確認：`POST /api/orders/:id/verify-payment`（帶 Bearer token），
  回傳應含 `status: "paid"`、`ecpay.TradeStatus: "1"`、`PaymentType: "WebATM_LAND"`。

### 8. 截圖存證（必做）
- `browser_take_screenshot`（`fullPage: true`），用 `filename` 參數**直接帶絕對路徑**存到
  `docs/e2e-evidence/`，檔名含時間戳與結果，例如：
  `filename: "<專案絕對路徑>/docs/e2e-evidence/e2e-paid-YYYYMMDD-HHmm.png"`
  （直接給絕對路徑就會存進 `docs/e2e-evidence/`，不需從 `.playwright-mcp/` 再複製。
  注意 `.playwright-mcp/` 已被 gitignore，存那裡不會進版控。）
- 在回報中附上截圖路徑與最終狀態。

### 9. 收尾
- 若 server 是這次 skill 啟動的，提示使用者：`lsof -ti tcp:3001 | xargs kill` 可關閉，避免占用 port。

## Troubleshooting

| 症狀 | 原因 / 解法 |
|------|-------------|
| 導回網站顯示「付款已取消」但其實有付款 | server 連不到綠界查詢 API。看 `node server.js` 終端機是否有 `[ECPay] /ecpay/result query 失敗`；確認非沙箱、無防火牆/Proxy 擋 `payment-stage.ecpay.com.tw`。也可在訂單頁按「重新確認付款狀態」手動補對帳 |
| 綠界只出現信用卡、沒有 ATM | `ecpayService.js` 的 `ChoosePayment` 不是 `'ALL'` |
| 選了 ATM 卻看不到「付款成功」 | 選成「ATM虛擬帳號」（非同步取號）。要當場成功請選「網路ATM (WebATM)」 |
| 「前往付款」點了沒反應 | 按鈕在選銀行前是 `pointer-events:none`，需先 `browser_evaluate` 強制啟用 |
| 卡在綠界沒跳轉銀行頁 | 還有「將跳轉至銀行頁面」提醒彈窗沒按「關閉」 |
| `browser_click` 報參數錯誤 | 參數名是 `target`（不是 `ref`）；值可用 snapshot 的 element ref 或 CSS selector |
| `verify-payment` 回 502 / fetch failed | 同第一列，server 對外連線問題 |

## 相關檔案
- `src/routes/ecpayRoutes.js` — `/ecpay/result`（導回後對帳）、`/ecpay/notify`（S2S 通知）、`/ecpay/client-back`
- `src/routes/orderRoutes.js` — 建立訂單、`/api/orders/:id/ecpay-form`、`/api/orders/:id/verify-payment`
- `src/services/ecpayService.js` — `buildAioFormParams`（`ChoosePayment`）、`queryTradeInfo`
- `views/pages/checkout.ejs` / `public/js/pages/checkout.js` — 結帳頁
