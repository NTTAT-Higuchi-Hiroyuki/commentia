import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface LambdaFunctionProps {
  functionName: string;
  entry: string;
  environment?: Record<string, string>;
  timeout?: cdk.Duration;
  memorySize?: number;
  runtime?: lambda.Runtime;
}

export class LambdaFunction extends Construct {
  public readonly function: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaFunctionProps) {
    super(scope, id);

    // Dead Letter Queue for failed invocations
    const deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${props.functionName}-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Lambda Function
    this.function = new nodejs.NodejsFunction(this, 'Function', {
      functionName: props.functionName,
      entry: props.entry,
      runtime: props.runtime || lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: props.timeout || cdk.Duration.seconds(30),
      memorySize: props.memorySize || 256,
      deadLetterQueue,
      environment: {
        NODE_ENV: 'production',
        ...props.environment,
      },
      bundling: {
        minify: true,
        target: 'es2022',
        format: nodejs.OutputFormat.ESM,
        banner:
          'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
        externalModules: ['aws-sdk', '@aws-sdk/*'],
        keepNames: true,
        sourceMap: true,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    });

    // Error handling
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

    // CloudWatch Alarms for monitoring
    new cloudwatch.Alarm(this, 'ErrorAlarm', {
      alarmName: `${props.functionName}-errors`,
      metric: this.function.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'DurationAlarm', {
      alarmName: `${props.functionName}-duration`,
      metric: this.function.metricDuration({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 25000, // 25 seconds
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
