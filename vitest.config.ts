import { defineConfig } from 'vitest/config';

/**
 * Replaces jest.config.js. Two things carried over deliberately:
 *
 *  - `globals: true`, so the suites keep using bare describe/it/expect rather
 *    than importing them into all 24 files.
 *  - the `'./Foo.js' -> './Foo'` alias. The sources use ESM-style specifiers
 *    that point at the *compiled* name; vite resolves them against the .ts
 *    originals, the same job jest's moduleNameMapper did.
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            enabled: true,
            reportsDirectory: 'coverage',
            reporter: ['text', 'lcov'],
            include: ['src/**'],
            exclude: ['src/**/__tests__/**']
        }
    },
    resolve: {
        alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }]
    }
});
