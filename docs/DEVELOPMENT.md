# DEVELOPMENT.md

## 環境變數

| 變數 | 用途 | 必要 | 預設值 |
|------|------|------|--------|
| `JWT_SECRET` | JWT 簽名密鑰 | **是**（啟動失敗） | 無 |
| `PORT` | HTTP 監聽埠 | 否 | `3001` |
| `BASE_URL` | Server 對外 URL（OpenAPI 文件 + ECPay 回呼 `OrderResultURL` / `ReturnURL` / `ClientBackURL` 基底） | 否 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許的來源 | 否 | `http://localhost:3001` |
| `ADMIN_EMAIL` | Seed 管理員帳號 email | 否 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | Seed 管理員帳號密碼 | 否 | `12345678` |
| `ECPAY_MERCHANT_ID` | 綠界商店代號（AIO 金流） | 否 | `3002607`（官方測試帳號） |
| `ECPAY_HASH_KEY` | 綠界 HashKey（CheckMacValue 計算用） | 否 | 官方測試值 |
| `ECPAY_HASH_IV` | 綠界 HashIV（CheckMacValue 計算用） | 否 | 官方測試值 |
| `ECPAY_ENV` | 綠界環境；`production` → `payment.ecpay.com.tw`，其餘 → `payment-stage.ecpay.com.tw` | 否 | `staging` |
| `NODE_ENV` | 執行環境，影響 bcrypt salt rounds | 否 | — |

> `NODE_ENV=test` 時 bcrypt salt rounds 降為 1 以加速測試。測試環境需確認 `.env` 中的 `JWT_SECRET` 有效。

---

## 命名規則

### 檔案命名

| 類型 | 規則 | 範例 |
|------|------|------|
| Route 檔案 | camelCase + `Routes.js` | `authRoutes.js`, `adminProductRoutes.js` |
| Middleware 檔案 | camelCase + `Middleware.js` | `authMiddleware.js`, `sessionMiddleware.js` |
| 測試檔案 | camelCase + `.test.js` | `cart.test.js`, `adminOrders.test.js` |
| 前端頁面 JS | kebab-case | `product-detail.js`, `admin-products.js` |
| EJS 頁面模板 | kebab-case + `.ejs` | `product-detail.ejs`, `order-detail.ejs` |
| 計畫文件 | `YYYY-MM-DD-<feature-name>.md` | `2026-04-18-payment-integration.md` |

### 資料庫欄位命名

統一使用 `snake_case`：`user_id`、`product_name`、`created_at`。

### API 請求 Body

**camelCase**（JavaScript 慣例）：`productId`、`recipientName`、`recipientEmail`。

回傳資料為 `snake_case`（與 DB 欄位一致）：`product_id`、`order_no`、`created_at`。

---

## 模組系統

本專案使用 **CommonJS（CJS）**：`require()` / `module.exports`。

唯一例外：`vitest.config.js` 使用 ESM（`import`）語法，因 Vitest 要求。

不要在 `src/`、`tests/`、`app.js` 中混用 ESM `import`。

---

## 新增 API 端點的步驟

1. **選擇或建立 route 檔案**：
   - 公開 API → 在既有 `src/routes/*.js` 新增路由
   - 需要新模組 → 建立 `src/routes/新模組Routes.js`，並在 `app.js` 掛載

2. **套用正確的 middleware**：
   - 需要 JWT 登入 → `authMiddleware`
   - 需要 admin 角色 → `authMiddleware` + `adminMiddleware`（順序不可錯）
   - 購物車類操作 → 使用 `dualAuth`（仿照 `cartRoutes.js`）

3. **撰寫 JSDoc OpenAPI 註解**：緊接在 `router.METHOD` 之前，格式見「JSDoc 格式」節。

4. **統一回應格式**：所有回應必須為 `{ data, error, message }`，error 成功時為 null。

5. **新增對應測試**：見 [TESTING.md](./TESTING.md)。

---

## 新增 Middleware 的步驟

1. 在 `src/middleware/` 建立 `<名稱>Middleware.js`
2. Export 一個 Express middleware 函式 `(req, res, next) => {}`
3. 錯誤時回傳統一格式 JSON，不直接 throw
4. 在 `app.js`（全域）或路由檔（路由層級）掛載

---

## 新增資料表的步驟

1. 在 `src/database.js` 的 `db.exec()` SQL 字串內新增 `CREATE TABLE IF NOT EXISTS ...`
2. 若需要 seed 資料，在 `initializeDatabase()` 呼叫新的 seed 函式
3. 所有 ID 欄位使用 `uuidv4()` 生成 TEXT 型別，不使用自增 INTEGER

---

## JSDoc / OpenAPI 格式

所有 API 路由函式前須加上 `@openapi` JSDoc，供 `swagger-jsdoc` 解析：

```javascript
/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: 取得商品列表
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 找不到資源
 */
router.get('/', (req, res) => { ... });
```

需要認證的路由在 `security` 欄位聲明：
- JWT：`- bearerAuth: []`
- Session：`- sessionId: []`
- 購物車雙模式：同時列出兩者

---

## 計畫歸檔流程

1. **建立計畫**：新計畫文件放置於 `docs/plans/`，命名格式：`YYYY-MM-DD-<feature-name>.md`
2. **計畫文件結構**：
   ```markdown
   # [功能名稱] 開發計畫

   ## User Story
   作為 <角色>，我想要 <功能>，以便 <目的>

   ## Spec（規格）
   - API 端點定義
   - 業務邏輯描述
   - 錯誤情境

   ## Tasks
   - [ ] Task 1
   - [ ] Task 2
   ```
3. **功能完成後**：
   - 移動計畫文件至 `docs/plans/archive/`
   - 更新 `docs/FEATURES.md` 功能狀態表
   - 在 `docs/CHANGELOG.md` 新增版本記錄

---

## 前端 JS 組織規則

- `public/js/api.js`：封裝 `fetch` 呼叫，自動從 localStorage 讀取 JWT token，自動附帶 `Authorization: Bearer` header 和 `X-Session-Id` header
- `public/js/auth.js`：管理 localStorage 中的 `token` 和 `user` 資訊，提供登出功能
- `public/js/pages/*.js`：頁面專屬邏輯，不要在此處重複實作 API 呼叫封裝

新增頁面時：
1. 建立 `views/pages/<頁面名>.ejs`
2. 在 `pageRoutes.js` 新增路由，傳入 `pageScript: '<頁面名>'`
3. 建立 `public/js/pages/<頁面名>.js`
