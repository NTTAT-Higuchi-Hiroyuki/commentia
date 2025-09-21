import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { logger } from './logger.js';

interface MetricData {
  metricName: string;
  value: number;
  unit?: 'Count' | 'Seconds' | 'Milliseconds' | 'Percent' | 'Bytes' | 'Rate';
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

class MetricsCollector {
  private cloudwatch: CloudWatchClient;
  private namespace = 'Commentia';
  private stage: string;
  private enabled: boolean;

  constructor() {
    this.stage = process.env.STAGE || 'dev';
    this.enabled = process.env.ENABLE_METRICS === 'true';
    this.cloudwatch = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.IS_LOCAL === 'true' && {
        endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test',
        },
      }),
    });
  }

  /**
   * 単一メトリクスの送信
   */
  async putMetric(metric: MetricData): Promise<void> {
    if (!this.enabled) {
      logger.debug('Metrics disabled, skipping metric:', metric);
      return;
    }

    try {
      if (process.env.IS_LOCAL === 'true' && this.stage === 'dev') {
        // ローカル環境では実際の送信を行わずログ出力のみ
        logger.info('Metric (local):', metric);
        return;
      }

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metric.metricName,
            Value: metric.value,
            Unit: metric.unit || 'Count',
            Timestamp: metric.timestamp || new Date(),
            Dimensions: metric.dimensions
              ? Object.entries(metric.dimensions).map(([name, value]) => ({
                  Name: name,
                  Value: value,
                }))
              : undefined,
          },
        ],
      });

      await this.cloudwatch.send(command);
      logger.debug('Metric sent successfully:', metric.metricName);
    } catch (error) {
      logger.error('Failed to send metric:', error, { metric });
      // メトリクス送信の失敗は本体の処理を阻害しないようにする
    }
  }

  /**
   * 複数メトリクスの送信
   */
  async putMetrics(metrics: MetricData[]): Promise<void> {
    if (!this.enabled) {
      logger.debug('Metrics disabled, skipping metrics batch');
      return;
    }

    try {
      if (process.env.IS_LOCAL === 'true' && this.stage === 'dev') {
        logger.info('Metrics batch (local):', metrics);
        return;
      }

      // CloudWatchは一度に20個のメトリクスまで送信可能
      const chunks = this.chunkArray(metrics, 20);

      for (const chunk of chunks) {
        const command = new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: chunk.map((metric) => ({
            MetricName: metric.metricName,
            Value: metric.value,
            Unit: metric.unit || 'Count',
            Timestamp: metric.timestamp || new Date(),
            Dimensions: metric.dimensions
              ? Object.entries(metric.dimensions).map(([name, value]) => ({
                  Name: name,
                  Value: value,
                }))
              : undefined,
          })),
        });

        await this.cloudwatch.send(command);
      }
      logger.debug(`Sent ${metrics.length} metrics in ${chunks.length} chunks`);
    } catch (error) {
      logger.error('Failed to send metrics batch:', error, {
        count: metrics.length,
      });
    }
  }

  /**
   * ビジネスメトリクス: ルーム作成
   */
  async recordRoomCreated(roomId: string, hostId?: string): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'RoomsCreated',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
          ...(hostId && { HostId: hostId }),
        },
      },
      {
        metricName: 'ActiveRooms',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      },
    ];

    await this.putMetrics(metrics);
  }

  /**
   * ビジネスメトリクス: ルーム終了
   */
  async recordRoomClosed(
    roomId: string,
    durationSeconds: number,
    participantCount: number
  ): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'RoomsClosed',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
      {
        metricName: 'RoomLifetime',
        value: durationSeconds,
        unit: 'Seconds',
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
      {
        metricName: 'AverageRoomSize',
        value: participantCount,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
    ];

    await this.putMetrics(metrics);
  }

  /**
   * ビジネスメトリクス: ルーム作成失敗
   */
  async recordRoomCreationFailure(errorType: string): Promise<void> {
    await this.putMetric({
      metricName: 'RoomCreationFailures',
      value: 1,
      dimensions: {
        Stage: this.stage,
        ErrorType: errorType,
      },
    });
  }

  /**
   * ビジネスメトリクス: ユーザー参加
   */
  async recordUserJoined(roomId: string, userId: string, userName: string): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'UserJoined',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
          UserId: userId,
        },
      },
      {
        metricName: 'ActiveConnections',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      },
      {
        metricName: 'UniqueUsers',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      },
    ];

    await this.putMetrics(metrics);
  }

  /**
   * ビジネスメトリクス: ユーザー退出
   */
  async recordUserLeft(roomId: string, userId: string, sessionDuration: number): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'UserLeft',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
          UserId: userId,
        },
      },
      {
        metricName: 'AverageSessionDuration',
        value: sessionDuration,
        unit: 'Seconds',
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
    ];

    await this.putMetrics(metrics);
  }

  /**
   * ビジネスメトリクス: アクティブルーム数
   */
  async recordActiveRooms(count: number): Promise<void> {
    await this.putMetric({
      metricName: 'ActiveRooms',
      value: count,
      unit: 'Count',
      dimensions: {
        Stage: this.stage,
      },
    });
  }

  /**
   * ビジネスメトリクス: 接続ユーザー数
   */
  async recordConnectedUsers(roomId: string, count: number): Promise<void> {
    await this.putMetrics([
      {
        metricName: 'ConnectedUsers',
        value: count,
        unit: 'Count',
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
      {
        metricName: 'PeakConcurrentUsers',
        value: count,
        unit: 'Count',
        dimensions: {
          Stage: this.stage,
        },
      },
    ]);
  }

  /**
   * ビジネスメトリクス: コメント投稿
   */
  async recordCommentPosted(roomId: string, userId: string, commentLength?: number): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'CommentsPosted',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
          UserId: userId,
        },
      },
      {
        metricName: 'CommentsPerMinute',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      },
    ];

    if (commentLength) {
      metrics.push({
        metricName: 'AverageCommentLength',
        value: commentLength,
        unit: 'Count',
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      });
    }

    await this.putMetrics(metrics);
  }

  /**
   * ビジネスメトリクス: いいね追加
   */
  async recordLikeAdded(roomId: string, commentId: string, userId: string): Promise<void> {
    await this.putMetrics([
      {
        metricName: 'LikesGiven',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
          CommentId: commentId,
          UserId: userId,
        },
      },
      {
        metricName: 'LikesPerMinute',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      },
    ]);
  }

  /**
   * エンゲージメントメトリクス
   */
  async recordUserEngagement(
    roomId: string,
    userId: string,
    metrics: {
      commentsCount: number;
      likesGiven: number;
      likesReceived: number;
      sessionDuration: number;
    }
  ): Promise<void> {
    const engagementScore =
      metrics.commentsCount * 2 +
      metrics.likesGiven * 1 +
      metrics.likesReceived * 1.5 +
      Math.min(metrics.sessionDuration / 60, 30); // 最大30点

    await this.putMetrics([
      {
        metricName: 'UserEngagementScore',
        value: engagementScore,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
          UserId: userId,
        },
      },
      {
        metricName: 'CommentsPerUser',
        value: metrics.commentsCount,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
      {
        metricName: 'LikesPerUser',
        value: metrics.likesGiven,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
    ]);
  }

  /**
   * ビジネスメトリクス: WebSocket接続失敗
   */
  async recordWebSocketConnectionFailure(errorType: string, roomId?: string): Promise<void> {
    await this.putMetric({
      metricName: 'WebSocketConnectionFailures',
      value: 1,
      dimensions: {
        Stage: this.stage,
        ErrorType: errorType,
        ...(roomId && { RoomId: roomId }),
      },
    });
  }

  /**
   * WebSocket メトリクス
   */
  async recordWebSocketActivity(
    action: 'connect' | 'disconnect' | 'message',
    roomId?: string
  ): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'WebSocketConnections',
        value: action === 'connect' ? 1 : action === 'disconnect' ? -1 : 0,
        dimensions: {
          Stage: this.stage,
          Action: action,
          ...(roomId && { RoomId: roomId }),
        },
      },
    ];

    if (action === 'message') {
      metrics.push({
        metricName: 'MessageThroughput',
        value: 1,
        dimensions: {
          Stage: this.stage,
          ...(roomId && { RoomId: roomId }),
        },
      });
    }

    if (action === 'disconnect') {
      metrics.push({
        metricName: 'ConnectionTurnover',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      });
    }

    await this.putMetrics(metrics);
  }

  /**
   * ビジネスメトリクス: 疑わしいコメント活動
   */
  async recordSuspiciousCommentActivity(
    roomId: string,
    activityType: string,
    userId?: string
  ): Promise<void> {
    await this.putMetric({
      metricName: 'SuspiciousCommentActivity',
      value: 1,
      dimensions: {
        Stage: this.stage,
        RoomId: roomId,
        ActivityType: activityType,
        ...(userId && { UserId: userId }),
      },
    });
  }

  /**
   * パフォーマンスメトリクス: API応答時間
   */
  async recordApiResponseTime(
    functionName: string,
    duration: number,
    statusCode?: number
  ): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'ApiResponseTime',
        value: duration,
        unit: 'Milliseconds',
        dimensions: {
          Stage: this.stage,
          FunctionName: functionName,
          ...(statusCode && { StatusCode: statusCode.toString() }),
        },
      },
      {
        metricName: 'LatencyP50',
        value: duration,
        unit: 'Milliseconds',
        dimensions: {
          Stage: this.stage,
        },
      },
      {
        metricName: 'LatencyP95',
        value: duration,
        unit: 'Milliseconds',
        dimensions: {
          Stage: this.stage,
        },
      },
    ];

    await this.putMetrics(metrics);
  }

  /**
   * パフォーマンスメトリクス: WebSocket メッセージ配信時間
   */
  async recordMessageDeliveryTime(
    roomId: string,
    messageType: string,
    duration: number
  ): Promise<void> {
    await this.putMetric({
      metricName: 'MessageDeliveryTime',
      value: duration,
      unit: 'Milliseconds',
      dimensions: {
        Stage: this.stage,
        RoomId: roomId,
        MessageType: messageType,
      },
    });
  }

  /**
   * パフォーマンスメトリクス: DynamoDB操作時間
   */
  async recordDynamoDBOperationTime(
    operation: string,
    tableName: string,
    duration: number
  ): Promise<void> {
    await this.putMetric({
      metricName: 'DynamoDBOperationTime',
      value: duration,
      unit: 'Milliseconds',
      dimensions: {
        Stage: this.stage,
        Operation: operation,
        TableName: tableName,
      },
    });
  }

  /**
   * エラーメトリクス: アプリケーションエラー
   */
  async recordApplicationError(errorType: string, functionName?: string): Promise<void> {
    await this.putMetric({
      metricName: 'ApplicationErrors',
      value: 1,
      dimensions: {
        Stage: this.stage,
        ErrorType: errorType,
        ...(functionName && { FunctionName: functionName }),
      },
    });
  }

  /**
   * エラーメトリクス: ビジネスロジックエラー
   */
  async recordBusinessLogicError(functionName: string, errorType: string): Promise<void> {
    await this.putMetric({
      metricName: 'BusinessLogicErrors',
      value: 1,
      dimensions: {
        Stage: this.stage,
        FunctionName: functionName,
        ErrorType: errorType,
      },
    });
  }

  /**
   * エラーメトリクス: バリデーションエラー
   */
  async recordValidationError(field: string, errorType: string): Promise<void> {
    await this.putMetric({
      metricName: 'ValidationErrors',
      value: 1,
      dimensions: {
        Stage: this.stage,
        Field: field,
        ErrorType: errorType,
      },
    });
  }

  /**
   * システムメトリクス: 可用性
   */
  async recordSystemAvailability(isAvailable: boolean): Promise<void> {
    await this.putMetric({
      metricName: 'SystemAvailability',
      value: isAvailable ? 100 : 0,
      unit: 'Percent',
      dimensions: {
        Stage: this.stage,
      },
    });
  }

  /**
   * 成長メトリクス
   */
  async recordGrowthMetrics(dailyActiveUsers: number, weeklyActiveUsers?: number): Promise<void> {
    const metrics: MetricData[] = [
      {
        metricName: 'DailyActiveUsers',
        value: dailyActiveUsers,
        dimensions: {
          Stage: this.stage,
        },
      },
    ];

    if (weeklyActiveUsers) {
      metrics.push({
        metricName: 'WeeklyActiveUsers',
        value: weeklyActiveUsers,
        dimensions: {
          Stage: this.stage,
        },
      });
    }

    await this.putMetrics(metrics);
  }

  /**
   * カスタムメトリクス送信（汎用）
   */
  async recordCustomMetric(
    metricName: string,
    value: number,
    unit?: MetricData['unit'],
    dimensions?: Record<string, string>
  ): Promise<void> {
    await this.putMetric({
      metricName,
      value,
      unit,
      dimensions: {
        Stage: this.stage,
        ...dimensions,
      },
    });
  }

  /**
   * タイマー機能：処理時間測定
   */
  startTimer(operationName: string): () => Promise<void> {
    const startTime = Date.now();
    return async () => {
      const duration = Date.now() - startTime;
      await this.putMetric({
        metricName: 'OperationDuration',
        value: duration,
        unit: 'Milliseconds',
        dimensions: {
          Stage: this.stage,
          Operation: operationName,
        },
      });
    };
  }

  /**
   * 配列を指定サイズのチャンクに分割
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// シングルトンインスタンス
export const metrics = new MetricsCollector();

/**
 * Lambda関数でのメトリクス計測用デコレータ
 */
