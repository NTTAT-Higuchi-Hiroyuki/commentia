import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import type { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  enableEncryption?: boolean;
  enableDeletionProtection?: boolean;
  backupRetentionDays?: number;
}

export interface TablesConfig {
  roomsTable: dynamodb.Table;
  commentsTable: dynamodb.Table;
  connectionsTable: dynamodb.Table;
  likesTable: dynamodb.Table;
  encryptionKey: kms.Key | undefined;
}

export class DatabaseStack extends cdk.Stack {
  public readonly tablesConfig: TablesConfig;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // 環境設定に基づくデフォルト値
    const enableEncryption = props.enableEncryption ?? props.stage === 'prod';
    const enableDeletionProtection = props.enableDeletionProtection ?? props.stage === 'prod';
    const backupRetentionDays = props.backupRetentionDays ?? (props.stage === 'prod' ? 35 : 7);

    // KMSキー（本番環境と暗号化が有効な場合）
    const encryptionKey = enableEncryption
      ? new kms.Key(this, 'DatabaseEncryptionKey', {
          description: `Commentia DynamoDB Encryption Key - ${props.stage}`,
          enableKeyRotation: props.stage === 'prod',
          removalPolicy:
            props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        })
      : undefined;

    // KMSキーエイリアス
    if (encryptionKey) {
      new kms.Alias(this, 'DatabaseEncryptionKeyAlias', {
        aliasName: `alias/commentia-database-${props.stage}`,
        targetKey: encryptionKey,
      });
    }

    // 共通テーブル設定（暗号化キーがundefinedでない場合のみ含める）
    const commonTableProps = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.stage === 'prod',
      },
      deletionProtection: enableDeletionProtection,
      encryption: enableEncryption
        ? dynamodb.TableEncryption.CUSTOMER_MANAGED
        : dynamodb.TableEncryption.AWS_MANAGED,
      ...(encryptionKey && { encryptionKey }),
      contributorInsightsSpecification: {
        enabled: props.stage === 'prod',
      },
      ...(props.stage === 'prod' && {
        stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      }),
    };

    // Rooms Table
    const roomsTable = new dynamodb.Table(this, 'RoomsTable', {
      ...commonTableProps,
      tableName: `commentia-rooms-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    });

    // GSI for room code lookup
    roomsTable.addGlobalSecondaryIndex({
      indexName: 'RoomCodeIndex',
      partitionKey: { name: 'roomCode', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Comments Table with GSI for like count sorting
    const commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      ...commonTableProps,
      tableName: `commentia-comments-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    });

    // GSI for like count based sorting
    commentsTable.addGlobalSecondaryIndex({
      indexName: 'LikeCountIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for user comments tracking
    commentsTable.addGlobalSecondaryIndex({
      indexName: 'UserCommentsIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // Connections Table with GSI for room-based queries
    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      ...commonTableProps,
      tableName: `commentia-connections-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    });

    // GSI for room connections
    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'RoomConnectionsIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Likes Table with GSI for user likes tracking
    const likesTable = new dynamodb.Table(this, 'LikesTable', {
      ...commonTableProps,
      tableName: `commentia-likes-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    });

    // GSI for user likes per room
    likesTable.addGlobalSecondaryIndex({
      indexName: 'UserLikesIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Backup vaults for production
    if (props.stage === 'prod') {
      this.setupBackupPlan(
        [roomsTable, commentsTable, connectionsTable, likesTable],
        backupRetentionDays
      );
    }

    this.tablesConfig = {
      roomsTable,
      commentsTable,
      connectionsTable,
      likesTable,
      encryptionKey,
    };

    // タグ付け
    const tables = [roomsTable, commentsTable, connectionsTable, likesTable];
    tables.forEach((table) => {
      cdk.Tags.of(table).add('Stage', props.stage);
      cdk.Tags.of(table).add('Project', 'Commentia');
      cdk.Tags.of(table).add('Component', 'Database');
    });

    // Outputs
    new cdk.CfnOutput(this, 'RoomsTableName', {
      value: roomsTable.tableName,
      description: 'Rooms DynamoDB Table Name',
      exportName: `commentia-rooms-table-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'CommentsTableName', {
      value: commentsTable.tableName,
      description: 'Comments DynamoDB Table Name',
      exportName: `commentia-comments-table-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: connectionsTable.tableName,
      description: 'Connections DynamoDB Table Name',
      exportName: `commentia-connections-table-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'LikesTableName', {
      value: likesTable.tableName,
      description: 'Likes DynamoDB Table Name',
      exportName: `commentia-likes-table-${props.stage}`,
    });

    if (encryptionKey) {
      new cdk.CfnOutput(this, 'EncryptionKeyId', {
        value: encryptionKey.keyId,
        description: 'Database Encryption Key ID',
        exportName: `commentia-db-encryption-key-${props.stage}`,
      });
    }
  }

  /**
   * 本番環境用バックアップ計画の設定
   */
  private setupBackupPlan(tables: dynamodb.Table[], retentionDays: number): void {
    // Note: AWS Backup service integration would require additional CDK constructs
    // For now, point-in-time recovery is enabled for production tables
    // Full backup implementation can be added with aws-backup constructs if needed

    // Add backup tags for tables
    tables.forEach((table) => {
      cdk.Tags.of(table).add('BackupPlan', 'CommentiaProd');
    });

    // Log backup configuration
    new cdk.CfnOutput(this, 'BackupConfiguration', {
      value: `Point-in-time recovery enabled, retention: ${retentionDays} days`,
      description: 'Database backup configuration for production',
    });
  }
}
