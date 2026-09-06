const path = require('path');
const { test, expect } = require('@playwright/test');

const evidencePath = path.resolve(__dirname, '../../docs/e2e-evidence/e2e-paid-latest.png');

test('admin completes an ECPay WebATM payment and returns to a paid order', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('請輸入 Email').fill('admin@hexschool.com');
  await page.getByPlaceholder('請輸入密碼').fill('12345678');
  await Promise.all([
    page.waitForURL(url => url.origin === 'http://localhost:3001' && url.pathname === '/'),
    page.locator('form button[type="submit"]').click(),
  ]);

  await page.goto('/');
  const addButton = page.locator('#products button').filter({ hasText: '加入購物車' }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByText('已加入購物車', { exact: true })).toBeVisible();

  await page.goto('/checkout');
  await page.getByPlaceholder('請輸入收件人姓名').fill('王小明');
  await page.getByPlaceholder('請輸入 Email').fill('e2e@example.com');
  await page.getByPlaceholder('請輸入收件地址').fill('台北市中正區重慶南路一段 122 號');
  await page.locator('input[value="convenience_store"]').check();
  await page.getByText('偏遠地區（加 NT$ 200）').click();
  await page.getByText('當日急件（加 NT$ 250）').click();

  await Promise.all([
    page.waitForURL(/\/orders\/[^/?]+$/),
    page.getByRole('button', { name: '確認送出訂單' }).click(),
  ]);
  const orderId = new URL(page.url()).pathname.split('/').pop();

  await Promise.all([
    page.waitForURL(url => url.hostname === 'payment-stage.ecpay.com.tw'),
    page.getByRole('button', { name: '前往綠界付款' }).click(),
  ]);

  await page.locator('li').filter({ hasText: '網路ATM' }).click();
  await page.locator('#selWebATMBank').selectOption({ label: '台灣土地銀行' });
  await page.locator('#WebATMPaySubmit').click({ force: true });
  await page.getByRole('button', { name: '關閉' }).click();

  await page.waitForURL(url => url.hostname === 'pay-stage.ecpay.com.tw' && url.pathname.includes('/MockMPPost/LandWebAtm'));
  await page.getByRole('button', { name: 'Save' }).click();

  const paymentSuccess = page.getByText('付款成功', { exact: false });
  await expect(paymentSuccess).toBeVisible();
  const returnButton = page.getByRole('button', { name: /返回商店/ }).or(page.getByRole('link', { name: /返回商店/ }));
  if (await returnButton.isVisible()) {
    await returnButton.click();
  }

  await page.waitForURL(url => url.origin === 'http://localhost:3001' && url.pathname === `/orders/${orderId}`);
  await expect(page.getByText('已付款', { exact: true })).toBeVisible();
  await expect(page.getByText('付款成功！感謝您的購買。', { exact: true })).toBeVisible();

  const apiOrder = await page.evaluate(async id => {
    const token = localStorage.getItem('flower_token');
    const response = await fetch(`/api/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  }, orderId);
  expect(apiOrder.error).toBeNull();
  expect(apiOrder.data.status).toBe('paid');

  await page.screenshot({ path: evidencePath, fullPage: true });
});
