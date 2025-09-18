/**
 * 統合テスト用Jest設定
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../../',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@commentia/shared$': '<rootDir>/packages/shared/src',
    '^@commentia/backend/(.*)$': '<rootDir>/packages/backend/src/$1',
    '^@commentia/frontend/(.*)$': '<rootDir>/packages/frontend/src/$1',
  },
  testTimeout: 30000,
  collectCoverageFrom: [
    'packages/backend/src/**/*.ts',
    'packages/frontend/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/dist/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
};
