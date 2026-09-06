const fileOrder = [
  'tests/unit/shipping.test.js',
  'tests/auth.test.js',
  'tests/products.test.js',
  'tests/cart.test.js',
  'tests/orders.test.js',
  'tests/adminProducts.test.js',
  'tests/adminOrders.test.js',
  'tests/integration/order-flow.test.js',
];

export default class ProjectSequencer {
  shard(files) {
    return files;
  }

  sort(files) {
    return [...files].sort((left, right) => {
      const leftPath = left.moduleId.replaceAll('\\', '/');
      const rightPath = right.moduleId.replaceAll('\\', '/');
      const leftIndex = fileOrder.findIndex(path => leftPath.endsWith(path));
      const rightIndex = fileOrder.findIndex(path => rightPath.endsWith(path));
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return normalizedLeft - normalizedRight || leftPath.localeCompare(rightPath);
    });
  }
}
