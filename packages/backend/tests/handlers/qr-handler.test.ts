import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { generateQRCodeHandler } from '../../src/handlers/qr-handler.js';
import { qrService } from '../../src/services/qr-service.js';

// Mock qrService
jest.mock('../../src/services/qr-service.js', () => ({
  qrService: {
    generateQRCode: jest.fn(),
  },
}));

const mockQrService = qrService as jest.Mocked<typeof qrService>;

// Helper function to create mock event
const createMockEvent = (
  body?: string,
  pathParameters?: Record<string, string | undefined>,
  queryStringParameters?: Record<string, string | undefined>
): APIGatewayProxyEvent => ({
  body,
  pathParameters,
  queryStringParameters,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/qr',
  resource: '/qr',
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    httpMethod: 'GET',
    path: '/qr',
    stage: 'test',
    requestId: 'test-request-id',
    requestTime: '2023-01-01T00:00:00.000Z',
    requestTimeEpoch: 1672531200000,
    resourceId: 'test-resource',
    resourcePath: '/qr',
    protocol: 'HTTP/1.1',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'test-agent',
      userArn: null,
      clientCert: null,
    },
    authorizer: null,
  },
  stageVariables: null,
});

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2023/01/01/[1]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('QR Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateQRCodeHandler', () => {
    test('正常にQRコードを生成できる（PNG形式）', async () => {
      const mockQRResult = {
        qrCodeData: 'base64-encoded-png-data',
        format: 'png' as const,
        url: 'https://example.com/room/123',
      };

      mockQrService.generateQRCode.mockResolvedValue(mockQRResult);

      const event = createMockEvent(
        undefined,
        { roomId: 'room-123' },
        {
          format: 'png',
          size: '200',
        }
      );

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject(mockQRResult);
      expect(mockQrService.generateQRCode).toHaveBeenCalledWith({
        roomId: 'room-123',
        format: 'png',
        size: 200,
      });
    });

    test('正常にQRコードを生成できる（SVG形式）', async () => {
      const mockQRResult = {
        qrCodeData: '<svg>...</svg>',
        format: 'svg' as const,
        url: 'https://example.com/room/123',
      };

      mockQrService.generateQRCode.mockResolvedValue(mockQRResult);

      const event = createMockEvent(
        undefined,
        { roomId: 'room-123' },
        {
          format: 'svg',
        }
      );

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.headers).toMatchObject({
        'Content-Type': 'image/svg+xml',
      });
      expect(result.isBase64Encoded).toBeUndefined();
      expect(result.body).toBe(mockQRResult.qrCodeData);
      expect(mockQrService.generateQRCode).toHaveBeenCalledWith({
        roomId: 'room-123',
        format: 'svg',
        size: undefined,
      });
    });

    test('roomIdパラメータが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        undefined,
        {},
        {
          format: 'png',
        }
      );

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INVALID_INPUT');
    });

    test('無効なformatでValidationErrorを返す', async () => {
      const event = createMockEvent(
        undefined,
        { roomId: 'room-123' },
        {
          format: 'invalid',
        }
      );

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INVALID_INPUT');
    });

    test('無効なsizeでValidationErrorを返す', async () => {
      const event = createMockEvent(
        undefined,
        { roomId: 'room-123' },
        {
          format: 'png',
          size: 'invalid',
        }
      );

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INVALID_INPUT');
    });

    test('デフォルト値が正しく適用される', async () => {
      const mockQRResult = {
        qrCodeData: 'base64-encoded-png-data',
        format: 'png' as const,
        url: 'https://example.com/room/123',
      };

      mockQrService.generateQRCode.mockResolvedValue(mockQRResult);

      const event = createMockEvent(undefined, { roomId: 'room-123' });

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockQrService.generateQRCode).toHaveBeenCalledWith({
        roomId: 'room-123',
        format: 'png',
        size: undefined,
      });
    });

    test('QRサービスでエラーが発生した場合にエラーレスポンスを返す', async () => {
      mockQrService.generateQRCode.mockRejectedValue(new Error('QR generation failed'));

      const event = createMockEvent(undefined, { roomId: 'room-123' });

      const result = await generateQRCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });
});
