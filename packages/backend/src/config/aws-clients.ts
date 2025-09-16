/**
 * AWS SDK v3 クライアント設定
 * 環境に応じた設定とLocalStack対応
 */

import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// 環境設定
const stage = process.env.STAGE || 'dev';
const region = process.env.REGION || 'ap-northeast-1';
const isLocal = process.env.DYNAMODB_ENDPOINT || process.env.IS_LOCAL;

// DynamoDB クライアント設定
const dynamoDBClientConfig = {
  region,
  ...(isLocal && {
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:4566',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }),
  // リトライ設定
  maxAttempts: 3,
  // タイムアウト設定
  requestHandler: {
    requestTimeout: 5000,
    httpsAgent: {
      maxSockets: 50,
      keepAlive: true,
      keepAliveMsecs: 1000,
    },
  },
};

// DynamoDB クライアント
export const dynamoDBClient = new DynamoDBClient(dynamoDBClientConfig);

// DynamoDB Document クライアント（高レベルAPI）
export const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// WebSocket 接続管理用クライアント
let apiGatewayManagementClient: ApiGatewayManagementApiClient | null = null;

/**
 * WebSocket 管理クライアントの取得
 * 接続ごとに異なるエンドポイントを使用するため、遅延初期化
 */
export const getWebSocketClient = (endpoint?: string): ApiGatewayManagementApiClient => {
  if (!apiGatewayManagementClient || endpoint) {
    const wsEndpoint = endpoint || process.env.WEBSOCKET_ENDPOINT;

    if (!wsEndpoint) {
      throw new Error('WebSocket endpoint not configured');
    }

    apiGatewayManagementClient = new ApiGatewayManagementApiClient({
      region,
      endpoint: wsEndpoint,
      ...(isLocal && {
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test',
        },
      }),
    });
  }

  return apiGatewayManagementClient;
};

// テーブル名の取得
export const getTableName = (tableName: 'rooms' | 'comments' | 'connections' | 'likes'): string => {
  const tableEnvMap = {
    rooms: 'ROOMS_TABLE_NAME',
    comments: 'COMMENTS_TABLE_NAME',
    connections: 'CONNECTIONS_TABLE_NAME',
    likes: 'LIKES_TABLE_NAME',
  };

  const envVar = tableEnvMap[tableName];
  const name = process.env[envVar];

  if (!name) {
    throw new Error(`Table name not configured: ${envVar}`);
  }

  return name;
};

// 環境情報のエクスポート
export const awsConfig = {
  stage,
  region,
  isLocal: Boolean(isLocal),
};
