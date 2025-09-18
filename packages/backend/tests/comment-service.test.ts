import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Comment, CommentItem, PostCommentRequest, RoomSettings } from '@commentia/shared';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { CommentService } from '../src/services/comment-service.js';
import {
  CommentiaError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../src/utils/error-handler.js';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('CommentService', () => {
  let commentService: CommentService;

  beforeEach(() => {
    dynamoMock.reset();
    commentService = new CommentService();
    jest.clearAllMocks();
  });

  describe('postComment', () => {
    const validRequest: PostCommentRequest = {
      roomId: 'room123',
      userId: 'user123',
      userName: 'TestUser',
      content: 'This is a test comment',
    };

    const mockRoomSettings: RoomSettings = {
      maxCommentsPerUser: 50,
      maxLikesPerUser: 100,
      commentMaxLength: 500,
    };

    test('正常にコメントを投稿できる', async () => {
      const mockCommentId = '1234567890-abcdef';

      jest.spyOn(commentService as any, 'validateCommentRequest').mockImplementation(() => {});
      jest.spyOn(commentService as any, 'sanitizeContent').mockReturnValue(validRequest.content);
      jest.spyOn(commentService as any, 'getRoomSettings').mockResolvedValue(mockRoomSettings);
      jest.spyOn(commentService as any, 'checkPostingLimits').mockResolvedValue(undefined);
      jest.spyOn(commentService as any, 'generateCommentId').mockReturnValue(mockCommentId);

      dynamoMock.on(PutCommand).resolves({});

      const result = await commentService.postComment(validRequest);

      expect(result).toMatchObject({
        commentId: mockCommentId,
        roomId: validRequest.roomId,
        userId: validRequest.userId,
        userName: validRequest.userName,
        content: validRequest.content,
        likeCount: 0,
      });

      expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = dynamoMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item).toMatchObject({
        PK: `ROOM#${validRequest.roomId}`,
        commentId: mockCommentId,
        roomId: validRequest.roomId,
        userId: validRequest.userId,
        userName: validRequest.userName,
        content: validRequest.content,
        likeCount: 0,
      });
    });

    test('XSS対策でHTMLタグがサニタイズされる', async () => {
      const maliciousRequest = {
        ...validRequest,
        content: '<script>alert("xss")</script>Test content',
      };

      jest.spyOn(commentService as any, 'validateCommentRequest').mockImplementation(() => {});
      jest.spyOn(commentService as any, 'getRoomSettings').mockResolvedValue(mockRoomSettings);
      jest.spyOn(commentService as any, 'checkPostingLimits').mockResolvedValue(undefined);
      jest.spyOn(commentService as any, 'generateCommentId').mockReturnValue('test-id');

      dynamoMock.on(PutCommand).resolves({});

      const result = await commentService.postComment(maliciousRequest);

      expect(result.content).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Test content'
      );
    });

    test('投稿制限に引っかかった場合にエラーを投げる', async () => {
      jest.spyOn(commentService as any, 'validateCommentRequest').mockImplementation(() => {});
      jest.spyOn(commentService as any, 'sanitizeContent').mockReturnValue(validRequest.content);
      jest.spyOn(commentService as any, 'getRoomSettings').mockResolvedValue(mockRoomSettings);
      jest
        .spyOn(commentService as any, 'checkPostingLimits')
        .mockRejectedValue(new RateLimitError('Maximum 50 comments per user allowed'));

      await expect(commentService.postComment(validRequest)).rejects.toThrow(RateLimitError);
    });

    test('存在しないルームでエラーを投げる', async () => {
      jest.spyOn(commentService as any, 'validateCommentRequest').mockImplementation(() => {});
      jest.spyOn(commentService as any, 'sanitizeContent').mockReturnValue(validRequest.content);
      jest
        .spyOn(commentService as any, 'getRoomSettings')
        .mockRejectedValue(new NotFoundError('Room'));

      await expect(commentService.postComment(validRequest)).rejects.toThrow(NotFoundError);
    });

    test('DynamoDBエラーでコメント投稿に失敗', async () => {
      jest.spyOn(commentService as any, 'validateCommentRequest').mockImplementation(() => {});
      jest.spyOn(commentService as any, 'sanitizeContent').mockReturnValue(validRequest.content);
      jest.spyOn(commentService as any, 'getRoomSettings').mockResolvedValue(mockRoomSettings);
      jest.spyOn(commentService as any, 'checkPostingLimits').mockResolvedValue(undefined);
      jest.spyOn(commentService as any, 'generateCommentId').mockReturnValue('test-id');

      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

      await expect(commentService.postComment(validRequest)).rejects.toThrow(CommentiaError);
    });
  });

  describe('getComments', () => {
    const roomId = 'room123';
    const mockCommentItem: CommentItem = {
      PK: `ROOM#${roomId}`,
      SK: 'COMMENT#1234567890123#comment123',
      GSI1PK: `ROOM#${roomId}`,
      GSI1SK: 'LIKES#0000000005#comment123',
      commentId: 'comment123',
      roomId,
      userId: 'user123',
      userName: 'TestUser',
      content: 'Test comment',
      timestamp: '2024-01-01T00:00:00.000Z',
      likeCount: 5,
      ttl: 1234567890,
    };

    test('新着順でコメント一覧を取得できる', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [mockCommentItem],
        LastEvaluatedKey: undefined,
      });

      const result = await commentService.getComments(roomId, 'latest', 50);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toEqual({
        commentId: 'comment123',
        roomId,
        userId: 'user123',
        userName: 'TestUser',
        content: 'Test comment',
        timestamp: '2024-01-01T00:00:00.000Z',
        likeCount: 5,
      });
      expect(result.nextCursor).toBeUndefined();

      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.KeyConditionExpression).toBe(
        'PK = :pk AND begins_with(SK, :sk)'
      );
      expect(queryCall.args[0].input.ScanIndexForward).toBe(false);
    });

    test('いいね順でコメント一覧を取得できる', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [mockCommentItem],
        LastEvaluatedKey: undefined,
      });

      const result = await commentService.getComments(roomId, 'likes', 50);

      expect(result.comments).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();

      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('LikeCountIndex');
      expect(queryCall.args[0].input.KeyConditionExpression).toBe(
        'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)'
      );
    });

    test('ページネーション用のカーソルが正しく処理される', async () => {
      const lastEvaluatedKey = {
        PK: 'ROOM#room123',
        SK: 'COMMENT#1234567890123#comment123',
      };
      const cursor = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockCommentItem],
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const result = await commentService.getComments(roomId, 'latest', 50, cursor);

      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor).toBe(cursor);

      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    test('無効なRoom IDでValidationErrorを投げる', async () => {
      await expect(commentService.getComments('')).rejects.toThrow(ValidationError);
    });

    test('DynamoDBエラーでコメント取得に失敗', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB Error'));

      await expect(commentService.getComments(roomId)).rejects.toThrow(CommentiaError);
    });
  });

  describe('deleteComment', () => {
    const commentId = 'comment123';
    const userId = 'user123';
    const mockComment: CommentItem = {
      PK: 'ROOM#room123',
      SK: 'COMMENT#1234567890123#comment123',
      GSI1PK: 'ROOM#room123',
      GSI1SK: 'LIKES#0000000005#comment123',
      commentId,
      roomId: 'room123',
      userId,
      userName: 'TestUser',
      content: 'Test comment',
      timestamp: '2024-01-01T00:00:00.000Z',
      likeCount: 5,
      ttl: 1234567890,
    };

    test('正常にコメントを削除できる', async () => {
      jest.spyOn(commentService as any, 'getCommentById').mockResolvedValue(mockComment);
      dynamoMock.on(DeleteCommand).resolves({});

      await commentService.deleteComment(commentId, userId);

      expect(dynamoMock.commandCalls(DeleteCommand)).toHaveLength(1);
      const deleteCall = dynamoMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input.Key).toEqual({
        PK: mockComment.PK,
        SK: mockComment.SK,
      });
      expect(deleteCall.args[0].input.ConditionExpression).toBe(
        'attribute_exists(PK) AND userId = :userId'
      );
    });

    test('作成者以外がコメント削除しようとするとエラーを投げる', async () => {
      const otherUserId = 'other456';
      jest.spyOn(commentService as any, 'getCommentById').mockResolvedValue(mockComment);

      await expect(commentService.deleteComment(commentId, otherUserId)).rejects.toThrow(
        new CommentiaError('Only comment author can delete the comment', 403, 'FORBIDDEN')
      );
    });

    test('存在しないコメントでNotFoundErrorを投げる', async () => {
      jest
        .spyOn(commentService as any, 'getCommentById')
        .mockRejectedValue(new NotFoundError('Comment'));

      await expect(commentService.deleteComment(commentId, userId)).rejects.toThrow(NotFoundError);
    });

    test('無効なパラメータでValidationErrorを投げる', async () => {
      await expect(commentService.deleteComment('', userId)).rejects.toThrow(ValidationError);
      await expect(commentService.deleteComment(commentId, '')).rejects.toThrow(ValidationError);
    });
  });

  describe('updateCommentLikeCount', () => {
    const commentId = 'comment123';
    const mockComment: CommentItem = {
      PK: 'ROOM#room123',
      SK: 'COMMENT#1234567890123#comment123',
      GSI1PK: 'ROOM#room123',
      GSI1SK: 'LIKES#0000000005#comment123',
      commentId,
      roomId: 'room123',
      userId: 'user123',
      userName: 'TestUser',
      content: 'Test comment',
      timestamp: '2024-01-01T00:00:00.000Z',
      likeCount: 5,
      ttl: 1234567890,
    };

    test('正常にいいね数を更新できる', async () => {
      const newLikeCount = 10;
      jest.spyOn(commentService as any, 'getCommentById').mockResolvedValue(mockComment);
      dynamoMock.on(UpdateCommand).resolves({});

      await commentService.updateCommentLikeCount(commentId, newLikeCount);

      expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(1);
      const updateCall = dynamoMock.commandCalls(UpdateCommand)[0];
      expect(updateCall.args[0].input.UpdateExpression).toBe(
        'SET likeCount = :likeCount, GSI1SK = :gsi1sk'
      );
      expect(updateCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':likeCount': newLikeCount,
        ':gsi1sk': `LIKES#0000000010#${commentId}`,
      });
    });

    test('存在しないコメントでエラーを投げる', async () => {
      jest
        .spyOn(commentService as any, 'getCommentById')
        .mockRejectedValue(new NotFoundError('Comment'));

      await expect(commentService.updateCommentLikeCount(commentId, 10)).rejects.toThrow(
        CommentiaError
      );
    });

    test('DynamoDBエラーでいいね数更新に失敗', async () => {
      jest.spyOn(commentService as any, 'getCommentById').mockResolvedValue(mockComment);
      dynamoMock.on(UpdateCommand).rejects(new Error('DynamoDB Error'));

      await expect(commentService.updateCommentLikeCount(commentId, 10)).rejects.toThrow(
        CommentiaError
      );
    });
  });

  describe('validateCommentRequest', () => {
    test('有効なリクエストで正常に処理される', () => {
      const validRequest: PostCommentRequest = {
        roomId: 'room123',
        userId: 'user123',
        userName: 'TestUser',
        content: 'Valid comment content',
      };

      expect(() => (commentService as any).validateCommentRequest(validRequest)).not.toThrow();
    });

    test('必須フィールドが不足している場合にValidationErrorを投げる', () => {
      const invalidRequests = [
        { roomId: '', userId: 'user123', userName: 'Test', content: 'Content' },
        { roomId: 'room123', userId: '', userName: 'Test', content: 'Content' },
        {
          roomId: 'room123',
          userId: 'user123',
          userName: '',
          content: 'Content',
        },
        { roomId: 'room123', userId: 'user123', userName: 'Test', content: '' },
      ];

      invalidRequests.forEach((request) => {
        expect(() => (commentService as any).validateCommentRequest(request)).toThrow(
          ValidationError
        );
      });
    });

    test('文字数制限を超えた場合にValidationErrorを投げる', () => {
      const longUserName = 'A'.repeat(51);
      const longContent = 'A'.repeat(501);

      const requestWithLongUserName = {
        roomId: 'room123',
        userId: 'user123',
        userName: longUserName,
        content: 'Content',
      };

      const requestWithLongContent = {
        roomId: 'room123',
        userId: 'user123',
        userName: 'Test',
        content: longContent,
      };

      expect(() => (commentService as any).validateCommentRequest(requestWithLongUserName)).toThrow(
        ValidationError
      );
      expect(() => (commentService as any).validateCommentRequest(requestWithLongContent)).toThrow(
        ValidationError
      );
    });
  });

  describe('sanitizeContent', () => {
    test('HTMLタグが正しくエスケープされる', () => {
      const input = '<script>alert("xss")</script>&Test"Content\'';
      const expected =
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;Test&quot;Content&#039;';

      const result = (commentService as any).sanitizeContent(input);

      expect(result).toBe(expected);
    });

    test('前後の空白が削除される', () => {
      const input = '  Test content  ';
      const expected = 'Test content';

      const result = (commentService as any).sanitizeContent(input);

      expect(result).toBe(expected);
    });
  });

  describe('generateCommentId', () => {
    test('ユニークなコメントIDを生成する', () => {
      const commentId1 = (commentService as any).generateCommentId();
      const commentId2 = (commentService as any).generateCommentId();

      expect(commentId1).not.toBe(commentId2);
      expect(commentId1).toMatch(/^\d+-[a-z0-9]+$/);
      expect(commentId2).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('checkPostingLimits', () => {
    const roomId = 'room123';
    const userId = 'user123';
    const settings: RoomSettings = {
      maxCommentsPerUser: 50,
      maxLikesPerUser: 100,
      commentMaxLength: 500,
    };

    test('制限内の場合は正常に処理される', async () => {
      jest.spyOn(commentService as any, 'getUserCommentCount').mockResolvedValue(10);
      jest.spyOn(commentService as any, 'getRecentUserComments').mockResolvedValue([]);

      await expect(
        (commentService as any).checkPostingLimits(roomId, userId, settings)
      ).resolves.toBeUndefined();
    });

    test('コメント数上限に達した場合にRateLimitErrorを投げる', async () => {
      jest.spyOn(commentService as any, 'getUserCommentCount').mockResolvedValue(50);

      await expect(
        (commentService as any).checkPostingLimits(roomId, userId, settings)
      ).rejects.toThrow(RateLimitError);
    });

    test('連続投稿制限に引っかかった場合にRateLimitErrorを投げる', async () => {
      const recentComment: Comment = {
        commentId: 'recent123',
        roomId,
        userId,
        userName: 'Test',
        content: 'Recent comment',
        timestamp: new Date(Date.now() - 15000).toISOString(), // 15秒前
        likeCount: 0,
      };

      jest.spyOn(commentService as any, 'getUserCommentCount').mockResolvedValue(10);
      jest.spyOn(commentService as any, 'getRecentUserComments').mockResolvedValue([recentComment]);

      await expect(
        (commentService as any).checkPostingLimits(roomId, userId, settings)
      ).rejects.toThrow(RateLimitError);
    });

    test('30秒以上前の投稿なら制限に引っかからない', async () => {
      const oldComment: Comment = {
        commentId: 'old123',
        roomId,
        userId,
        userName: 'Test',
        content: 'Old comment',
        timestamp: new Date(Date.now() - 35000).toISOString(), // 35秒前
        likeCount: 0,
      };

      jest.spyOn(commentService as any, 'getUserCommentCount').mockResolvedValue(10);
      jest.spyOn(commentService as any, 'getRecentUserComments').mockResolvedValue([oldComment]);

      await expect(
        (commentService as any).checkPostingLimits(roomId, userId, settings)
      ).resolves.toBeUndefined();
    });
  });

  describe('convertToComment', () => {
    test('CommentItemをCommentに正しく変換する', () => {
      const commentItem: CommentItem = {
        PK: 'ROOM#room123',
        SK: 'COMMENT#1234567890123#comment123',
        GSI1PK: 'ROOM#room123',
        GSI1SK: 'LIKES#0000000005#comment123',
        commentId: 'comment123',
        roomId: 'room123',
        userId: 'user123',
        userName: 'TestUser',
        content: 'Test comment',
        timestamp: '2024-01-01T00:00:00.000Z',
        likeCount: 5,
        ttl: 1234567890,
      };

      const result = (commentService as any).convertToComment(commentItem);

      expect(result).toEqual({
        commentId: 'comment123',
        roomId: 'room123',
        userId: 'user123',
        userName: 'TestUser',
        content: 'Test comment',
        timestamp: '2024-01-01T00:00:00.000Z',
        likeCount: 5,
      });

      // DynamoDB固有のフィールドは除外されることを確認
      expect(result).not.toHaveProperty('PK');
      expect(result).not.toHaveProperty('SK');
      expect(result).not.toHaveProperty('GSI1PK');
      expect(result).not.toHaveProperty('GSI1SK');
      expect(result).not.toHaveProperty('ttl');
    });
  });
});
