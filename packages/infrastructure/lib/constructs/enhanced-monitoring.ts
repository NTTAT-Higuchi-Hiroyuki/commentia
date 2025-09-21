import * as cdk from 'aws-cdk-lib';
import type * as apigateway from 'aws-cdk-lib/aws-apigateway';
import type * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface EnhancedMonitoringProps {
  stage: 'dev' | 'staging' | 'prod';
  lambdaFunctions: lambda.Function[];
  restApi: apigateway.RestApi;
  webSocketApi?: apigatewayv2.WebSocketApi;
  tables: dynamodb.Table[];
  distribution?: cloudfront.Distribution;
  notificationEmail?: string;
  slackWebhookUrl?: string;
}

export class EnhancedMonitoring extends Construct {
  public readonly alarmTopic: sns.Topic;
  public readonly criticalAlarmTopic: sns.Topic;
  public readonly operationalDashboard: cloudwatch.Dashboard;
  public readonly businessDashboard: cloudwatch.Dashboard;
  public readonly logInsightsQueries: logs.QueryDefinition[];

  constructor(scope: Construct, id: string, props: EnhancedMonitoringProps) {
    super(scope, id);

    // SNS Topics for different severity levels
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `commentia-alarms-${props.stage}`,
      displayName: `Commentia Alarms - ${props.stage}`,
    });

    this.criticalAlarmTopic = new sns.Topic(this, 'CriticalAlarmTopic', {
      topicName: `commentia-critical-alarms-${props.stage}`,
      displayName: `Commentia Critical Alarms - ${props.stage}`,
    });

    // Email subscriptions
    if (props.notificationEmail) {
      // General alarms for all environments
      this.alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.notificationEmail)
      );

      // Critical alarms (production and staging)
      if (props.stage === 'prod' || props.stage === 'staging') {
        this.criticalAlarmTopic.addSubscription(
          new snsSubscriptions.EmailSubscription(props.notificationEmail)
        );
      }
    }

    // CloudWatch Dashboards
    this.operationalDashboard = this.createOperationalDashboard(props);
    this.businessDashboard = this.createBusinessDashboard(props);

    // Log Insights Queries
    this.logInsightsQueries = this.createLogInsightsQueries(props);

    // Enhanced Alarms
    this.createEnhancedAlarms(props);

    // Create custom metrics for application monitoring
    this.createCustomMetrics(props);
  }

  private createOperationalDashboard(props: EnhancedMonitoringProps): cloudwatch.Dashboard {
    return new cloudwatch.Dashboard(this, 'OperationalDashboard', {
      dashboardName: `Commentia-Operations-${props.stage}`,
      widgets: [
        // System Health Overview
        [this.createSystemHealthWidget(props)],

        // API Gateway Performance
        [this.createApiPerformanceWidget(props.restApi, props.stage)],

        // Lambda Performance Grid
        [this.createLambdaPerformanceWidget(props.lambdaFunctions, props.stage)],

        // Database Performance
        [this.createDatabasePerformanceWidget(props.tables, props.stage)],

        // WebSocket Performance (if exists)
        ...(props.webSocketApi
          ? [[this.createWebSocketPerformanceWidget(props.webSocketApi, props.stage)]]
          : []),

        // Error Analysis
        [this.createErrorAnalysisWidget(props)],

        // Infrastructure Costs (for production)
        ...(props.stage === 'prod' ? [[this.createCostAnalysisWidget(props.stage)]] : []),
      ],
    });
  }

  private createBusinessDashboard(props: EnhancedMonitoringProps): cloudwatch.Dashboard {
    return new cloudwatch.Dashboard(this, 'BusinessDashboard', {
      dashboardName: `Commentia-Business-${props.stage}`,
      widgets: [
        // Key Business Metrics
        [this.createBusinessMetricsWidget(props.stage)],

        // User Engagement
        [this.createUserEngagementWidget(props.stage)],

        // Room Activity
        [this.createRoomActivityWidget(props.stage)],

        // Content Metrics
        [this.createContentMetricsWidget(props.stage)],

        // Real-time Activity
        [this.createRealTimeActivityWidget(props.stage)],

        // Growth Metrics (for production)
        ...(props.stage === 'prod' ? [[this.createGrowthMetricsWidget(props.stage)]] : []),
      ],
    });
  }

  private createSystemHealthWidget(props: EnhancedMonitoringProps): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'System Health Overview',
      left: [
        // Overall API success rate
        new cloudwatch.MathExpression({
          expression: '100 - (error4xx + error5xx) / requests * 100',
          label: 'API Success Rate (%)',
          usingMetrics: {
            requests: new cloudwatch.Metric({
              namespace: 'AWS/ApiGateway',
              metricName: 'Count',
              dimensionsMap: { ApiName: props.restApi.restApiName },
              statistic: 'Sum',
            }),
            error4xx: new cloudwatch.Metric({
              namespace: 'AWS/ApiGateway',
              metricName: '4XXError',
              dimensionsMap: { ApiName: props.restApi.restApiName },
              statistic: 'Sum',
            }),
            error5xx: new cloudwatch.Metric({
              namespace: 'AWS/ApiGateway',
              metricName: '5XXError',
              dimensionsMap: { ApiName: props.restApi.restApiName },
              statistic: 'Sum',
            }),
          },
        }),

        // System availability
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'SystemAvailability',
          statistic: 'Average',
          label: 'System Availability (%)',
        }),
      ],
      right: [
        // Active connections
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ActiveConnections',
          statistic: 'Maximum',
          label: 'Active WebSocket Connections',
        }),

        // Active rooms
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ActiveRooms',
          statistic: 'Maximum',
          label: 'Active Rooms',
        }),
      ],
      width: 24,
      height: 6,
    });
  }

  private createApiPerformanceWidget(
    api: apigateway.RestApi,
    stage: string
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'API Gateway Performance',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Count',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'Sum',
          label: 'Total Requests',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'CacheHitCount',
          dimensionsMap: { ApiName: api.restApiName },
          statistic: 'Sum',
          label: 'Cache Hits',
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
          statistic: 'p99',
          label: 'P99 Latency',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createLambdaPerformanceWidget(
    functions: lambda.Function[],
    stage: string
  ): cloudwatch.GraphWidget {
    const invocationMetrics = functions.map(
      (fn) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: fn.functionName },
          statistic: 'Sum',
          label: `${fn.functionName} Invocations`,
        })
    );

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

    return new cloudwatch.GraphWidget({
      title: 'Lambda Performance',
      left: invocationMetrics,
      right: durationMetrics,
      width: 12,
      height: 6,
    });
  }

  private createDatabasePerformanceWidget(
    tables: dynamodb.Table[],
    stage: string
  ): cloudwatch.GraphWidget {
    const readMetrics = tables.map(
      (table) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedReadCapacityUnits',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          label: `${table.tableName} Read Units`,
        })
    );

    const writeMetrics = tables.map(
      (table) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedWriteCapacityUnits',
          dimensionsMap: { TableName: table.tableName },
          statistic: 'Sum',
          label: `${table.tableName} Write Units`,
        })
    );

    return new cloudwatch.GraphWidget({
      title: 'DynamoDB Performance',
      left: readMetrics,
      right: writeMetrics,
      width: 12,
      height: 6,
    });
  }

  private createWebSocketPerformanceWidget(
    webSocketApi: apigatewayv2.WebSocketApi,
    stage: string
  ): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'WebSocket Performance',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGatewayV2',
          metricName: 'Count',
          dimensionsMap: { ApiId: webSocketApi.apiId },
          statistic: 'Sum',
          label: 'WebSocket Messages',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'WebSocketConnections',
          statistic: 'Maximum',
          label: 'Active Connections',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGatewayV2',
          metricName: 'IntegrationLatency',
          dimensionsMap: { ApiId: webSocketApi.apiId },
          statistic: 'Average',
          label: 'Integration Latency',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'MessageDeliveryTime',
          statistic: 'Average',
          label: 'Message Delivery Time',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createErrorAnalysisWidget(props: EnhancedMonitoringProps): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Error Analysis',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '4XXError',
          dimensionsMap: { ApiName: props.restApi.restApiName },
          statistic: 'Sum',
          label: 'Client Errors (4XX)',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '5XXError',
          dimensionsMap: { ApiName: props.restApi.restApiName },
          statistic: 'Sum',
          label: 'Server Errors (5XX)',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ApplicationErrors',
          statistic: 'Sum',
          label: 'Application Errors',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ValidationErrors',
          statistic: 'Sum',
          label: 'Validation Errors',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createBusinessMetricsWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Key Business Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'RoomsCreated',
          statistic: 'Sum',
          label: 'Rooms Created',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'UniqueUsers',
          statistic: 'Maximum',
          label: 'Unique Users',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'CommentsPosted',
          statistic: 'Sum',
          label: 'Comments Posted',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'LikesGiven',
          statistic: 'Sum',
          label: 'Likes Given',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createUserEngagementWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'User Engagement',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'AverageSessionDuration',
          statistic: 'Average',
          label: 'Avg Session Duration (min)',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'UserRetentionRate',
          statistic: 'Average',
          label: 'User Retention Rate (%)',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'CommentsPerUser',
          statistic: 'Average',
          label: 'Avg Comments per User',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'LikesPerUser',
          statistic: 'Average',
          label: 'Avg Likes per User',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createRoomActivityWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Room Activity',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ActiveRooms',
          statistic: 'Maximum',
          label: 'Active Rooms',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'AverageRoomSize',
          statistic: 'Average',
          label: 'Avg Participants per Room',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'RoomLifetime',
          statistic: 'Average',
          label: 'Avg Room Duration (min)',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'PeakConcurrentUsers',
          statistic: 'Maximum',
          label: 'Peak Concurrent Users',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createContentMetricsWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Content Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'CommentsPerMinute',
          statistic: 'Average',
          label: 'Comments per Minute',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'LikesPerMinute',
          statistic: 'Average',
          label: 'Likes per Minute',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'CommentEngagementRate',
          statistic: 'Average',
          label: 'Comment Engagement Rate (%)',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ModerationActions',
          statistic: 'Sum',
          label: 'Moderation Actions',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createRealTimeActivityWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Real-time Activity',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'MessageThroughput',
          statistic: 'Sum',
          label: 'Messages per Second',
          period: cdk.Duration.seconds(60),
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ConnectionTurnover',
          statistic: 'Sum',
          label: 'Connection Turnover',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'LatencyP50',
          statistic: 'Average',
          label: 'Message Latency P50 (ms)',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'LatencyP95',
          statistic: 'Average',
          label: 'Message Latency P95 (ms)',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createCostAnalysisWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Infrastructure Costs (Estimated)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Billing',
          metricName: 'EstimatedCharges',
          dimensionsMap: { ServiceName: 'AmazonApiGateway' },
          statistic: 'Maximum',
          label: 'API Gateway Costs',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Billing',
          metricName: 'EstimatedCharges',
          dimensionsMap: { ServiceName: 'AWSLambda' },
          statistic: 'Maximum',
          label: 'Lambda Costs',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'AWS/Billing',
          metricName: 'EstimatedCharges',
          dimensionsMap: { ServiceName: 'AmazonDynamoDB' },
          statistic: 'Maximum',
          label: 'DynamoDB Costs',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Billing',
          metricName: 'EstimatedCharges',
          dimensionsMap: { ServiceName: 'AmazonCloudFront' },
          statistic: 'Maximum',
          label: 'CloudFront Costs',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createGrowthMetricsWidget(stage: string): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Growth Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'DailyActiveUsers',
          statistic: 'Maximum',
          label: 'Daily Active Users',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'WeeklyActiveUsers',
          statistic: 'Maximum',
          label: 'Weekly Active Users',
        }),
      ],
      right: [
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'UserGrowthRate',
          statistic: 'Average',
          label: 'User Growth Rate (%)',
        }),
        new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'ContentGrowthRate',
          statistic: 'Average',
          label: 'Content Growth Rate (%)',
        }),
      ],
      width: 12,
      height: 6,
    });
  }

  private createLogInsightsQueries(props: EnhancedMonitoringProps): logs.QueryDefinition[] {
    const queries: logs.QueryDefinition[] = [];

    // Error Analysis Query
    queries.push(
      new logs.QueryDefinition(this, 'ErrorAnalysisQuery', {
        queryDefinitionName: `commentia-error-analysis-${props.stage}`,
        queryString: `
fields @timestamp, level, message, errorName, errorMessage, errorStack, requestId, userId, roomId
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
      `,
        logGroups: props.lambdaFunctions.map((fn) =>
          logs.LogGroup.fromLogGroupName(
            this,
            `LogGroup-${fn.functionName}`,
            `/aws/lambda/${fn.functionName}`
          )
        ),
      })
    );

    // Performance Analysis Query
    queries.push(
      new logs.QueryDefinition(this, 'PerformanceAnalysisQuery', {
        queryDefinitionName: `commentia-performance-analysis-${props.stage}`,
        queryString: `
fields @timestamp, @duration, @requestId, action, duration_ms
| filter @type = "REPORT"
| stats avg(@duration), max(@duration), min(@duration) by bin(5m)
| sort @timestamp desc
      `,
        logGroups: props.lambdaFunctions.map((fn) =>
          logs.LogGroup.fromLogGroupName(
            this,
            `LogGroup-Performance-${fn.functionName}`,
            `/aws/lambda/${fn.functionName}`
          )
        ),
      })
    );

    // User Activity Query
    queries.push(
      new logs.QueryDefinition(this, 'UserActivityQuery', {
        queryDefinitionName: `commentia-user-activity-${props.stage}`,
        queryString: `
fields @timestamp, userId, userName, roomId, action, message
| filter action in ["user_joined", "user_left", "comment_posted", "like_added"]
| stats count() by userId, action
| sort @timestamp desc
      `,
        logGroups: props.lambdaFunctions.map((fn) =>
          logs.LogGroup.fromLogGroupName(
            this,
            `LogGroup-Activity-${fn.functionName}`,
            `/aws/lambda/${fn.functionName}`
          )
        ),
      })
    );

    // WebSocket Connection Analysis
    queries.push(
      new logs.QueryDefinition(this, 'WebSocketAnalysisQuery', {
        queryDefinitionName: `commentia-websocket-analysis-${props.stage}`,
        queryString: `
fields @timestamp, connectionId, roomId, action, message
| filter connectionId like /^[A-Za-z0-9_-]+$/
| stats count() by action, roomId
| sort @timestamp desc
      `,
        logGroups: props.lambdaFunctions.map((fn) =>
          logs.LogGroup.fromLogGroupName(
            this,
            `LogGroup-WebSocket-${fn.functionName}`,
            `/aws/lambda/${fn.functionName}`
          )
        ),
      })
    );

    // Security Events Query
    queries.push(
      new logs.QueryDefinition(this, 'SecurityEventsQuery', {
        queryDefinitionName: `commentia-security-events-${props.stage}`,
        queryString: `
fields @timestamp, level, message, requestId, userId, action
| filter level in ["WARN", "ERROR"] and (message like /rate.limit/ or message like /validation/ or message like /security/)
| sort @timestamp desc
| limit 100
      `,
        logGroups: props.lambdaFunctions.map((fn) =>
          logs.LogGroup.fromLogGroupName(
            this,
            `LogGroup-Security-${fn.functionName}`,
            `/aws/lambda/${fn.functionName}`
          )
        ),
      })
    );

    return queries;
  }

  private createEnhancedAlarms(props: EnhancedMonitoringProps): void {
    // System-wide availability alarm
    new cloudwatch.Alarm(this, 'SystemAvailabilityAlarm', {
      alarmName: `Commentia-SystemAvailability-${props.stage}`,
      alarmDescription: 'System availability has dropped below threshold',
      metric: new cloudwatch.Metric({
        namespace: 'Commentia',
        metricName: 'SystemAvailability',
        statistic: 'Average',
      }),
      threshold: props.stage === 'prod' ? 99.9 : 99.0,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.criticalAlarmTopic));

    // High error rate alarm
    new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: `Commentia-HighErrorRate-${props.stage}`,
      alarmDescription: 'Error rate is unusually high',
      metric: new cloudwatch.MathExpression({
        expression: '(error4xx + error5xx) / requests * 100',
        usingMetrics: {
          requests: new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiName: props.restApi.restApiName },
            statistic: 'Sum',
          }),
          error4xx: new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: props.restApi.restApiName },
            statistic: 'Sum',
          }),
          error5xx: new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: props.restApi.restApiName },
            statistic: 'Sum',
          }),
        },
      }),
      threshold: props.stage === 'prod' ? 5 : 10, // percentage
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

    // Business metrics alarms
    if (props.stage === 'prod') {
      // Low user engagement alarm
      new cloudwatch.Alarm(this, 'LowUserEngagementAlarm', {
        alarmName: `Commentia-LowUserEngagement-${props.stage}`,
        alarmDescription: 'User engagement is below normal levels',
        metric: new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'CommentsPerUser',
          statistic: 'Average',
        }),
        threshold: 0.5, // comments per user
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.alarmTopic));

      // Spike in room creation failures
      new cloudwatch.Alarm(this, 'RoomCreationFailureSpike', {
        alarmName: `Commentia-RoomCreationFailureSpike-${props.stage}`,
        alarmDescription: 'Unusual spike in room creation failures',
        metric: new cloudwatch.Metric({
          namespace: 'Commentia',
          metricName: 'RoomCreationFailures',
          statistic: 'Sum',
        }),
        threshold: 10,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.criticalAlarmTopic));
    }
  }

  private createCustomMetrics(props: EnhancedMonitoringProps): void {
    // Create Lambda environment variables for metric collection
    props.lambdaFunctions.forEach((fn) => {
      fn.addEnvironment('ENABLE_METRICS', 'true');
      fn.addEnvironment('METRICS_NAMESPACE', 'Commentia');
      fn.addEnvironment('STAGE', props.stage);
    });
  }
}
