import { defineConfig } from 'vitest/config';
import ProjectSequencer from './tests/sequencer.mjs';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    setupFiles: ['tests/integration/env.setup.js'],
    include: [
      'tests/auth.test.js',
      'tests/products.test.js',
      'tests/cart.test.js',
      'tests/orders.test.js',
      'tests/adminProducts.test.js',
      'tests/adminOrders.test.js',
      'tests/integration/**/*.test.js',
    ],
    sequence: {
      sequencer: ProjectSequencer,
    },
    hookTimeout: 10000,
  },
});
