import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5分間キャッシュを保持
      staleTime: 5 * 60 * 1000,
      // 10分間でキャッシュを削除
      gcTime: 10 * 60 * 1000,
      // エラー時のリトライ設定
      retry: (failureCount, error) => {
        // 404エラーはリトライしない
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
          return false;
        }
        // 3回まで再試行
        return failureCount < 3;
      },
      // リトライ間隔（指数バックオフ）
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // バックグラウンドでのrefetch設定
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // mutation失敗時のリトライ設定
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// 開発環境での詳細ログ
if (process.env.NODE_ENV === 'development') {
  queryClient.setQueryDefaults(['room'], {
    staleTime: 1 * 60 * 1000, // ルーム情報は1分でstale
  });

  queryClient.setQueryDefaults(['comments'], {
    staleTime: 30 * 1000, // コメントは30秒でstale
  });
}

// エラーハンドリング設定
queryClient.setDefaultOptions({
  queries: {
    throwOnError: false,
  },
  mutations: {
    throwOnError: false,
  },
});
