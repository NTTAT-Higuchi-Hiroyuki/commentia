import type {
  APIResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
} from '@commentia/shared';
import { apiClient, authTokenManager, extractResponseData } from './api';

export class UserService {
  // ユーザー登録
  static async register(data: RegisterRequest): Promise<LoginResponse> {
    const response = await apiClient.post<APIResponse<LoginResponse>>('/auth/register', data);
    const result = extractResponseData(response);

    // トークンを保存
    if (result.token) {
      authTokenManager.setToken(result.token);
    }

    return result;
  }

  // ログイン
  static async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<APIResponse<LoginResponse>>('/auth/login', data);
    const result = extractResponseData(response);

    // トークンを保存
    if (result.token) {
      authTokenManager.setToken(result.token);
    }

    return result;
  }

  // ログアウト
  static async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      // サーバーエラーが発生してもローカルのトークンは削除
      authTokenManager.removeToken();
    }
  }

  // 現在のユーザー情報取得
  static async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<APIResponse<User>>('/auth/me');
    return extractResponseData(response);
  }

  // ユーザー情報更新
  static async updateUser(data: Partial<User>): Promise<User> {
    const response = await apiClient.patch<APIResponse<User>>('/auth/me', data);
    return extractResponseData(response);
  }

  // ユーザー統計取得
  static async getUserStats(userId?: string): Promise<{
    commentsPosted: number;
    likesGiven: number;
    likesReceived: number;
    roomsJoined: number;
    roomsHosted: number;
  }> {
    const endpoint = userId ? `/users/${userId}/stats` : '/auth/me/stats';
    const response =
      await apiClient.get<
        APIResponse<{
          commentsPosted: number;
          likesGiven: number;
          likesReceived: number;
          roomsJoined: number;
          roomsHosted: number;
        }>
      >(endpoint);
    return extractResponseData(response);
  }

  // ユーザー制限情報取得
  static async getUserLimits(): Promise<{
    commentsRemaining: number;
    likesRemaining: number;
    nextPostTime: number;
  }> {
    const response =
      await apiClient.get<
        APIResponse<{
          commentsRemaining: number;
          likesRemaining: number;
          nextPostTime: number;
        }>
      >('/auth/me/limits');
    return extractResponseData(response);
  }

  // ゲストユーザー作成
  static async createGuestUser(): Promise<LoginResponse> {
    const response = await apiClient.post<APIResponse<LoginResponse>>('/auth/guest');
    const result = extractResponseData(response);

    // トークンを保存
    if (result.token) {
      authTokenManager.setToken(result.token);
    }

    return result;
  }

  // ユーザー検索
  static async searchUsers(
    query: string,
    params?: {
      page?: number;
      limit?: number;
    }
  ): Promise<{
    users: User[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const response = await apiClient.get<
      APIResponse<{
        users: User[];
        totalCount: number;
        hasMore: boolean;
      }>
    >('/users/search', {
      params: { q: query, ...params },
    });
    return extractResponseData(response);
  }

  // パスワード変更
  static async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    await apiClient.post('/auth/change-password', data);
  }

  // メールアドレス変更
  static async changeEmail(data: {
    newEmail: string;
    password: string;
  }): Promise<void> {
    await apiClient.post('/auth/change-email', data);
  }

  // アカウント削除
  static async deleteAccount(password: string): Promise<void> {
    await apiClient.delete('/auth/me', {
      data: { password },
    });
    authTokenManager.removeToken();
  }

  // トークン更新
  static async refreshToken(): Promise<{ token: string }> {
    const response = await apiClient.post<APIResponse<{ token: string }>>('/auth/refresh');
    const result = extractResponseData(response);

    // 新しいトークンを保存
    authTokenManager.setToken(result.token);

    return result;
  }
}
