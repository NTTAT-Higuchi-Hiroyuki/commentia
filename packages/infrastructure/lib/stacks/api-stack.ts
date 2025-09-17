import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import type { Construct } from 'constructs';
import { LambdaFunction } from '../constructs/lambda-function';
import type { TablesConfig } from './database-stack';

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

    // Lambda環境変数
    const lambdaEnvironment = {
      STAGE: props.stage,
      REGION: this.region,
      ROOMS_TABLE_NAME: props.tablesConfig.roomsTable.tableName,
      COMMENTS_TABLE_NAME: props.tablesConfig.commentsTable.tableName,
      CONNECTIONS_TABLE_NAME: props.tablesConfig.connectionsTable.tableName,
      LIKES_TABLE_NAME: props.tablesConfig.likesTable.tableName,
    };

    // Room Service Lambda Function
    const roomService = new LambdaFunction(this, 'RoomService', {
      functionName: `commentia-room-service-${props.stage}`,
      description: `Commentia Room Service Lambda - ${props.stage}`,
      entry: '../backend/src/handlers/room-handler.ts',
      handler: 'handler',
      stage: props.stage,
      environment: lambdaEnvironment,
    });

    // DynamoDBテーブルへのアクセス権限を付与
    props.tablesConfig.roomsTable.grantReadWriteData(roomService.function);

    // Comment Service Lambda Function
    const commentService = new LambdaFunction(this, 'CommentService', {
      functionName: `commentia-comment-service-${props.stage}`,
      description: `Commentia Comment Service Lambda - ${props.stage}`,
      entry: '../backend/src/handlers/comment-handler.ts',
      handler: 'handler',
      stage: props.stage,
      environment: lambdaEnvironment,
    });

    // DynamoDBテーブルへのアクセス権限を付与
    props.tablesConfig.commentsTable.grantReadWriteData(commentService.function);
    props.tablesConfig.roomsTable.grantReadData(commentService.function); // ルーム設定取得用

    // QR Service Lambda Function
    const qrService = new LambdaFunction(this, 'QRService', {
      functionName: `commentia-qr-service-${props.stage}`,
      description: `Commentia QR Service Lambda - ${props.stage}`,
      entry: '../backend/src/handlers/qr-handler.ts',
      handler: 'generateQRCodeHandler',
      stage: props.stage,
      environment: {
        ...lambdaEnvironment,
        FRONTEND_URL:
          props.stage === 'prod'
            ? 'https://commentia.example.com' // TODO: 本番ドメインに置き換え
            : 'http://localhost:3000', // 開発環境用
      },
    });

    // QR Serviceは読み取り専用のため、特別なDynamoDBアクセス権限は不要

    // API ルートの設定
    this.setupRoomApiRoutes(roomService);
    this.setupCommentApiRoutes(commentService);
    this.setupQRApiRoutes(qrService);

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

  /**
   * Room Service用APIルートの設定
   */
  private setupRoomApiRoutes(roomService: LambdaFunction): void {
    // /rooms リソース
    const roomsResource = this.api.root.addResource('rooms');

    // POST /rooms - ルーム作成
    roomsResource.addMethod('POST', new apigateway.LambdaIntegration(roomService.function), {
      requestValidator: this.requestValidator,
      requestModels: {
        'application/json': this.createRoomRequestModel(),
      },
    });

    // /rooms/{roomId} リソース
    const roomResource = roomsResource.addResource('{roomId}');

    // GET /rooms/{roomId} - ルーム情報取得
    roomResource.addMethod('GET', new apigateway.LambdaIntegration(roomService.function), {
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.roomId': true,
      },
    });

    // DELETE /rooms/{roomId} - ルーム終了
    roomResource.addMethod('DELETE', new apigateway.LambdaIntegration(roomService.function), {
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.roomId': true,
      },
    });

    // /rooms/code/{roomCode} - ルームコード検索
    const codeResource = roomsResource.addResource('code');
    const roomCodeResource = codeResource.addResource('{roomCode}');
    roomCodeResource.addMethod('GET', new apigateway.LambdaIntegration(roomService.function), {
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.roomCode': true,
      },
    });
  }

  /**
   * Comment Service用APIルートの設定
   */
  private setupCommentApiRoutes(commentService: LambdaFunction): void {
    // 既存の /rooms/{roomId} リソースを取得
    const roomsResource = this.api.root.getResource('rooms');
    if (!roomsResource) {
      throw new Error('Rooms resource not found. Room API routes must be set up first.');
    }

    const roomResource = roomsResource.getResource('{roomId}');
    if (!roomResource) {
      throw new Error('Room resource not found. Room API routes must be set up first.');
    }

    // POST /rooms/{roomId}/comments - コメント投稿
    // GET /rooms/{roomId}/comments - コメント一覧取得
    const commentsResource = roomResource.addResource('comments');

    commentsResource.addMethod('POST', new apigateway.LambdaIntegration(commentService.function), {
      requestValidator: this.requestValidator,
      requestModels: {
        'application/json': this.createCommentRequestModel(),
      },
      requestParameters: {
        'method.request.path.roomId': true,
      },
    });

    commentsResource.addMethod('GET', new apigateway.LambdaIntegration(commentService.function), {
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.roomId': true,
        'method.request.querystring.sortBy': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.cursor': false,
      },
    });

    // /comments/{commentId} リソース
    const commentsRootResource = this.api.root.addResource('comments');
    const commentResource = commentsRootResource.addResource('{commentId}');

    // DELETE /comments/{commentId} - コメント削除
    commentResource.addMethod('DELETE', new apigateway.LambdaIntegration(commentService.function), {
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.commentId': true,
      },
    });
  }

  /**
   * Room Request Modelの作成
   */
  private createRoomRequestModel(): apigateway.Model {
    return new apigateway.Model(this, 'RoomRequestModel', {
      restApi: this.api as apigateway.IRestApi,
      modelName: 'RoomRequest',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          hostId: { type: apigateway.JsonSchemaType.STRING },
          settings: {
            type: apigateway.JsonSchemaType.OBJECT,
            properties: {
              maxCommentsPerUser: {
                type: apigateway.JsonSchemaType.INTEGER,
                minimum: 1,
                maximum: 100,
              },
              maxLikesPerUser: {
                type: apigateway.JsonSchemaType.INTEGER,
                minimum: 1,
                maximum: 1000,
              },
              commentMaxLength: {
                type: apigateway.JsonSchemaType.INTEGER,
                minimum: 1,
                maximum: 500,
              },
            },
          },
        },
        required: ['hostId'],
      },
    });
  }

  /**
   * Comment Request Modelの作成
   */
  private createCommentRequestModel(): apigateway.Model {
    return new apigateway.Model(this, 'CommentRequestModel', {
      restApi: this.api as apigateway.IRestApi,
      modelName: 'CommentRequest',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          userId: { type: apigateway.JsonSchemaType.STRING },
          userName: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 1,
            maxLength: 50,
          },
          content: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 1,
            maxLength: 500,
          },
        },
        required: ['userId', 'userName', 'content'],
      },
    });
  }

  /**
   * QR Service用APIルートの設定
   */
  private setupQRApiRoutes(qrService: LambdaFunction): void {
    // 既存の /rooms/{roomId} リソースを取得
    const roomsResource = this.api.root.getResource('rooms');
    if (!roomsResource) {
      throw new Error('Rooms resource not found. Room API routes must be set up first.');
    }

    const roomResource = roomsResource.getResource('{roomId}');
    if (!roomResource) {
      throw new Error('Room resource not found. Room API routes must be set up first.');
    }

    // GET /rooms/{roomId}/qr - QRコード生成
    const qrResource = roomResource.addResource('qr');
    qrResource.addMethod('GET', new apigateway.LambdaIntegration(qrService.function), {
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.roomId': true,
        'method.request.querystring.format': false, // png or svg
        'method.request.querystring.size': false, // 50-500
      },
    });
  }
}
