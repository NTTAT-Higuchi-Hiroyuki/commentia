#!/bin/bash

# DynamoDB Local セットアップスクリプト
# Task 2.2: LocalStackでのテーブル作成テスト用

set -e

DYNAMODB_LOCAL_DIR="$HOME/.dynamodb-local"
DYNAMODB_LOCAL_JAR="$DYNAMODB_LOCAL_DIR/DynamoDBLocal.jar"
DYNAMODB_LOCAL_PORT=8000

echo "🚀 DynamoDB Local セットアップ"

# ディレクトリ作成
mkdir -p "$DYNAMODB_LOCAL_DIR"

# DynamoDB Local のダウンロード（まだ存在しない場合）
if [ ! -f "$DYNAMODB_LOCAL_JAR" ]; then
    echo "📥 DynamoDB Local ダウンロード中..."
    cd "$DYNAMODB_LOCAL_DIR"
    curl -o dynamodb-local.tar.gz https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz
    tar -xzf dynamodb-local.tar.gz
    rm dynamodb-local.tar.gz
    echo "✅ DynamoDB Local ダウンロード完了"
else
    echo "✅ DynamoDB Local は既にダウンロード済み"
fi

# DynamoDB Local の起動確認
if lsof -ti:$DYNAMODB_LOCAL_PORT > /dev/null; then
    echo "⚠️  ポート $DYNAMODB_LOCAL_PORT は既に使用中です"
    echo "既存のDynamoDB Localプロセスを停止しますか？ [y/N]"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "🛑 既存プロセスを停止中..."
        lsof -ti:$DYNAMODB_LOCAL_PORT | xargs kill -9
        sleep 2
    else
        echo "❌ テストを実行するにはポート $DYNAMODB_LOCAL_PORT が必要です"
        exit 1
    fi
fi

# DynamoDB Local の起動
echo "🚀 DynamoDB Local 起動中 (ポート: $DYNAMODB_LOCAL_PORT)..."
cd "$DYNAMODB_LOCAL_DIR"
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -port $DYNAMODB_LOCAL_PORT -inMemory &
DYNAMODB_PID=$!

# 起動待機
echo "⏳ DynamoDB Local の起動待機中..."
sleep 5

# 起動確認
if curl -s "http://localhost:$DYNAMODB_LOCAL_PORT" > /dev/null; then
    echo "✅ DynamoDB Local が起動しました (PID: $DYNAMODB_PID)"
    echo "📋 PIDファイルに保存: $DYNAMODB_LOCAL_DIR/dynamodb-local.pid"
    echo $DYNAMODB_PID > "$DYNAMODB_LOCAL_DIR/dynamodb-local.pid"

    echo ""
    echo "🎯 テスト実行コマンド:"
    echo "npm run test:localstack"
    echo ""
    echo "🛑 DynamoDB Local 停止コマンド:"
    echo "kill $DYNAMODB_PID"
    echo "または:"
    echo "bash scripts/stop-dynamodb-local.sh"
else
    echo "❌ DynamoDB Local の起動に失敗しました"
    kill $DYNAMODB_PID 2>/dev/null || true
    exit 1
fi