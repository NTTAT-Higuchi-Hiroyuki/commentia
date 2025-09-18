/**
 * QR Service - QRコード生成管理
 * ルーム参加用QRコードの生成とキャッシュ機能を提供
 */

import QRCode from 'qrcode';

// QR Service用型定義（独立定義）
interface GenerateQRCodeRequest {
  roomId: string;
  format?: 'png' | 'svg';
  size?: number;
}

interface GenerateQRCodeResponse {
  qrCodeData: string;
  format: 'png' | 'svg';
  url: string;
  expiresAt?: string;
}
import { validateRequired, validateString } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

interface QRCodeCache {
  data: string;
  format: 'png' | 'svg';
  expiresAt: number;
}

/**
 * QRコードキャッシュ - メモリベースの簡易キャッシュ
 * 本番環境ではRedisやDynamoDBでの実装を推奨
 */
const qrCodeCache = new Map<string, QRCodeCache>();

export class QRService {
  private readonly defaultSize = 200;
  private readonly cacheTTLMinutes = 30;
  private readonly baseUrl = process.env.FRONTEND_URL || 'https://commentia.example.com';

  /**
   * QRコード生成
   */
  async generateQRCode(request: GenerateQRCodeRequest): Promise<GenerateQRCodeResponse> {
    logger.info('QR code generation started', {
      roomId: request.roomId,
      format: request.format,
    });

    // バリデーション
    const roomId = validateRequired(validateString(request.roomId, 'roomId', 100), 'roomId');
    const format = request.format || 'png';
    const size = request.size || this.defaultSize;

    // バリデーション: サイズ制限
    if (size < 50 || size > 500) {
      throw new Error('QR code size must be between 50 and 500 pixels');
    }

    // キャッシュキー生成
    const cacheKey = `${roomId}_${format}_${size}`;

    // キャッシュチェック
    const cached = this.getCachedQRCode(cacheKey);
    if (cached) {
      logger.info('QR code served from cache', { roomId, format, size });
      return {
        qrCodeData: cached.data,
        format: cached.format,
        url: this.generateRoomUrl(roomId),
        expiresAt: new Date(cached.expiresAt).toISOString(),
      };
    }

    // ルーム参加URL生成
    const roomUrl = this.generateRoomUrl(roomId);

    // QRコード生成
    const qrCodeData = await this.generateQRCodeData(roomUrl, format, size);

    // キャッシュに保存
    this.cacheQRCode(cacheKey, qrCodeData, format);

    const response: GenerateQRCodeResponse = {
      qrCodeData,
      format,
      url: roomUrl,
      expiresAt: new Date(Date.now() + this.cacheTTLMinutes * 60 * 1000).toISOString(),
    };

    logger.info('QR code generated successfully', { roomId, format, size });
    return response;
  }

  /**
   * QRコードデータ生成（PNG/SVG対応）
   */
  private async generateQRCodeData(
    url: string,
    format: 'png' | 'svg',
    size: number
  ): Promise<string> {
    const options = {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    };

    if (format === 'svg') {
      // SVG形式で生成
      return await QRCode.toString(url, { ...options, type: 'svg' });
    }
    // PNG形式で生成（Base64エンコード）
    const buffer = await QRCode.toBuffer(url, { ...options, type: 'png' });
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  /**
   * ルーム参加URL生成
   */
  private generateRoomUrl(roomId: string): string {
    return `${this.baseUrl}/rooms/${roomId}`;
  }

  /**
   * キャッシュされたQRコード取得
   */
  private getCachedQRCode(cacheKey: string): QRCodeCache | null {
    const cached = qrCodeCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    // 期限切れチェック
    if (Date.now() > cached.expiresAt) {
      qrCodeCache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * QRコードをキャッシュに保存
   */
  private cacheQRCode(cacheKey: string, data: string, format: 'png' | 'svg'): void {
    const expiresAt = Date.now() + this.cacheTTLMinutes * 60 * 1000;
    qrCodeCache.set(cacheKey, {
      data,
      format,
      expiresAt,
    });

    // キャッシュサイズ制限（メモリリーク防止）
    if (qrCodeCache.size > 1000) {
      this.cleanupExpiredCache();
    }
  }

  /**
   * 期限切れキャッシュのクリーンアップ
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, cache] of qrCodeCache.entries()) {
      if (now > cache.expiresAt) {
        qrCodeCache.delete(key);
      }
    }
  }

  /**
   * キャッシュクリア（テスト用）
   */
  clearCache(): void {
    qrCodeCache.clear();
  }

  /**
   * キャッシュ統計取得（監視用）
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: qrCodeCache.size,
      keys: Array.from(qrCodeCache.keys()),
    };
  }
}

// シングルトンインスタンス
export const qrService = process.env.NODE_ENV === 'test' ? null : new QRService();
