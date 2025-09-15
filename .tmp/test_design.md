# テスト設計書 - リアルタイムコメント投稿アプリケーション「Commentia」

## 1. テスト概要

### 1.1 テスト目的

- アプリケーションの全機能が要件通りに動作することを検証
- リアルタイム通信の信頼性とパフォーマンスを確認
- セキュリティ脆弱性がないことを確認
- 100人同時接続でのシステム安定性を検証

### 1.2 テスト範囲

- **対象**:
  - REST API全エンドポイント
  - WebSocket通信機能
  - フロントエンドコンポーネント
  - Lambda関数
  - DynamoDB操作
- **対象外**:
  - AWS インフラストラクチャ（CDK）のデプロイメント
  - CloudFront CDNのキャッシュ動作
  - サードパーティライブラリの内部動作

### 1.3 テスト環境

- **ローカル環境**: LocalStack + Docker
- **CI環境**: GitHub Actions
- **依存関係**:
  - LocalStack (DynamoDB, Lambda, API Gateway)
  - Jest + Testing Library
  - WebSocket Mock Server

## 2. テストケース設計

### 2.1 Room Service APIのテストケース

#### 2.1.1 正常系テスト

| ID   | テストケース名 | 入力データ | 期待結果 | 優先度 |
|------|--------------|-----------|---------|--------|
| T001 | ルーム作成成功 | `{ hostId: "host123" }` | Room object with unique roomId, 6-digit roomCode | High |
| T002 | ルーム情報取得 | Valid roomId | Room details with status='active' | High |
| T003 | ルーム終了 | Valid roomId + hostId | status='closed', 200 OK | High |
| T004 | ルームコード検索 | Valid 6-digit code | Matching room object | High |
| T005 | QRコード生成 | Valid roomId | Base64 encoded QR image | Medium |

#### 2.1.2 異常系テスト

| ID   | テストケース名 | 入力データ | 期待結果 | 優先度 |
|------|--------------|-----------|---------|--------|
| T101 | 存在しないルーム取得 | Invalid roomId | 404 Not Found | High |
| T102 | 権限なしルーム終了 | Wrong hostId | 401 Unauthorized | High |
| T103 | 無効なルームコード | Invalid code format | 400 Bad Request | Medium |
| T104 | 終了済みルーム操作 | Closed room ID | 400 Bad Request | High |

#### 2.1.3 境界値テスト

| ID   | テストケース名 | 入力データ | 期待結果 | 優先度 |
|------|--------------|-----------|---------|--------|
| T201 | ルームコード重複確認 | 10000回生成 | すべてユニーク | Low |
| T202 | TTL期限切れルーム | 24時間経過 | 自動削除確認 | Medium |

### 2.2 Comment Service APIのテストケース

#### 2.2.1 正常系テスト

| ID   | テストケース名 | 入力データ | 期待結果 | 優先度 |
|------|--------------|-----------|---------|--------|
| T301 | コメント投稿成功 | Valid text (< 500文字) | Comment object with timestamp | High |
| T302 | コメント一覧取得（新着順） | sortBy='latest' | Comments in descending timestamp order | High |
| T303 | コメント一覧取得（いいね順） | sortBy='likes' | Comments in descending like count order | High |
| T304 | コメント削除 | commentId + userId | 200 OK, Comment removed | High |
| T305 | リアルタイム配信 | New comment | WebSocket broadcast to all connections | High |

#### 2.2.2 異常系テスト

| ID   | テストケース名 | 入力データ | 期待結果 | 優先度 |
|------|--------------|-----------|---------|--------|
| T401 | 文字数超過 | 501文字以上 | 400 Bad Request | High |
| T402 | 空コメント | Empty string | 400 Bad Request | High |
| T403 | 投稿数制限超過 | Max comments reached | 429 Too Many Requests | High |
| T404 | 連続投稿制限 | Rapid posting | 429 Too Many Requests | High |
| T405 | XSS攻撃文字列 | `<script>alert('xss')</script>` | Sanitized output | High |
| T406 | 他人のコメント削除 | Wrong userId | 401 Unauthorized | High |

### 2.3 WebSocket通信のテストケース

#### 2.3.1 接続管理テスト

| ID   | テストケース名 | シナリオ | 期待結果 | 優先度 |
|------|--------------|---------|---------|--------|
| T501 | 接続確立 | $connect | connectionId generated | High |
| T502 | ルーム参加 | joinRoom message | user_joined broadcast | High |
| T503 | 切断処理 | $disconnect | user_left broadcast | High |
| T504 | 重複ニックネーム | Same userName in room | 400 Error | High |
| T505 | 再接続処理 | Connection drop & retry | Successful reconnection | Medium |

#### 2.3.2 メッセージ配信テスト

| ID   | テストケース名 | シナリオ | 期待結果 | 優先度 |
|------|--------------|---------|---------|--------|
| T601 | コメント配信 | comment_new | All users receive | High |
| T602 | いいね更新配信 | like_updated | Real-time count update | High |
| T603 | 参加者数更新 | user_joined/left | User count broadcast | Medium |
| T604 | 大量メッセージ | 100 messages/sec | No message loss | High |

