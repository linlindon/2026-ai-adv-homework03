# CLAUDE.md

## 專案概述

花卉電商網站 — Node.js + Express 4 + SQLite (better-sqlite3) + EJS + Tailwind CSS v4

前後端同源架構：Server 端負責 SSR 頁面渲染（EJS）與 REST API，前端頁面透過靜態 JS 呼叫 API。

## 常用指令

```bash
# 開發
node server.js           # 啟動伺服器（不含 CSS 編譯）
npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --watch  # CSS 監聽

# 正式啟動（先編譯 CSS 再啟動）
npm start

# 測試（固定順序執行，不可平行）
npm test

# 生成 OpenAPI 文件
npm run openapi
```

## 關鍵規則

1. **統一回應格式**：所有 API 回應必須符合 `{ data, error, message }` 結構，成功時 `error: null`，失敗時 `data: null`。
2. **購物車雙模式認證**：`/api/cart` 路由同時支援 JWT Bearer Token（登入用戶）和 `X-Session-Id` header（訪客）。若 Authorization header 存在但 token 無效，立即回傳 401，不 fallback 至 session。
3. **訂單建立使用 Transaction**：建立訂單時，在單一 SQLite transaction 內完成寫入 orders、order_items、扣除庫存、清空購物車，確保原子性。
4. **測試執行順序固定**：vitest 設定 `fileParallelism: false`，測試檔案必須依序執行（auth → products → cart → orders → adminProducts → adminOrders），因為後面的測試依賴前面測試的資料狀態（如已存在的商品、seed admin）。
5. **JWT_SECRET 為必要環境變數**：`server.js` 啟動時若無 `JWT_SECRET` 即 `process.exit(1)`；測試環境需在 `.env` 或環境中設定。
6. 功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`。

## 詳細文件

- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌
