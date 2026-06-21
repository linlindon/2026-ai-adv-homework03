const crypto = require('crypto');

const STAGE_BASE = 'https://payment-stage.ecpay.com.tw';
const PROD_BASE = 'https://payment.ecpay.com.tw';

function getEcpayConfig() {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV;

  if (!merchantId || !hashKey || !hashIv) {
    throw new Error('ECPay 環境變數未設定：ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV');
  }

  const isProd = process.env.ECPAY_ENV === 'production';
  return {
    merchantId,
    hashKey,
    hashIv,
    apiBase: isProd ? PROD_BASE : STAGE_BASE,
  };
}

function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const replacements = {
    '%2d': '-',
    '%5f': '_',
    '%2e': '.',
    '%21': '!',
    '%2a': '*',
    '%28': '(',
    '%29': ')',
  };
  for (const [from, to] of Object.entries(replacements)) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv) {
  const entries = Object.entries(params).filter(([k]) => k !== 'CheckMacValue');
  entries.sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const joined = entries.map(([k, v]) => `${k}=${v}`).join('&');
  const raw = `HashKey=${hashKey}&${joined}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIv) {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params, hashKey, hashIv);
  const a = Buffer.from(received);
  const b = Buffer.from(calculated);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generateMerchantTradeNo() {
  const ts = Math.floor(Date.now() / 1000).toString();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EC${ts}${rand}`;
}

function formatTradeDate(date = new Date()) {
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = utc8.getUTCFullYear();
  const mm = String(utc8.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc8.getUTCDate()).padStart(2, '0');
  const hh = String(utc8.getUTCHours()).padStart(2, '0');
  const mi = String(utc8.getUTCMinutes()).padStart(2, '0');
  const ss = String(utc8.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function sanitizeText(text) {
  return String(text)
    .replace(/[\x00-\x1F]/g, '')
    .replace(/[#&<>]/g, ' ')
    .trim();
}

function buildItemName(items) {
  const parts = items.map(i => `${sanitizeText(i.product_name)} x${i.quantity}`);
  let joined = parts.join('#');
  if (joined.length > 200) {
    joined = joined.slice(0, 197) + '...';
  }
  return joined || '訂單商品';
}

function buildAioFormParams({ order, items, baseUrl }) {
  const { merchantId, hashKey, hashIv, apiBase } = getEcpayConfig();

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: order.merchant_trade_no,
    MerchantTradeDate: formatTradeDate(),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: sanitizeText(`訂單 ${order.order_no}`).slice(0, 200),
    ItemName: buildItemName(items),
    ReturnURL: `${baseUrl}/ecpay/notify`,
    OrderResultURL: `${baseUrl}/ecpay/result`,
    ClientBackURL: `${baseUrl}/ecpay/client-back?orderId=${encodeURIComponent(order.id)}`,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };

  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIv);

  return {
    action: `${apiBase}/Cashier/AioCheckOut/V5`,
    params,
  };
}

async function queryTradeInfo(merchantTradeNo) {
  const { merchantId, hashKey, hashIv, apiBase } = getEcpayConfig();

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIv);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${apiBase}/Cashier/QueryTradeInfo/V5`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`ECPay QueryTradeInfo HTTP ${res.status}`);
  }

  const text = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(text));

  if (!verifyCheckMacValue(parsed, hashKey, hashIv)) {
    throw new Error('ECPay QueryTradeInfo CheckMacValue 驗證失敗');
  }

  return parsed;
}

module.exports = {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  generateMerchantTradeNo,
  formatTradeDate,
  buildAioFormParams,
  queryTradeInfo,
  getEcpayConfig,
};
