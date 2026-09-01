const path = require('path');

module.exports = {
  preset: 'jest-expo',
  // Component smoke tests only; the shared domain runs far faster under vitest.
  testMatch: ['**/src/__tests__/**/*.test.tsx'],
  // @vitto/core resolves to workspace source outside this package, so Babel's
  // runtime helpers have to be pointed back at this app's node_modules.
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': path.resolve(__dirname, 'node_modules/@babel/runtime/$1'),
  },
};