### 2.4 Like Service APIのテストケース

| ID   | テストケース名 | 入力データ | 期待結果 | 優先度 |
|------|--------------|-----------|---------|--------|
| T701 | いいね追加 | commentId + userId | likeCount incremented | High |
| T702 | いいね取消 | commentId + userId | likeCount decremented | High |
| T703 | 重複いいね防止 | Same user twice | 400 Bad Request | High |
| T704 | いいね数制限 | Max likes reached | 429 Too Many Requests | High |

## 3. テストデータ設計

### 3.1 マスタデータ

```json
{
  "testData": {
    "valid": {
      "room": {
        "hostId": "host-test-001",
        "settings": {
          "maxCommentsPerUser": 10,
          "maxLikesPerUser": 50,
          "commentMaxLength": 500
        }
      },
      "comment": {
        "userId": "user-test-001",
        "userName": "テストユーザー",
        "content": "これはテストコメントです。"
      },
      "users": [
        { "userId": "user-001", "userName": "ユーザー1" },
        { "userId": "user-002", "userName": "ユーザー2" },
        { "userId": "user-003", "userName": "ユーザー3" }
      ]
    },
    "invalid": {
      "comment": {
        "empty": "",
        "tooLong": "あ".repeat(501),
        "xss": "<script>alert('XSS')</script>",
        "sqlInjection": "'; DROP TABLE comments; --"
      },
      "roomCode": {
        "tooShort": "12345",
        "tooLong": "1234567",
        "invalid": "ABCDEF"
      }
    },
    "boundary": {
      "comment": {
        "maxLength": "あ".repeat(500),
        "minLength": "a"
      },
      "limits": {
        "maxComments": 10,
        "maxLikes": 50,
        "rateLimit": 5
      }
    }
  }
}
```

### 3.2 モックデータ

```typescript
// DynamoDB Response Mock
const mockRoomData = {
  PK: "ROOM#test-room-001",
  SK: "METADATA",
  roomId: "test-room-001",
  roomCode: "123456",
  hostId: "host-test-001",
  createdAt: "2024-01-01T00:00:00Z",
  status: "active",
  settings: {
    maxCommentsPerUser: 10,
    maxLikesPerUser: 50,
    commentMaxLength: 500
  },
  ttl: Math.floor(Date.now() / 1000) + 86400
};

// WebSocket Message Mock
const mockWSMessage = {
  type: "comment_new",
  data: {
    commentId: "comment-001",
    roomId: "room-001",
    userId: "user-001",
    userName: "テストユーザー",
    content: "新しいコメント",
    timestamp: "2024-01-01T00:00:00Z",
    likeCount: 0
  }
};
```

## 4. パフォーマンステスト

### 4.1 負荷テスト

| テスト項目 | 条件 | 期待値 | 測定項目 |
|-----------|------|--------|---------|
| 同時接続 | 100ユーザー/ルーム | 全接続成功 | 接続成功率 |
| コメント投稿 | 10件/秒/ルーム | 遅延 < 2秒 | レスポンスタイム |
| いいね処理 | 50回/秒/ルーム | 遅延 < 1秒 | 処理時間 |
| API応答 | 100 req/sec | 95%ile < 500ms | レスポンスタイム |
| WebSocket配信 | 100接続同時 | 遅延 < 1秒 | 配信遅延 |

### 4.2 ストレステスト

| テスト項目 | 条件 | 期待される挙動 |
|-----------|------|---------------|
| 最大接続数 | 500接続/ルーム | グレースフルな拒否 |
| バースト負荷 | 100件/秒の投稿 | レート制限発動 |
| メモリリーク | 24時間連続稼働 | メモリ使用量安定 |
| DynamoDB制限 | 書込み上限到達 | 適切なエラーハンドリング |

## 5. セキュリティテスト

### 5.1 入力検証テスト

| テスト項目 | 攻撃パターン | 期待結果 |
|-----------|------------|---------|
| XSS対策 | Script injection | サニタイズ済み出力 |
| SQLインジェクション | SQL文の挿入 | パラメータ化により無効 |
| コマンドインジェクション | Shell commands | 実行されない |
| パストラバーサル | ../../../etc/passwd | アクセス拒否 |
| JSONインジェクション | Malformed JSON | パースエラー |

### 5.2 認証・認可テスト

| テスト項目 | シナリオ | 期待結果 |
|-----------|---------|---------|
| ホスト権限 | 他人のルーム終了 | 401 Unauthorized |
| コメント削除権限 | 他人のコメント削除 | 401 Unauthorized |
| ルームアクセス | 存在しないルーム | 404 Not Found |
| レート制限 | 制限超過アクセス | 429 Too Many Requests |

### 5.3 通信セキュリティ

