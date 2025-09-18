import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiStack } from './stacks/api-stack';
import { DatabaseStack } from './stacks/database-stack';
import { FrontendStack } from './stacks/frontend-stack';
import { WebSocketStack } from './stacks/websocket-stack';

export interface CommentiaAppProps extends cdk.StackProps {
  stage?: 'dev' | 'staging' | 'prod';
  customDomainName?: string;
  certificateArn?: string;
  enableEncryption?: boolean;
  enableDeletionProtection?: boolean;
  enableCloudFrontLogging?: boolean;
}

export class CommentiaApp extends Construct {
  public readonly databaseStack: DatabaseStack;
  public readonly apiStack: ApiStack;
  public readonly webSocketStack: WebSocketStack;
  public readonly frontendStack: FrontendStack;

  constructor(scope: Construct, id: string, props: CommentiaAppProps = {}) {
    super(scope, id);

    // 環境設定の読み込み
    const stage = props.stage || (process.env.STAGE as 'dev' | 'staging' | 'prod') || 'dev';

    // 環境別デフォルト設定
    const environmentDefaults = this.getEnvironmentDefaults(stage);
    const enableEncryption = props.enableEncryption ?? environmentDefaults.enableEncryption;
    const enableDeletionProtection =
      props.enableDeletionProtection ?? environmentDefaults.enableDeletionProtection;
    const enableCloudFrontLogging =
      props.enableCloudFrontLogging ?? environmentDefaults.enableCloudFrontLogging;

    // Environment configuration for stacks - optional account handling
    const stackEnv: cdk.Environment | undefined = process.env.CDK_DEFAULT_ACCOUNT
      ? {
          account: process.env.CDK_DEFAULT_ACCOUNT,
          region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        }
      : {
          region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        };

    // データベーススタック（最初に作成）
    this.databaseStack = new DatabaseStack(this, `CommentiaDatabase-${stage}`, {
      ...props,
      stage,
      enableEncryption,
      enableDeletionProtection,
      description: `Commentia Database Stack - ${stage}`,
      stackName: `CommentiaDatabaseStack-${stage}`,
      env: stackEnv,
    });

    // APIスタック（データベースに依存）
    this.apiStack = new ApiStack(this, `CommentiaApi-${stage}`, {
      ...props,
      stage,
      tablesConfig: this.databaseStack.tablesConfig,
      // optional domain propertiesをundefinedでない場合のみ渡す
      ...(props.customDomainName && {
        customDomainName: props.customDomainName,
      }),
      ...(props.certificateArn && { certificateArn: props.certificateArn }),
      description: `Commentia API Stack - ${stage}`,
      stackName: `CommentiaApiStack-${stage}`,
      env: stackEnv,
    });

    // WebSocketスタック（データベースに依存）
    this.webSocketStack = new WebSocketStack(this, `CommentiaWebSocket-${stage}`, {
      ...props,
      stage,
      tablesConfig: this.databaseStack.tablesConfig,
      description: `Commentia WebSocket Stack - ${stage}`,
      stackName: `CommentiaWebSocketStack-${stage}`,
      env: stackEnv,
    });

    // フロントエンドスタック（APIに依存）
    this.frontendStack = new FrontendStack(this, `CommentiaFrontend-${stage}`, {
      ...props,
      stage,
      apiEndpoint: this.apiStack.apiEndpoint,
      webSocketEndpoint: this.webSocketStack.webSocketEndpoint,
      // optional domain propertiesをundefinedでない場合のみ渡す
      ...(props.customDomainName && {
        customDomainName: props.customDomainName,
      }),
      ...(props.certificateArn && { certificateArn: props.certificateArn }),
      enableCloudFrontLogging,
      description: `Commentia Frontend Stack - ${stage}`,
      stackName: `CommentiaFrontendStack-${stage}`,
      env: stackEnv,
    });

    // スタック間の依存関係設定
    this.apiStack.addDependency(this.databaseStack);
    this.webSocketStack.addDependency(this.databaseStack);
    this.frontendStack.addDependency(this.apiStack);
    this.frontendStack.addDependency(this.webSocketStack);

    // クロススタック参照の設定
    this.setupCrossStackReferences();

    // タグ付け
    this.addTags(stage);
  }

