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
    // In a git worktree checkout, node_modules is shared with (symlinked to)
    // the main repo checkout, so npm's own `@vitto/core` workspace symlink
    // always resolves to the *main repo's* packages/core, not this worktree's
    // -- forcing the resolution to `../packages/core/src` (relative to this
    // worktree's own mobile/) keeps tests exercising the code actually being
    // worked on here.
    '^@vitto/core$': `${path.resolve(__dirname, '../packages/core/src/index.ts')}`,
  },
};
