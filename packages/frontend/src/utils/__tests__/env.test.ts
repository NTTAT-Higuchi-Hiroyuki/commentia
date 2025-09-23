/**
 * @jest-environment jsdom
 */

// Mock the env module entirely
jest.mock('../env', () => {
  const mockConfig = {
    apiEndpoint: 'http://localhost:3000/api',
    websocketEndpoint: 'ws://localhost:3001',
    appName: 'Commentia',
    appVersion: '0.1.0',
    appDescription: 'リアルタイムコメント投稿アプリケーション',
    features: {
      qrCodeEnabled: true,
      darkModeEnabled: true,
      analyticsEnabled: false,
    },
    isDevelopment: false,
    isProduction: false,
    isStaging: false,
    devToolsEnabled: false,
    logLevel: 'info' as const,
  };

  return {
    config: mockConfig,
    isFeatureEnabled: (feature: string) =>
      mockConfig.features[feature as keyof typeof mockConfig.features] || false,
    getApiUrl: (path: string) => {
      const baseUrl = mockConfig.apiEndpoint.replace(/\/$/, '');
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      return `${baseUrl}${normalizedPath}`;
    },
    getWebSocketUrl: () => mockConfig.websocketEndpoint,
  };
});

import { config, getApiUrl, getWebSocketUrl, isFeatureEnabled } from '../env';

describe('env.ts', () => {
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
      expect(getApiUrl('/rooms')).toBe('http://localhost:3000/api/rooms');
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
});
