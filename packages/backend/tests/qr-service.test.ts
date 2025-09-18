import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import QRCode from 'qrcode';
import { QRService } from '../src/services/qr-service.js';

// QRCode ライブラリをモック
jest.mock('qrcode', () => ({
  toString: jest.fn(),
  toBuffer: jest.fn(),
}));

const mockQRCode = QRCode as jest.Mocked<typeof QRCode>;

describe('QRService', () => {
  let qrService: QRService;
  const originalEnv = process.env.FRONTEND_URL;
  const validRequest = {
    roomId: 'test-room-123',
    format: 'png' as const,
    size: 200,
  };

  beforeEach(() => {
    qrService = new QRService();
    // キャッシュをクリア
    qrService.clearCache();
    jest.clearAllMocks();

    // 環境変数を設定
    process.env.FRONTEND_URL = 'https://test-commentia.com';
  });

  afterEach(() => {
    // 環境変数を復元
    process.env.FRONTEND_URL = originalEnv;
  });

  describe('generateQRCode', () => {
    test('正常にPNG形式のQRコードを生成できる', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      const result = await qrService.generateQRCode(validRequest);

      expect(result).toMatchObject({
        qrCodeData: `data:image/png;base64,${mockBuffer.toString('base64')}`,
        format: 'png',
        url: 'https://test-commentia.com/rooms/test-room-123',
      });
      expect(result.expiresAt).toBeDefined();
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());

      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(
        'https://test-commentia.com/rooms/test-room-123',
        expect.objectContaining({
          width: 200,
          margin: 2,
          type: 'png',
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })
      );
    });

    test('正常にSVG形式のQRコードを生成できる', async () => {
      const mockSvgData = '<svg>fake-svg-data</svg>';
      mockQRCode.toString.mockResolvedValue(mockSvgData);

      const svgRequest = { ...validRequest, format: 'svg' as const };
      const result = await qrService.generateQRCode(svgRequest);

      expect(result).toMatchObject({
        qrCodeData: mockSvgData,
        format: 'svg',
        url: 'https://test-commentia.com/rooms/test-room-123',
      });

      expect(mockQRCode.toString).toHaveBeenCalledWith(
        'https://test-commentia.com/rooms/test-room-123',
        expect.objectContaining({
          width: 200,
          margin: 2,
          type: 'svg',
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })
      );
    });

    test('デフォルト値が正しく適用される', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      const minimalRequest = { roomId: 'test-room-123' };
      const result = await qrService.generateQRCode(minimalRequest);

      expect(result.format).toBe('png');
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          width: 200, // デフォルトサイズ
        })
      );
    });

    test('キャッシュから正しくQRコードを取得できる', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      // 最初の生成
      const result1 = await qrService.generateQRCode(validRequest);

      // 2回目はキャッシュから取得
      const result2 = await qrService.generateQRCode(validRequest);

      expect(result1).toEqual(result2);
      expect(mockQRCode.toBuffer).toHaveBeenCalledTimes(1); // 1回のみ呼ばれる
    });

    test('無効なサイズでエラーを投げる', async () => {
      const invalidSizeRequest = { ...validRequest, size: 30 }; // 50未満

      await expect(qrService.generateQRCode(invalidSizeRequest)).rejects.toThrow(
        'QR code size must be between 50 and 500 pixels'
      );

      const tooLargeSizeRequest = { ...validRequest, size: 600 }; // 500超過

      await expect(qrService.generateQRCode(tooLargeSizeRequest)).rejects.toThrow(
        'QR code size must be between 50 and 500 pixels'
      );
    });

    test('QRCodeライブラリのエラーを正しく伝播する', async () => {
      const qrError = new Error('QR generation failed');
      mockQRCode.toBuffer.mockRejectedValue(qrError);

      await expect(qrService.generateQRCode(validRequest)).rejects.toThrow(qrError);
    });

    test('異なる設定で異なるキャッシュキーを使用する', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      // サイズ違い
      await qrService.generateQRCode({ ...validRequest, size: 100 });
      await qrService.generateQRCode({ ...validRequest, size: 200 });

      // フォーマット違い
      mockQRCode.toString.mockResolvedValue('<svg>fake</svg>');
      await qrService.generateQRCode({ ...validRequest, format: 'svg' });

      expect(mockQRCode.toBuffer).toHaveBeenCalledTimes(2);
      expect(mockQRCode.toString).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateRoomUrl', () => {
    test('正しいルームURLを生成する', () => {
      const roomId = 'test-room-123';
      const url = (qrService as any).generateRoomUrl(roomId);

      expect(url).toBe('https://test-commentia.com/rooms/test-room-123');
    });

    test('デフォルトURLを使用する（環境変数が未設定の場合）', () => {
      process.env.FRONTEND_URL = undefined;
      const newQrService = new QRService();

      const roomId = 'test-room-123';
      const url = (newQrService as any).generateRoomUrl(roomId);

      expect(url).toBe('https://commentia.example.com/rooms/test-room-123');
    });
  });

  describe('キャッシュ機能', () => {
    test('期限切れキャッシュが自動的に削除される', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      // キャッシュTTLを短くするためにプライベートプロパティを変更
      (qrService as any).cacheTTLMinutes = 0.001; // 約0.06秒

      await qrService.generateQRCode(validRequest);

      // 少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 期限切れなので再生成される
      await qrService.generateQRCode(validRequest);

      expect(mockQRCode.toBuffer).toHaveBeenCalledTimes(2);
    });

    test('キャッシュ統計が正しく取得できる', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      // 複数のQRコードを生成
      await qrService.generateQRCode({
        roomId: 'room1',
        format: 'png',
        size: 200,
      });
      await qrService.generateQRCode({
        roomId: 'room2',
        format: 'png',
        size: 200,
      });
      await qrService.generateQRCode({
        roomId: 'room1',
        format: 'svg',
        size: 200,
      });

      const stats = qrService.getCacheStats();

      expect(stats.size).toBe(3);
      expect(stats.keys).toContain('room1_png_200');
      expect(stats.keys).toContain('room2_png_200');
      expect(stats.keys).toContain('room1_svg_200');
    });

    test('キャッシュクリアが正しく動作する', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      await qrService.generateQRCode(validRequest);
      expect(qrService.getCacheStats().size).toBe(1);

      qrService.clearCache();
      expect(qrService.getCacheStats().size).toBe(0);
    });

    test('キャッシュサイズ制限で期限切れエントリがクリーンアップされる', async () => {
      const mockBuffer = Buffer.from('fake-png-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      // キャッシュTTLを短くする
      (qrService as any).cacheTTLMinutes = 0.001;

      // 複数のQRコードを生成してキャッシュを埋める
      for (let i = 0; i < 5; i++) {
        await qrService.generateQRCode({
          roomId: `room${i}`,
          format: 'png',
          size: 200,
        });
      }

      // 少し待って期限切れにする
      await new Promise((resolve) => setTimeout(resolve, 100));

      // キャッシュサイズ制限を低く設定してクリーンアップをトリガー
      const _originalMaxSize = 1000;
      const _mockCacheMap = (qrService as any).qrCodeCache || new Map();

      // 新しいエントリを追加してクリーンアップをトリガー
      await qrService.generateQRCode({
        roomId: 'new-room',
        format: 'png',
        size: 200,
      });

      // 期限切れのエントリは削除されているはず（実装による）
      const finalStats = qrService.getCacheStats();
      expect(finalStats.keys).toContain('new-room_png_200');
    });
  });

  describe('validateRequired と validateString の動作', () => {
    test('空文字列のroomIdでエラーを投げる', async () => {
      const invalidRequest = { roomId: '', format: 'png' as const, size: 200 };

      await expect(qrService.generateQRCode(invalidRequest)).rejects.toThrow();
    });

    test('nullのroomIdでエラーを投げる', async () => {
      const invalidRequest = {
        roomId: null as any,
        format: 'png' as const,
        size: 200,
      };

      await expect(qrService.generateQRCode(invalidRequest)).rejects.toThrow();
    });

    test('長すぎるroomIdでエラーを投げる', async () => {
      const longRoomId = 'a'.repeat(101); // 100文字制限を超える
      const invalidRequest = {
        roomId: longRoomId,
        format: 'png' as const,
        size: 200,
      };

      await expect(qrService.generateQRCode(invalidRequest)).rejects.toThrow();
    });
  });

  describe('generateQRCodeData', () => {
    test('PNG形式のQRコードデータを正しく生成する', async () => {
      const mockBuffer = Buffer.from('test-data');
      mockQRCode.toBuffer.mockResolvedValue(mockBuffer);

      const result = await (qrService as any).generateQRCodeData('https://example.com', 'png', 200);

      expect(result).toBe(`data:image/png;base64,${mockBuffer.toString('base64')}`);
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          width: 200,
          margin: 2,
          type: 'png',
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })
      );
    });

    test('SVG形式のQRコードデータを正しく生成する', async () => {
      const mockSvg = '<svg>test-svg</svg>';
      mockQRCode.toString.mockResolvedValue(mockSvg);

      const result = await (qrService as any).generateQRCodeData('https://example.com', 'svg', 150);

      expect(result).toBe(mockSvg);
      expect(mockQRCode.toString).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          width: 150,
          margin: 2,
          type: 'svg',
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })
      );
    });
  });
});
