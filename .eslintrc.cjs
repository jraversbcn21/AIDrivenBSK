module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:import/typescript'],
  settings: { 'import/resolver': { typescript: { alwaysTryTypes: true } } },
  rules: {
    'import/no-cycle': ['error', { maxDepth: Infinity }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  ignorePatterns: ['node_modules', 'reports', 'playwright-report', 'test-results', '.auth'],
};
