const SHIPPING_METHODS = Object.freeze({
  HOME_DELIVERY: 'home_delivery',
  CONVENIENCE_STORE: 'convenience_store',
});

const SHIPPING_FEES = Object.freeze({
  HOME_DELIVERY: 120,
  CONVENIENCE_STORE: 60,
  REMOTE_AREA: 200,
  SAME_DAY_DELIVERY: 250,
  FREE_BASIC_SHIPPING_THRESHOLD: 1500,
});

function calculateShipping({
  subtotal,
  shippingMethod = SHIPPING_METHODS.HOME_DELIVERY,
  isRemoteArea = false,
  isSameDayDelivery = false,
}) {
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為大於或等於 0 的整數');
  }

  if (!Object.values(SHIPPING_METHODS).includes(shippingMethod)) {
    throw new TypeError('shippingMethod 必須為 home_delivery 或 convenience_store');
  }

  if (typeof isRemoteArea !== 'boolean' || typeof isSameDayDelivery !== 'boolean') {
    throw new TypeError('isRemoteArea 與 isSameDayDelivery 必須為 boolean');
  }

  const isHomeDelivery = shippingMethod === SHIPPING_METHODS.HOME_DELIVERY;
  const isFreeBasicShipping = isHomeDelivery
    && subtotal >= SHIPPING_FEES.FREE_BASIC_SHIPPING_THRESHOLD;

  const deliveryFee = isHomeDelivery
    ? (isFreeBasicShipping ? 0 : SHIPPING_FEES.HOME_DELIVERY)
    : SHIPPING_FEES.CONVENIENCE_STORE;
  const remoteAreaFee = isRemoteArea ? SHIPPING_FEES.REMOTE_AREA : 0;
  const sameDayDeliveryFee = isSameDayDelivery ? SHIPPING_FEES.SAME_DAY_DELIVERY : 0;
  const shippingFee = deliveryFee + remoteAreaFee + sameDayDeliveryFee;

  return {
    subtotal,
    shippingMethod,
    isFreeBasicShipping,
    deliveryFee,
    remoteAreaFee,
    sameDayDeliveryFee,
    shippingFee,
    totalAmount: subtotal + shippingFee,
  };
}

module.exports = {
  SHIPPING_METHODS,
  SHIPPING_FEES,
  calculateShipping,
};
