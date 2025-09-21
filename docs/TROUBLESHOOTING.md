# トラブルシューティングガイド - Commentia

Commentiaアプリケーションで発生する可能性のある問題の診断と解決方法

## 目次

1. [一般的な問題](#一般的な問題)
2. [フロントエンド関連](#フロントエンド関連)
3. [バックエンド・API関連](#バックエンドapi関連)
4. [WebSocket関連](#websocket関連)
5. [デプロイメント関連](#デプロイメント関連)
6. [パフォーマンス関連](#パフォーマンス関連)
7. [セキュリティ関連](#セキュリティ関連)
8. [監視・ログ関連](#監視ログ関連)

---

## 一般的な問題

### ルームが見つからない

**症状**: 「ルームが見つかりません」エラーが表示される

**原因と対処法**:

1. **ルームコードの入力ミス**
   ```bash
   # 正しいルームコードの形式確認
   # 6桁の英数字（例: ABC123）
   ```

2. **ルームの有効期限切れ**
   ```bash
   # DynamoDBでルームの存在確認
   aws dynamodb get-item \
     --table-name CommentiaRooms \
     --key '{"PK":{"S":"ROOM#<roomId>"},"SK":{"S":"METADATA"}}'
   ```

3. **ネットワーク接続問題**
   ```bash
   # API接続テスト
   curl -f https://api.commentia.example.com/health
   ```

### コメントが投稿できない

**症状**: コメント投稿時にエラーが発生する

**診断手順**:

```bash
# 1. APIエンドポイントの確認
curl -X POST https://api.commentia.example.com/rooms/{roomId}/comments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "userName": "テストユーザー",
    "content": "テストコメント"
  }'

# 2. ルームの状態確認
curl https://api.commentia.example.com/rooms/{roomId}

# 3. Lambda関数のログ確認
aws logs tail /aws/lambda/CommentiaCommentFunction --follow
```

**対処法**:
- 文字数制限の確認（デフォルト500文字）
- 連続投稿制限の確認（30秒間隔）
- ユーザーの投稿数制限の確認

---

## フロントエンド関連

### ページが表示されない

**症状**: 白いページまたは404エラー

**診断手順**:

```bash
# 1. ブラウザコンソールでエラー確認
# F12 → Console タブでエラーメッセージを確認

# 2. ネットワークタブで失敗したリクエスト確認
# F12 → Network タブで赤いエラーを確認

# 3. CloudFrontディストリビューションの確認
aws cloudfront get-distribution --id <distribution-id>
```

**対処法**:

1. **キャッシュクリア**
   ```bash
   # CloudFrontキャッシュの無効化
   aws cloudfront create-invalidation \
     --distribution-id <distribution-id> \
     --paths "/*"
   ```

2. **ブラウザキャッシュクリア**
   - Ctrl+F5（Windows）/ Cmd+Shift+R（Mac）
   - 開発者ツール → Application → Storage → Clear storage

### WebSocket接続エラー

**症状**: リアルタイム更新が動作しない

**診断手順**:

```javascript
// ブラウザコンソールで実行
const ws = new WebSocket('wss://api.commentia.example.com/');
ws.onopen = () => console.log('WebSocket connected');
ws.onerror = (error) => console.error('WebSocket error:', error);
ws.onclose = (event) => console.log('WebSocket closed:', event.code, event.reason);
```

**対処法**:

1. **ネットワーク設定確認**
   - ファイアウォール設定
   - プロキシ設定
   - VPN接続の確認

2. **API Gateway WebSocket設定確認**
   ```bash
   aws apigatewayv2 get-apis --query 'Items[?Name==`CommentiaWebSocketApi`]'
   ```

### レスポンシブデザインの問題

**症状**: モバイルデバイスでレイアウトが崩れる

**確認ポイント**:
- ビューポート設定: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Tailwind CSSのレスポンシブクラス
- タッチイベントの動作

---

## バックエンド・API関連

### Lambda関数のタイムアウト

**症状**: API呼び出しが30秒でタイムアウトする

**診断**:

```bash
# Lambda関数の設定確認
aws lambda get-function-configuration --function-name CommentiaCreateRoomFunction

# CloudWatch Logsでタイムアウトエラー確認
aws logs filter-log-events \
  --log-group-name /aws/lambda/CommentiaCreateRoomFunction \
  --filter-pattern "Task timed out"
```

**対処法**:

1. **タイムアウト時間の調整**
   ```bash
   aws lambda update-function-configuration \
     --function-name CommentiaCreateRoomFunction \
     --timeout 60
   ```

2. **メモリ割り当ての増加**
   ```bash
   aws lambda update-function-configuration \
     --function-name CommentiaCreateRoomFunction \
     --memory-size 512
   ```

### DynamoDB調整エラー

**症状**: `ProvisionedThroughputExceededException` エラー

**対処法**:

```bash
# 現在のキャパシティ確認
aws dynamodb describe-table --table-name CommentiaRooms

# オンデマンドモードへの変更
aws dynamodb modify-table \
  --table-name CommentiaRooms \
  --billing-mode PAY_PER_REQUEST

# キャパシティの調整（プロビジョンモードの場合）
aws dynamodb update-table \
  --table-name CommentiaRooms \
  --provisioned-throughput ReadCapacityUnits=20,WriteCapacityUnits=20
```

### CORS エラー

**症状**: ブラウザコンソールで `CORS policy` エラー

**確認・修正**:

```bash
# API GatewayのCORS設定確認
aws apigateway get-resources --rest-api-id <api-id>

# Lambda関数でのCORSヘッダー確認
# レスポンスに以下が含まれているか確認：
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
# Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```

---

## WebSocket関連

### 接続が頻繁に切断される

**症状**: WebSocket接続が安定しない

**診断**:

```bash
# API Gateway WebSocketのメトリクス確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGatewayV2 \
  --metric-name ConnectCount \
  --dimensions Name=ApiId,Value=<websocket-api-id> \
  --statistics Sum \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

**対処法**:

1. **再接続ロジックの確認**
   ```javascript
   // 指数バックオフでの再接続実装
   let reconnectDelay = 1000;
   const maxDelay = 30000;

   function reconnect() {
     setTimeout(() => {
       connect();
       reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
     }, reconnectDelay);
   }
   ```

2. **ハートビート機能の実装**
   ```javascript
   setInterval(() => {
     if (ws.readyState === WebSocket.OPEN) {
       ws.send(JSON.stringify({ type: 'ping' }));
     }
   }, 30000);
   ```

### メッセージの配信遅延

**症状**: リアルタイム更新に遅延が発生する

**調査手順**:

```bash
# Lambda関数の実行時間確認
aws logs filter-log-events \
  --log-group-name /aws/lambda/CommentiaWebSocketFunction \
  --filter-pattern "[timestamp, requestId, duration]"

# DynamoDB Connectionsテーブルの確認
aws dynamodb scan --table-name CommentiaConnections --select COUNT
```

---

## デプロイメント関連

### CDKデプロイエラー

**エラー**: `Resource already exists`

**対処法**:

```bash
# 既存リソースのインポート
cdk import

# または手動削除後に再デプロイ
aws cloudformation delete-stack --stack-name CommentiaStack
npm run infra:deploy
```

**エラー**: `Insufficient permissions`

**対処法**:

```bash
# IAM権限の確認
aws sts get-caller-identity
aws iam get-user
aws iam list-attached-user-policies --user-name <username>

# 必要な権限の付与
aws iam attach-user-policy \
  --user-name <username> \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

### Lambda関数のビルドエラー

**症状**: esbuildでのビルドが失敗する

**対処法**:

```bash
# 依存関係の確認
npm audit
npm update

# 型チェック
npm run type-check

# 手動ビルド
cd packages/backend
npm run build
```

---

## パフォーマンス関連

### 高レスポンス時間

**症状**: API応答時間が500ms以上

**調査**:

```bash
# CloudWatch Metricsでの確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CommentiaCreateRoomFunction \
  --statistics Average,Maximum \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

**対処法**:

1. **Lambda関数の最適化**
   - メモリ割り当ての増加
   - Provisioned Concurrencyの設定
   - コールドスタート対策

2. **DynamoDB最適化**
   - GSIの追加
   - クエリパターンの見直し
   - DAX（DynamoDB Accelerator）の導入検討

### 同時接続数の制限

**症状**: 多数のユーザー接続時にエラー

**監視**:

```bash
# WebSocket接続数の確認
aws apigatewayv2 get-apis --query 'Items[?Name==`CommentiaWebSocketApi`].ApiId' --output text | \
xargs -I {} aws logs filter-log-events \
  --log-group-name /aws/apigateway/{}/accesslog \
  --filter-pattern "[timestamp, requestId, ip, user, timestamp, method, resource, protocol, status, error, bytes, responseTime]"
```

**対処法**:
- API Gatewayの制限値確認
- Lambda同時実行数の調整
- CloudFrontキャッシュ設定の最適化

---

## セキュリティ関連

### WAF誤検知

**症状**: 正常なリクエストがブロックされる

**調査**:

```bash
# WAFログの確認
aws wafv2 get-sampled-requests \
  --web-acl-arn <web-acl-arn> \
  --rule-metric-name <rule-name> \
  --scope CLOUDFRONT \
  --time-window StartTime=$(date -d '1 hour ago' +%s),EndTime=$(date +%s) \
  --max-items 100
```

**対処法**:
- WAFルールの調整
- IP許可リストの追加
- レート制限の緩和

### XSS/コンテンツ検証エラー

**症状**: コメント投稿時にサニタイゼーションエラー

**確認ポイント**:
- DOMPurifyの設定
- 入力値検証ロジック
- エスケープ処理

```javascript
// サニタイゼーション設定の確認
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(dirty, {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: []
});
```

---

## 監視・ログ関連

### ログが表示されない

**症状**: CloudWatch Logsにログが記録されない

**確認項目**:

```bash
# Lambda関数のIAM権限確認
aws iam get-role --role-name <lambda-execution-role>

# ログ取得タイムラグの確認（最大5分）
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/Commentia
```

### アラームが誤作動する

**症状**: 正常な状況でアラームが発火する

**調整**:

```bash
# アラームの閾値確認
aws cloudwatch describe-alarms --alarm-names CommentiaHighErrorRate

# メトリクスの実際の値確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=CommentiaCreateRoomFunction \
  --statistics Sum \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

---

## デバッグ手順

### 段階的診断フロー

1. **基本接続テスト**
   ```bash
   # ヘルスチェック
   curl -f https://api.commentia.example.com/health

   # DNS解決確認
   nslookup api.commentia.example.com
   ```

2. **フロントエンド診断**
   ```bash
   # ローカル開発サーバーでの確認
   npm run dev

   # プロダクションビルドの確認
   npm run build
   npm run preview
   ```

3. **バックエンド診断**
   ```bash
   # Lambda関数の手動実行
   aws lambda invoke \
     --function-name CommentiaCreateRoomFunction \
     --payload '{"httpMethod":"POST","body":"{\"hostId\":\"test_host\"}"}' \
     response.json

   cat response.json
   ```

4. **データベース診断**
   ```bash
   # DynamoDBテーブルの存在確認
   aws dynamodb list-tables --query 'TableNames[?contains(@, `Commentia`)]'

   # テーブル内容の確認
   aws dynamodb scan --table-name CommentiaRooms --max-items 5
   ```

### ログレベル設定

環境変数でログレベルを調整：

```bash
# 詳細ログの有効化
export LOG_LEVEL=debug

# 本番環境では警告以上のみ
export LOG_LEVEL=warn
```

---

## 緊急時対応手順

### サービス全停止

```bash
# 1. API Gatewayの無効化
aws apigateway update-stage \
  --rest-api-id <api-id> \
  --stage-name prod \
  --patch-ops op=replace,path=/~/throttle/burstLimit,value=0

# 2. CloudFrontでのメンテナンスページ表示
aws cloudfront update-distribution \
  --id <distribution-id> \
  --distribution-config file://maintenance-config.json

# 3. WebSocket APIの無効化
aws apigatewayv2 update-stage \
  --api-id <websocket-api-id> \
  --stage-name prod \
  --throttle-config BurstLimit=0,RateLimit=0
```

### データベース緊急復旧

```bash
# DynamoDBポイントインタイム復旧
aws dynamodb restore-table-to-point-in-time \
  --source-table-name CommentiaRooms \
  --target-table-name CommentiaRoomsRestore \
  --restore-date-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S)
```

---

## よくある質問 (FAQ)

### Q: ローカル開発でDynamoDBに接続できない

A: LocalStackが起動していることを確認してください：

```bash
docker-compose up localstack
export DYNAMODB_ENDPOINT=http://localhost:4566
```

### Q: 本番環境で急にエラー率が上昇した

A: 以下の順序で確認してください：

1. CloudWatch Alarms確認
2. Lambda関数のエラーログ確認
3. DynamoDB調整問題の確認
4. API Gatewayのレート制限確認

### Q: WebSocketの接続数が想定より少ない

A: 以下を確認してください：

1. タイムアウト設定（デフォルト30分）
2. ハートビート機能の実装
3. ブラウザの接続制限

---

## サポートリソース

### 内部ドキュメント
- [API仕様書](./API.md)
- [デプロイメントガイド](./DEPLOYMENT.md)
- [アーキテクチャ設計書](../.tmp/design.md)

### 外部リソース
- [AWS Lambda トラブルシューティング](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting.html)
- [DynamoDB トラブルシューティング](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Troubleshooting.html)
- [API Gateway トラブルシューティング](https://docs.aws.amazon.com/apigateway/latest/developerguide/troubleshooting.html)

### コミュニティサポート
- [GitHub Issues](https://github.com/commentia/commentia/issues)
- [GitHub Discussions](https://github.com/commentia/commentia/discussions)

---

## 更新履歴

- v0.1.0: 初回トラブルシューティングガイド作成
  - 基本的な問題と解決方法
  - 段階的診断手順
  - 緊急時対応手順