import type {
  APIResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
} from '@commentia/shared';
import { apiClient, authTokenManager, extractResponseData } from './api';

// ユーザー登録
export async function register(data: RegisterRequest): Promise<LoginResponse> {
  const response = await apiClient.post<APIResponse<LoginResponse>>('/auth/register', data);
  const result = extractResponseData(response);

  // トークンを保存
  if (result.token) {
    authTokenManager.setToken(result.token);
  }

  return result;
}

// ログイン
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<APIResponse<LoginResponse>>('/auth/login', data);
  const result = extractResponseData(response);

  // トークンを保存
  if (result.token) {
    authTokenManager.setToken(result.token);
  }

  return result;
}

// ログアウト
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } finally {
    // サーバーエラーが発生してもローカルのトークンは削除
    authTokenManager.removeToken();
  }
}

// 現在のユーザー情報取得
export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<APIResponse<User>>('/auth/me');
  return extractResponseData(response);
}

// ユーザー情報更新
export async function updateUser(data: Partial<User>): Promise<User> {
  const response = await apiClient.patch<APIResponse<User>>('/auth/me', data);
  return extractResponseData(response);
}

// ユーザー統計取得
export async function getUserStats(userId?: string): Promise<{
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
export async function getUserLimits(): Promise<{
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
export async function createGuestUser(): Promise<LoginResponse> {
  const response = await apiClient.post<APIResponse<LoginResponse>>('/auth/guest');
  const result = extractResponseData(response);

  // トークンを保存
  if (result.token) {
    authTokenManager.setToken(result.token);
  }

  return result;
}

// ユーザー検索
export async function searchUsers(
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
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiClient.post('/auth/change-password', data);
}

// メールアドレス変更
export async function changeEmail(data: {
  newEmail: string;
  password: string;
}): Promise<void> {
  await apiClient.post('/auth/change-email', data);
}

// アカウント削除
export async function deleteAccount(password: string): Promise<void> {
  await apiClient.delete('/auth/me', {
    data: { password },
  });
  authTokenManager.removeToken();
}

// トークン更新
export async function refreshToken(): Promise<{ token: string }> {
  const response = await apiClient.post<APIResponse<{ token: string }>>('/auth/refresh');
  const result = extractResponseData(response);

  // 新しいトークンを保存
  authTokenManager.setToken(result.token);

  return result;
}

// 後方互換性のため、UserServiceオブジェクトも提供
export const UserService = {
  register,
  login,
  logout,
  getCurrentUser,
  updateUser,
  getUserStats,
  getUserLimits,
  createGuestUser,
  searchUsers,
  changePassword,
  changeEmail,
  deleteAccount,
  refreshToken,
} as const;
