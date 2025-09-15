#!/bin/bash

# DynamoDB Local 停止スクリプト

set -e

DYNAMODB_LOCAL_DIR="$HOME/.dynamodb-local"
PID_FILE="$DYNAMODB_LOCAL_DIR/dynamodb-local.pid"
DYNAMODB_LOCAL_PORT=8000

echo "🛑 DynamoDB Local 停止"

# PIDファイルから停止
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null; then
        echo "⏹️  プロセス停止中 (PID: $PID)..."
        kill $PID
        sleep 2

        if ps -p $PID > /dev/null; then
            echo "⚠️  強制停止中..."
            kill -9 $PID
        fi

        rm -f "$PID_FILE"
        echo "✅ DynamoDB Local を停止しました"
    else
        echo "⚠️  PIDファイルのプロセスは既に停止しています"
        rm -f "$PID_FILE"
    fi
else
    echo "ℹ️  PIDファイルが見つかりません"
fi

# ポートベースで停止（フォールバック）
if lsof -ti:$DYNAMODB_LOCAL_PORT > /dev/null; then
    echo "🔍 ポート $DYNAMODB_LOCAL_PORT で動作中のプロセスを停止中..."
    lsof -ti:$DYNAMODB_LOCAL_PORT | xargs kill -9
    echo "✅ ポートベースでプロセスを停止しました"
fi

echo "🏁 DynamoDB Local 停止完了"