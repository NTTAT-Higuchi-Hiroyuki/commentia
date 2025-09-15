#!/usr/bin/env ts-node

/**
 * LocalStack DynamoDB テーブル作成テストスクリプト
 * Task 2.2: DynamoDBテーブル定義の検証
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BillingMode,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  ScalarAttributeType,
  TableStatus,
} from '@aws-sdk/client-dynamodb';

// DynamoDB Local設定
const DYNAMODB_LOCAL_ENDPOINT = 'http://localhost:8000';
const dynamoClient = new DynamoDBClient({
  endpoint: DYNAMODB_LOCAL_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

interface TestTableConfig {
  tableName: string;
  partitionKey: { name: string; type: ScalarAttributeType };
  sortKey?: { name: string; type: ScalarAttributeType };
  globalSecondaryIndexes?: Array<{
    indexName: string;
    partitionKey: { name: string; type: ScalarAttributeType };
    sortKey?: { name: string; type: ScalarAttributeType };
  }>;
}

// 設計文書通りのテーブル定義
const tableConfigs: TestTableConfig[] = [
  {
    tableName: 'commentia-rooms-test',
    partitionKey: { name: 'PK', type: ScalarAttributeType.S },
    sortKey: { name: 'SK', type: ScalarAttributeType.S },
  },
  {
    tableName: 'commentia-comments-test',
    partitionKey: { name: 'PK', type: ScalarAttributeType.S },
    sortKey: { name: 'SK', type: ScalarAttributeType.S },
    globalSecondaryIndexes: [
      {
        indexName: 'LikeCountIndex',
        partitionKey: { name: 'GSI1PK', type: ScalarAttributeType.S },
        sortKey: { name: 'GSI1SK', type: ScalarAttributeType.S },
      },
    ],
  },
  {
    tableName: 'commentia-connections-test',
    partitionKey: { name: 'PK', type: ScalarAttributeType.S },
    sortKey: { name: 'SK', type: ScalarAttributeType.S },
    globalSecondaryIndexes: [
      {
        indexName: 'RoomConnectionsIndex',
        partitionKey: { name: 'GSI1PK', type: ScalarAttributeType.S },
        sortKey: { name: 'GSI1SK', type: ScalarAttributeType.S },
      },
    ],
  },
  {
    tableName: 'commentia-likes-test',
    partitionKey: { name: 'PK', type: ScalarAttributeType.S },
    sortKey: { name: 'SK', type: ScalarAttributeType.S },
    globalSecondaryIndexes: [
      {
        indexName: 'UserLikesIndex',
        partitionKey: { name: 'GSI1PK', type: ScalarAttributeType.S },
        sortKey: { name: 'GSI1SK', type: ScalarAttributeType.S },
      },
    ],
  },
];

async function testDynamoDBConnection(): Promise<boolean> {
  try {
    console.log('🔍 DynamoDB Local接続テスト...');
    const response = await dynamoClient.send(new ListTablesCommand({}));
    console.log('✅ DynamoDB Local接続成功');
    console.log(`既存テーブル: ${response.TableNames?.length || 0}個`);
    return true;
  } catch (error) {
    console.error('❌ DynamoDB Local接続失敗:', error);
    return false;
  }
}

async function createTable(config: TestTableConfig): Promise<boolean> {
  try {
    console.log(`📝 テーブル作成: ${config.tableName}`);

    // 属性定義
    const attributeDefinitions = [
      {
        AttributeName: config.partitionKey.name,
        AttributeType: config.partitionKey.type,
      },
    ];

    if (config.sortKey) {
      attributeDefinitions.push({
        AttributeName: config.sortKey.name,
        AttributeType: config.sortKey.type,
      });
    }

    // GSIの属性も追加
    if (config.globalSecondaryIndexes) {
      for (const gsi of config.globalSecondaryIndexes) {
        // GSI PKが既存の属性と重複しない場合のみ追加
        if (!attributeDefinitions.find((attr) => attr.AttributeName === gsi.partitionKey.name)) {
          attributeDefinitions.push({
            AttributeName: gsi.partitionKey.name,
            AttributeType: gsi.partitionKey.type,
          });
        }

        if (
          gsi.sortKey &&
          !attributeDefinitions.find((attr) => attr.AttributeName === gsi.sortKey?.name)
        ) {
          attributeDefinitions.push({
            AttributeName: gsi.sortKey.name,
            AttributeType: gsi.sortKey.type,
          });
        }
      }
    }

    // キースキーマ
    const keySchema: Array<{ AttributeName: string; KeyType: 'HASH' | 'RANGE' }> = [
      {
        AttributeName: config.partitionKey.name,
        KeyType: 'HASH',
      },
    ];

    if (config.sortKey) {
      keySchema.push({
        AttributeName: config.sortKey.name,
        KeyType: 'RANGE',
      });
    }

    // GSI設定
    const globalSecondaryIndexes = config.globalSecondaryIndexes?.map((gsi) => ({
      IndexName: gsi.indexName,
      KeySchema: [
        {
          AttributeName: gsi.partitionKey.name,
          KeyType: 'HASH' as 'HASH' | 'RANGE',
        },
        ...(gsi.sortKey
          ? [
              {
                AttributeName: gsi.sortKey.name,
                KeyType: 'RANGE' as 'HASH' | 'RANGE',
              },
            ]
          : []),
      ],
      Projection: {
        ProjectionType: 'ALL' as const,
      },
    }));

    const command = new CreateTableCommand({
      TableName: config.tableName,
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,
      BillingMode: BillingMode.PAY_PER_REQUEST,
      GlobalSecondaryIndexes: globalSecondaryIndexes,
    });

    await dynamoClient.send(command);
    console.log(`✅ テーブル作成成功: ${config.tableName}`);
    return true;
  } catch (error) {
    console.error(`❌ テーブル作成失敗: ${config.tableName}`, error);
    return false;
  }
}

async function waitForTableActive(tableName: string, timeout = 30000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
      const table = response.Table;

      if (table?.TableStatus === TableStatus.ACTIVE) {
        // GSIもアクティブかチェック
        const allGSIActive =
          table.GlobalSecondaryIndexes?.every((gsi) => gsi.IndexStatus === 'ACTIVE') ?? true;

        if (allGSIActive) {
          return true;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`テーブル状態確認エラー: ${tableName}`, error);
      return false;
    }
  }

  return false;
}

async function verifyTable(config: TestTableConfig): Promise<boolean> {
  try {
    console.log(`🔍 テーブル検証: ${config.tableName}`);

    const response = await dynamoClient.send(
      new DescribeTableCommand({ TableName: config.tableName })
    );
    const table = response.Table;

    if (!table) {
      console.error(`❌ テーブルが見つかりません: ${config.tableName}`);
      return false;
    }

    // キースキーマ検証
    const expectedKeys = [config.partitionKey.name];
    if (config.sortKey) expectedKeys.push(config.sortKey.name);

    const actualKeys = table.KeySchema?.map((key) => key.AttributeName) || [];
    const keysMatch = expectedKeys.every((key) => actualKeys.includes(key));

    if (!keysMatch) {
      console.error(`❌ キースキーマ不一致: 期待値=${expectedKeys}, 実際=${actualKeys}`);
      return false;
    }

    // GSI検証
    if (config.globalSecondaryIndexes) {
      const expectedGSIs = config.globalSecondaryIndexes.map((gsi) => gsi.indexName);
      const actualGSIs = table.GlobalSecondaryIndexes?.map((gsi) => gsi.IndexName) || [];

      const gsiMatch = expectedGSIs.every((gsi) => actualGSIs.includes(gsi));
      if (!gsiMatch) {
        console.error(`❌ GSI不一致: 期待値=${expectedGSIs}, 実際=${actualGSIs}`);
        return false;
      }
    }

    console.log(`✅ テーブル検証成功: ${config.tableName}`);
    return true;
  } catch (error) {
    console.error(`❌ テーブル検証失敗: ${config.tableName}`, error);
    return false;
  }
}

async function cleanupTables(): Promise<void> {
  console.log('🧹 テスト用テーブルクリーンアップ...');

  for (const config of tableConfigs) {
    try {
      await dynamoClient.send(new DeleteTableCommand({ TableName: config.tableName }));
      console.log(`🗑️ テーブル削除: ${config.tableName}`);
    } catch (_error) {
      // テーブルが存在しない場合は無視
    }
  }
}

async function runTests(): Promise<void> {
  console.log('🚀 DynamoDB Local テーブル作成テスト開始\n');

  // DynamoDB Local接続テスト
  const connected = await testDynamoDBConnection();
  if (!connected) {
    console.error('DynamoDB Localが起動していないか、接続できません。');
    console.log('DynamoDB Localを起動してください: bash scripts/setup-dynamodb-local.sh');
    process.exit(1);
  }

  // 既存のテストテーブルをクリーンアップ
  await cleanupTables();

  let allTestsPassed = true;

  // 各テーブルをテスト
  for (const config of tableConfigs) {
    console.log(`\n📋 ${config.tableName} のテスト`);

    // テーブル作成
    const created = await createTable(config);
    if (!created) {
      allTestsPassed = false;
      continue;
    }

    // テーブルがアクティブになるまで待機
    console.log('⏳ テーブルアクティブ化待機...');
    const active = await waitForTableActive(config.tableName);
    if (!active) {
      console.error(`❌ テーブルアクティブ化タイムアウト: ${config.tableName}`);
      allTestsPassed = false;
      continue;
    }

    // テーブル検証
    const verified = await verifyTable(config);
    if (!verified) {
      allTestsPassed = false;
    }
  }

  // クリーンアップ
  await cleanupTables();

  console.log('\n🏁 テスト完了');
  if (allTestsPassed) {
    console.log('✅ 全てのテストが成功しました！');
  } else {
    console.log('❌ いくつかのテストが失敗しました。');
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests, testDynamoDBConnection };
