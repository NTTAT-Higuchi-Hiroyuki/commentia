#!/bin/bash

# 統合テスト・E2Eテスト環境セットアップスクリプト

set -e

echo "🚀 統合テスト・E2Eテスト環境をセットアップします..."

# Docker Composeでテスト環境を起動
echo "📦 LocalStack & DynamoDB Localを起動中..."
docker-compose up -d

echo "⏳ サービスが完全に起動するまで待機中..."
sleep 10

# DynamoDB Localの起動確認
echo "🔍 DynamoDB Localの起動確認..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo "✅ DynamoDB Localが起動しました"
    break
  fi

  echo "⏳ DynamoDB Localの起動を待機中... ($((attempt+1))/$max_attempts)"
  sleep 2
  attempt=$((attempt+1))
done

if [ $attempt -eq $max_attempts ]; then
  echo "❌ DynamoDB Localの起動に失敗しました"
  exit 1
fi

# LocalStackの起動確認
echo "🔍 LocalStackの起動確認..."
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if curl -s http://localhost:4566 > /dev/null 2>&1; then
    echo "✅ LocalStackが起動しました"
    break
  fi

  echo "⏳ LocalStackの起動を待機中... ($((attempt+1))/$max_attempts)"
  sleep 2
  attempt=$((attempt+1))
done

if [ $attempt -eq $max_attempts ]; then
  echo "❌ LocalStackの起動に失敗しました"
  exit 1
fi

echo "🎉 テスト環境の準備が完了しました！"
echo ""
echo "利用可能なサービス:"
echo "  - DynamoDB Local: http://localhost:8000"
echo "  - LocalStack: http://localhost:4566"
echo ""
echo "テスト実行コマンド:"
echo "  npm run test:integration  # 統合テスト"
echo "  npm run test:e2e          # E2Eテスト"
echo ""
echo "環境停止:"
echo "  npm run test:cleanup      # テスト環境停止"