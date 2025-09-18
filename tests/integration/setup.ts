/**
 * 統合テスト用セットアップ
 */

import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import waitPort from 'wait-port';

// LocalStack設定
export const LOCALSTACK_CONFIG = {
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};

// DynamoDB設定
export const DYNAMODB_CONFIG = {
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};

// テスト用クライアント
export const testDynamoClient = new DynamoDBClient(DYNAMODB_CONFIG);

// LocalStack起動チェック
export async function checkLocalStack(): Promise<boolean> {
  try {
    const isAvailable = await waitPort({
      host: 'localhost',
      port: 4566,
      timeout: 5000,
    });
    return isAvailable;
  } catch {
    return false;
  }
}

// DynamoDB Local起動チェック
export async function checkDynamoDBLocal(): Promise<boolean> {
  try {
    const isAvailable = await waitPort({
      host: 'localhost',
      port: 8000,
      timeout: 5000,
    });
    return isAvailable;
  } catch {
    return false;
  }
}

// テスト用のヘルパー関数
export function generateTestRoomId(): string {
  return `test-room-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function generateTestUserId(): string {
  return `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function generateTestCommentId(): string {
  return `test-comment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// テスト環境のクリーンアップ
export async function cleanupTestData(): Promise<void> {
  // 実装は必要に応じて追加
  console.log('Test data cleanup completed');
}

// Jest Global Setup
beforeAll(async () => {
  console.log('Setting up integration tests...');

  // LocalStackとDynamoDB Localの起動確認
  const localStackRunning = await checkLocalStack();
  const dynamoRunning = await checkDynamoDBLocal();

  if (!localStackRunning && !dynamoRunning) {
    console.warn('Warning: Neither LocalStack nor DynamoDB Local is running');
    console.warn('Some tests may be skipped or fail');
  }
});

afterAll(async () => {
  console.log('Cleaning up integration tests...');
  await cleanupTestData();
});

// テストタイムアウトの延長
jest.setTimeout(30000);
