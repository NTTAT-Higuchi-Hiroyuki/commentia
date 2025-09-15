import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
// import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
// import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { TablesConfig } from './database-stack';
// import { LambdaFunction } from '../constructs/lambda-function';

export interface WebSocketStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  tablesConfig: TablesConfig;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketEndpoint: string;
  public readonly webSocketApi: apigatewayv2.WebSocketApi;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    // Lambda環境変数 (will be used in Task 3.5)
    // const lambdaEnvironment = {
    //   STAGE: props.stage,
    //   REGION: this.region,
    //   ROOMS_TABLE_NAME: props.tablesConfig.roomsTable.tableName,
    //   COMMENTS_TABLE_NAME: props.tablesConfig.commentsTable.tableName,
    //   CONNECTIONS_TABLE_NAME: props.tablesConfig.connectionsTable.tableName,
    //   LIKES_TABLE_NAME: props.tablesConfig.likesTable.tableName,
    // };

    // WebSocket Handler Lambda will be created in Task 3.5
    // Temporarily commented out for CDK structure verification

    // const webSocketHandlerLambda = new LambdaFunction(this, 'WebSocketHandlerLambda', {
    //   functionName: `commentia-websocket-handler-${props.stage}`,
    //   entry: '../backend/src/websocket-handler.ts',
    //   environment: lambdaEnvironment,
    // });

    // DynamoDBテーブルへのアクセス権限付与
    // props.tablesConfig.connectionsTable.grantReadWriteData(webSocketHandlerLambda.function);
    // props.tablesConfig.commentsTable.grantReadData(webSocketHandlerLambda.function);
    // props.tablesConfig.roomsTable.grantReadData(webSocketHandlerLambda.function);

    // WebSocket API Gateway will be configured in Task 3.5
    // Temporarily create a basic WebSocket API for structure verification

    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'CommentiaWebSocketApi', {
      apiName: `commentia-websocket-api-${props.stage}`,
      description: `Commentia WebSocket API - ${props.stage}`,
    });

    // WebSocket API Stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: props.stage,
      autoDeploy: true,
    });

    this.webSocketEndpoint = webSocketStage.url;

    // Output
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: this.webSocketEndpoint,
      description: 'WebSocket API Gateway Endpoint',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API Gateway ID',
    });
  }
}
