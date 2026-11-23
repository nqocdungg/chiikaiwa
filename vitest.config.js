import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.js'],
          fileParallelism: false,
          hookTimeout: 120000,
          testTimeout: 20000,
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/server/**/*.test.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/client/**/*.test.{js,jsx}'],
        },
      },
    ],
  },
});
