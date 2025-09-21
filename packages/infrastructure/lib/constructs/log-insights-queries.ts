import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface LogInsightsQueriesProps {
  stage: 'dev' | 'staging' | 'prod';
  lambdaFunctions: string[]; // Function names
}

export class LogInsightsQueries extends Construct {
  public readonly queryDefinitions: logs.QueryDefinition[];

  constructor(scope: Construct, id: string, props: LogInsightsQueriesProps) {
    super(scope, id);

    this.queryDefinitions = [
      // Error Analysis Queries
      this.createErrorAnalysisQuery(props),
      this.createErrorTrendQuery(props),
      this.createCriticalErrorQuery(props),

      // Performance Analysis Queries
      this.createPerformanceAnalysisQuery(props),
      this.createSlowRequestsQuery(props),
      this.createLatencyTrendQuery(props),

      // Business Analytics Queries
      this.createUserActivityQuery(props),
      this.createRoomAnalyticsQuery(props),
      this.createEngagementMetricsQuery(props),

      // WebSocket Analysis Queries
      this.createWebSocketAnalysisQuery(props),
      this.createConnectionIssuesQuery(props),
      this.createMessageThroughputQuery(props),

      // Security Analysis Queries
      this.createSecurityEventsQuery(props),
      this.createRateLimitingQuery(props),
      this.createSuspiciousActivityQuery(props),

      // Infrastructure Analysis Queries
      this.createResourceUsageQuery(props),
      this.createColdStartAnalysisQuery(props),
      this.createDynamoDBPerformanceQuery(props),

      // Troubleshooting Queries
      this.createRequestTracingQuery(props),
      this.createCorrelationQuery(props),
      this.createHealthCheckQuery(props),
    ];
  }

