import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  deleteCommentHandler,
  getCommentsHandler,
  postCommentHandler,
} from '../../src/handlers/comment-handler.js';
import { commentService } from '../../src/services/comment-service.js';
import { NotFoundError } from '../../src/utils/error-handler.js';

// Mock commentService
jest.mock('../../src/services/comment-service.js', () => ({
  commentService: {
    postComment: jest.fn(),
    getComments: jest.fn(),
    deleteComment: jest.fn(),
  },
}));

const mockCommentService = commentService as jest.Mocked<typeof commentService>;

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
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/comments',
  resource: '/comments',
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    httpMethod: 'POST',
    path: '/comments',
    stage: 'test',
    requestId: 'test-request-id',
    requestTime: '2023-01-01T00:00:00.000Z',
    requestTimeEpoch: 1672531200000,
    resourceId: 'test-resource',
    resourcePath: '/comments',
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

describe('Comment Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('postCommentHandler', () => {
    test('正常にコメントを投稿できる', async () => {
      const mockComment = {
        commentId: 'comment-123',
        roomId: 'room-123',
        userId: 'user-123',
        userName: 'Test User',
        content: 'Test comment',
        likeCount: 0,
        postedAt: '2023-01-01T00:00:00.000Z',
      };

      mockCommentService.postComment.mockResolvedValue(mockComment);

      const event = createMockEvent(
        JSON.stringify({
          roomId: 'room-123',
          userId: 'user-123',
          userName: 'Test User',
          content: 'Test comment',
        }),
        { roomId: 'room-123' }
      );

      const result = await postCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toMatchObject({ comment: mockComment });
      expect(mockCommentService.postComment).toHaveBeenCalledWith({
        roomId: 'room-123',
        userId: 'user-123',
        userName: 'Test User',
        content: 'Test comment',
      });
    });

    test('roomIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          userId: 'user-123',
          userName: 'Test User',
          content: 'Test comment',
        }),
        {}
      );

      const result = await postCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('userIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          roomId: 'room-123',
          userName: 'Test User',
          content: 'Test comment',
        }),
        { roomId: 'room-123' }
      );

      const result = await postCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('contentが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(
        JSON.stringify({
          roomId: 'room-123',
          userId: 'user-123',
          userName: 'Test User',
        }),
        { roomId: 'room-123' }
      );

      const result = await postCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('getCommentsHandler', () => {
    test('正常にコメント一覧を取得できる', async () => {
      const mockComments = [
        {
          commentId: 'comment-1',
          roomId: 'room-123',
          userId: 'user-1',
          userName: 'User 1',
          content: 'Comment 1',
          likeCount: 5,
          postedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          commentId: 'comment-2',
          roomId: 'room-123',
          userId: 'user-2',
          userName: 'User 2',
          content: 'Comment 2',
          likeCount: 3,
          postedAt: '2023-01-01T00:01:00.000Z',
        },
      ];

      mockCommentService.getComments.mockResolvedValue({
        comments: mockComments,
        nextCursor: undefined,
      });

      const event = createMockEvent(undefined, { roomId: 'room-123' }, undefined);

      const result = await getCommentsHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        comments: mockComments,
      });
      expect(mockCommentService.getComments).toHaveBeenCalledWith(
        'room-123',
        'latest',
        50,
        undefined
      );
    });

    test('roomIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(undefined, {});

      const result = await getCommentsHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('limitとlastKeyパラメータを正しく処理できる', async () => {
      const mockComments: any[] = [];

      mockCommentService.getComments.mockResolvedValue({
        comments: mockComments,
        nextCursor: undefined,
      });

      const event = createMockEvent(
        undefined,
        { roomId: 'room-123' },
        { limit: '20', cursor: 'last-key-123' }
      );

      const result = await getCommentsHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockCommentService.getComments).toHaveBeenCalledWith(
        'room-123',
        'latest',
        20,
        'last-key-123'
      );
    });
  });

  describe('deleteCommentHandler', () => {
    test('正常にコメントを削除できる', async () => {
      mockCommentService.deleteComment.mockResolvedValue();

      const event = createMockEvent(JSON.stringify({ userId: 'user-123' }), {
        roomId: 'room-123',
        commentId: 'comment-123',
      });

      const result = await deleteCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ success: true });
      expect(mockCommentService.deleteComment).toHaveBeenCalledWith('comment-123', 'user-123');
    });

    test('commentIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(JSON.stringify({ userId: 'user-123' }), {
        roomId: 'room-123',
      });

      const result = await deleteCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('userIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(JSON.stringify({}), {
        roomId: 'room-123',
        commentId: 'comment-123',
      });

      const result = await deleteCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('存在しないコメントでNotFoundErrorを返す', async () => {
      mockCommentService.deleteComment.mockRejectedValue(new NotFoundError('Comment not found'));

      const event = createMockEvent(JSON.stringify({ userId: 'user-123' }), {
        roomId: 'room-123',
        commentId: 'non-existent',
      });

      const result = await deleteCommentHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('NOT_FOUND');
    });
  });
});