export function withMetrics<T extends (...args: any[]) => Promise<any>>(
  functionName: string,
  originalFunction: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    let error: Error | null = null;
    let statusCode = 200;

    try {
      const result = await originalFunction(...args);
      // Lambdaレスポンスからステータスコードを抽出
      if (result && typeof result === 'object' && 'statusCode' in result) {
        statusCode = result.statusCode;
      }
      return result;
    } catch (err) {
      error = err as Error;
      statusCode = 500;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // 応答時間の記録
      await metrics.recordApiResponseTime(functionName, duration, statusCode);

      // エラーの記録
      if (error) {
        await metrics.recordBusinessLogicError(functionName, error.name || 'UnknownError');
      }

      // システム可用性の記録
      await metrics.recordSystemAvailability(statusCode < 500);
    }
  }) as T;
}

/**
 * DynamoDB操作の計測用ヘルパー
 */
export async function measureDynamoDBOperation<T>(
  operation: string,
  tableName: string,
  operationFunction: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operationFunction();
    return result;
  } finally {
    const duration = Date.now() - startTime;
    await metrics.recordDynamoDBOperationTime(operation, tableName, duration);
  }
}

/**
 * WebSocket操作の計測用ヘルパー
 */
export async function measureWebSocketOperation<T>(
  operationType: string,
  roomId: string,
  operationFunction: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operationFunction();
    return result;
  } finally {
    const duration = Date.now() - startTime;
    await metrics.recordMessageDeliveryTime(roomId, operationType, duration);
  }
}

export default metrics;