  private getEnvironmentDefaults(stage: string) {
    switch (stage) {
      case 'prod':
        return {
          enableEncryption: true,
          enableDeletionProtection: true,
          enableCloudFrontLogging: true,
        };
      case 'staging':
        return {
          enableEncryption: true,
          enableDeletionProtection: false,
          enableCloudFrontLogging: true,
        };
      default: // dev
        return {
          enableEncryption: false,
          enableDeletionProtection: false,
          enableCloudFrontLogging: false,
        };
    }
  }

  private setupCrossStackReferences(): void {
    // 各スタックのOutputsを使用してクロススタック参照を確立
    // これらは既に各スタック内で設定されているため、明示的な設定は不要
    // 必要に応じて追加のクロススタック参照をここで設定
    // 例: Lambda関数にWebSocket管理権限を付与
    // this.apiStack.addWebSocketPermissions(this.webSocketStack.webSocketApi);
  }

  private addTags(stage: string): void {
    // アプリケーション全体へのタグ付け
    const stacks = [this.databaseStack, this.apiStack, this.webSocketStack, this.frontendStack];

    stacks.forEach((stack) => {
      cdk.Tags.of(stack).add('Project', 'Commentia');
      cdk.Tags.of(stack).add('Stage', stage);
      cdk.Tags.of(stack).add('Environment', stage);
      cdk.Tags.of(stack).add('Application', 'commentia-realtime-comment');
      cdk.Tags.of(stack).add('ManagedBy', 'AWS-CDK');
      cdk.Tags.of(stack).add('Owner', 'commentia-team');
      cdk.Tags.of(stack).add('CostCenter', `commentia-${stage}`);
    });
  }

  /**
   * 環境別設定ファイルの作成
   */
  public createEnvironmentConfig(): Record<string, string> {
    return {
      VITE_API_ENDPOINT: this.apiStack.apiEndpoint,
      VITE_WEBSOCKET_ENDPOINT: this.webSocketStack.webSocketEndpoint,
      VITE_FRONTEND_URL: this.frontendStack.distributionDomainName,
      // バックエンド用環境変数
      ROOMS_TABLE_NAME: this.databaseStack.tablesConfig.roomsTable.tableName,
      COMMENTS_TABLE_NAME: this.databaseStack.tablesConfig.commentsTable.tableName,
      CONNECTIONS_TABLE_NAME: this.databaseStack.tablesConfig.connectionsTable.tableName,
      LIKES_TABLE_NAME: this.databaseStack.tablesConfig.likesTable.tableName,
      WEBSOCKET_API_ID: this.webSocketStack.webSocketApi.apiId,
      DISTRIBUTION_ID: this.frontendStack.distribution.distributionId,
    };
  }

  /**
   * すべてのスタックのリソース情報を取得
   */
  public getResourceSummary() {
    return {
      database: {
        stackName: this.databaseStack.stackName,
        tables: {
          rooms: this.databaseStack.tablesConfig.roomsTable.tableName,
          comments: this.databaseStack.tablesConfig.commentsTable.tableName,
          connections: this.databaseStack.tablesConfig.connectionsTable.tableName,
          likes: this.databaseStack.tablesConfig.likesTable.tableName,
        },
        encryptionKey: this.databaseStack.tablesConfig.encryptionKey?.keyId,
      },
      api: {
        stackName: this.apiStack.stackName,
        endpoint: this.apiStack.apiEndpoint,
        apiId: this.apiStack.api.restApiId,
        customDomain: this.apiStack.customDomain?.domainName,
      },
      websocket: {
        stackName: this.webSocketStack.stackName,
        endpoint: this.webSocketStack.webSocketEndpoint,
        apiId: this.webSocketStack.webSocketApi.apiId,
      },
      frontend: {
        stackName: this.frontendStack.stackName,
        url: this.frontendStack.distributionDomainName,
        bucketName: this.frontendStack.bucket.bucketName,
        distributionId: this.frontendStack.distribution.distributionId,
        logsBucket: this.frontendStack.logsBucket?.bucketName,
      },
    };
  }

  /**
   * デプロイメント後の検証機能
   */
  public validateDeployment(): boolean {
    // 基本的な検証ロジック
    try {
      // 必要なリソースが作成されているかチェック
      return !!(
        this.databaseStack.tablesConfig.roomsTable &&
        this.apiStack.api &&
        this.webSocketStack.webSocketApi &&
        this.frontendStack.distribution
      );
    } catch (error) {
      console.error('Deployment validation failed:', error);
      return false;
    }
  }
}
