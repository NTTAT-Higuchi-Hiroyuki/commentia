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
  enableXrayTracing?: boolean;
  provisionedConcurrency?: number;
}

export class LambdaFunction extends Construct {
  public readonly function: nodejs.NodejsFunction;
  public readonly logGroup: logs.LogGroup;
  public readonly deadLetterQueue?: sqs.Queue;

  constructor(scope: Construct, id: string, props: LambdaFunctionProps) {
    super(scope, id);

    // CloudWatch Logs Group (先に作成してアクセス制御)
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/commentia-${props.functionName}-${props.stage}`,
      retention: this.getLogRetention(props.stage),
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

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

    // Dead Letter Queue for failed invocations (本番環境とステージング環境)
    if (props.stage === 'prod' || props.stage === 'staging') {
      this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
        queueName: `commentia-${props.functionName}-dlq-${props.stage}`,
        retentionPeriod: cdk.Duration.days(14),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
      });
    }

    // 同時実行数の設定
    const reservedConcurrency = this.getReservedConcurrency(props.stage);

    // Lambda Function with enhanced configuration
    this.function = new nodejs.NodejsFunction(this, 'Function', {
      functionName: `commentia-${props.functionName}-${props.stage}`,
      description: props.description,
      entry: props.entry,
      runtime: props.runtime || lambda.Runtime.NODEJS_22_X, // 最新のNode.js runtime
      architecture: lambda.Architecture.ARM_64, // Graviton2プロセッサー（コスト最適化）
      handler: props.handler || 'handler',
      timeout: props.timeout || cdk.Duration.seconds(30),
      memorySize: props.memorySize || this.getMemorySize(props.stage),
      ...(this.deadLetterQueue && { deadLetterQueue: this.deadLetterQueue }),
      environment,

      // リトライ設定
      retryAttempts: props.stage === 'prod' ? 2 : 0,

      // 同時実行数制限（undefinedでない場合のみ設定）
      ...(reservedConcurrency !== undefined && {
        reservedConcurrentExecutions: reservedConcurrency,
      }),

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
          '@aws-sdk/client-cloudwatch',
        ],
        keepNames: true,
        sourcesContent: props.stage !== 'prod',
        define: {
          'process.env.NODE_ENV': JSON.stringify(
            props.stage === 'prod' ? 'production' : 'development'
          ),
        },
      },

      // ログ設定 (修正済み - logGroup を使用)
      logGroup: this.logGroup,

      // トレーシング設定
      tracing: (props.enableXrayTracing ?? true) ? lambda.Tracing.ACTIVE : lambda.Tracing.DISABLED,

      // Lambda Insights（本番環境とステージング環境）
      ...(props.stage !== 'dev' && {
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      }),

      // Provisioned Concurrency（本番環境）
      ...(props.provisionedConcurrency &&
        props.stage === 'prod' &&
        {
          // Note: Provisioned Concurrency は別途設定が必要
        }),

      // ファイルシステム設定（必要に応じて）
      ...(props.stage === 'prod' &&
        {
          // filesystem: lambda.FileSystem.fromEfsAccessPoint(...),
        }),

      // VPC設定（セキュリティ要件に応じて）
      ...(props.stage === 'prod' &&
        {
          // vpc: vpc,
          // vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          // securityGroups: [securityGroup],
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

    // CloudWatch Metrics権限（カスタムメトリクス用）
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': ['Commentia', 'AWS/Lambda'],
          },
        },
      })
    );

    // X-Ray権限（トレーシング有効時）
    if (props.enableXrayTracing ?? true) {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
          resources: ['*'],
        })
      );
    }

    // Lambda Insights権限（本番環境とステージング環境）
    if (props.stage !== 'dev') {
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

    // セキュリティ強化：最小権限の原則
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['iam:*', 'organizations:*', 'account:*'],
        resources: ['*'],
      })
    );

    // CloudWatch Alarms for monitoring（本番環境とステージング環境）
    if (props.stage === 'prod' || props.stage === 'staging') {
      this.createAlarms(props.functionName, props.stage);
    }

    // タグ付け
    cdk.Tags.of(this.function).add('Stage', props.stage);
    cdk.Tags.of(this.function).add('Project', 'Commentia');
    cdk.Tags.of(this.function).add('Function', props.functionName);
    cdk.Tags.of(this.function).add('Component', 'Backend');

    // Provisioned Concurrency設定（本番環境）
    // 型エラーを避けるために、直接createVersionを使用
    if (props.provisionedConcurrency && props.stage === 'prod') {
      const version = this.function.addVersion(`v${Date.now()}`);
      new lambda.Alias(this, 'ProdAlias', {
        aliasName: 'prod',
        version,
        provisionedConcurrencyConfig: {
          provisionedConcurrentExecutions: props.provisionedConcurrency,
        },
      });
    }
  }

  private getMemorySize(stage: string): number {
    switch (stage) {
      case 'prod':
        return 512;
      case 'staging':
        return 256;
      default:
        return 128;
    }
  }

  private getReservedConcurrency(stage: string): number | undefined {
    switch (stage) {
      case 'prod':
        return 100;
      case 'staging':
        return 50;
      default:
        return undefined; // 開発環境では制限なし
    }
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
    const alarmThresholds = this.getAlarmThresholds(stage);

    // エラー率アラーム
    new cloudwatch.Alarm(this, 'ErrorAlarm', {
      alarmName: `commentia-${functionName}-${stage}-errors`,
      alarmDescription: `Lambda function ${functionName} error rate is high`,
      metric: this.function.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      threshold: alarmThresholds.errorCount,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // 実行時間アラーム（平均値ベース）
    new cloudwatch.Alarm(this, 'DurationAlarm', {
      alarmName: `commentia-${functionName}-${stage}-duration`,
      alarmDescription: `Lambda function ${functionName} duration is high`,
      metric: this.function.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Stats.AVERAGE,
      }),
      threshold: alarmThresholds.durationMs,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // スロットリング アラーム
    new cloudwatch.Alarm(this, 'ThrottleAlarm', {
      alarmName: `commentia-${functionName}-${stage}-throttles`,
      alarmDescription: `Lambda function ${functionName} is being throttled`,
      metric: this.function.metricThrottles({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // 同時実行数アラーム（本番環境のみ）
    if (stage === 'prod') {
      new cloudwatch.Alarm(this, 'ConcurrentExecutionsAlarm', {
        alarmName: `commentia-${functionName}-${stage}-concurrent-executions`,
        alarmDescription: `Lambda function ${functionName} concurrent executions are high`,
        metric: this.function.metric('ConcurrentExecutions', {
          period: cdk.Duration.minutes(1),
          statistic: cloudwatch.Stats.MAXIMUM,
        }),
        threshold: alarmThresholds.concurrentExecutions,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      });
    }
  }

  private getAlarmThresholds(stage: string) {
    switch (stage) {
      case 'prod':
        return {
          errorCount: 5,
          durationMs: 25000, // 25秒
          concurrentExecutions: 80, // 予約済み同時実行数の80%
        };
      case 'staging':
        return {
          errorCount: 10,
          durationMs: 25000,
          concurrentExecutions: 40,
        };
      default:
        return {
          errorCount: 20,
          durationMs: 25000,
          concurrentExecutions: 20,
        };
    }
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

  /**
   * カスタムメトリクスの作成
   */
  public createCustomMetric(metricName: string, namespace = 'Commentia'): cloudwatch.Metric {
    return new cloudwatch.Metric({
      namespace,
      metricName,
      dimensionsMap: {
        FunctionName: this.function.functionName,
        Stage: cdk.Stack.of(this).stackName,
      },
      statistic: cloudwatch.Stats.SUM,
      period: cdk.Duration.minutes(5),
    });
  }

  /**
   * Lambda Layerの追加
   */
  public addLayer(layer: lambda.ILayerVersion): void {
    this.function.addLayers(layer);
  }

  /**
   * Function URLの作成（必要に応じて）
   */
  public createFunctionUrl(
    authType: lambda.FunctionUrlAuthType = lambda.FunctionUrlAuthType.AWS_IAM
  ): lambda.FunctionUrl {
    return this.function.addFunctionUrl({
      authType,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    });
  }
}
