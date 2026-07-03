import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.unit.test.ts', 'explorer/**/*.unit.test.ts', 'planner/**/*.unit.test.ts', 'builder/**/*.unit.test.ts'], environment: 'node' },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
