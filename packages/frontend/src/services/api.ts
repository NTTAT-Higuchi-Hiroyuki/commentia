import type { APIError, APIResponse } from '@commentia/shared';
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
  (response: AxiosResponse<APIResponse>) => {
    // 成功レスポンスのログ（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] Response from ${response.config.url}:`, response.data);
    }

    // APIResponseの形式をチェック
    if (response.data.success) {
      return response;
    } else {
      // APIレベルでのエラー
      const apiError: APIError = {
        code: response.data.error?.code || 'UNKNOWN_ERROR',
        message: response.data.error?.message || '不明なエラーが発生しました',
        details: response.data.error?.details,
      };
      throw new APIResponseError(apiError, response.status);
    }
  },
  (error: AxiosError<APIResponse>) => {
    // ネットワークエラーやHTTPエラーの処理
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Error:', error);
    }

    // タイムアウトエラー
    if (error.code === 'ECONNABORTED') {
      throw new APIResponseError(
        {
          code: 'TIMEOUT_ERROR',
          message: 'リクエストがタイムアウトしました',
        },
        408
      );
    }

    // ネットワークエラー
    if (!error.response) {
      throw new APIResponseError(
        {
          code: 'NETWORK_ERROR',
          message: 'ネットワークに接続できません',
        },
        0
      );
    }

    // HTTPステータスエラー
    const status = error.response.status;
    const responseData = error.response.data;

    let apiError: APIError;

    if (responseData?.error) {
      // サーバーからのエラーレスポンス
      apiError = responseData.error;
    } else {
      // HTTPステータスコードからエラーを生成
      switch (status) {
        case 400:
          apiError = {
            code: 'BAD_REQUEST',
            message: 'リクエストが無効です',
          };
          break;
        case 401:
          apiError = {
            code: 'UNAUTHORIZED',
            message: '認証が必要です',
          };
          break;
        case 403:
          apiError = {
            code: 'FORBIDDEN',
            message: 'アクセスが拒否されました',
          };
          break;
        case 404:
          apiError = {
            code: 'NOT_FOUND',
            message: 'リソースが見つかりません',
          };
          break;
        case 429:
          apiError = {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'リクエスト制限に達しました',
          };
          break;
        case 500:
          apiError = {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'サーバーエラーが発生しました',
          };
          break;
        default:
          apiError = {
            code: 'UNKNOWN_ERROR',
            message: `HTTPエラー: ${status}`,
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
  return response.data.data;
};
