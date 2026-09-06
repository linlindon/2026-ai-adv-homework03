# 花卉電商網站

一個使用 Node.js 全端開發的花卉電商 demo，包含前台購物流程與後台管理功能。

結帳支援宅配與超商取貨，並依滿額免基本運費、偏遠地區及當日急件條件計算運費；後端以獨立 Shipping 純函式模組作為訂單金額的權威來源。

## 配送費用

| 條件 | 費用 |
|------|------|
| 宅配基本運費 | NT$ 120；商品小計滿 NT$ 1,500 免除 |
| 超商取貨 | NT$ 60；不屬於基本運費，不適用滿額免運 |
| 偏遠地區 | 加收 NT$ 200 |
| 當日急件 | 加收 NT$ 250 |

附加費可同時累加，且滿額時仍需支付成立的附加費。

## 技術棧

| 類別 | 技術 |
|------|------|
| 執行環境 | Node.js |
| Web 框架 | Express 4 |
| 資料庫 | SQLite（better-sqlite3，WAL 模式） |
| 模板引擎 | EJS 5 |
| CSS 框架 | Tailwind CSS v4 |
| 認證 | JWT（HS256，7 天有效期） |
| 密碼雜湊 | bcrypt（10 rounds） |
| UUID 生成 | uuid v4 |
| API 文件 | swagger-jsdoc（OpenAPI 3.0.3） |
| 測試框架 | Vitest + Supertest |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，至少設定 JWT_SECRET

# 3. 啟動（含 CSS 編譯）
npm start

# 或開發模式（分開啟動）
node server.js          # 終端機 1
npm run dev:css         # 終端機 2

# 4. 開啟瀏覽器
# 前台首頁： http://localhost:3001
# 後台商品： http://localhost:3001/admin/products
# 後台訂單： http://localhost:3001/admin/orders
```

預設管理員帳號（由 seed 建立）：
- Email：`admin@hexschool.com`
- 密碼：`12345678`

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | 編譯 CSS 後啟動伺服器 |
| `node server.js` | 直接啟動伺服器（不編譯 CSS） |
| `npm run dev:css` | 監聽 CSS 變更並自動編譯 |
| `npm run css:build` | 一次性編譯並壓縮 CSS |
| `npm test` | 執行所有測試 |
| `npm run openapi` | 輸出 OpenAPI JSON 文件 |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構設計、目錄結構、API 路由總覽、資料庫 schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、新增 API 流程、環境變數說明 |
| [FEATURES.md](./FEATURES.md) | 功能清單、API 行為描述、業務邏輯說明 |
| [TESTING.md](./TESTING.md) | 測試規範、執行順序、新增測試指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新記錄 |
| [plans/](./plans/) | 進行中的開發計畫 |
| [plans/archive/](./plans/archive/) | 已完成的開發計畫歸檔 |
