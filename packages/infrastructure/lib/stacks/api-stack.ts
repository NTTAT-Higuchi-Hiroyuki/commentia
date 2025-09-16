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
  private readonly requestValidator: apigateway.RequestValidator;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // REST API Gateway with enhanced configuration
    this.api = new apigateway.RestApi(this, 'CommentiaApi', {
      restApiName: `commentia-api-${props.stage}`,
      description: `Commentia REST API - ${props.stage}`,

      // CORS Configuration - 本番環境では特定のオリジンに制限
      defaultCorsPreflightOptions: {
        allowOrigins:
          props.stage === 'prod'
            ? ['https://commentia.example.com'] // TODO: 本番ドメインに置き換え
            : apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Requested-With',
        ],
        allowCredentials: false,
        maxAge: cdk.Duration.hours(1),
      },

      // Deploy Options with Rate Limiting & Throttling
      deployOptions: {
        stageName: props.stage,
        // レート制限設定（要件に基づく）
        throttlingRateLimit: props.stage === 'prod' ? 1000 : 500, // requests/second
        throttlingBurstLimit: props.stage === 'prod' ? 2000 : 1000, // burst limit
        // ロギング設定
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: props.stage !== 'prod', // 本番環境では無効化
        metricsEnabled: true,
      },

      // API Gateway の種類を明示的に設定
      endpointTypes: [apigateway.EndpointType.REGIONAL],

      // Binary Media Types (将来のファイルアップロード用)
      binaryMediaTypes: ['image/*', 'application/octet-stream'],

      // Minimum Compression Size
      minimumCompressionSize: 1024,
    });

    // Global Request Validator
    this.requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: this.api as apigateway.IRestApi,
      validateRequestBody: true,
      validateRequestParameters: true,
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
    // setupApiRoutes will be called from there

    // Gateway Responses for better error handling
    this.setupGatewayResponses();

    // Usage Plan for API Key management (optional for future)
    this.setupUsagePlan();

    this.apiEndpoint = this.api.url;

    // Output
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: 'REST API Gateway Endpoint',
      exportName: `commentia-api-endpoint-${props.stage}`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'REST API Gateway ID',
      exportName: `commentia-api-id-${props.stage}`,
    });
  }

  /**
   * カスタムゲートウェイレスポンス設定
   * 適切なエラーメッセージとCORSヘッダーを返す
   */
  private setupGatewayResponses(): void {
    // 400 Bad Request
    this.api.addGatewayResponse('BadRequest', {
      type: apigateway.ResponseType.BAD_REQUEST_BODY,
      statusCode: '400',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Bad Request',
          message: '$context.error.validationErrorString',
          requestId: '$context.requestId',
        }),
      },
    });

    // 401 Unauthorized
    this.api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Unauthorized',
          message: 'Authentication required',
          requestId: '$context.requestId',
        }),
      },
    });

    // 403 Forbidden
    this.api.addGatewayResponse('Forbidden', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Forbidden',
          message: 'Access denied',
          requestId: '$context.requestId',
        }),
      },
    });

    // 404 Not Found
    this.api.addGatewayResponse('NotFound', {
      type: apigateway.ResponseType.RESOURCE_NOT_FOUND,
      statusCode: '404',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Not Found',
          message: 'Resource not found',
          requestId: '$context.requestId',
        }),
      },
    });

    // 429 Too Many Requests
    this.api.addGatewayResponse('TooManyRequests', {
      type: apigateway.ResponseType.THROTTLED,
      statusCode: '429',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Retry-After': "'60'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          requestId: '$context.requestId',
        }),
      },
    });

    // 500 Internal Server Error
    this.api.addGatewayResponse('InternalServerError', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      statusCode: '500',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Internal Server Error',
          message: 'An internal error occurred',
          requestId: '$context.requestId',
        }),
      },
    });
  }

  /**
   * Usage Plan設定（将来的なAPI Key管理用）
   */
  private setupUsagePlan(): void {
    const plan = new apigateway.UsagePlan(this, 'CommentiaUsagePlan', {
      name: `commentia-usage-plan-${this.node.tryGetContext('stage') || 'dev'}`,
      description: 'Usage plan for Commentia API',
      throttle: {
        rateLimit: 1000,
        burstLimit: 2000,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
      apiStages: [
        {
          api: this.api as apigateway.IRestApi,
          stage: this.api.deploymentStage,
        },
      ],
    });

    // 将来的な拡張性のため変数を保持
    // Usage Plan は必要に応じて API Key と関連付け可能
    // 現在の要件では認証なしのため、準備のみ
    void plan; // 未使用警告を回避
  }

  /**
   * Request Validator を取得するためのゲッター
   * Task 3.1 で Lambda との統合時に使用
   */
  public getRequestValidator(): apigateway.RequestValidator {
    return this.requestValidator;
  }

  // API routes will be configured in Task 3.1
  // public setupApiRoutes(
  //   roomService: LambdaFunction,
  //   commentService: LambdaFunction,
  //   likeService: LambdaFunction,
  //   qrService: LambdaFunction,
  // ): void {
  //   // /rooms リソース
  //   const roomsResource = this.api.root.addResource('rooms');

  //   // POST /rooms - ルーム作成
  //   roomsResource.addMethod('POST', new apigateway.LambdaIntegration(roomService.function), {
  //     requestValidator: this.requestValidator,
  //     requestModels: {
  //       'application/json': this.createRoomRequestModel(),
  //     },
  //   });

  //   // /rooms/{roomId} リソース
  //   const roomResource = roomsResource.addResource('{roomId}');

  //   // GET /rooms/{roomId} - ルーム情報取得
  //   roomResource.addMethod('GET', new apigateway.LambdaIntegration(roomService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.roomId': true,
  //     },
  //   });

  //   // DELETE /rooms/{roomId} - ルーム終了
  //   roomResource.addMethod('DELETE', new apigateway.LambdaIntegration(roomService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.roomId': true,
  //     },
  //   });

  //   // GET /rooms/{roomId}/qr - QRコード取得
  //   const qrResource = roomResource.addResource('qr');
  //   qrResource.addMethod('GET', new apigateway.LambdaIntegration(qrService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.roomId': true,
  //     },
  //   });

  //   // POST /rooms/{roomId}/comments - コメント投稿
  //   // GET /rooms/{roomId}/comments - コメント一覧取得
  //   const commentsResource = roomResource.addResource('comments');
  //   commentsResource.addMethod('POST', new apigateway.LambdaIntegration(commentService.function), {
  //     requestValidator: this.requestValidator,
  //     requestModels: {
  //       'application/json': this.createCommentRequestModel(),
  //     },
  //     requestParameters: {
  //       'method.request.path.roomId': true,
  //     },
  //   });
  //   commentsResource.addMethod('GET', new apigateway.LambdaIntegration(commentService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.roomId': true,
  //       'method.request.querystring.sortBy': false,
  //       'method.request.querystring.limit': false,
  //       'method.request.querystring.lastEvaluatedKey': false,
  //     },
  //   });

  //   // /rooms/code/{roomCode} - ルームコード検索
  //   const codeResource = roomsResource.addResource('code');
  //   const roomCodeResource = codeResource.addResource('{roomCode}');
  //   roomCodeResource.addMethod('GET', new apigateway.LambdaIntegration(roomService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.roomCode': true,
  //     },
  //   });

  //   // /comments/{commentId} リソース
  //   const commentsRootResource = this.api.root.addResource('comments');
  //   const commentResource = commentsRootResource.addResource('{commentId}');

  //   // DELETE /comments/{commentId} - コメント削除
  //   commentResource.addMethod('DELETE', new apigateway.LambdaIntegration(commentService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.commentId': true,
  //     },
  //   });

  //   // POST /comments/{commentId}/likes - いいね追加
  //   // DELETE /comments/{commentId}/likes - いいね取消
  //   const likesResource = commentResource.addResource('likes');
  //   likesResource.addMethod('POST', new apigateway.LambdaIntegration(likeService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.commentId': true,
  //     },
  //   });
  //   likesResource.addMethod('DELETE', new apigateway.LambdaIntegration(likeService.function), {
  //     requestValidator: this.requestValidator,
  //     requestParameters: {
  //       'method.request.path.commentId': true,
  //     },
  //   });
  // }

  // Request Models for validation (will be used in Task 3.1)
  // private createRoomRequestModel(): apigateway.Model {
  //   return new apigateway.Model(this, 'RoomRequestModel', {
  //     restApi: this.api,
  //     modelName: 'RoomRequest',
  //     contentType: 'application/json',
  //     schema: {
  //       type: apigateway.JsonSchemaType.OBJECT,
  //       properties: {
  //         hostId: { type: apigateway.JsonSchemaType.STRING },
  //         settings: {
  //           type: apigateway.JsonSchemaType.OBJECT,
  //           properties: {
  //             maxCommentsPerUser: { type: apigateway.JsonSchemaType.INTEGER, minimum: 1, maximum: 100 },
  //             maxLikesPerUser: { type: apigateway.JsonSchemaType.INTEGER, minimum: 1, maximum: 1000 },
  //             commentMaxLength: { type: apigateway.JsonSchemaType.INTEGER, minimum: 1, maximum: 500 },
  //           },
  //         },
  //       },
  //       required: ['hostId'],
  //     },
  //   });
  // }

  // private createCommentRequestModel(): apigateway.Model {
  //   return new apigateway.Model(this, 'CommentRequestModel', {
  //     restApi: this.api,
  //     modelName: 'CommentRequest',
  //     contentType: 'application/json',
  //     schema: {
  //       type: apigateway.JsonSchemaType.OBJECT,
  //       properties: {
  //         userId: { type: apigateway.JsonSchemaType.STRING },
  //         userName: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 50 },
  //         content: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 500 },
  //       },
  //       required: ['userId', 'userName', 'content'],
  //     },
  //   });
  // }
}
