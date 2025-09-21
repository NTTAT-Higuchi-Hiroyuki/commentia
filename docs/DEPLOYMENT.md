# デプロイメントガイド - Commentia

CommentiaアプリケーションのAWSクラウド環境への段階的デプロイメント手順書

## 目次

1. [前提条件](#前提条件)
2. [AWS環境の準備](#aws環境の準備)
3. [環境設定](#環境設定)
4. [開発環境デプロイ](#開発環境デプロイ)
5. [ステージング環境デプロイ](#ステージング環境デプロイ)
6. [本番環境デプロイ](#本番環境デプロイ)
7. [デプロイメント後の確認](#デプロイメント後の確認)
8. [ロールバック手順](#ロールバック手順)
9. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件

### 必要なツール

```bash
# Node.js 22.0.0以上
node --version  # v22.0.0+

# npm 10.0.0以上
npm --version   # 10.0.0+

# AWS CLI v2
aws --version   # aws-cli/2.0.0+

# Docker（ローカルテスト用）
docker --version
```

### 必要な権限

AWSアカウントで以下のサービスへのフルアクセス権限が必要：

- CloudFormation
- S3
- CloudFront
- API Gateway
- Lambda
- DynamoDB
- IAM
- CloudWatch
- Route53（カスタムドメイン使用時）
- ACM（SSL証明書管理時）

---

## AWS環境の準備

### 1. AWS CLIの設定

```bash
# AWS認証情報を設定
aws configure

# プロファイルを使用する場合
aws configure --profile commentia-prod
export AWS_PROFILE=commentia-prod
```

### 2. CDKブートストラップ

```bash
# 対象リージョンでCDKを初期化（各環境・リージョンで一度だけ実行）
npx cdk bootstrap aws://ACCOUNT-NUMBER/ap-northeast-1

# 複数リージョンの場合
npx cdk bootstrap aws://ACCOUNT-NUMBER/ap-northeast-1 aws://ACCOUNT-NUMBER/us-east-1
```

### 3. ドメインの準備（オプション）

カスタムドメインを使用する場合：

```bash
# Route53でホストゾーンを作成
aws route53 create-hosted-zone --name commentia.example.com --caller-reference $(date +%s)

# SSL証明書をACMで発行（us-east-1リージョンで実行）
aws acm request-certificate --domain-name commentia.example.com --validation-method DNS --region us-east-1
```

---

## 環境設定

### 1. 環境変数ファイルの作成

```bash
# 開発環境
cp .env.example .env.dev
# ステージング環境
cp .env.example .env.staging
# 本番環境
cp .env.example .env.prod
```

### 2. 各環境の設定

#### .env.dev (開発環境)
```bash
STAGE=dev
REGION=ap-northeast-1
DOMAIN_NAME=dev.commentia.example.com
ALLOWED_ORIGINS=https://dev.commentia.example.com,http://localhost:5173
DEBUG_MODE=true
LOG_LEVEL=debug

# DynamoDB設定
DYNAMODB_BILLING_MODE=PAY_PER_REQUEST
ENABLE_POINT_IN_TIME_RECOVERY=false

# CloudFront設定
ENABLE_CLOUDFRONT_LOGS=true
CLOUDFRONT_PRICE_CLASS=PriceClass_100

# Monitoring設定
ENABLE_DETAILED_MONITORING=true
ENABLE_X_RAY_TRACING=true
```

#### .env.staging (ステージング環境)
```bash
STAGE=staging
REGION=ap-northeast-1
DOMAIN_NAME=staging.commentia.example.com
ALLOWED_ORIGINS=https://staging.commentia.example.com
DEBUG_MODE=false
LOG_LEVEL=info

# DynamoDB設定
DYNAMODB_BILLING_MODE=PAY_PER_REQUEST
ENABLE_POINT_IN_TIME_RECOVERY=true

# CloudFront設定
ENABLE_CLOUDFRONT_LOGS=true
CLOUDFRONT_PRICE_CLASS=PriceClass_200

# Monitoring設定
ENABLE_DETAILED_MONITORING=true
ENABLE_X_RAY_TRACING=true
```

#### .env.prod (本番環境)
```bash
STAGE=prod
REGION=ap-northeast-1
DOMAIN_NAME=commentia.example.com
ALLOWED_ORIGINS=https://commentia.example.com
DEBUG_MODE=false
LOG_LEVEL=warn

# DynamoDB設定
DYNAMODB_BILLING_MODE=PAY_PER_REQUEST
ENABLE_POINT_IN_TIME_RECOVERY=true
ENABLE_BACKUP=true

# CloudFront設定
ENABLE_CLOUDFRONT_LOGS=true
CLOUDFRONT_PRICE_CLASS=PriceClass_All

# Monitoring設定
ENABLE_DETAILED_MONITORING=true
ENABLE_X_RAY_TRACING=true
ENABLE_ENHANCED_MONITORING=true

# セキュリティ設定
ENABLE_WAF=true
ENABLE_SHIELD_ADVANCED=false  # 必要に応じてtrue
```

---

## 開発環境デプロイ

### 1. 事前チェック

```bash
# プロジェクトルートで実行
npm install

# 全パッケージのビルド
npm run build

# 型チェック
npm run type-check

# テスト実行
npm test

# CDKの合成確認
npm run infra:synth
```

### 2. 開発環境デプロイ実行

```bash
# 環境変数を設定
export $(cat .env.dev | xargs)

# または、スクリプトを使用
npm run infra:deploy:dev
```

### 3. デプロイ進行状況の確認

```bash
# CloudFormationスタックの状態確認
aws cloudformation describe-stacks --stack-name CommentiaDevStack

# CloudFormationコンソールでリアルタイム確認
# https://console.aws.amazon.com/cloudformation/
```

### 4. デプロイ完了後の設定

```bash
# APIエンドポイントの取得
aws cloudformation describe-stacks \
  --stack-name CommentiaDevStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text

# WebSocketエンドポイントの取得
aws cloudformation describe-stacks \
  --stack-name CommentiaDevStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketUrl`].OutputValue' \
  --output text

# CloudFrontドメインの取得
aws cloudformation describe-stacks \
  --stack-name CommentiaDevStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomain`].OutputValue' \
  --output text
```

---

## ステージング環境デプロイ

### 1. 開発環境での動作確認完了

```bash
# 開発環境でのスモークテスト
npm run test:smoke -- --env dev

# E2Eテスト
npm run test:e2e -- --config playwright.config.dev.ts
```

### 2. ステージング環境デプロイ

```bash
# 環境変数を設定
export $(cat .env.staging | xargs)

# デプロイ実行
npm run infra:deploy:staging
```

### 3. ステージング環境での検証

```bash
# ステージング環境でのテスト
npm run test:smoke -- --env staging
npm run test:performance -- --env staging

# 手動動作確認
# 1. ルーム作成・参加の確認
# 2. コメント投稿・表示の確認
# 3. いいね機能の確認
# 4. レスポンシブデザインの確認
```

---

## 本番環境デプロイ

### 1. 本番リリース前チェックリスト

- [ ] ステージング環境での全機能テスト完了
- [ ] パフォーマンステスト完了
- [ ] セキュリティスキャン完了
- [ ] ドキュメント更新完了
- [ ] ロールバック手順の確認
- [ ] 監視・アラート設定の確認
- [ ] 本番デプロイ許可の取得

### 2. 本番環境デプロイ実行

```bash
# メンテナンス通知（必要に応じて）
# - 事前にユーザーへ通知

# 環境変数を設定
export $(cat .env.prod | xargs)

# 最終確認
npm run infra:synth
aws cloudformation validate-template --template-body file://cdk.out/CommentiaStack.template.json

# デプロイ実行
npm run infra:deploy:prod

# デプロイ進行状況の監視
watch aws cloudformation describe-stacks --stack-name CommentiaStack --query 'Stacks[0].StackStatus'
```

### 3. 本番デプロイ後の即座確認

```bash
# スモークテスト
npm run test:smoke -- --env prod

# 主要機能の手動確認
# 1. ルーム作成
# 2. ルーム参加
# 3. コメント投稿
# 4. いいね機能
# 5. リアルタイム更新

# パフォーマンス確認
npm run test:performance -- --env prod --concurrent-users 50
```

---

## デプロイメント後の確認

### 1. ヘルスチェック

```bash
# API Gatewayのヘルスチェック
curl -f https://api.commentia.example.com/health

# WebSocketの接続確認
curl -f --include \
  --no-buffer \
  --header "Connection: Upgrade" \
  --header "Upgrade: websocket" \
  --header "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  --header "Sec-WebSocket-Version: 13" \
  https://api.commentia.example.com/
```

### 2. 監視の設定確認

```bash
# CloudWatchメトリクスの確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CommentiaCreateRoomFunction \
  --statistics Average \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300

# CloudWatchアラームの状態確認
aws cloudwatch describe-alarms --alarm-names CommentiaHighErrorRate CommentiaHighLatency
```

### 3. ログの確認

```bash
# Lambda関数のログ確認
aws logs tail /aws/lambda/CommentiaCreateRoomFunction --follow

# API Gatewayのアクセスログ確認
aws logs tail CommentiaApiGatewayAccessLogs --follow
```

---

## ロールバック手順

### 1. 緊急時の即座ロールバック

```bash
# 前のバージョンのスタックIDを取得
aws cloudformation list-stacks \
  --stack-status-filter UPDATE_COMPLETE \
  --query 'StackSummaries[?StackName==`CommentiaStack`] | [0].StackId'

# CloudFormationスタックのロールバック
aws cloudformation cancel-update-stack --stack-name CommentiaStack

# または、前のバージョンに戻す
git checkout <previous-commit>
npm run infra:deploy:prod
```

### 2. Lambda関数のバージョンロールバック

```bash
# 前のバージョンを確認
aws lambda list-versions-by-function --function-name CommentiaCreateRoomFunction

# エイリアスを前のバージョンに切り替え
aws lambda update-alias \
  --function-name CommentiaCreateRoomFunction \
  --name prod \
  --function-version <previous-version>
```

### 3. フロントエンドのロールバック

```bash
# S3から前のバージョンを復元
aws s3 sync s3://commentia-backup-bucket/frontend-v1.0.0/ s3://commentia-frontend-bucket/

# CloudFrontキャッシュの無効化
aws cloudfront create-invalidation \
  --distribution-id <distribution-id> \
  --paths "/*"
```

---

## 継続的デプロイメント (CI/CD)

### GitHub Actionsワークフロー

プロジェクトには `.github/workflows/ci-cd.yml` でCI/CDパイプラインが設定されています。

#### トリガー条件

- **開発環境**: `main` ブランチへのプッシュ
- **ステージング環境**: `release/*` ブランチへのプルリクエスト
- **本番環境**: リリースタグ作成時

#### 自動デプロイの有効化

```bash
# GitHub Secretsに認証情報を設定
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY
# AWS_REGION

# 環境別の設定
# DEV_DOMAIN_NAME
# STAGING_DOMAIN_NAME
# PROD_DOMAIN_NAME
```

---

## 環境の削除

### 開発環境の削除

```bash
# スタックの削除
npm run infra:destroy:dev

# 手動削除が必要な場合
aws cloudformation delete-stack --stack-name CommentiaDevStack

# S3バケットの中身を削除（必要に応じて）
aws s3 rm s3://commentia-dev-frontend-bucket --recursive
```

### 全環境の削除

```bash
# 全スタックの削除（本番環境は慎重に）
aws cloudformation list-stacks --query 'StackSummaries[?contains(StackName, `Commentia`)].StackName' --output text | xargs -I {} aws cloudformation delete-stack --stack-name {}
```

---

## トラブルシューティング

### よくある問題と解決方法

#### 1. CDKデプロイエラー

```bash
# エラー: "Stack is in UPDATE_ROLLBACK_FAILED state"
aws cloudformation continue-update-rollback --stack-name CommentiaStack

# エラー: "Resource already exists"
# リソースを手動削除するか、CDK diffで差分を確認
npm run infra:diff
```

#### 2. Lambda関数のコールドスタート

```bash
# Provisioned Concurrencyの設定
aws lambda put-provisioned-concurrency-config \
  --function-name CommentiaCreateRoomFunction \
  --qualifier prod \
  --provisioned-concurrency-config 10
```

#### 3. DynamoDB調整

```bash
# DynamoDBテーブルの容量調整
aws dynamodb update-table \
  --table-name CommentiaRooms \
  --provisioned-throughput ReadCapacityUnits=20,WriteCapacityUnits=20
```

### ログの確認方法

```bash
# 構造化ログの検索
aws logs filter-log-events \
  --log-group-name /aws/lambda/CommentiaCreateRoomFunction \
  --filter-pattern '{ $.level = "ERROR" }'

# CloudWatch Insightsでの高度な分析
aws logs start-query \
  --log-group-name /aws/lambda/CommentiaCreateRoomFunction \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20'
```

---

## セキュリティ考慮事項

### 1. IAM権限の最小化

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/Commentia*"
    }
  ]
}
```

### 2. WAFルールの設定

```bash
# WAFの有効化確認
aws wafv2 get-web-acl --scope CLOUDFRONT --id <web-acl-id> --name CommentiaWAF
```

### 3. SSL/TLS証明書の管理

```bash
# 証明書の有効期限確認
aws acm describe-certificate --certificate-arn <certificate-arn>

# 自動更新の設定確認
aws acm list-certificates --certificate-statuses ISSUED
```

---

## 本番運用時の注意事項

### 1. 定期メンテナンス

- **月次**: DynamoDBバックアップの確認
- **週次**: CloudWatchログの確認とクリーンアップ
- **日次**: エラーレートとレスポンス時間の確認

### 2. 容量計画

```bash
# DynamoDBの使用量確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=CommentiaRooms \
  --statistics Sum \
  --start-time $(date -d '1 day ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600
```

### 3. バックアップ戦略

- DynamoDBポイントインタイムリカバリー: 有効化済み
- Lambda関数バージョン管理: 自動保持
- フロントエンドアセット: S3バージョニング有効

---

## サポート

デプロイメントに関する問題や質問は以下を参照してください：

- [トラブルシューティングガイド](./TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/commentia/commentia/issues)
- [AWS サポート](https://aws.amazon.com/support/)

---

## 更新履歴

- v0.1.0: 初回デプロイメントガイド作成
  - 段階的デプロイメント手順
  - CI/CD設定
  - ロールバック手順