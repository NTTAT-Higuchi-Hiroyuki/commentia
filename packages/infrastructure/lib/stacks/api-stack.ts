import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { EnhancedMonitoring } from '../constructs/enhanced-monitoring';
import { LambdaFunction } from '../constructs/lambda-function';
import { LogInsightsQueries } from '../constructs/log-insights-queries';
import type { TablesConfig } from './database-stack';

export interface ApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'staging' | 'prod';
  tablesConfig: TablesConfig;
  customDomainName?: string;
  certificateArn?: string;
  notificationEmail?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly apiEndpoint: string;
  public readonly api: apigateway.RestApi;
  public readonly customDomain?: apigateway.DomainName;
  public readonly lambdaFunctions: { [key: string]: LambdaFunction };
  public readonly monitoring: EnhancedMonitoring;
  public readonly logInsightsQueries: LogInsightsQueries;
  private readonly requestValidator: apigateway.RequestValidator;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // カスタムドメインの設定（オプション）
    if (props.customDomainName && props.certificateArn) {
      this.customDomain = new apigateway.DomainName(this, 'CustomDomain', {
        domainName: props.customDomainName,
        certificate: acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn),
        endpointType: apigateway.EndpointType.REGIONAL,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      });
    }

    // Access Logs用のCloudWatch Logs Group
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/commentia-${props.stage}`,
      retention: this.getLogRetention(props.stage),
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, 'CommentiaApi', {
      restApiName: `commentia-api-${props.stage}`,
      description: `Commentia API - ${props.stage}`,
      // CORS設定（プリフライトリクエスト用）
      defaultCorsPreflightOptions: {
        allowOrigins: this.getAllowedOrigins(props.stage),
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
        allowCredentials: false,
      },

      // CloudWatch ログ設定
      cloudWatchRole: true,
      cloudWatchRoleRemovalPolicy:
        props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,

      // アクセスログ設定
      deployOptions: {
        stageName: props.stage,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),

        // メトリクス設定
        metricsEnabled: true,
        dataTraceEnabled: props.stage !== 'prod',
        loggingLevel:
          props.stage === 'prod'
            ? apigateway.MethodLoggingLevel.ERROR
            : apigateway.MethodLoggingLevel.INFO,
      },

      // 圧縮設定
      minCompressionSize: cdk.Size.kibibytes(1),

      // バイナリメディアタイプ（必要に応じて）
      binaryMediaTypes: ['image/*', 'application/octet-stream'],

      // エンドポイント設定
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    // スロットリング設定をCarbon後に追加
    const _throttleRateLimit = this.getRateLimit(props.stage);
    const _throttleBurstLimit = this.getBurstLimit(props.stage);

    // Lambda関数の設定
    this.lambdaFunctions = this.createLambdaFunctions(props);

    // API エンドポイントの設定
    this.setupApiEndpoints(this.lambdaFunctions);

    // Note: API Gateway throttling is configured at the usage plan level
    // Individual method throttling is available via usage plans

    // リクエストバリデーター
    this.requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: this.api,
      requestValidatorName: `commentia-validator-${props.stage}`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // カスタムドメインマッピング
    if (this.customDomain) {
      new apigateway.BasePathMapping(this, 'BasePathMapping', {
        domainName: this.customDomain,
        restApi: this.api,
        basePath: '',
      });
    }

    // Gateway Responses（エラーレスポンスのカスタマイズ）
    this.addGatewayResponses();

    // API エンドポイント URL の設定
    this.apiEndpoint = this.customDomain ? `https://${this.customDomain.domainName}` : this.api.url;

    // Enhanced Monitoring Setup
    this.monitoring = new EnhancedMonitoring(this, 'EnhancedMonitoring', {
      stage: props.stage,
      lambdaFunctions: Object.values(this.lambdaFunctions).map((lf) => lf.function),
      restApi: this.api,
      tables: [
        props.tablesConfig.roomsTable,
        props.tablesConfig.commentsTable,
        props.tablesConfig.connectionsTable,
        props.tablesConfig.likesTable,
      ],
      notificationEmail: props.notificationEmail,
    });

    // Log Insights Queries Setup
    this.logInsightsQueries = new LogInsightsQueries(this, 'LogInsightsQueries', {
      stage: props.stage,
      lambdaFunctions: Object.values(this.lambdaFunctions).map((lf) => lf.function.functionName),
    });

    // CloudFormation Outputs
    this.createOutputs(props.stage);

    // セキュリティ強化
    this.addSecurityHeaders();

    // リソースポリシー（オプション）
    if (props.stage === 'prod') {
      this.addResourcePolicy();
    }
  }

  private getLogRetention(stage: string): logs.RetentionDays {
    switch (stage) {
      case 'prod':
        return logs.RetentionDays.ONE_MONTH;
      case 'staging':
        return logs.RetentionDays.ONE_WEEK;
      default:
        return logs.RetentionDays.THREE_DAYS;
    }
  }

  private getAllowedOrigins(stage: string): string[] {
    switch (stage) {
      case 'prod':
        return ['https://commentia.example.com'];
      case 'staging':
        return ['https://staging.commentia.example.com'];
      default:
        return ['*']; // 開発環境では全て許可
    }
  }

  private getRateLimit(stage: string): number {
    switch (stage) {
      case 'prod':
        return 1000;
      case 'staging':
        return 500;
      default:
        return 100;
    }
  }

  private getBurstLimit(stage: string): number {
    switch (stage) {
      case 'prod':
        return 2000;
      case 'staging':
        return 1000;
      default:
        return 200;
    }
  }

  private createLambdaFunctions(props: ApiStackProps): {
    [key: string]: LambdaFunction;
  } {
    const commonLambdaProps = {
      stage: props.stage,
      tables: [
        props.tablesConfig.roomsTable,
        props.tablesConfig.commentsTable,
        props.tablesConfig.connectionsTable,
        props.tablesConfig.likesTable,
      ],
      // Enable metrics for monitoring
      environment: {
        ENABLE_METRICS: 'true',
        METRICS_NAMESPACE: 'Commentia',
      },
    };

    // Comment管理Lambda
    const commentFunction = new LambdaFunction(this, 'CommentFunction', {
      ...commonLambdaProps,
      functionName: 'comment-handler',
      description: 'Handle comment operations',
      entry: '/Users/higu/Project/commentia/packages/backend/src/handlers/comment-handler.ts',
      timeout: cdk.Duration.seconds(30),
    });

    // Room管理Lambda
    const roomFunction = new LambdaFunction(this, 'RoomFunction', {
      ...commonLambdaProps,
      functionName: 'room-handler',
      description: 'Handle room operations',
      entry: '/Users/higu/Project/commentia/packages/backend/src/handlers/room-handler.ts',
      timeout: cdk.Duration.seconds(30),
    });

    // Like管理Lambda
    const likeFunction = new LambdaFunction(this, 'LikeFunction', {
      ...commonLambdaProps,
      functionName: 'like-handler',
      description: 'Handle like operations',
      entry: '/Users/higu/Project/commentia/packages/backend/src/handlers/like-handler.ts',
      timeout: cdk.Duration.seconds(15),
    });

    // QR生成Lambda
    const qrFunction = new LambdaFunction(this, 'QrFunction', {
      ...commonLambdaProps,
      functionName: 'qr-handler',
      description: 'Handle QR code generation',
      entry: '/Users/higu/Project/commentia/packages/backend/src/handlers/qr-handler.ts',
      timeout: cdk.Duration.seconds(15),
    });

    return {
      commentFunction,
      roomFunction,
      likeFunction,
      qrFunction,
    };
  }

  private setupApiEndpoints(functions: {
    commentFunction: LambdaFunction;
    roomFunction: LambdaFunction;
    likeFunction: LambdaFunction;
    qrFunction: LambdaFunction;
  }) {
    // /rooms リソース
    const roomsResource = this.api.root.addResource('rooms');

    // POST /rooms - ルーム作成
    roomsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(functions.roomFunction.function, {
        proxy: false,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
          {
            statusCode: '400',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        requestValidator: this.requestValidator,
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '400',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // GET /rooms/{roomId} - ルーム情報取得
    const roomResource = roomsResource.addResource('{roomId}');
    roomResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(functions.roomFunction.function)
    );

    // /rooms/{roomId}/comments リソース
    const commentsResource = roomResource.addResource('comments');

    // GET /rooms/{roomId}/comments - コメント一覧取得
    commentsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(functions.commentFunction.function)
    );

    // POST /rooms/{roomId}/comments - コメント投稿
    commentsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(functions.commentFunction.function),
      {
        requestValidator: this.requestValidator,
      }
    );

    // /rooms/{roomId}/comments/{commentId} リソース
    const commentResource = commentsResource.addResource('{commentId}');

    // DELETE /rooms/{roomId}/comments/{commentId} - コメント削除
    commentResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(functions.commentFunction.function)
    );

    // /rooms/{roomId}/comments/{commentId}/like リソース
    const likeResource = commentResource.addResource('like');

    // POST /rooms/{roomId}/comments/{commentId}/like - いいね追加
    likeResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(functions.likeFunction.function)
    );

    // DELETE /rooms/{roomId}/comments/{commentId}/like - いいね削除
    likeResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(functions.likeFunction.function)
    );

    // /qr リソース
    const qrResource = this.api.root.addResource('qr');

    // GET /qr/{roomId} - QRコード生成
    const qrRoomResource = qrResource.addResource('{roomId}');
    qrRoomResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(functions.qrFunction.function)
    );

    // /health リソース（ヘルスチェック）
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': JSON.stringify({
                status: 'healthy',
                timestamp: '$context.requestTime',
                version: '1.0.0',
              }),
            },
          },
        ],
        requestTemplates: {
          'application/json': JSON.stringify({ statusCode: 200 }),
        },
      }),
      {
        methodResponses: [{ statusCode: '200' }],
      }
    );
  }

  private addGatewayResponses() {
    // 4XX エラー
    this.api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: '$context.error.message',
          requestId: '$context.requestId',
          timestamp: '$context.requestTime',
        }),
      },
    });

    // 5XX エラー
    this.api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'*'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Internal Server Error',
          requestId: '$context.requestId',
          timestamp: '$context.requestTime',
        }),
      },
    });

    // レート制限エラー
    this.api.addGatewayResponse('Throttled', {
      type: apigateway.ResponseType.THROTTLED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Retry-After': "'60'",
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: 60,
        }),
      },
    });
  }

  private addSecurityHeaders() {
    // セキュリティヘッダーの追加
    this.api.addGatewayResponse('SecurityHeaders', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'X-Content-Type-Options': "'nosniff'",
        'X-Frame-Options': "'DENY'",
        'X-XSS-Protection': "'1; mode=block'",
        'Strict-Transport-Security': "'max-age=31536000; includeSubDomains'",
        'Referrer-Policy': "'strict-origin-when-cross-origin'",
      },
    });
  }

  private addResourcePolicy() {
    // 本番環境のリソースポリシー
    this.api.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: ['arn:aws:execute-api:*:*:*'],
        conditions: {
          IpAddress: {
            'aws:SourceIp': [
              // 必要に応じて許可するIPアドレス範囲を設定
              '0.0.0.0/0', // 全て許可（実際の本番環境では制限推奨）
            ],
          },
        },
      })
    );
  }

  private createOutputs(stage: string) {
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: `API Gateway endpoint for ${stage}`,
      exportName: `Commentia-Api-Endpoint-${stage}`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: `API Gateway ID for ${stage}`,
      exportName: `Commentia-Api-Id-${stage}`,
    });

    if (this.customDomain) {
      new cdk.CfnOutput(this, 'CustomDomainName', {
        value: this.customDomain.domainName,
        description: `Custom domain name for ${stage}`,
        exportName: `Commentia-Custom-Domain-${stage}`,
      });
    }

    // Monitoring Outputs
    new cdk.CfnOutput(this, 'OperationalDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.monitoring.operationalDashboard.dashboardName}`,
      description: 'Operational Dashboard URL',
      exportName: `Commentia-Operations-Dashboard-${stage}`,
    });

    new cdk.CfnOutput(this, 'BusinessDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.monitoring.businessDashboard.dashboardName}`,
      description: 'Business Dashboard URL',
      exportName: `Commentia-Business-Dashboard-${stage}`,
    });

    new cdk.CfnOutput(this, 'LogInsightsUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:logs-insights`,
      description: 'CloudWatch Logs Insights URL',
      exportName: `Commentia-Log-Insights-${stage}`,
    });
  }
}
