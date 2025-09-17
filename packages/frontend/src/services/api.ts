import type { APIError, APIResponse, ErrorCode } from '@commentia/shared';
import axios, { type AxiosInstance, type AxiosResponse, type AxiosError } from 'axios';

// API設定
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const REQUEST_TIMEOUT = 10000; // 10秒

// Axiosインスタンスの作成
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストインターセプター（認証トークンの追加）
apiClient.interceptors.request.use(
  (config) => {
    // ローカルストレージからJWTトークンを取得
    const token = localStorage.getItem('commentia-auth-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // リクエストログ（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
        headers: config.headers,
        data: config.data,
      });
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// レスポンスインターセプター（エラーハンドリング）
apiClient.interceptors.response.use(
  (response: AxiosResponse<APIResponse<unknown>>) => {
    // 成功レスポンスのログ（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] Response from ${response.config.url}:`, response.data);
    }

    // APIResponseの形式をチェック
    if (response.data.success) {
      return response;
    }
    // APIレベルでのエラー
    const apiError: APIError = {
      code: (response.data.error?.code || 'INTERNAL_ERROR') as ErrorCode,
      message: response.data.error?.message || '不明なエラーが発生しました',
      details: response.data.error?.details,
      timestamp: new Date().toISOString(),
    };
    throw new APIResponseError(apiError, response.status);
  },
  (error: AxiosError<APIResponse<unknown>>) => {
    // ネットワークエラーやHTTPエラーの処理
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Error:', error);
    }

    // タイムアウトエラー
    if (error.code === 'ECONNABORTED') {
      throw new APIResponseError(
        {
          code: 'INTERNAL_ERROR' as ErrorCode,
          message: 'リクエストがタイムアウトしました',
          timestamp: new Date().toISOString(),
        },
        408
      );
    }

    // ネットワークエラー
    if (!error.response) {
      throw new APIResponseError(
        {
          code: 'INTERNAL_ERROR' as ErrorCode,
          message: 'ネットワークに接続できません',
          timestamp: new Date().toISOString(),
        },
        0
      );
    }

    // HTTPステータスエラー
    const status = error.response.status;
    const responseData = error.response.data;

    let apiError: APIError;

    if (responseData && !responseData.success) {
      // サーバーからのエラーレスポンス
      apiError = {
        code: (responseData.error.code as ErrorCode) || 'INTERNAL_ERROR',
        message: responseData.error.message,
        details: responseData.error.details,
        timestamp:
          (responseData.error as { timestamp?: string }).timestamp || new Date().toISOString(),
      };
    } else {
      // HTTPステータスコードからエラーを生成
      switch (status) {
        case 400:
          apiError = {
            code: 'INVALID_INPUT' as ErrorCode,
            message: 'リクエストが無効です',
            timestamp: new Date().toISOString(),
          };
          break;
        case 401:
          apiError = {
            code: 'UNAUTHORIZED' as ErrorCode,
            message: '認証が必要です',
            timestamp: new Date().toISOString(),
          };
          break;
        case 403:
          apiError = {
            code: 'UNAUTHORIZED' as ErrorCode,
            message: 'アクセスが拒否されました',
            timestamp: new Date().toISOString(),
          };
          break;
        case 404:
          apiError = {
            code: 'ROOM_NOT_FOUND' as ErrorCode,
            message: 'リソースが見つかりません',
            timestamp: new Date().toISOString(),
          };
          break;
        case 429:
          apiError = {
            code: 'RATE_LIMIT_EXCEEDED' as ErrorCode,
            message: 'リクエスト制限に達しました',
            timestamp: new Date().toISOString(),
          };
          break;
        case 500:
          apiError = {
            code: 'INTERNAL_ERROR' as ErrorCode,
            message: 'サーバーエラーが発生しました',
            timestamp: new Date().toISOString(),
          };
          break;
        default:
          apiError = {
            code: 'INTERNAL_ERROR' as ErrorCode,
            message: `HTTPエラー: ${status}`,
            timestamp: new Date().toISOString(),
          };
      }
    }

    throw new APIResponseError(apiError, status);
  }
);

// カスタムエラークラス
export class APIResponseError extends Error {
  public readonly apiError: APIError;
  public readonly status: number;

  constructor(apiError: APIError, status: number) {
    super(apiError.message);
    this.name = 'APIResponseError';
    this.apiError = apiError;
    this.status = status;
  }
}

// 認証トークン管理
export const authTokenManager = {
  setToken: (token: string) => {
    localStorage.setItem('commentia-auth-token', token);
  },

  getToken: (): string | null => {
    return localStorage.getItem('commentia-auth-token');
  },

  removeToken: () => {
    localStorage.removeItem('commentia-auth-token');
  },

  hasToken: (): boolean => {
    return !!localStorage.getItem('commentia-auth-token');
  },
};

// レスポンスデータ抽出ヘルパー
export const extractResponseData = <T>(response: AxiosResponse<APIResponse<T>>): T => {
  if (response.data.success) {
    return response.data.data;
  }
  throw new Error('Invalid response format');
};
