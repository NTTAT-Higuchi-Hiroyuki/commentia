import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import type { Construct } from 'constructs';
import type { TablesConfig } from './database-stack';
// import { LambdaFunction } from '../constructs/lambda-function';

export interface ApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  tablesConfig: TablesConfig;
}

export class ApiStack extends cdk.Stack {
  public readonly apiEndpoint: string;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // REST API Gateway
    this.api = new apigateway.RestApi(this, 'CommentiaApi', {
      restApiName: `commentia-api-${props.stage}`,
      description: `Commentia REST API - ${props.stage}`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
      deployOptions: {
        stageName: props.stage,
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
      },
    });

    // Lambda環境変数 (will be used in Task 3.1)
    // const lambdaEnvironment = {
    //   STAGE: props.stage,
    //   REGION: this.region,
    //   ROOMS_TABLE_NAME: props.tablesConfig.roomsTable.tableName,
    //   COMMENTS_TABLE_NAME: props.tablesConfig.commentsTable.tableName,
    //   CONNECTIONS_TABLE_NAME: props.tablesConfig.connectionsTable.tableName,
    //   LIKES_TABLE_NAME: props.tablesConfig.likesTable.tableName,
    // };

    // Lambda functions will be created in Task 3.1
    // Temporarily commented out for CDK structure verification

    // this.setupApiRoutes();

    this.apiEndpoint = this.api.url;

    // Output
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: 'REST API Gateway Endpoint',
    });
  }

  // API routes will be configured in Task 3.1
  // private setupApiRoutes(
  //   roomService: LambdaFunction,
  //   commentService: LambdaFunction,
  //   likeService: LambdaFunction,
  //   qrService: LambdaFunction,
  // ): void {
  //   // /rooms リソース
  //   const roomsResource = this.api.root.addResource('rooms');

  //   // POST /rooms - ルーム作成
  //   roomsResource.addMethod('POST', new apigateway.LambdaIntegration(roomService.function));

  //   // /rooms/{roomId} リソース
  //   const roomResource = roomsResource.addResource('{roomId}');

  //   // GET /rooms/{roomId} - ルーム情報取得
  //   roomResource.addMethod('GET', new apigateway.LambdaIntegration(roomService.function));

  //   // DELETE /rooms/{roomId} - ルーム終了
  //   roomResource.addMethod('DELETE', new apigateway.LambdaIntegration(roomService.function));

  //   // GET /rooms/{roomId}/qr - QRコード取得
  //   const qrResource = roomResource.addResource('qr');
  //   qrResource.addMethod('GET', new apigateway.LambdaIntegration(qrService.function));

  //   // POST /rooms/{roomId}/comments - コメント投稿
  //   // GET /rooms/{roomId}/comments - コメント一覧取得
  //   const commentsResource = roomResource.addResource('comments');
  //   commentsResource.addMethod('POST', new apigateway.LambdaIntegration(commentService.function));
  //   commentsResource.addMethod('GET', new apigateway.LambdaIntegration(commentService.function));

  //   // /rooms/code/{roomCode} - ルームコード検索
  //   const codeResource = roomsResource.addResource('code');
  //   const roomCodeResource = codeResource.addResource('{roomCode}');
  //   roomCodeResource.addMethod('GET', new apigateway.LambdaIntegration(roomService.function));

  //   // /comments/{commentId} リソース
  //   const commentsRootResource = this.api.root.addResource('comments');
  //   const commentResource = commentsRootResource.addResource('{commentId}');

  //   // DELETE /comments/{commentId} - コメント削除
  //   commentResource.addMethod('DELETE', new apigateway.LambdaIntegration(commentService.function));

  //   // POST /comments/{commentId}/likes - いいね追加
  //   // DELETE /comments/{commentId}/likes - いいね取消
  //   const likesResource = commentResource.addResource('likes');
  //   likesResource.addMethod('POST', new apigateway.LambdaIntegration(likeService.function));
  //   likesResource.addMethod('DELETE', new apigateway.LambdaIntegration(likeService.function));
  // }
}
