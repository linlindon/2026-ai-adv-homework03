# TESTING.md

## 測試架構

- **測試框架**：Vitest 2.x
- **HTTP 測試工具**：Supertest（直接呼叫 Express app，不需啟動 server）
- **資料庫**：共用 `database.sqlite`（非 in-memory，測試使用真實 SQLite）
- **測試類型**：Shipping 純函式使用 Unit Tests；API 使用 Integration Tests（直接操作端點與 DB）

> **注意**：本專案不使用 mock DB。測試直接操作真實 SQLite 資料庫，確保 SQL 邏輯正確性。

---

## 測試檔案一覽

| 測試檔案 | 測試路由 | 說明 |
|----------|----------|------|
| `tests/shipping.test.js` | `src/utils/shipping.js` | 配送費用純函式的門檻與附加費組合 |
| `tests/auth.test.js` | `/api/auth` | 註冊、登入、profile 存取 |
| `tests/products.test.js` | `/api/products` | 公開商品列表與詳情 |
| `tests/cart.test.js` | `/api/cart` | 訪客模式、登入模式、庫存檢查 |
| `tests/orders.test.js` | `/api/orders` | 建立訂單、列表、詳情、模擬付款 |
| `tests/adminProducts.test.js` | `/api/admin/products` | 後台商品 CRUD、401/403 保護 |
| `tests/adminOrders.test.js` | `/api/admin/orders` | 後台訂單列表（含狀態篩選）、詳情 |

---

## 執行順序與依賴關係

`vitest.config.js` 強制設定 `fileParallelism: false`，並指定固定順序：

```
shipping → auth → products → cart → orders → adminProducts → adminOrders
```

**為何順序固定**：

1. **shipping**：純函式、無 DB 狀態依賴，先驗證訂單使用的費用規則
2. **auth**：不依賴其他模組，但 seed admin 帳號在 DB 初始化時建立
3. **products**：需要 seed 商品存在（由 `src/database.js` 初始化時 seed）
4. **cart**：`beforeAll` 呼叫 `GET /api/products` 取得商品 ID，需要商品 seed 資料
5. **orders**：測試需要先將商品加入購物車，依賴 cart 邏輯與商品資料
6. **adminProducts**：在 orders 測試執行後，商品庫存已被扣除，測試會自行建立新商品
7. **adminOrders**：需要已存在的訂單資料（由 orders 測試建立）

---

## 共用工具（tests/setup.js）

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

### `getAdminToken()`

登入 seed admin 帳號（email: `admin@hexschool.com`，password: `12345678`），回傳 JWT token string。

```javascript
const adminToken = await getAdminToken();
// 使用：request(app).get('/api/admin/orders').set('Authorization', `Bearer ${adminToken}`)
```

### `registerUser(overrides = {})`

建立新測試用戶並回傳 `{ token, user }`。

```javascript
// 使用預設隨機 email
const { token, user } = await registerUser();

// 自訂 email 與 name
const { token } = await registerUser({ email: 'custom@test.com', name: '自訂名稱' });
```

- 預設 email：`test-<timestamp>-<random>@example.com`（避免衝突）
- 預設 password：`password123`
- 預設 name：`測試使用者`

---

## 撰寫新測試的步驟

1. **引入工具**：

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

2. **測試結構範例**：

```javascript
describe('新功能 API', () => {
  let userToken;
  let createdId;

  beforeAll(async () => {
    const { token } = await registerUser();
    userToken = token;
  });

  it('應成功建立資源', async () => {
    const res = await request(app)
      .post('/api/new-resource')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: '測試資源' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);    // 成功時 error 為 null
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');

    createdId = res.body.data.id;
  });

  it('應拒絕未登入的請求', async () => {
    const res = await request(app).post('/api/new-resource').send({ name: '未授權' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body.error).not.toBeNull();             // 失敗時 error 非 null
  });
});
```

3. **在 `vitest.config.js` 加入新檔案**（維持順序）：

```javascript
sequence: {
  files: [
    'tests/shipping.test.js',
    'tests/auth.test.js',
    'tests/products.test.js',
    'tests/cart.test.js',
    'tests/orders.test.js',
    'tests/adminProducts.test.js',
    'tests/adminOrders.test.js',
    'tests/newFeature.test.js',  // 新增在最後或適當位置
  ],
}
```

---

## 常見陷阱

### 1. 並行測試導致資料衝突

`fileParallelism: false` 已確保檔案間循序，但**同一 describe 內的 it()** 共享狀態。跨 it() 使用 `let` 共享變數時，請確保：

```javascript
let cartItemId; // 在上一個 it() 建立，下一個 it() 使用
it('加入購物車', async () => {
  const res = await ...;
  cartItemId = res.body.data.id; // 設定
});
it('更新數量', async () => {
  // 依賴上方設定的 cartItemId
  const res = await request(app).patch(`/api/cart/${cartItemId}`)...;
});
```

Vitest 保證同一 describe 內 it() 按定義順序執行，但不要假設跨 describe 的順序。

### 2. 訂單測試需先有購物車商品

`orders.test.js` 的測試流程：需要先用測試用戶將商品加入購物車，才能建立訂單。建立訂單後購物車清空，之後的測試不能再依賴購物車。

### 3. bcrypt 在測試環境自動加速

`src/database.js` 的 `seedAdminUser()` 在 `NODE_ENV === 'test'` 時使用 `saltRounds = 1`。但 `authRoutes.js` 的 `register` 路由固定使用 10 rounds，測試中呼叫 register 會略慢。建議用 `registerUser()` helper 建立測試用戶。

### 4. Session ID 測試

訪客購物車測試需要穩定的 sessionId：

```javascript
const sessionId = 'test-session-' + Date.now(); // 每次測試套件使用唯一 session
```

不同 `describe` 區塊若使用相同 sessionId，購物車資料會互相影響。

### 5. 回應格式驗證

每個測試都應驗證統一回應格式：

```javascript
// 成功
expect(res.body).toHaveProperty('error', null);   // error 必須為 null
expect(res.body).toHaveProperty('data');           // data 非 undefined

// 失敗
expect(res.body).toHaveProperty('data', null);     // data 必須為 null
expect(res.body.error).not.toBeNull();             // error 必須有值
```

---

## 執行測試

```bash
# 執行全部測試
npm test

# Vitest 互動模式（開發時使用）
npx vitest

# 單一測試檔
npx vitest run tests/cart.test.js
```