  /**
   * エラー分析クエリ - 一般的なエラーパターンの分析
   */
  private createErrorAnalysisQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'ErrorAnalysisQuery', {
      queryDefinitionName: `commentia-error-analysis-${props.stage}`,
      queryString: `
fields @timestamp, level, message, errorName, errorMessage, errorStack, requestId, userId, roomId, functionName
| filter level = "ERROR"
| stats count() as ErrorCount by errorName, functionName
| sort ErrorCount desc
| limit 50
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * エラートレンド分析 - 時系列でのエラー発生状況
   */
  private createErrorTrendQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'ErrorTrendQuery', {
      queryDefinitionName: `commentia-error-trend-${props.stage}`,
      queryString: `
fields @timestamp, level, errorName, functionName
| filter level = "ERROR"
| stats count() as ErrorCount by bin(5m), errorName
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * 重要なエラー - システムに影響する重大なエラー
   */
  private createCriticalErrorQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'CriticalErrorQuery', {
      queryDefinitionName: `commentia-critical-errors-${props.stage}`,
      queryString: `
fields @timestamp, level, message, errorName, errorMessage, errorStack, requestId, functionName
| filter level = "ERROR" and (errorName like /Timeout/ or errorName like /OutOfMemory/ or errorName like /Lambda/ or message like /500/)
| sort @timestamp desc
| limit 100
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * パフォーマンス分析 - 実行時間とレスポンス時間の分析
   */
  private createPerformanceAnalysisQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'PerformanceAnalysisQuery', {
      queryDefinitionName: `commentia-performance-analysis-${props.stage}`,
      queryString: `
fields @timestamp, @duration, @requestId, action, duration_ms, functionName
| filter @type = "REPORT"
| stats avg(@duration) as AvgDuration, max(@duration) as MaxDuration, min(@duration) as MinDuration, count() as RequestCount by functionName, bin(5m)
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * 遅いリクエスト - パフォーマンス問題の特定
   */
  private createSlowRequestsQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'SlowRequestsQuery', {
      queryDefinitionName: `commentia-slow-requests-${props.stage}`,
      queryString: `
fields @timestamp, @duration, @requestId, message, requestId, userId, roomId, functionName
| filter @type = "REPORT" and @duration > 5000
| sort @duration desc
| limit 50
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * レイテンシトレンド - 時系列でのレスポンス時間分析
   */
  private createLatencyTrendQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'LatencyTrendQuery', {
      queryDefinitionName: `commentia-latency-trend-${props.stage}`,
      queryString: `
fields @timestamp, @duration, functionName
| filter @type = "REPORT"
| stats avg(@duration) as AvgLatency, pct(@duration, 95) as P95Latency, pct(@duration, 99) as P99Latency by bin(5m), functionName
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * ユーザーアクティビティ分析 - ユーザー行動の分析
   */
  private createUserActivityQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'UserActivityQuery', {
      queryDefinitionName: `commentia-user-activity-${props.stage}`,
      queryString: `
fields @timestamp, userId, userName, roomId, action, message
| filter action in ["user_joined", "user_left", "comment_posted", "like_added"]
| stats count() as ActionCount by userId, action, roomId
| sort ActionCount desc
| limit 100
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * ルーム分析 - ルームの利用状況と統計
   */
  private createRoomAnalyticsQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'RoomAnalyticsQuery', {
      queryDefinitionName: `commentia-room-analytics-${props.stage}`,
      queryString: `
fields @timestamp, roomId, action, userId, message
| filter roomId like /^room_/
| stats count() as ActivityCount, count_distinct(userId) as UniqueUsers by roomId, bin(1h)
| sort ActivityCount desc
| limit 50
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * エンゲージメントメトリクス - ユーザーエンゲージメントの分析
   */
  private createEngagementMetricsQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'EngagementMetricsQuery', {
      queryDefinitionName: `commentia-engagement-metrics-${props.stage}`,
      queryString: `
fields @timestamp, userId, roomId, action
| filter action in ["comment_posted", "like_added"]
| stats count() as TotalActions,
        sum(case action when "comment_posted" then 1 else 0 end) as Comments,
        sum(case action when "like_added" then 1 else 0 end) as Likes
        by userId, roomId
| limit 100
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * WebSocket分析 - WebSocket接続とメッセージングの分析
   */
  private createWebSocketAnalysisQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'WebSocketAnalysisQuery', {
      queryDefinitionName: `commentia-websocket-analysis-${props.stage}`,
      queryString: `
fields @timestamp, connectionId, roomId, action, message
| filter connectionId like /^[A-Za-z0-9_=-]+$/
| stats count() as MessageCount by action, roomId, bin(5m)
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * 接続問題 - WebSocket接続エラーと切断の分析
   */
  private createConnectionIssuesQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'ConnectionIssuesQuery', {
      queryDefinitionName: `commentia-connection-issues-${props.stage}`,
      queryString: `
fields @timestamp, level, message, connectionId, roomId, errorName
| filter (level = "ERROR" and connectionId like /^[A-Za-z0-9_=-]+$/) or message like /disconnect/ or message like /connection/
| sort @timestamp desc
| limit 100
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * メッセージスループット - WebSocketメッセージのスループット分析
   */
  private createMessageThroughputQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'MessageThroughputQuery', {
      queryDefinitionName: `commentia-message-throughput-${props.stage}`,
      queryString: `
fields @timestamp, roomId, messageType
| filter messageType in ["comment_new", "like_updated", "user_joined", "user_left"]
| stats count() as MessageCount by messageType, bin(1m)
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * セキュリティイベント - セキュリティ関連のログ分析
   */
  private createSecurityEventsQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'SecurityEventsQuery', {
      queryDefinitionName: `commentia-security-events-${props.stage}`,
      queryString: `
fields @timestamp, level, message, requestId, userId, action
| filter level in ["WARN", "ERROR"] and (message like /rate.limit/ or message like /validation/ or message like /security/ or message like /suspicious/)
| sort @timestamp desc
| limit 100
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * レート制限 - レート制限イベントの分析
   */
  private createRateLimitingQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'RateLimitingQuery', {
      queryDefinitionName: `commentia-rate-limiting-${props.stage}`,
      queryString: `
fields @timestamp, userId, roomId, message, action
| filter message like /rate.limit/ or message like /throttle/ or message like /429/
| stats count() as ViolationCount by userId, roomId, bin(5m)
| sort ViolationCount desc
| limit 50
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * 疑わしいアクティビティ - 異常なユーザー行動の検出
   */
  private createSuspiciousActivityQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'SuspiciousActivityQuery', {
      queryDefinitionName: `commentia-suspicious-activity-${props.stage}`,
      queryString: `
fields @timestamp, userId, roomId, action, message
| filter message like /suspicious/ or action like /spam/
| stats count() as SuspiciousCount by userId, roomId, action
| sort SuspiciousCount desc
| limit 50
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * リソース使用量 - メモリとCPU使用量の分析
   */
  private createResourceUsageQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'ResourceUsageQuery', {
      queryDefinitionName: `commentia-resource-usage-${props.stage}`,
      queryString: `
fields @timestamp, @maxMemoryUsed, @memorySize, @duration, functionName
| filter @type = "REPORT"
| stats avg(@maxMemoryUsed) as AvgMemoryUsed, max(@maxMemoryUsed) as MaxMemoryUsed, avg(@duration) as AvgDuration by functionName, bin(15m)
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * コールドスタート分析 - Lambda関数のコールドスタート状況
   */
  private createColdStartAnalysisQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'ColdStartAnalysisQuery', {
      queryDefinitionName: `commentia-cold-start-analysis-${props.stage}`,
      queryString: `
fields @timestamp, @initDuration, @duration, @requestId, functionName
| filter @type = "REPORT" and @initDuration > 0
| stats count() as ColdStarts, avg(@initDuration) as AvgInitDuration, avg(@duration) as AvgTotalDuration by functionName, bin(1h)
| sort ColdStarts desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * DynamoDBパフォーマンス - データベース操作の分析
   */
  private createDynamoDBPerformanceQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'DynamoDBPerformanceQuery', {
      queryDefinitionName: `commentia-dynamodb-performance-${props.stage}`,
      queryString: `
fields @timestamp, tableName, operation, duration_ms, message
| filter message like /DynamoDB/ or tableName like /commentia/
| stats avg(duration_ms) as AvgDuration, max(duration_ms) as MaxDuration, count() as OperationCount by tableName, operation, bin(5m)
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * リクエストトレーシング - 特定のリクエストの追跡
   */
  private createRequestTracingQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'RequestTracingQuery', {
      queryDefinitionName: `commentia-request-tracing-${props.stage}`,
      queryString: `
fields @timestamp, @requestId, level, message, action, functionName
| filter @requestId like /REQUEST_ID_PLACEHOLDER/
| sort @timestamp asc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * 相関分析 - 関連するイベントの分析
   */
  private createCorrelationQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'CorrelationQuery', {
      queryDefinitionName: `commentia-correlation-analysis-${props.stage}`,
      queryString: `
fields @timestamp, userId, roomId, action, functionName, message
| filter userId like /USER_ID_PLACEHOLDER/ or roomId like /ROOM_ID_PLACEHOLDER/
| sort @timestamp asc
| limit 200
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * ヘルスチェック - システムの全体的な健全性
   */
  private createHealthCheckQuery(props: LogInsightsQueriesProps): logs.QueryDefinition {
    return new logs.QueryDefinition(this, 'HealthCheckQuery', {
      queryDefinitionName: `commentia-health-check-${props.stage}`,
      queryString: `
fields @timestamp, level, message, functionName
| filter level in ["INFO", "WARN", "ERROR"]
| stats count() as LogCount by level, functionName, bin(5m)
| sort @timestamp desc
      `,
      logGroups: this.getLogGroups(props.lambdaFunctions),
    });
  }

  /**
   * Lambda関数名からLogGroupオブジェクトを作成
   */
  private getLogGroups(functionNames: string[]): logs.ILogGroup[] {
    return functionNames.map((functionName) =>
      logs.LogGroup.fromLogGroupName(
        this,
        `LogGroup-${functionName}`,
        `/aws/lambda/${functionName}`
      )
    );
  }
}

/**
 * 事前定義されたクエリテンプレート
 */
export const QUERY_TEMPLATES = {
  /**
   * カスタムエラー検索クエリ
   */
  CUSTOM_ERROR_SEARCH: `
fields @timestamp, level, message, errorName, errorMessage, requestId, userId, roomId
| filter level = "ERROR" and message like /SEARCH_TERM/
| sort @timestamp desc
| limit 100
  `,

  /**
   * ユーザー固有のアクティビティ追跡
   */
  USER_ACTIVITY_TRACE: `
fields @timestamp, action, message, roomId, functionName
| filter userId = "USER_ID"
| sort @timestamp asc
| limit 200
  `,

  /**
   * ルーム固有のイベント追跡
   */
  ROOM_EVENT_TRACE: `
fields @timestamp, action, userId, userName, message, functionName
| filter roomId = "ROOM_ID"
| sort @timestamp asc
| limit 200
  `,

  /**
   * パフォーマンス問題の特定
   */
  PERFORMANCE_INVESTIGATION: `
fields @timestamp, @duration, @requestId, message, functionName
| filter @duration > THRESHOLD_MS
| sort @duration desc
| limit 50
  `,

  /**
   * WebSocket接続問題の診断
   */
  WEBSOCKET_DIAGNOSTICS: `
fields @timestamp, connectionId, action, message, errorName
| filter connectionId = "CONNECTION_ID"
| sort @timestamp asc
| limit 100
  `,
};
