const express = require('express');
const db = require('../database');
const ecpayService = require('../services/ecpayService');

const router = express.Router();

async function reconcileByMerchantTradeNo(merchantTradeNo) {
  const order = db.prepare('SELECT * FROM orders WHERE merchant_trade_no = ?').get(merchantTradeNo);
  if (!order) return { order: null, result: null };

  let result;
  try {
    result = await ecpayService.queryTradeInfo(merchantTradeNo);
  } catch (err) {
    return { order, result: null, error: err };
  }

  const tradeStatus = String(result.TradeStatus || '');
  if (tradeStatus === '1') {
    db.prepare(
      `UPDATE orders SET status = 'paid', ecpay_trade_no = ?, payment_type = ?, paid_at = ?
       WHERE id = ? AND status = 'pending'`
    ).run(result.TradeNo || null, result.PaymentType || null, result.PaymentDate || null, order.id);
  } else if (tradeStatus === '10200095' || tradeStatus === '10100248' || tradeStatus === '10100254') {
    db.prepare("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(order.id);
  }

  return { order, result };
}

router.post('/result', async (req, res) => {
  const params = req.body || {};
  const merchantTradeNo = params.MerchantTradeNo;

  if (!merchantTradeNo) {
    return res.redirect('/orders');
  }

  const { merchantId, hashKey, hashIv } = ecpayService.getEcpayConfig();
  const cmvOk = params.MerchantID === merchantId && ecpayService.verifyCheckMacValue(params, hashKey, hashIv);
  if (!cmvOk) {
    console.warn('[ECPay] /ecpay/result CheckMacValue 驗證失敗 MerchantTradeNo=%s', merchantTradeNo);
  }

  const order = db.prepare('SELECT * FROM orders WHERE merchant_trade_no = ?').get(merchantTradeNo);
  if (!order) {
    return res.redirect('/orders');
  }

  try {
    await reconcileByMerchantTradeNo(merchantTradeNo);
  } catch (err) {
    console.error('[ECPay] /ecpay/result query 失敗', err);
  }

  const updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id);
  const outcome = updated.status === 'paid' ? 'success' : (updated.status === 'failed' ? 'failed' : 'cancel');
  res.redirect(`/orders/${order.id}?payment=${outcome}`);
});

router.post('/notify', async (req, res) => {
  const params = req.body || {};
  const merchantTradeNo = params.MerchantTradeNo;

  try {
    if (merchantTradeNo) {
      const { merchantId, hashKey, hashIv } = ecpayService.getEcpayConfig();
      if (params.MerchantID === merchantId && ecpayService.verifyCheckMacValue(params, hashKey, hashIv)) {
        await reconcileByMerchantTradeNo(merchantTradeNo);
      } else {
        console.warn('[ECPay] /ecpay/notify CheckMacValue 驗證失敗 MerchantTradeNo=%s', merchantTradeNo);
      }
    }
  } catch (err) {
    console.error('[ECPay] /ecpay/notify 處理失敗', err);
  }

  res.set('Content-Type', 'text/plain');
  res.send('1|OK');
});

router.get('/client-back', (req, res) => {
  const orderId = req.query.orderId;
  if (orderId) {
    return res.redirect(`/orders/${orderId}?payment=cancel`);
  }
  res.redirect('/orders');
});

module.exports = router;
