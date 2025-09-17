import type {
  APIResponse,
  Comment,
  CreateCommentRequest,
  GetCommentsRequest,
  GetCommentsResponse,
} from '@commentia/shared';
import { apiClient, extractResponseData } from './api';

// コメント一覧取得
export async function getComments(params: GetCommentsRequest): Promise<GetCommentsResponse> {
  const response = await apiClient.get<APIResponse<GetCommentsResponse>>(
    `/rooms/${params.roomId}/comments`,
    { params }
  );
  return extractResponseData(response);
}

// コメント投稿
export async function createComment(data: CreateCommentRequest): Promise<Comment> {
  const response = await apiClient.post<APIResponse<Comment>>(
    `/rooms/${data.roomId}/comments`,
    data
  );
  return extractResponseData(response);
}

// コメント削除
export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.delete(`/comments/${commentId}`);
}

// コメント詳細取得
export async function getComment(commentId: string): Promise<Comment> {
  const response = await apiClient.get<APIResponse<Comment>>(`/comments/${commentId}`);
  return extractResponseData(response);
}

// いいね追加
export async function likeComment(commentId: string): Promise<{ likeCount: number }> {
  const response = await apiClient.post<APIResponse<{ likeCount: number }>>(
    `/comments/${commentId}/like`
  );
  return extractResponseData(response);
}

// いいね取消
export async function unlikeComment(commentId: string): Promise<{ likeCount: number }> {
  const response = await apiClient.delete<APIResponse<{ likeCount: number }>>(
    `/comments/${commentId}/like`
  );
  return extractResponseData(response);
}

// ユーザーのコメント一覧取得
export async function getUserComments(
  userId: string,
  params?: {
    page?: number;
    limit?: number;
    roomId?: string;
  }
): Promise<{
  comments: Comment[];
  totalCount: number;
  hasMore: boolean;
}> {
  const response = await apiClient.get<
    APIResponse<{
      comments: Comment[];
      totalCount: number;
      hasMore: boolean;
    }>
  >(`/users/${userId}/comments`, { params });
  return extractResponseData(response);
}

// コメント通報
export async function reportComment(commentId: string, reason: string): Promise<void> {
  await apiClient.post(`/comments/${commentId}/report`, { reason });
}

// コメント検索
export async function searchComments(
  roomId: string,
  query: string,
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<{
  comments: Comment[];
  totalCount: number;
  hasMore: boolean;
}> {
  const response = await apiClient.get<
    APIResponse<{
      comments: Comment[];
      totalCount: number;
      hasMore: boolean;
    }>
  >(`/rooms/${roomId}/comments/search`, {
    params: { q: query, ...params },
  });
  return extractResponseData(response);
}

// 後方互換性のため、CommentServiceオブジェクトも提供
export const CommentService = {
  getComments,
  createComment,
  deleteComment,
  getComment,
  likeComment,
  unlikeComment,
  getUserComments,
  reportComment,
  searchComments,
} as const;
