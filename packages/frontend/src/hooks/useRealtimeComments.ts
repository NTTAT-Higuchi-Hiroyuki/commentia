import { useCommentsStore } from '@/store/commentsStore';
import { useWebSocketStore } from '@/store/websocketStore';
import type { Comment, WSMessage } from '@commentia/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseRealtimeCommentsOptions {
  roomId: string;
  onNewComment?: (comment: Comment) => void;
  onCommentDeleted?: (commentId: string) => void;
  onLikeUpdated?: (commentId: string, newLikeCount: number) => void;
  enableNotifications?: boolean;
}

export const useRealtimeComments = ({
  roomId,
  onNewComment,
  onCommentDeleted,
  onLikeUpdated,
  enableNotifications = false,
}: UseRealtimeCommentsOptions) => {
  const { socket, status: wsStatus } = useWebSocketStore();
  const { addComment, removeComment, updateLikeCount, setError } = useCommentsStore();

  // 通知の重複を防ぐためのref
  const lastNotificationRef = useRef<string>('');

  // WebSocketメッセージの処理
  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'comment_new':
          case 'comment_created': {
            const comment = 'comment' in message.data ? message.data.comment : message.data;

            // 自分のルームのコメントのみ処理
            if (comment.roomId === roomId) {
              addComment(comment);

              // コールバック実行
              if (onNewComment) {
                onNewComment(comment);
              }

              // 通知表示（ブラウザ通知）
              if (enableNotifications && comment.commentId !== lastNotificationRef.current) {
                showNotification(
                  '新しいコメント',
                  `${comment.userName}: ${comment.content.slice(0, 50)}${comment.content.length > 50 ? '...' : ''}`
                );
                lastNotificationRef.current = comment.commentId;
              }
            }
            break;
          }

          case 'comment_deleted': {
            const { commentId } = message.data;
            removeComment(commentId);

            if (onCommentDeleted) {
              onCommentDeleted(commentId);
            }
            break;
          }

          case 'like_updated':
          case 'comment_liked': {
            const commentId = message.data.commentId;
            const newLikeCount =
              'newLikeCount' in message.data ? message.data.newLikeCount : message.data.likeCount;

            updateLikeCount(commentId, newLikeCount);

            if (onLikeUpdated) {
              onLikeUpdated(commentId, newLikeCount);
            }
            break;
          }

          case 'error': {
            console.error('WebSocket error:', message.data);
            setError(message.data.message || 'リアルタイム通信でエラーが発生しました');
            break;
          }

          default:
            // 他のメッセージタイプは無視
            break;
        }
      } catch (error) {
        console.error('WebSocket message parsing error:', error);
      }
    },
    [
      roomId,
      addComment,
      removeComment,
      updateLikeCount,
      setError,
      onNewComment,
      onCommentDeleted,
      onLikeUpdated,
      enableNotifications,
    ]
  );

  // ブラウザ通知の表示
  const showNotification = (title: string, body: string) => {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'comment-notification',
        requireInteraction: false,
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: 'comment-notification',
            requireInteraction: false,
          });
        }
      });
    }
  };

  // WebSocketイベントリスナーの設定
  useEffect(() => {
    if (socket && wsStatus === 'connected') {
      socket.addEventListener('message', handleWebSocketMessage);

      return () => {
        socket.removeEventListener('message', handleWebSocketMessage);
      };
    }
    return undefined;
  }, [socket, wsStatus, handleWebSocketMessage]);

  // 通知権限のリクエスト
  useEffect(() => {
    if (enableNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return undefined;
  }, [enableNotifications]);

  return {
    isConnected: wsStatus === 'connected',
    connectionStatus: wsStatus,
  };
};

// 視覚的フィードバック付きのリアルタイムコメントフック
export const useRealtimeCommentsWithFeedback = (roomId: string) => {
  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set());
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());

  const markAsRead = (commentId: string) => {
    setNewCommentIds((prev) => {
      const next = new Set(prev);
      next.delete(commentId);
      return next;
    });
  };

  const markAllAsRead = () => {
    setNewCommentIds(new Set());
  };

  const clearRecentUpdates = () => {
    setRecentlyUpdatedIds(new Set());
  };

  const realtimeStatus = useRealtimeComments({
    roomId,
    onNewComment: (comment) => {
      setNewCommentIds((prev) => new Set(prev).add(comment.commentId));

      // 3秒後に新着マークを自動削除
      setTimeout(() => {
        setNewCommentIds((prev) => {
          const next = new Set(prev);
          next.delete(comment.commentId);
          return next;
        });
      }, 3000);
    },
    onLikeUpdated: (commentId) => {
      setRecentlyUpdatedIds((prev) => new Set(prev).add(commentId));

      // 2秒後に更新マークを自動削除
      setTimeout(() => {
        setRecentlyUpdatedIds((prev) => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
      }, 2000);
    },
    enableNotifications: true,
  });

  return {
    ...realtimeStatus,
    newCommentIds,
    recentlyUpdatedIds,
    markAsRead,
    markAllAsRead,
    clearRecentUpdates,
  };
};
