import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

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

  constructor() {
    this.stage = process.env.STAGE || 'dev';
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
    try {
      if (process.env.IS_LOCAL === 'true' && this.stage === 'dev') {
        // ローカル環境では実際の送信を行わずログ出力のみ
        console.log('Metric (local):', JSON.stringify(metric, null, 2));
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
    } catch (error) {
      console.error('Failed to send metric:', error);
      // メトリクス送信の失敗は本体の処理を阻害しないようにする
    }
  }

  /**
   * 複数メトリクスの送信
   */
  async putMetrics(metrics: MetricData[]): Promise<void> {
    try {
      if (process.env.IS_LOCAL === 'true' && this.stage === 'dev') {
        console.log('Metrics (local):', JSON.stringify(metrics, null, 2));
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
    } catch (error) {
      console.error('Failed to send metrics:', error);
    }
  }

  /**
   * ビジネスメトリクス: ルーム作成
   */
  async recordRoomCreated(roomId: string): Promise<void> {
    await this.putMetric({
      metricName: 'RoomCreated',
      value: 1,
      dimensions: {
        Stage: this.stage,
        RoomId: roomId,
      },
    });
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
        metricName: 'ConnectedUsers',
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
  async recordCommentPosted(roomId: string): Promise<void> {
    await this.putMetrics([
      {
        metricName: 'CommentsPerMinute',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
        },
      },
      {
        metricName: 'CommentsPerMinute',
        value: 1,
        dimensions: {
          Stage: this.stage,
        },
      },
    ]);
  }

  /**
   * ビジネスメトリクス: いいね追加
   */
  async recordLikeAdded(roomId: string, _commentId: string): Promise<void> {
    await this.putMetrics([
      {
        metricName: 'LikesPerMinute',
        value: 1,
        dimensions: {
          Stage: this.stage,
          RoomId: roomId,
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
   * ビジネスメトリクス: WebSocket接続失敗
   */
  async recordWebSocketConnectionFailure(errorType: string): Promise<void> {
    await this.putMetric({
      metricName: 'WebSocketConnectionFailures',
      value: 1,
      dimensions: {
        Stage: this.stage,
        ErrorType: errorType,
      },
    });
  }

  /**
   * ビジネスメトリクス: 疑わしいコメント活動
   */
  async recordSuspiciousCommentActivity(roomId: string, activityType: string): Promise<void> {
    await this.putMetric({
      metricName: 'SuspiciousCommentActivity',
      value: 1,
      dimensions: {
        Stage: this.stage,
        RoomId: roomId,
        ActivityType: activityType,
      },
    });
  }

  /**
   * パフォーマンスメトリクス: API応答時間
   */
  async recordApiResponseTime(functionName: string, duration: number): Promise<void> {
    await this.putMetric({
      metricName: 'ApiResponseTime',
      value: duration,
      unit: 'Milliseconds',
      dimensions: {
        Stage: this.stage,
        FunctionName: functionName,
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

    try {
      const result = await originalFunction(...args);
      return result;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // 応答時間の記録
      await metrics.recordApiResponseTime(functionName, duration);

      // エラーの記録
      if (error) {
        await metrics.recordBusinessLogicError(functionName, error.name || 'UnknownError');
      }
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

export default metrics;
