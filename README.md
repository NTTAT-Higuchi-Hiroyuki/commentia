# Commentia

リアルタイムコメント投稿アプリケーション - Web会議、講演会、スピーチ等のイベントで主催者と聴衆者間のインタラクティブなコミュニケーションを実現

## 概要

Commentiaは、主催者がワンクリックでルームを作成し、聴衆者がニックネームのみで参加してリアルタイムにコメントを投稿・反応できるアプリケーションです。

### 主要機能

- **ルーム管理**: ワンクリックでルーム作成、QRコード/URLでの簡単参加
- **リアルタイムコメント**: WebSocketによる即座のコメント配信
- **いいね機能**: コメントへのリアクション
- **参加者管理**: リアルタイムでの参加者数・状態表示
- **モバイル対応**: レスポンシブデザインとPWA機能

## アーキテクチャ

- **フロントエンド**: React 18 + TypeScript + Vite + Tailwind CSS
- **バックエンド**: AWS Lambda + TypeScript (Node.js 22.x)
- **データベース**: Amazon DynamoDB
- **インフラ**: AWS CDK v2 + TypeScript
- **リアルタイム通信**: API Gateway WebSocket API

## プロジェクト構成

```
commentia/
├── packages/
│   ├── frontend/          # React SPA
│   ├── backend/           # Lambda関数群
│   ├── infrastructure/    # AWS CDKコード
│   └── shared/            # 共通型定義
├── tests/                 # 統合・E2Eテスト
├── scripts/               # デプロイ・テストスクリプト
└── .github/               # CI/CDワークフロー
```

## セットアップ

### 必要な環境

- Node.js 22.0.0以上
- npm 10.0.0以上
- AWS CLI v2 (デプロイ時)
- Docker (ローカル開発・テスト時)

### 1. プロジェクトのクローン

```bash
git clone https://github.com/commentia/commentia.git
cd commentia
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

```bash
cp .env.example .env
# .envファイルを編集してください
```

主要な環境変数:

```bash
# 開発環境
STAGE=dev
REGION=ap-northeast-1

# LocalStack（ローカル開発用）
DYNAMODB_ENDPOINT=http://localhost:4566
WEBSOCKET_ENDPOINT=ws://localhost:4566
API_ENDPOINT=http://localhost:4566
```

### 4. ローカル開発環境の起動

#### 方法1: LocalStackを使用（推奨）

```bash
# LocalStackとDynamoDBを起動
npm run test:setup

# フロントエンド開発サーバーを起動
npm run dev

# 別ターミナルでバックエンドをビルド
npm run backend:build
```

#### 方法2: フロントエンドのみ開発

```bash
npm run dev
```

アプリケーションが `http://localhost:5173` で起動します。

## 開発ワークフロー

### コーディング

```bash
# フォーマット・リント
npm run format
npm run lint

# 型チェック
npm run type-check

# ビルド
npm run build
```

### テスト

```bash
# 全体テスト実行
npm test

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e

# 完全テストスイート（LocalStack使用）
npm run test:full
```

### デプロイ

```bash
# インフラの合成確認
npm run infra:synth

# 開発環境へデプロイ
npm run infra:deploy:dev

# ステージング環境へデプロイ
npm run infra:deploy:staging

# 本番環境へデプロイ
npm run infra:deploy:prod
```

## 利用方法

### 主催者（ルーム作成）

1. アプリケーションにアクセス
2. 「ルームを作成」をクリック
3. 生成されたルームURL・QRコード・6桁コードを参加者に共有
4. リアルタイムでコメントと参加者を確認

### 参加者（コメント投稿）

1. 共有されたURL・QRコード・6桁コードでルームに参加
2. ニックネームを入力
3. コメントを投稿・他の参加者のコメントにいいね

## 技術詳細

### API仕様

詳細なAPI仕様は [API仕様書](./docs/API.md) を参照してください。

主要エンドポイント:

```
# REST API
POST   /rooms                    # ルーム作成
GET    /rooms/{roomId}           # ルーム情報取得
POST   /rooms/{roomId}/comments  # コメント投稿
POST   /comments/{commentId}/likes # いいね追加

# WebSocket API
$connect    # 接続確立
joinRoom    # ルーム参加
leaveRoom   # ルーム退出
```

### データベース設計

DynamoDBテーブル:

- **Rooms**: ルーム情報（TTL: 24時間）
- **Comments**: コメント（TTL: 24時間）
- **Connections**: WebSocket接続（TTL: 2時間）
- **Likes**: いいね情報（TTL: 24時間）

### セキュリティ

- XSS対策: DOMPurifyによるサニタイゼーション
- レート制限: API Gateway + Lambda内制限
- WAFルール: SQLインジェクション・XSS攻撃対策
- HTTPS通信の強制

## パフォーマンス

- 同時接続数: 100人/ルーム
- コメント投稿から表示: 1秒以内
- API応答時間: 95%ile 500ms以内

## モニタリング

- CloudWatch Logs: 構造化ログ出力
- CloudWatch Metrics: カスタムメトリクス収集
- CloudWatch Alarms: エラー率・レスポンス時間監視

## 貢献

1. フォークして機能ブランチを作成
2. 変更をコミット（コミットメッセージは [Conventional Commits](https://conventionalcommits.org/) に従う）
3. テストが通ることを確認
4. プルリクエストを作成

### 開発ガイドライン

- TypeScript厳格モードを維持
- Biomeによるフォーマット・リント
- テストカバレッジ80%以上を維持
- すべてのPRでCI/CDパイプラインが通ること

## ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) ファイルを参照

## サポート

- バグ報告: [Issues](https://github.com/commentia/commentia/issues)
- 機能要望: [Discussions](https://github.com/commentia/commentia/discussions)
- トラブルシューティング: [トラブルシューティングガイド](./docs/TROUBLESHOOTING.md)

## ドキュメント

- [API仕様書](./docs/API.md)
- [デプロイメントガイド](./docs/DEPLOYMENT.md)
- [トラブルシューティングガイド](./docs/TROUBLESHOOTING.md)
- [アーキテクチャ設計書](./.tmp/design.md)

---

## 更新履歴

- v0.1.0: 初回リリース - 基本機能実装完了