import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { addLikeHandler, removeLikeHandler } from '../../src/handlers/like-handler.js';
import { likeService } from '../../src/services/like-service.js';
import { NotFoundError, RateLimitError } from '../../src/utils/error-handler.js';

// Mock likeService
jest.mock('../../src/services/like-service.js', () => ({
  likeService: {
    addLike: jest.fn(),
    removeLike: jest.fn(),
  },
}));

const mockLikeService = likeService as jest.Mocked<typeof likeService>;

// Helper function to create mock event
const createMockEvent = (
  body?: string,
  pathParameters?: Record<string, string | undefined>
): APIGatewayProxyEvent => ({
  body,
  pathParameters,
  queryStringParameters: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/likes',
  resource: '/likes',
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    httpMethod: 'POST',
    path: '/likes',
    stage: 'test',
    requestId: 'test-request-id',
    requestTime: '2023-01-01T00:00:00.000Z',
    requestTimeEpoch: 1672531200000,
    resourceId: 'test-resource',
    resourcePath: '/likes',
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

describe('Like Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addLikeHandler', () => {
    test('正常にいいねを追加できる', async () => {
      const mockResult = {
        success: true,
        likeCount: 5,
        message: 'Like added successfully',
      };

      mockLikeService.addLike.mockResolvedValue(mockResult);

      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
          userId: 'user-123',
          roomId: 'room-123',
        }),
        { roomId: 'room-123', commentId: 'comment-123' }
      );

      const result = await addLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toMatchObject(mockResult);
      expect(mockLikeService.addLike).toHaveBeenCalledWith({
        commentId: 'comment-123',
        userId: 'user-123',
        roomId: 'room-123',
      });
    });

    test('commentIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          userId: 'user-123',
          roomId: 'room-123',
        }),
        { roomId: 'room-123' }
      );

      const result = await addLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('userIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
          roomId: 'room-123',
        }),
        { roomId: 'room-123', commentId: 'comment-123' }
      );

      const result = await addLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('roomIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
          userId: 'user-123',
        }),
        { commentId: 'comment-123' }
      );

      const result = await addLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('存在しないコメントでNotFoundErrorを返す', async () => {
      mockLikeService.addLike.mockRejectedValue(new NotFoundError('Comment not found'));

      const event = createMockEvent(
        JSON.stringify({
          commentId: 'non-existent',
          userId: 'user-123',
          roomId: 'room-123',
        }),
        { roomId: 'room-123', commentId: 'non-existent' }
      );

      const result = await addLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('NOT_FOUND');
    });

    test('いいね制限に達した場合にRateLimitErrorを返す', async () => {
      mockLikeService.addLike.mockRejectedValue(new RateLimitError('Like limit exceeded'));

      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
          userId: 'user-123',
          roomId: 'room-123',
        }),
        { roomId: 'room-123', commentId: 'comment-123' }
      );

      const result = await addLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('removeLikeHandler', () => {
    test('正常にいいねを削除できる', async () => {
      const mockResult = {
        success: true,
        likeCount: 3,
        message: 'Like removed successfully',
      };

      mockLikeService.removeLike.mockResolvedValue(mockResult);

      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
          userId: 'user-123',
        }),
        { roomId: 'room-123', commentId: 'comment-123' }
      );

      const result = await removeLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject(mockResult);
      expect(mockLikeService.removeLike).toHaveBeenCalledWith({
        commentId: 'comment-123',
        userId: 'user-123',
      });
    });

    test('commentIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          userId: 'user-123',
        }),
        { roomId: 'room-123' }
      );

      const result = await removeLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('userIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
        }),
        { roomId: 'room-123', commentId: 'comment-123' }
      );

      const result = await removeLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('存在しないいいねでNotFoundErrorを返す', async () => {
      mockLikeService.removeLike.mockRejectedValue(new NotFoundError('Like not found'));

      const event = createMockEvent(
        JSON.stringify({
          commentId: 'comment-123',
          userId: 'user-123',
        }),
        { roomId: 'room-123', commentId: 'comment-123' }
      );

      const result = await removeLikeHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('NOT_FOUND');
    });
  });
});
