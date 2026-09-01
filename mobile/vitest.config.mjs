import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The domain is plain TypeScript with no React Native imports, so it runs
    // under Node without a native test renderer.
    include: ['src/domain/**/*.test.ts', 'src/services/**/*.test.ts'],
  },
});
