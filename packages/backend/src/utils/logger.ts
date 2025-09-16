/**
 * 構造化ログユーティリティ
 * CloudWatch Logs Insights で検索しやすいJSON形式のログを出力
 */

interface LogContext {
  requestId?: string;
  userId?: string;
  roomId?: string;
  connectionId?: string;
  action?: string;
  [key: string]: unknown;
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private context: LogContext = {};
  private stage: string;

  constructor() {
    this.stage = process.env.STAGE || 'dev';
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      stage: this.stage,
      message,
      ...this.context,
    };

    if (data) {
      logEntry.data = data;
    }

    // 構造化ログ出力（CloudWatch Logs Insights対応）
    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, data?: unknown): void {
    if (this.stage !== 'prod') {
      this.log(LogLevel.DEBUG, message, data);
    }
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    let errorData: Record<string, unknown>;

    if (error instanceof Error) {
      errorData = {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      };
      if (data && typeof data === 'object') {
        Object.assign(errorData, data);
      }
    } else {
      errorData = { error };
      if (data && typeof data === 'object') {
        Object.assign(errorData, data);
      }
    }

    this.log(LogLevel.ERROR, message, errorData);
  }

  /**
   * Lambda関数の実行時間を計測
   */
  startTimer(label: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info(`${label} completed`, { duration_ms: duration });
    };
  }

  /**
   * メトリクスログ出力（CloudWatch Metrics用）
   */
  metric(name: string, value: number, unit = 'Count'): void {
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: new Date().getTime(),
          CloudWatchMetrics: [
            {
              Namespace: 'Commentia',
              Dimensions: [['Stage'], ['FunctionName']],
              Metrics: [
                {
                  Name: name,
                  Unit: unit,
                },
              ],
            },
          ],
        },
        Stage: this.stage,
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
        [name]: value,
      })
    );
  }
}

// シングルトンインスタンス
export const logger = new Logger();
