import * as cdk from 'aws-cdk-lib';
import type * as apigateway from 'aws-cdk-lib/aws-apigateway';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface MonitoringProps {
  stage: 'dev' | 'staging' | 'prod';
  lambdaFunctions: lambda.Function[];
  restApi: apigateway.RestApi;
  tables: dynamodb.Table[];
  distribution?: cloudfront.Distribution;
  notificationEmail?: string;
}

export class Monitoring extends Construct {
  public readonly alarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    // SNS Topic for alarm notifications
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `commentia-alarms-${props.stage}`,
      displayName: `Commentia Alarms - ${props.stage}`,
    });

    // Email subscription for production
    if (props.notificationEmail && props.stage === 'prod') {
      this.alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.notificationEmail)
      );
    }

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `Commentia-${props.stage}`,
      widgets: [
        // API Gateway metrics
        [this.createApiGatewayWidget(props.restApi, props.stage)],
        // Lambda metrics
        [this.createLambdaWidget(props.lambdaFunctions, props.stage)],
        // DynamoDB metrics
        [this.createDynamoDBWidget(props.tables, props.stage)],
        // CloudFront metrics (if exists)
        ...(props.distribution
          ? [[this.createCloudFrontWidget(props.distribution, props.stage)]]
          : []),
        // Application-specific metrics
        [this.createApplicationMetricsWidget(props.stage)],
      ],
    });

    // Create alarms
    this.createApiGatewayAlarms(props.restApi, props.stage);
    this.createLambdaAlarms(props.lambdaFunctions, props.stage);
    this.createDynamoDBAlarms(props.tables, props.stage);

    if (props.distribution) {
      this.createCloudFrontAlarms(props.distribution, props.stage);
    }

    // Application-specific alarms
    this.createApplicationAlarms(props.stage);
  }

  private createApiGatewayWidget(api: apigateway.RestApi, stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'API Gateway Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Count',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'Sum',
          label: 'Request Count',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '4XXError',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'Sum',
          label: '4XX Errors',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '5XXError',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'Sum',
          label: '5XX Errors',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'Average',
          label: 'Average Latency',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'p95',
          label: 'P95 Latency',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createLambdaWidget(functions: lambda.Function[], stage: string): cloudwatch.GraphWidget {
    const durationMetrics = functions.map(
      (fn) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: fn.functionName },
          statistic: 'Average',
          label: `${fn.functionName} Duration`,
        })
    );

    const errorMetrics = functions.map(
      (fn) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: fn.functionName },
          statistic: 'Sum',
          label: `${fn.functionName} Errors`,
        })
    );

    return new cloudwatch.GraphWidget({
      title: 'Lambda Functions Metrics',
      left: durationMetrics,
      right: errorMetrics,
      width: 12,
      height: 6,
    });
  }

  private createDynamoDBWidget(tables: dynamodb.Table[], stage: string): cloudwatch.GraphWidget {
    const readMetrics = tables.map(
      (table) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedReadCapacityUnits',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          label: `${table.tableName} Read`,
        })
    );

    const writeMetrics = tables.map(
      (table) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedWriteCapacityUnits',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          label: `${table.tableName} Write`,
        })
    );

    return new cloudwatch.GraphWidget({
      title: 'DynamoDB Metrics',
      left: readMetrics,
      right: writeMetrics,
      width: 12,
      height: 6,
    });
  }

  private createCloudFrontWidget(
    distribution: cloudfront.Distribution,
    stage: string
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'CloudFront Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: 'Requests',
          dimensionsMap: { DistributionId: distribution.distributionId },
          statistic: 'Sum',
          label: 'Requests',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: 'BytesDownloaded',
          dimensionsMap: { DistributionId: distribution.distributionId },
          statistic: 'Sum',
          label: 'Bytes Downloaded',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: '4xxErrorRate',
          dimensionsMap: { DistributionId: distribution.distributionId },
          statistic: 'Average',
          label: '4XX Error Rate',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: '5xxErrorRate',
          dimensionsMap: { DistributionId: distribution.distributionId },
          statistic: 'Average',
          label: '5XX Error Rate',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createApplicationMetricsWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Application Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ActiveRooms',
          statistic: 'Maximum',
          label: 'Active Rooms',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ConnectedUsers',
          statistic: 'Maximum',
          label: 'Connected Users',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'CommentsPerMinute',
          statistic: 'Sum',
          label: 'Comments/Minute',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'LikesPerMinute',
          statistic: 'Sum',
          label: 'Likes/Minute',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createApiGatewayAlarms(api: apigateway.RestApi, stage: string): void {
    // High error rate alarm
    new cloudwatch.Alarm(this, 'ApiGateway5xxAlarm', {
      alarmName: `Commentia-API-5xx-${stage}`,
      alarmDescription: 'High 5XX error rate in API Gateway',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: api.restApiName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: stage === 'prod' ? 5 : 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

    // High latency alarm
    new cloudwatch.Alarm(this, 'ApiGatewayLatencyAlarm', {
      alarmName: `Commentia-API-Latency-${stage}`,
      alarmDescription: 'High latency in API Gateway',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: { ApiName: api.restApiName },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: stage === 'prod' ? 1000 : 2000, // ms
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));
  }

  private createLambdaAlarms(functions: lambda.Function[], stage: string): void {
    functions.forEach((fn) => {
      // Error rate alarm
      new cloudwatch.Alarm(this, `Lambda${fn.functionName}ErrorAlarm`, {
        alarmName: `Commentia-Lambda-${fn.functionName}-Errors-${stage}`,
        alarmDescription: `High error rate in ${fn.functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: fn.functionName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: stage === 'prod' ? 5 : 10,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

      // Duration alarm
      new cloudwatch.Alarm(this, `Lambda${fn.functionName}DurationAlarm`, {
        alarmName: `Commentia-Lambda-${fn.functionName}-Duration-${stage}`,
        alarmDescription: `High duration in ${fn.functionName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: fn.functionName },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 15000, // 15 seconds
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

      // Throttle alarm (本番環境のみ)
      if (stage === 'prod') {
        new cloudwatch.Alarm(this, `Lambda${fn.functionName}ThrottleAlarm`, {
          alarmName: `Commentia-Lambda-${fn.functionName}-Throttles-${stage}`,
          alarmDescription: `Throttling detected in ${fn.functionName}`,
          metric: new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Throttles',
            dimensionsMap: { FunctionName: fn.functionName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: 1,
          evaluationPeriods: 1,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));
      }
    });
  }

  private createDynamoDBAlarms(tables: dynamodb.Table[], stage: string): void {
    tables.forEach((table) => {
      // Read throttle alarm
      new cloudwatch.Alarm(this, `DynamoDB${table.tableName}ReadThrottleAlarm`, {
        alarmName: `Commentia-DynamoDB-${table.tableName}-ReadThrottles-${stage}`,
        alarmDescription: `Read throttling in ${table.tableName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ReadThrottles',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

      // Write throttle alarm
      new cloudwatch.Alarm(this, `DynamoDB${table.tableName}WriteThrottleAlarm`, {
        alarmName: `Commentia-DynamoDB-${table.tableName}-WriteThrottles-${stage}`,
        alarmDescription: `Write throttling in ${table.tableName}`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'WriteThrottles',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));
    });
  }

  private createCloudFrontAlarms(distribution: cloudfront.Distribution, stage: string): void {
    // 4xx error rate alarm
    new cloudwatch.Alarm(this, 'CloudFront4xxAlarm', {
      alarmName: `Commentia-CloudFront-4xx-${stage}`,
      alarmDescription: 'High 4XX error rate in CloudFront',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '4xxErrorRate',
        dimensionsMap: { DistributionId: distribution.distributionId },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: stage === 'prod' ? 5 : 10, // percentage
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

    // 5xx error rate alarm
    new cloudwatch.Alarm(this, 'CloudFront5xxAlarm', {
      alarmName: `Commentia-CloudFront-5xx-${stage}`,
      alarmDescription: 'High 5XX error rate in CloudFront',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '5xxErrorRate',
        dimensionsMap: { DistributionId: distribution.distributionId },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: stage === 'prod' ? 2 : 5, // percentage
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));
  }

  private createApplicationAlarms(stage: string): void {
    // Room creation failure alarm
    new cloudwatch.Alarm(this, 'RoomCreationFailureAlarm', {
      alarmName: `Commentia-RoomCreationFailures-${stage}`,
      alarmDescription: 'High room creation failure rate',
      metric: new cloudwatch.Metric({
        namespace: 'Commentia',
        metricName: 'RoomCreationFailures',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: stage === 'prod' ? 3 : 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

    // WebSocket connection failure alarm
    new cloudwatch.Alarm(this, 'WebSocketConnectionFailureAlarm', {
      alarmName: `Commentia-WebSocketFailures-${stage}`,
      alarmDescription: 'High WebSocket connection failure rate',
      metric: new cloudwatch.Metric({
        namespace: 'Commentia',
        metricName: 'WebSocketConnectionFailures',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: stage === 'prod' ? 10 : 20,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

    // Comment spam detection alarm（本番環境のみ）
    if (stage === 'prod') {
      new cloudwatch.Alarm(this, 'CommentSpamAlarm', {
        alarmName: `Commentia-CommentSpam-${stage}`,
        alarmDescription: 'Potential comment spam detected',
        metric: new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'SuspiciousCommentActivity',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 50,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));
    }
  }
}
