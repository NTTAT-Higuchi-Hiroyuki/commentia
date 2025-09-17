/**
 * Environment configuration utility
 * Provides type-safe access to environment variables
 */

export interface AppConfig {
  // API Configuration
  apiEndpoint: string;
  websocketEndpoint: string;

  // Application Configuration
  appName: string;
  appVersion: string;
  appDescription: string;

  // Feature Flags
  features: {
    qrCodeEnabled: boolean;
    darkModeEnabled: boolean;
    analyticsEnabled: boolean;
  };

  // Development Configuration
  isDevelopment: boolean;
  isProduction: boolean;
  isStaging: boolean;
  devToolsEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Get environment variable with type conversion and validation
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

/**
 * Get boolean environment variable
 */
function getBooleanEnvVar(key: string, defaultValue = false): boolean {
  const value = import.meta.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

/**
 * Application configuration object
 */
export const config: AppConfig = {
  // API Configuration
  apiEndpoint: getEnvVar('VITE_API_ENDPOINT', 'http://localhost:3000/api'),
  websocketEndpoint: getEnvVar('VITE_WEBSOCKET_ENDPOINT', 'ws://localhost:3001'),

  // Application Configuration
  appName: getEnvVar('VITE_APP_NAME', 'Commentia'),
  appVersion: getEnvVar('VITE_APP_VERSION', '0.1.0'),
  appDescription: getEnvVar('VITE_APP_DESCRIPTION', 'リアルタイムコメント投稿アプリケーション'),

  // Feature Flags
  features: {
    qrCodeEnabled: getBooleanEnvVar('VITE_FEATURE_QR_CODE_ENABLED', true),
    darkModeEnabled: getBooleanEnvVar('VITE_FEATURE_DARK_MODE_ENABLED', true),
    analyticsEnabled: getBooleanEnvVar('VITE_FEATURE_ANALYTICS_ENABLED', false),
  },

  // Development Configuration
  isDevelopment: import.meta.env.DEV || import.meta.env.VITE_NODE_ENV === 'development',
  isProduction: import.meta.env.PROD || import.meta.env.VITE_NODE_ENV === 'production',
  isStaging: import.meta.env.VITE_NODE_ENV === 'staging',
  devToolsEnabled: getBooleanEnvVar('VITE_DEV_TOOLS_ENABLED', import.meta.env.DEV),
  logLevel: getEnvVar('VITE_LOG_LEVEL', 'info') as AppConfig['logLevel'],
};

/**
 * Validate configuration on module load
 */
function validateConfig(): void {
  // API endpoints validation
  try {
    new URL(config.apiEndpoint);
  } catch {
    console.warn(`Invalid API endpoint: ${config.apiEndpoint}`);
  }

  // Log configuration in development
  if (config.isDevelopment) {
    console.group('🔧 Application Configuration');
    console.log('Environment:', {
      isDevelopment: config.isDevelopment,
      isProduction: config.isProduction,
      isStaging: config.isStaging,
    });
    console.log('API Configuration:', {
      apiEndpoint: config.apiEndpoint,
      websocketEndpoint: config.websocketEndpoint,
    });
    console.log('Feature Flags:', config.features);
    console.groupEnd();
  }
}

// Validate on module load
validateConfig();

/**
 * Environment-specific feature detection
 */
export const isFeatureEnabled = (feature: keyof AppConfig['features']): boolean => {
  return config.features[feature];
};

/**
 * Get API endpoint with path
 */
export const getApiUrl = (path: string): string => {
  const baseUrl = config.apiEndpoint.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

/**
 * Get WebSocket URL
 */
export const getWebSocketUrl = (): string => {
  return config.websocketEndpoint;
};
