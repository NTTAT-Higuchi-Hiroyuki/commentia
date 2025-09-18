#!/bin/bash

# 統合テスト・E2Eテスト環境クリーンアップスクリプト

set -e

echo "🧹 テスト環境をクリーンアップします..."

# Docker Composeでテスト環境を停止
echo "🛑 LocalStack & DynamoDB Localを停止中..."
docker-compose down -v

echo "🗑️ 未使用のコンテナとイメージをクリーンアップ..."
docker system prune -f

echo "✅ テスト環境のクリーンアップが完了しました！"