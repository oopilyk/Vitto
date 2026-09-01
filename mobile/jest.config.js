module.exports = {
  preset: 'jest-expo',
  // Component smoke tests only; the pure domain runs far faster under vitest.
  testMatch: ['**/src/__tests__/**/*.test.tsx'],
};
