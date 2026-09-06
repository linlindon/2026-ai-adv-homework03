const { v4: uuidv4 } = require('uuid');
const { app, request } = require('../setup');
const db = require('../../src/database');

let product;
const createdUserIds = [];

function seedProduct() {
  product = {
    id: `integration-product-${uuidv4()}`,
    name: 'Integration 測試花束',
    price: 1000,
    stock: 10,
  };
  db.prepare(
    `INSERT INTO products (id, name, description, price, stock, image_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(product.id, product.name, '僅供整合測試使用', product.price, product.stock, null);
}

async function registerAndAddToCart() {
  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send({
      email: `integration-${uuidv4()}@example.com`,
      password: 'password123',
      name: '整合測試會員',
    });

  expect(registerResponse.status).toBe(201);
  expect(registerResponse.body).toEqual(expect.objectContaining({
    error: null,
    message: '註冊成功',
  }));

  const token = registerResponse.body.data.token;
  const userId = registerResponse.body.data.user.id;
  createdUserIds.push(userId);

  const productsResponse = await request(app).get('/api/products');
  expect(productsResponse.status).toBe(200);
  expect(productsResponse.body).toEqual(expect.objectContaining({ error: null }));
  expect(productsResponse.body.data.products).toContainEqual(
    expect.objectContaining({ id: product.id, price: product.price, stock: product.stock })
  );

  const cartResponse = await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 2 });

  expect(cartResponse.status).toBe(200);
  expect(cartResponse.body).toEqual(expect.objectContaining({
    error: null,
    message: '已加入購物車',
  }));

  return { token, userId };
}

describe('Order integration flow with isolated SQLite', () => {
  beforeEach(() => {
    db.exec('DROP TRIGGER IF EXISTS integration_fail_order_item');
    seedProduct();
  });

  afterEach(() => {
    db.exec('DROP TRIGGER IF EXISTS integration_fail_order_item');
    for (const userId of createdUserIds.splice(0)) {
      db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)').run(userId);
      db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }
    db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(product.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  });

  it('uses an in-memory database instead of the project database.sqlite', () => {
    expect(db.name).toBe(':memory:');
  });

  it('creates a complete order, deducts stock, and clears the cart', async () => {
    const { token, userId } = await registerAndAddToCart();

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '王小明',
        recipientEmail: 'integration@example.com',
        recipientAddress: '台北市中正區測試路 1 號',
        shippingMethod: 'convenience_store',
        isRemoteArea: true,
        isSameDayDelivery: true,
      });

    expect(orderResponse.status).toBe(201);
    expect(orderResponse.body).toEqual(expect.objectContaining({
      error: null,
      message: '訂單建立成功',
      data: expect.objectContaining({
        subtotal: 2000,
        shipping_fee: 510,
        shipping_method: 'convenience_store',
        is_remote_area: true,
        is_same_day_delivery: true,
        total_amount: 2510,
        status: 'pending',
      }),
    }));

    const orderId = orderResponse.body.data.id;
    const storedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(storedOrder).toEqual(expect.objectContaining({
      user_id: userId,
      subtotal: 2000,
      shipping_fee: 510,
      total_amount: 2510,
      shipping_method: 'convenience_store',
      is_remote_area: 1,
      is_same_day_delivery: 1,
    }));

    const storedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    expect(storedItems).toHaveLength(1);
    expect(storedItems[0]).toEqual(expect.objectContaining({
      product_id: product.id,
      product_name: product.name,
      product_price: product.price,
      quantity: 2,
    }));

    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(8);
    expect(db.prepare('SELECT COUNT(*) AS count FROM cart_items WHERE user_id = ?').get(userId).count).toBe(0);
  });

  it('rolls back the order, items, and stock when creation fails', async () => {
    const { token, userId } = await registerAndAddToCart();
    const stockBefore = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;

    db.exec(`
      CREATE TEMP TRIGGER integration_fail_order_item
      BEFORE INSERT ON order_items
      BEGIN
        SELECT RAISE(ABORT, 'forced integration failure');
      END;
    `);

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '王小明',
        recipientEmail: 'integration@example.com',
        recipientAddress: '台北市中正區測試路 1 號',
        shippingMethod: 'home_delivery',
      });

    expect(orderResponse.status).toBe(500);
    expect(orderResponse.body).toEqual({
      data: null,
      error: 'INTERNAL_ERROR',
      message: '伺服器內部錯誤',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?').get(userId).count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?').get(product.id).count).toBe(0);
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(stockBefore);
    expect(db.prepare('SELECT COUNT(*) AS count FROM cart_items WHERE user_id = ?').get(userId).count).toBe(1);
  });
});
