/**
 * @jest-environment jsdom
 */
import { config, getApiUrl, getWebSocketUrl, isFeatureEnabled } from '../env';

// Mock import.meta.env
const mockImportMeta = {
  env: {} as Record<string, string | undefined>,
  DEV: false,
  PROD: false,
};

// Provide type-safe mock for import.meta
declare global {
  namespace jest {
    interface Global {
      importMeta?: typeof mockImportMeta;
    }
  }
}

describe('env.ts', () => {
  let originalImportMeta: any;

  beforeEach(() => {
    // Save original import.meta
    originalImportMeta = (global as any).importMeta;

    // Reset import.meta.env mock
    mockImportMeta.env = {
      VITE_API_ENDPOINT: 'http://localhost:3000/api',
      VITE_WEBSOCKET_ENDPOINT: 'ws://localhost:3001',
      VITE_APP_NAME: 'Commentia',
      VITE_APP_VERSION: '0.1.0',
      VITE_APP_DESCRIPTION: 'リアルタイムコメント投稿アプリケーション',
      VITE_FEATURE_QR_CODE_ENABLED: 'true',
      VITE_FEATURE_DARK_MODE_ENABLED: 'true',
      VITE_FEATURE_ANALYTICS_ENABLED: 'false',
      VITE_LOG_LEVEL: 'info',
    };
    mockImportMeta.DEV = false;
    mockImportMeta.PROD = false;

    // Override import.meta for tests
    (global as any).importMeta = mockImportMeta;
  });

  afterEach(() => {
    // Restore original import.meta
    (global as any).importMeta = originalImportMeta;
  });

  describe('config object', () => {
    it('should have default API configuration', () => {
      expect(config.apiEndpoint).toBe('http://localhost:3000/api');
      expect(config.websocketEndpoint).toBe('ws://localhost:3001');
    });

    it('should have default application configuration', () => {
      expect(config.appName).toBe('Commentia');
      expect(config.appVersion).toBe('0.1.0');
      expect(config.appDescription).toBe('リアルタイムコメント投稿アプリケーション');
    });

    it('should have default feature flags', () => {
      expect(config.features.qrCodeEnabled).toBe(true);
      expect(config.features.darkModeEnabled).toBe(true);
      expect(config.features.analyticsEnabled).toBe(false);
    });

    it('should have development configuration', () => {
      expect(typeof config.isDevelopment).toBe('boolean');
      expect(typeof config.isProduction).toBe('boolean');
      expect(typeof config.isStaging).toBe('boolean');
      expect(config.logLevel).toBe('info');
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for enabled QR code feature', () => {
      expect(isFeatureEnabled('qrCodeEnabled')).toBe(true);
    });

    it('should return true for enabled dark mode feature', () => {
      expect(isFeatureEnabled('darkModeEnabled')).toBe(true);
    });

    it('should return false for disabled analytics feature', () => {
      expect(isFeatureEnabled('analyticsEnabled')).toBe(false);
    });
  });

  describe('getApiUrl', () => {
    it('should concatenate base URL with path', () => {
      expect(getApiUrl('/rooms')).toBe('http://localhost:3000/api/rooms');
    });

    it('should handle paths without leading slash', () => {
      expect(getApiUrl('rooms')).toBe('http://localhost:3000/api/rooms');
    });

    it('should handle base URL with trailing slash', () => {
      // Mock config with trailing slash
      const originalEndpoint = config.apiEndpoint;
      (config as any).apiEndpoint = 'http://localhost:3000/api/';

      expect(getApiUrl('/rooms')).toBe('http://localhost:3000/api/rooms');

      // Restore original
      (config as any).apiEndpoint = originalEndpoint;
    });

    it('should handle empty path', () => {
      expect(getApiUrl('')).toBe('http://localhost:3000/api/');
    });

    it('should handle complex paths', () => {
      expect(getApiUrl('/rooms/123/comments')).toBe('http://localhost:3000/api/rooms/123/comments');
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return the WebSocket endpoint', () => {
      expect(getWebSocketUrl()).toBe('ws://localhost:3001');
    });
  });

  describe('environment detection', () => {
    it('should detect development environment', () => {
      mockImportMeta.DEV = true;
      mockImportMeta.PROD = false;

      // Re-import to test environment detection
      const { config: devConfig } = require('../env');
      expect(devConfig.isDevelopment).toBe(true);
      expect(devConfig.isProduction).toBe(false);
    });

    it('should detect production environment', () => {
      mockImportMeta.DEV = false;
      mockImportMeta.PROD = true;

      // Re-import to test environment detection
      const { config: prodConfig } = require('../env');
      expect(prodConfig.isDevelopment).toBe(false);
      expect(prodConfig.isProduction).toBe(true);
    });

    it('should detect staging environment from VITE_NODE_ENV', () => {
      mockImportMeta.env.VITE_NODE_ENV = 'staging';

      // Re-import to test environment detection
      const { config: stagingConfig } = require('../env');
      expect(stagingConfig.isStaging).toBe(true);
    });
  });

  describe('feature flags with environment variables', () => {
    it('should handle string "true" as boolean true', () => {
      mockImportMeta.env.VITE_FEATURE_QR_CODE_ENABLED = 'true';

      // Re-import to test feature flag parsing
      const { config: testConfig } = require('../env');
      expect(testConfig.features.qrCodeEnabled).toBe(true);
    });

    it('should handle string "1" as boolean true', () => {
      mockImportMeta.env.VITE_FEATURE_QR_CODE_ENABLED = '1';

      // Re-import to test feature flag parsing
      const { config: testConfig } = require('../env');
      expect(testConfig.features.qrCodeEnabled).toBe(true);
    });

    it('should handle string "false" as boolean false', () => {
      mockImportMeta.env.VITE_FEATURE_QR_CODE_ENABLED = 'false';

      // Re-import to test feature flag parsing
      const { config: testConfig } = require('../env');
      expect(testConfig.features.qrCodeEnabled).toBe(false);
    });

    it('should handle undefined environment variable with default', () => {
      mockImportMeta.env.VITE_FEATURE_QR_CODE_ENABLED = undefined;

      // Re-import to test feature flag parsing
      const { config: testConfig } = require('../env');
      expect(testConfig.features.qrCodeEnabled).toBe(true); // default value
    });
  });

  describe('URL validation', () => {
    it('should handle valid URLs without throwing', () => {
      mockImportMeta.env.VITE_API_ENDPOINT = 'https://api.example.com';

      expect(() => {
        require('../env');
      }).not.toThrow();
    });

    it('should handle invalid URLs gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockImportMeta.env.VITE_API_ENDPOINT = 'invalid-url';

      expect(() => {
        require('../env');
      }).not.toThrow();

      consoleSpy.mockRestore();
    });
  });
});
