import type * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiStack } from './stacks/api-stack';
import { DatabaseStack } from './stacks/database-stack';
import { FrontendStack } from './stacks/frontend-stack';
import { WebSocketStack } from './stacks/websocket-stack';

export interface CommentiaAppProps extends cdk.StackProps {
  stage?: 'dev' | 'staging' | 'prod';
}

export class CommentiaApp extends Construct {
  constructor(scope: Construct, id: string, props: CommentiaAppProps = {}) {
    super(scope, id);

    // 環境設定の読み込み
    const stage = props.stage || (process.env.STAGE as 'dev' | 'staging' | 'prod') || 'dev';

    // データベーススタック（最初に作成）
    const databaseStack = new DatabaseStack(this, `CommentiaDatabase-${stage}`, {
      ...props,
      stage,
      description: `Commentia Database Stack - ${stage}`,
    });

    // APIスタック（データベースに依存）
    const apiStack = new ApiStack(this, `CommentiaApi-${stage}`, {
      ...props,
      stage,
      tablesConfig: databaseStack.tablesConfig,
      description: `Commentia API Stack - ${stage}`,
    });

    // WebSocketスタック（データベースに依存）
    const webSocketStack = new WebSocketStack(this, `CommentiaWebSocket-${stage}`, {
      ...props,
      stage,
      tablesConfig: databaseStack.tablesConfig,
      description: `Commentia WebSocket Stack - ${stage}`,
    });

    // フロントエンドスタック（APIに依存）
    const frontendStack = new FrontendStack(this, `CommentiaFrontend-${stage}`, {
      ...props,
      stage,
      apiEndpoint: apiStack.apiEndpoint,
      webSocketEndpoint: webSocketStack.webSocketEndpoint,
      description: `Commentia Frontend Stack - ${stage}`,
    });

    // スタック間の依存関係設定
    apiStack.addDependency(databaseStack);
    webSocketStack.addDependency(databaseStack);
    frontendStack.addDependency(apiStack);
    frontendStack.addDependency(webSocketStack);

    // 出力 (will be configured in individual stacks)
    // new cdk.CfnOutput(this, 'FrontendUrl', {
    //   value: frontendStack.distributionDomainName,
    //   description: 'Frontend CloudFront Distribution URL',
    // });

    // new cdk.CfnOutput(this, 'ApiEndpoint', {
    //   value: apiStack.apiEndpoint,
    //   description: 'REST API Gateway Endpoint',
    // });

    // new cdk.CfnOutput(this, 'WebSocketEndpoint', {
    //   value: webSocketStack.webSocketEndpoint,
    //   description: 'WebSocket API Gateway Endpoint',
    // });
  }
}
