const {
  SHIPPING_METHODS,
  calculateShipping,
} = require('../src/utils/shipping');

describe('Shipping module', () => {
  it('charges NT$120 for basic home delivery', () => {
    const result = calculateShipping({ subtotal: 1000 });

    expect(result.deliveryFee).toBe(120);
    expect(result.shippingFee).toBe(120);
    expect(result.totalAmount).toBe(1120);
  });

  it('charges NT$60 for convenience store pickup', () => {
    const result = calculateShipping({
      subtotal: 1000,
      shippingMethod: SHIPPING_METHODS.CONVENIENCE_STORE,
    });

    expect(result.deliveryFee).toBe(60);
    expect(result.shippingFee).toBe(60);
    expect(result.totalAmount).toBe(1060);
  });

  it('still charges basic shipping when subtotal is NT$1,499', () => {
    const result = calculateShipping({ subtotal: 1499 });

    expect(result.isFreeBasicShipping).toBe(false);
    expect(result.shippingFee).toBe(120);
    expect(result.totalAmount).toBe(1619);
  });

  it('waives basic shipping when subtotal is NT$1,500', () => {
    const result = calculateShipping({ subtotal: 1500 });

    expect(result.isFreeBasicShipping).toBe(true);
    expect(result.shippingFee).toBe(0);
    expect(result.totalAmount).toBe(1500);
  });

  it('adds the NT$200 remote-area surcharge', () => {
    const result = calculateShipping({ subtotal: 1000, isRemoteArea: true });

    expect(result.remoteAreaFee).toBe(200);
    expect(result.shippingFee).toBe(320);
    expect(result.totalAmount).toBe(1320);
  });

  it('adds the NT$250 same-day surcharge', () => {
    const result = calculateShipping({ subtotal: 1000, isSameDayDelivery: true });

    expect(result.sameDayDeliveryFee).toBe(250);
    expect(result.shippingFee).toBe(370);
    expect(result.totalAmount).toBe(1370);
  });

  it('adds multiple surcharges together', () => {
    const result = calculateShipping({
      subtotal: 1000,
      isRemoteArea: true,
      isSameDayDelivery: true,
    });

    expect(result.shippingFee).toBe(570);
    expect(result.totalAmount).toBe(1570);
  });

  it('waives only basic shipping when threshold and surcharges both apply', () => {
    const result = calculateShipping({
      subtotal: 1500,
      isRemoteArea: true,
      isSameDayDelivery: true,
    });

    expect(result.deliveryFee).toBe(0);
    expect(result.remoteAreaFee).toBe(200);
    expect(result.sameDayDeliveryFee).toBe(250);
    expect(result.shippingFee).toBe(450);
    expect(result.totalAmount).toBe(1950);
  });

  it('does not waive the convenience-store pickup fee at the threshold', () => {
    const result = calculateShipping({
      subtotal: 1500,
      shippingMethod: SHIPPING_METHODS.CONVENIENCE_STORE,
    });

    expect(result.isFreeBasicShipping).toBe(false);
    expect(result.shippingFee).toBe(60);
    expect(result.totalAmount).toBe(1560);
  });
});
