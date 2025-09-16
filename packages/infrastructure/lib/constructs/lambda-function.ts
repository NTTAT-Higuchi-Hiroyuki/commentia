import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface LambdaFunctionProps {
  functionName: string;
  description: string;
  stage: 'dev' | 'staging' | 'prod';
  entry: string;
  handler?: string;
  environment?: Record<string, string>;
  timeout?: cdk.Duration;
  memorySize?: number;
  runtime?: lambda.Runtime;
  tables?: Table[];
  allowWebSocketManagement?: boolean;
  webSocketApiId?: string;
  webSocketManagementApiArn?: string;
}

export class LambdaFunction extends Construct {
  public readonly function: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaFunctionProps) {
    super(scope, id);

    // 環境変数の設定
    const environment: Record<string, string> = {
      STAGE: props.stage,
      REGION: cdk.Stack.of(this).region,
      NODE_ENV: props.stage === 'prod' ? 'production' : 'development',
      // DynamoDBテーブル名を環境変数として設定
      ...(props.tables && this.createTableEnvironmentVariables(props.tables)),
      // WebSocket管理用エンドポイント
      ...(props.webSocketApiId && {
        WEBSOCKET_API_ID: props.webSocketApiId,
        WEBSOCKET_ENDPOINT: `https://${props.webSocketApiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/${props.stage}`,
      }),
      // LocalStack対応
      ...(props.stage === 'dev' && {
        IS_LOCAL: 'true',
        DYNAMODB_ENDPOINT: 'http://localhost:4566',
      }),
      ...props.environment,
    };

    // Dead Letter Queue for failed invocations (本番環境のみ)
    const deadLetterQueue =
      props.stage === 'prod'
        ? new sqs.Queue(this, 'DeadLetterQueue', {
            queueName: `commentia-${props.functionName}-dlq-${props.stage}`,
            retentionPeriod: cdk.Duration.days(14),
          })
        : undefined;

    // Lambda Function
    this.function = new nodejs.NodejsFunction(this, 'Function', {
      functionName: `commentia-${props.functionName}-${props.stage}`,
      description: props.description,
      entry: props.entry,
      runtime: props.runtime || lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64, // Graviton2プロセッサー（コスト最適化）
      handler: props.handler || 'handler',
      timeout: props.timeout || cdk.Duration.seconds(30),
      memorySize: props.memorySize || (props.stage === 'prod' ? 256 : 128),
      ...(deadLetterQueue && { deadLetterQueue }),
      environment,

      // リトライ設定
      retryAttempts: props.stage === 'prod' ? 2 : 0,

      // バンドル設定（環境別最適化）
      bundling: {
        minify: props.stage === 'prod',
        sourceMap: props.stage !== 'prod',
        target: 'es2022',
        format: nodejs.OutputFormat.ESM,
        banner:
          'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-apigatewaymanagementapi',
        ],
        keepNames: true,
      },

      // ログ保持期間（環境別）
      logRetention: this.getLogRetention(props.stage),

      // トレーシング設定
      tracing: lambda.Tracing.ACTIVE,

      // Lambda Insights（本番環境のみ）
      ...(props.stage === 'prod' && {
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      }),

      // 同時実行数制限（本番環境のみ）
      ...(props.stage === 'prod' && {
        reservedConcurrentExecutions: 100,
      }),
    });

    // DynamoDBテーブルへのアクセス権限
    if (props.tables) {
      for (const table of props.tables) {
        table.grantReadWriteData(this.function);
      }
    }

    // WebSocket管理権限
    if (props.allowWebSocketManagement && props.webSocketManagementApiArn) {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['execute-api:ManageConnections'],
          resources: [props.webSocketManagementApiArn],
        })
      );
    }

    // CloudWatch Metrics権限
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'Commentia',
          },
        },
      })
    );

    // 基本権限（ログ、X-Ray）
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
        ],
        resources: ['*'],
      })
    );

    // Lambda Insights権限（本番環境のみ）
    if (props.stage === 'prod') {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda-insights:*`,
          ],
        })
      );
    }

    // CloudWatch Alarms for monitoring（本番環境とステージング環境）
    if (props.stage === 'prod' || props.stage === 'staging') {
      this.createAlarms(props.functionName, props.stage);
    }

    // タグ付け
    cdk.Tags.of(this.function).add('Stage', props.stage);
    cdk.Tags.of(this.function).add('Project', 'Commentia');
    cdk.Tags.of(this.function).add('Function', props.functionName);
  }

  private createTableEnvironmentVariables(tables: Table[]): Record<string, string> {
    const tableEnvVars: Record<string, string> = {};

    for (const table of tables) {
      // テーブル名からタイプを推測（naming convention: commentia-{type}-{stage}）
      const tableName = table.tableName;
      const match = tableName.match(/commentia-(\w+)-/);
      if (match) {
        const tableType = match[1].toUpperCase();
        tableEnvVars[`${tableType}_TABLE_NAME`] = tableName;
      }
    }

    return tableEnvVars;
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

  private createAlarms(functionName: string, stage: string): void {
    // エラー率アラーム
    new cloudwatch.Alarm(this, 'ErrorAlarm', {
      alarmName: `commentia-${functionName}-${stage}-errors`,
      alarmDescription: 'Lambda function error rate is high',
      metric: this.function.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 実行時間アラーム
    new cloudwatch.Alarm(this, 'DurationAlarm', {
      alarmName: `commentia-${functionName}-${stage}-duration`,
      alarmDescription: 'Lambda function duration is high',
      metric: this.function.metricDuration({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 25000, // 25秒
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // スロットリング アラーム
    new cloudwatch.Alarm(this, 'ThrottleAlarm', {
      alarmName: `commentia-${functionName}-${stage}-throttles`,
      alarmDescription: 'Lambda function is being throttled',
      metric: this.function.metricThrottles({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * 環境変数の追加
   */
  public addEnvironment(key: string, value: string): void {
    this.function.addEnvironment(key, value);
  }

  /**
   * IAMポリシーの追加
   */
  public addToRolePolicy(statement: iam.PolicyStatement): void {
    this.function.addToRolePolicy(statement);
  }
}
