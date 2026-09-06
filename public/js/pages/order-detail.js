const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);
    const verifying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    const shippingMethodMap = {
      home_delivery: '宅配',
      convenience_store: '超商取貨',
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      failed: { text: '付款失敗，請重試或確認付款狀態。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      cancel: { text: '付款已取消。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
    };

    async function handleEcpayPay() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay-form', { method: 'POST' });
        const { action, params } = res.data;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = action;
        form.style.display = 'none';
        for (const [k, v] of Object.entries(params)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      } catch (e) {
        Notification.show(e?.data?.message || '無法跳轉綠界付款', 'error');
        paying.value = false;
      }
    }

    async function handleVerifyPayment() {
      if (!order.value || verifying.value) return;
      verifying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/verify-payment', { method: 'POST' });
        order.value = res.data;
        Notification.show(res.message || '查詢完成', 'info');
        if (res.data.status === 'paid') {
          paymentResult.value = 'success';
        } else if (res.data.status === 'failed') {
          paymentResult.value = 'failed';
        }
      } catch (e) {
        Notification.show(e?.data?.message || '查詢付款狀態失敗', 'error');
      } finally {
        verifying.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order,
      loading,
      paying,
      verifying,
      paymentResult,
      statusMap,
      shippingMethodMap,
      paymentMessages,
      handleEcpayPay,
      handleVerifyPayment,
    };
  }
}).mount('#app');
