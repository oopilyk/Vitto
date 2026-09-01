const path = require('path');

// Resolved rather than hardcoded: npm hoists this to the workspace root or keeps it
// local depending on the install, and @vitto/core's sources sit outside this package.
const babelRuntime = path.dirname(require.resolve('@babel/runtime/package.json'));

module.exports = {
  preset: 'jest-expo',
  // Component smoke tests only; the shared domain runs far faster under vitest.
  testMatch: ['**/src/__tests__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': `${babelRuntime}/$1`,
  },
};
