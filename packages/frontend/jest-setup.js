/**
 * Jest setup file for mocking import.meta
 */

// Mock import.meta for Jest environment
Object.defineProperty(globalThis, 'import.meta', {
  value: {
    env: {
      // Default environment variables for tests
      VITE_API_ENDPOINT: 'http://localhost:3000/api',
      VITE_WEBSOCKET_ENDPOINT: 'ws://localhost:3001',
      VITE_APP_NAME: 'Commentia',
      VITE_APP_VERSION: '0.1.0',
      VITE_APP_DESCRIPTION: 'リアルタイムコメント投稿アプリケーション',
      VITE_FEATURE_QR_CODE_ENABLED: 'true',
      VITE_FEATURE_DARK_MODE_ENABLED: 'true',
      VITE_FEATURE_ANALYTICS_ENABLED: 'false',
      VITE_LOG_LEVEL: 'info',
      VITE_NODE_ENV: 'test',
    },
    DEV: false,
    PROD: false,
    MODE: 'test',
  },
  writable: true,
  configurable: true,
});