| テスト項目 | 確認内容 | 期待結果 |
|-----------|---------|---------|
| HTTPS強制 | HTTP接続試行 | HTTPSへリダイレクト |
| WebSocket暗号化 | WSS接続確認 | 暗号化通信 |
| CORS設定 | 異なるオリジン | 適切なCORSヘッダー |

## 6. 統合テストシナリオ

### シナリオ1: 基本的なルーム運用フロー

1. **前提条件**: システム初期状態
2. **テスト手順**:
   - Step 1: ホストがルームを作成
   - Step 2: QRコード/URLを生成
   - Step 3: 5人のユーザーが参加（ニックネーム設定）
   - Step 4: 各ユーザーがコメント投稿（計20件）
   - Step 5: いいね機能の利用（各コメント5～10いいね）
   - Step 6: コメントのソート切替（新着順→いいね順）
   - Step 7: ホストがルームを終了
3. **期待結果**:
   - 全ユーザーへのリアルタイム配信成功
   - データの整合性維持
   - ルーム終了後のアクセス拒否

### シナリオ2: 大規模イベントシミュレーション

1. **前提条件**: 100人参加想定
2. **テスト手順**:
   - Step 1: ルーム作成と100人の段階的参加
   - Step 2: 同時多発的なコメント投稿
   - Step 3: いいね機能の集中利用
   - Step 4: ネットワーク断絶と再接続
   - Step 5: 制限機能の動作確認
3. **期待結果**:
   - システム安定性維持
   - メッセージ配信の完全性
   - 適切なエラーハンドリング

### シナリオ3: 異常系統合テスト

1. **前提条件**: 様々な異常状態
2. **テスト手順**:
   - Step 1: Lambda関数のタイムアウト
   - Step 2: DynamoDB書込み失敗
   - Step 3: WebSocket接続の強制切断
   - Step 4: 悪意のある入力の連続投稿
3. **期待結果**:
   - エラーの適切な通知
   - システムの自己回復
   - データ不整合の防止

## 7. フロントエンドテスト

### 7.1 コンポーネントテスト

| コンポーネント | テスト内容 | カバレッジ目標 |
|--------------|-----------|--------------|
| RoomCreate | ルーム作成UI | 90% |
| CommentList | コメント表示・更新 | 85% |
| CommentInput | 入力バリデーション | 90% |
| LikeButton | いいね機能 | 85% |
| QRDisplay | QRコード表示 | 80% |

### 7.2 E2Eテスト（Playwright）

```typescript
// 主要なE2Eテストケース
const e2eTestCases = [
  "ルーム作成から参加まで",
  "コメント投稿と表示",
  "いいね機能の動作",
  "リアルタイム更新",
  "エラー表示",
  "レスポンシブデザイン"
];
```

## 8. テスト実行計画

### 8.1 実行順序

1. **単体テスト** (各コミット時)
   - Lambda関数
   - Reactコンポーネント
   - ユーティリティ関数

2. **統合テスト** (PR作成時)
   - API統合テスト
   - WebSocket通信テスト
   - データベース操作テスト

3. **E2Eテスト** (デプロイ前)
   - 主要シナリオ
   - クロスブラウザテスト

4. **パフォーマンステスト** (リリース前)
   - 負荷テスト
   - ストレステスト

5. **セキュリティテスト** (定期実行)
   - 脆弱性スキャン
   - ペネトレーションテスト

### 8.2 合格基準

- 単体テストカバレッジ: 80%以上
- 統合テスト成功率: 100%
- E2Eテスト成功率: 95%以上
- パフォーマンス基準達成
- セキュリティ脆弱性: Critical/High 0件

## 9. リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| LocalStack環境の不安定性 | High | Medium | Docker環境の定期的リセット、タイムアウト設定調整 |
| WebSocketテストの複雑性 | High | High | モックサーバーの利用、段階的テスト実装 |
| 大規模負荷テストの実施困難 | Medium | High | クラウド環境での段階的テスト、シミュレーション活用 |
| テストデータの管理複雑化 | Medium | Medium | テストデータ自動生成ツール導入 |
| CI/CD時間の長期化 | Low | High | 並列実行、キャッシュ活用 |

## 10. テスト自動化戦略

### 10.1 自動化対象

- **完全自動化**:
  - 単体テスト（Jest）
  - APIテスト（Supertest）
  - コンポーネントテスト（Testing Library）

- **部分自動化**:
  - E2Eテスト（Playwright）
  - パフォーマンステスト（K6）

- **手動テスト**:
  - UX/UIの使用感
  - エクスプロラトリーテスト

### 10.2 CI/CD統合

```yaml
# GitHub Actions設定概要
name: Test Pipeline
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - npm test
      - coverage report

  integration-tests:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack
    steps:
      - npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - npm run test:e2e
```

### 10.3 テストレポート

- **カバレッジレポート**: Codecov統合
- **テスト結果**: GitHub Actions Annotations
- **パフォーマンス**: CloudWatch Dashboards
- **セキュリティ**: OWASP ZAP Reports