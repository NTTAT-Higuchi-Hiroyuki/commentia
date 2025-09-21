# API仕様書 - Commentia

リアルタイムコメント投稿アプリケーションのAPI仕様書

## 概要

CommentiaのAPIは以下の2つの層で構成されています：

- **REST API**: ルーム・コメント・いいね機能のCRUD操作
- **WebSocket API**: リアルタイム通信（コメント配信、参加者管理）

## Base URL

```
# 本番環境
https://api.commentia.example.com

# ステージング環境
https://api-staging.commentia.example.com

# 開発環境
https://api-dev.commentia.example.com

# ローカル開発（LocalStack）
http://localhost:4566
```

## 認証

現在のバージョンでは認証は不要です（認証なし設計）。

## レート制限

- **REST API**: 100リクエスト/分/IP
- **WebSocket**: 50メッセージ/分/接続
- **コメント投稿**: 10件/分/ユーザー
- **いいね**: 50回/分/ユーザー

## エラーレスポンス

全てのAPIエラーは以下の形式で返されます：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "バリデーションエラーが発生しました",
    "details": {
      "field": "hostId",
      "reason": "必須項目です"
    },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "abc123-def456-ghi789"
  }
}
```

### エラーコード一覧

| コード | 説明 |
|--------|------|
| `VALIDATION_ERROR` | リクエストのバリデーションエラー |
| `NOT_FOUND` | リソースが見つからない |
| `RATE_LIMIT_EXCEEDED` | レート制限に達した |
| `ROOM_CLOSED` | ルームが終了している |
| `DUPLICATE_LIKE` | 重複いいね |
| `COMMENT_LIMIT_EXCEEDED` | コメント数制限に達した |
| `INTERNAL_ERROR` | サーバー内部エラー |

---

## REST API エンドポイント

### ルーム管理

#### ルーム作成
```http
POST /rooms
```

**リクエストボディ:**
```json
{
  "hostId": "user123",
  "settings": {
    "maxCommentsPerUser": 10,
    "maxLikesPerUser": 50,
    "commentMaxLength": 500
  }
}
```

**レスポンス:**
```json
{
  "room": {
    "roomId": "room_abc123def456",
    "roomCode": "ABC123",
    "hostId": "user123",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "status": "active",
    "settings": {
      "maxCommentsPerUser": 10,
      "maxLikesPerUser": 50,
      "commentMaxLength": 500
    }
  },
  "roomUrl": "https://commentia.example.com/rooms/room_abc123def456",
  "qrCodeUrl": "https://api.commentia.example.com/rooms/room_abc123def456/qr"
}
```

#### ルーム情報取得
```http
GET /rooms/{roomId}
```

**レスポンス:**
```json
{
  "roomId": "room_abc123def456",
  "roomCode": "ABC123",
  "hostId": "user123",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "status": "active",
  "settings": {
    "maxCommentsPerUser": 10,
    "maxLikesPerUser": 50,
    "commentMaxLength": 500
  },
  "participantCount": 25
}
```

#### ルームコードで検索
```http
GET /rooms/code/{roomCode}
```

**レスポンス:**
```json
{
  "roomId": "room_abc123def456",
  "roomCode": "ABC123",
  "hostId": "user123",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "status": "active",
  "settings": {
    "maxCommentsPerUser": 10,
    "maxLikesPerUser": 50,
    "commentMaxLength": 500
  }
}
```

#### ルーム終了
```http
DELETE /rooms/{roomId}
```

**リクエストボディ:**
```json
{
  "hostId": "user123"
}
```

**レスポンス:**
```json
{
  "message": "ルームが正常に終了されました",
  "roomId": "room_abc123def456"
}
```

### コメント管理

#### コメント投稿
```http
POST /rooms/{roomId}/comments
```

**リクエストボディ:**
```json
{
  "userId": "user456",
  "userName": "田中太郎",
  "content": "素晴らしい講演でした！"
}
```

**レスポンス:**
```json
{
  "commentId": "comment_xyz789abc123",
  "roomId": "room_abc123def456",
  "userId": "user456",
  "userName": "田中太郎",
  "content": "素晴らしい講演でした！",
  "timestamp": "2024-01-15T10:35:00.000Z",
  "likeCount": 0
}
```

#### コメント一覧取得
```http
GET /rooms/{roomId}/comments?sortBy={latest|likes}&limit={number}&lastKey={string}
```

**クエリパラメータ:**
- `sortBy`: ソート順（`latest`: 新着順、`likes`: いいね順）
- `limit`: 取得件数（デフォルト: 50、最大: 100）
- `lastKey`: ページネーション用キー

**レスポンス:**
```json
{
  "comments": [
    {
      "commentId": "comment_xyz789abc123",
      "roomId": "room_abc123def456",
      "userId": "user456",
      "userName": "田中太郎",
      "content": "素晴らしい講演でした！",
      "timestamp": "2024-01-15T10:35:00.000Z",
      "likeCount": 5
    }
  ],
  "lastKey": "next_page_key_if_exists",
  "hasMore": false
}
```

#### コメント削除
```http
DELETE /comments/{commentId}
```

**リクエストボディ:**
```json
{
  "userId": "user456"
}
```

**レスポンス:**
```json
{
  "message": "コメントが正常に削除されました",
  "commentId": "comment_xyz789abc123"
}
```

### いいね管理

#### いいね追加
```http
POST /comments/{commentId}/likes
```

**リクエストボディ:**
```json
{
  "userId": "user789",
  "roomId": "room_abc123def456"
}
```

**レスポンス:**
```json
{
  "commentId": "comment_xyz789abc123",
  "likeCount": 6,
  "isLiked": true
}
```

#### いいね取消
```http
DELETE /comments/{commentId}/likes
```

**リクエストボディ:**
```json
{
  "userId": "user789"
}
```

**レスポンス:**
```json
{
  "commentId": "comment_xyz789abc123",
  "likeCount": 5,
  "isLiked": false
}
```

### QRコード

#### QRコード取得
```http
GET /rooms/{roomId}/qr?format={png|svg}&size={number}
```

**クエリパラメータ:**
- `format`: 画像形式（`png` または `svg`、デフォルト: `png`）
- `size`: 画像サイズ（デフォルト: 200、最大: 1000）

**レスポンス:**
```
Content-Type: image/png または image/svg+xml
```

---

## WebSocket API

### 接続

#### WebSocket接続確立
```
wss://api.commentia.example.com/
```

#### 接続イベント
```json
{
  "action": "$connect"
}
```

#### 切断イベント
```json
{
  "action": "$disconnect"
}
```

### カスタムルート

#### ルーム参加
```json
{
  "action": "joinRoom",
  "data": {
    "roomId": "room_abc123def456",
    "userId": "user456",
    "userName": "田中太郎"
  }
}
```

**レスポンス:**
```json
{
  "type": "user_joined",
  "data": {
    "userName": "田中太郎",
    "userCount": 26
  }
}
```

#### ルーム退出
```json
{
  "action": "leaveRoom",
  "data": {
    "roomId": "room_abc123def456",
    "userId": "user456"
  }
}
```

**レスポンス:**
```json
{
  "type": "user_left",
  "data": {
    "userName": "田中太郎",
    "userCount": 25
  }
}
```

### ブロードキャストメッセージ

#### 新しいコメント
```json
{
  "type": "comment_new",
  "data": {
    "commentId": "comment_xyz789abc123",
    "roomId": "room_abc123def456",
    "userId": "user456",
    "userName": "田中太郎",
    "content": "素晴らしい講演でした！",
    "timestamp": "2024-01-15T10:35:00.000Z",
    "likeCount": 0
  }
}
```

#### コメント削除
```json
{
  "type": "comment_deleted",
  "data": {
    "commentId": "comment_xyz789abc123",
    "roomId": "room_abc123def456"
  }
}
```

#### いいね数更新
```json
{
  "type": "like_updated",
  "data": {
    "commentId": "comment_xyz789abc123",
    "likeCount": 6
  }
}
```

#### ユーザー参加通知
```json
{
  "type": "user_joined",
  "data": {
    "userName": "田中太郎",
    "userCount": 26
  }
}
```

#### ユーザー退出通知
```json
{
  "type": "user_left",
  "data": {
    "userName": "田中太郎",
    "userCount": 25
  }
}
```

#### ルーム終了通知
```json
{
  "type": "room_closed",
  "data": {
    "roomId": "room_abc123def456",
    "message": "ルームが終了されました"
  }
}
```

---

## データ形式

### タイムスタンプ
全てのタイムスタンプはISO 8601形式（UTC）で返されます：
```
2024-01-15T10:30:00.000Z
```

### 文字列制限
- **ニックネーム**: 1-20文字
- **コメント**: 1-500文字（設定可能）
- **ルームコード**: 6文字（英数字）
- **roomId**: `room_` + 16文字のランダム文字列
- **commentId**: `comment_` + 16文字のランダム文字列

### バリデーション規則

#### ニックネーム
- 文字数: 1-20文字
- 使用可能文字: 日本語、英数字、一部記号
- 禁止文字: 制御文字、HTMLタグ

#### コメント内容
- 文字数: 1-500文字（ルーム設定により変更可能）
- XSSサニタイゼーション適用
- 連続する改行・空白の制限

#### ルームコード
- 6桁の英数字（大文字）
- 重複回避のため生成時にチェック

---

## WebSocket接続管理

### 接続制限
- 最大同時接続数: 1000接続/リージョン
- 接続タイムアウト: 30分（非アクティブ時）
- 再接続間隔: 指数バックオフ（1秒から最大30秒）

### ハートビート
```json
{
  "type": "ping"
}
```

**レスポンス:**
```json
{
  "type": "pong",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### エラーメッセージ
```json
{
  "type": "error",
  "data": {
    "code": "ROOM_NOT_FOUND",
    "message": "指定されたルームが見つかりません",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## 利用例

### JavaScriptでのWebSocket接続例

```javascript
const ws = new WebSocket('wss://api.commentia.example.com/');

ws.onopen = () => {
  // ルームに参加
  ws.send(JSON.stringify({
    action: 'joinRoom',
    data: {
      roomId: 'room_abc123def456',
      userId: 'user456',
      userName: '田中太郎'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'comment_new':
      // 新しいコメントを表示
      displayComment(message.data);
      break;
    case 'like_updated':
      // いいね数を更新
      updateLikeCount(message.data.commentId, message.data.likeCount);
      break;
    case 'user_joined':
      // 参加者数を更新
      updateUserCount(message.data.userCount);
      break;
  }
};
```

### axiosでのREST API呼び出し例

```javascript
import axios from 'axios';

// ルーム作成
const createRoom = async (hostId) => {
  const response = await axios.post('https://api.commentia.example.com/rooms', {
    hostId: hostId,
    settings: {
      maxCommentsPerUser: 10,
      maxLikesPerUser: 50,
      commentMaxLength: 500
    }
  });
  return response.data;
};

// コメント投稿
const postComment = async (roomId, userId, userName, content) => {
  const response = await axios.post(
    `https://api.commentia.example.com/rooms/${roomId}/comments`,
    {
      userId: userId,
      userName: userName,
      content: content
    }
  );
  return response.data;
};
```

---

## 変更履歴

- v0.1.0: 初回API仕様策定
  - REST API基本機能
  - WebSocket API基本機能
  - 認証なし設計