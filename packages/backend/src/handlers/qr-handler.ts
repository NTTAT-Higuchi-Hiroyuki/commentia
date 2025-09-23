/**
 * QR Handler - QRコード生成API用Lambda関数
 * REST API経由でQRコード生成機能を提供
 */

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
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { qrService } from '../services/qr-service.js';
import {
  createApiResponse,
  validateRequired,
  validateString,
  withErrorHandling,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

/**
 * QRコード生成ハンドラー
 * GET /rooms/{roomId}/qr
 */
export const generateQRCodeHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'generateQRCode',
    });

    logger.info('QR code generation started');

    // パスパラメータからroomIdを取得
    const roomId = validateRequired(
      validateString(event.pathParameters?.roomId || '', 'roomId', 100),
      'roomId'
    );

    // クエリパラメータから形式とサイズを取得
    const format = (event.queryStringParameters?.format as 'png' | 'svg') || 'png';
    const sizeParam = event.queryStringParameters?.size;
    const size = sizeParam ? Number.parseInt(sizeParam, 10) : undefined;

    // バリデーション: 形式
    if (format !== 'png' && format !== 'svg') {
      return createApiResponse(400, {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Format must be either "png" or "svg"',
          details: { format },
        },
      });
    }

    // バリデーション: サイズ
    if (size !== undefined && (Number.isNaN(size) || size < 50 || size > 500)) {
      return createApiResponse(400, {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Size must be a number between 50 and 500',
          details: { size: sizeParam },
        },
      });
    }

    // リクエスト構築
    const request: GenerateQRCodeRequest = {
      roomId,
      format,
      ...(size !== undefined && { size }),
    };

    // QRコード生成
    if (!qrService) {
      throw new Error('QR service not available');
    }
    const qrCode = await qrService.generateQRCode(request);

    const response: GenerateQRCodeResponse = qrCode;

    logger.info('QR code generated successfully', {
      roomId,
      format,
      size,
      cacheHit: !!qrCode.expiresAt,
    });

    // SVGの場合はContent-Typeを設定
    const headers: Record<string, string> = {
      'Cache-Control': 'public, max-age=1800', // 30分キャッシュ
    };

    if (format === 'svg') {
      headers['Content-Type'] = 'image/svg+xml';
      // SVGデータをそのまま返す
      return {
        statusCode: 200,
        headers,
        body: qrCode.qrCodeData,
      };
    }
    // PNGの場合はJSONレスポンスで返す
    return createApiResponse(200, {
      success: true,
      data: response,
    });
  }
);

/**
 * QRコードキャッシュ統計取得ハンドラー（管理者用）
 * GET /admin/qr/stats
 */
export const getQRCacheStatsHandler = withErrorHandling(
  async (_event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'getQRCacheStats',
    });

    logger.info('QR cache stats requested');

    // キャッシュ統計取得
    if (!qrService) {
      throw new Error('QR service not available');
    }
    const stats = qrService.getCacheStats();

    logger.info('QR cache stats retrieved', stats);

    return createApiResponse(200, {
      success: true,
      data: stats,
    });
  }
);

/**
 * QRコードキャッシュクリアハンドラー（管理者用）
 * DELETE /admin/qr/cache
 */
export const clearQRCacheHandler = withErrorHandling(
  async (_event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'clearQRCache',
    });

    logger.info('QR cache clear requested');

    // キャッシュクリア
    if (!qrService) {
      throw new Error('QR service not available');
    }
    qrService.clearCache();

    logger.info('QR cache cleared successfully');

    return createApiResponse(200, {
      success: true,
      data: { message: 'Cache cleared successfully' },
    });
  }
);
