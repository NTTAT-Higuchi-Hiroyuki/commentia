import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  AddLikeRequest,
  AddLikeResponse,
  LikeItem,
  RemoveLikeRequest,
  RemoveLikeResponse,
} from '@commentia/shared';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { LikeService } from '../src/services/like-service.js';
import {
  CommentiaError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../src/utils/error-handler.js';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('LikeService', () => {
  let likeService: LikeService;

  beforeEach(() => {
    dynamoMock.reset();
    likeService = new LikeService();
    jest.clearAllMocks();
  });

  describe('addLike', () => {
    const validRequest: AddLikeRequest = {
      commentId: 'comment123',
      userId: 'user123',
      roomId: 'room123',
    };

    const _mockRoomSettings = {
      settings: {
        maxLikesPerUser: 100,
        maxCommentsPerUser: 50,
        commentMaxLength: 500,
      },
    };

    test('正常にいいねを追加できる', async () => {
      jest.spyOn(likeService as any, 'validateLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'validateCommentExists').mockResolvedValue(undefined);
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(null);
      jest.spyOn(likeService as any, 'checkLikeLimits').mockResolvedValue(undefined);
      jest.spyOn(likeService as any, 'updateCommentLikeCount').mockResolvedValue(5);

      dynamoMock.on(PutCommand).resolves({});

      const result = await likeService.addLike(validRequest);

      expect(result).toEqual({
        success: true,
        likeCount: 5,
        message: 'Like added successfully',
      });

      expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = dynamoMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item).toMatchObject({
        PK: `LIKE#${validRequest.commentId}`,
        SK: `USER#${validRequest.userId}`,
        commentId: validRequest.commentId,
        userId: validRequest.userId,
        roomId: validRequest.roomId,
      });
      expect(putCall.args[0].input.ConditionExpression).toBe('attribute_not_exists(PK)');
    });

    test('既にいいねしている場合にエラーを投げる', async () => {
      const existingLike: LikeItem = {
        PK: `LIKE#${validRequest.commentId}`,
        SK: `USER#${validRequest.userId}`,
        GSI1PK: `USER#${validRequest.userId}#ROOM#${validRequest.roomId}`,
        GSI1SK: 'LIKE#2024-01-01T00:00:00.000Z',
        commentId: validRequest.commentId,
        userId: validRequest.userId,
        roomId: validRequest.roomId,
        likedAt: '2024-01-01T00:00:00.000Z',
        ttl: 1234567890,
      };

      jest.spyOn(likeService as any, 'validateLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'validateCommentExists').mockResolvedValue(undefined);
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(existingLike);

      await expect(likeService.addLike(validRequest)).rejects.toThrow(
        new ValidationError('You have already liked this comment')
      );
    });

    test('存在しないコメントでエラーを投げる', async () => {
      jest.spyOn(likeService as any, 'validateLikeRequest').mockImplementation(() => {});
      jest
        .spyOn(likeService as any, 'validateCommentExists')
        .mockRejectedValue(new NotFoundError('Comment not found'));

      await expect(likeService.addLike(validRequest)).rejects.toThrow(NotFoundError);
    });

    test('いいね数制限に達している場合にエラーを投げる', async () => {
      jest.spyOn(likeService as any, 'validateLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'validateCommentExists').mockResolvedValue(undefined);
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(null);
      jest
        .spyOn(likeService as any, 'checkLikeLimits')
        .mockRejectedValue(new RateLimitError('Maximum 100 likes per user allowed'));

      await expect(likeService.addLike(validRequest)).rejects.toThrow(RateLimitError);
    });

    test('DynamoDBのConditionalCheckFailedExceptionで重複エラーを投げる', async () => {
      jest.spyOn(likeService as any, 'validateLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'validateCommentExists').mockResolvedValue(undefined);
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(null);
      jest.spyOn(likeService as any, 'checkLikeLimits').mockResolvedValue(undefined);

      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';
      dynamoMock.on(PutCommand).rejects(conditionalError);

      await expect(likeService.addLike(validRequest)).rejects.toThrow(
        new ValidationError('You have already liked this comment')
      );
    });

    test('DynamoDBエラーでいいね追加に失敗', async () => {
      jest.spyOn(likeService as any, 'validateLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'validateCommentExists').mockResolvedValue(undefined);
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(null);
      jest.spyOn(likeService as any, 'checkLikeLimits').mockResolvedValue(undefined);

      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

      await expect(likeService.addLike(validRequest)).rejects.toThrow(CommentiaError);
    });
  });

  describe('removeLike', () => {
    const validRequest: RemoveLikeRequest = {
      commentId: 'comment123',
      userId: 'user123',
    };

    const existingLike: LikeItem = {
      PK: `LIKE#${validRequest.commentId}`,
      SK: `USER#${validRequest.userId}`,
      GSI1PK: `USER#${validRequest.userId}#ROOM#room123`,
      GSI1SK: 'LIKE#2024-01-01T00:00:00.000Z',
      commentId: validRequest.commentId,
      userId: validRequest.userId,
      roomId: 'room123',
      likedAt: '2024-01-01T00:00:00.000Z',
      ttl: 1234567890,
    };

    test('正常にいいねを取消できる', async () => {
      jest.spyOn(likeService as any, 'validateRemoveLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(existingLike);
      jest.spyOn(likeService as any, 'updateCommentLikeCount').mockResolvedValue(3);

      dynamoMock.on(DeleteCommand).resolves({});

      const result = await likeService.removeLike(validRequest);

      expect(result).toEqual({
        success: true,
        likeCount: 3,
        message: 'Like removed successfully',
      });

      expect(dynamoMock.commandCalls(DeleteCommand)).toHaveLength(1);
      const deleteCall = dynamoMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input.Key).toEqual({
        PK: `LIKE#${validRequest.commentId}`,
        SK: `USER#${validRequest.userId}`,
      });
      expect(deleteCall.args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
    });

    test('存在しないいいねを取消そうとするとエラーを投げる', async () => {
      jest.spyOn(likeService as any, 'validateRemoveLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(null);

      await expect(likeService.removeLike(validRequest)).rejects.toThrow(
        new NotFoundError('Like not found')
      );
    });

    test('DynamoDBのConditionalCheckFailedExceptionでNotFoundErrorを投げる', async () => {
      jest.spyOn(likeService as any, 'validateRemoveLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(existingLike);

      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';
      dynamoMock.on(DeleteCommand).rejects(conditionalError);

      await expect(likeService.removeLike(validRequest)).rejects.toThrow(
        new NotFoundError('Like not found')
      );
    });

    test('DynamoDBエラーでいいね取消に失敗', async () => {
      jest.spyOn(likeService as any, 'validateRemoveLikeRequest').mockImplementation(() => {});
      jest.spyOn(likeService as any, 'checkExistingLike').mockResolvedValue(existingLike);

      dynamoMock.on(DeleteCommand).rejects(new Error('DynamoDB Error'));

      await expect(likeService.removeLike(validRequest)).rejects.toThrow(CommentiaError);
    });
  });

  describe('updateCommentLikeCount', () => {
    const commentId = 'comment123';
    const mockComment = {
      PK: 'ROOM#room123',
      SK: 'COMMENT#1234567890123#comment123',
      commentId,
      likeCount: 0,
    };

    test('正常にいいね数を更新できる', async () => {
      // いいね数カウント
      dynamoMock
        .on(QueryCommand)
        .resolves({ Count: 5 })
        .on(QueryCommand, {
          TableName: 'commentia-test-comments',
          FilterExpression: 'commentId = :commentId',
        })
        .resolves({ Items: [mockComment] });

      dynamoMock.on(UpdateCommand).resolves({});

      const result = await (likeService as any).updateCommentLikeCount(commentId);

      expect(result).toBe(5);

      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(2);
      expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(1);

      const updateCall = dynamoMock.commandCalls(UpdateCommand)[0];
      expect(updateCall.args[0].input.UpdateExpression).toBe(
        'SET likeCount = :likeCount, GSI1SK = :gsi1sk'
      );
      expect(updateCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':likeCount': 5,
        ':gsi1sk': 'LIKES#0000000005#comment123',
      });
    });

    test('存在しないコメントでエラーを投げる', async () => {
      dynamoMock
        .on(QueryCommand)
        .resolves({ Count: 5 })
        .on(QueryCommand, {
          TableName: 'commentia-test-comments',
          FilterExpression: 'commentId = :commentId',
        })
        .resolves({ Items: [] });

      await expect((likeService as any).updateCommentLikeCount(commentId)).rejects.toThrow(
        new NotFoundError('Comment not found')
      );
    });

    test('DynamoDBエラーでいいね数更新に失敗', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB Error'));

      await expect((likeService as any).updateCommentLikeCount(commentId)).rejects.toThrow(
        CommentiaError
      );
    });
  });

  describe('checkExistingLike', () => {
    const commentId = 'comment123';
    const userId = 'user123';

    test('既存のいいねを正しく取得できる', async () => {
      const mockLike: LikeItem = {
        PK: `LIKE#${commentId}`,
        SK: `USER#${userId}`,
        GSI1PK: `USER#${userId}#ROOM#room123`,
        GSI1SK: 'LIKE#2024-01-01T00:00:00.000Z',
        commentId,
        userId,
        roomId: 'room123',
        likedAt: '2024-01-01T00:00:00.000Z',
        ttl: 1234567890,
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockLike });

      const result = await (likeService as any).checkExistingLike(commentId, userId);

      expect(result).toEqual(mockLike);
      expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
      const getCall = dynamoMock.commandCalls(GetCommand)[0];
      expect(getCall.args[0].input.Key).toEqual({
        PK: `LIKE#${commentId}`,
        SK: `USER#${userId}`,
      });
    });

    test('いいねが存在しない場合にnullを返す', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const result = await (likeService as any).checkExistingLike(commentId, userId);

      expect(result).toBeNull();
    });

    test('DynamoDBエラーでnullを返す', async () => {
      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB Error'));

      const result = await (likeService as any).checkExistingLike(commentId, userId);

      expect(result).toBeNull();
    });
  });

  describe('validateCommentExists', () => {
    const commentId = 'comment123';
    const roomId = 'room123';

    test('コメントが存在する場合は正常に処理される', async () => {
      const mockComment = {
        commentId,
        roomId,
        content: 'Test comment',
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [mockComment] });

      await expect(
        (likeService as any).validateCommentExists(commentId, roomId)
      ).resolves.toBeUndefined();

      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.KeyConditionExpression).toBe(
        'PK = :pk AND begins_with(SK, :sk)'
      );
      expect(queryCall.args[0].input.FilterExpression).toBe('commentId = :commentId');
    });

    test('コメントが存在しない場合にNotFoundErrorを投げる', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await expect((likeService as any).validateCommentExists(commentId, roomId)).rejects.toThrow(
        new NotFoundError('Comment not found')
      );
    });

    test('DynamoDBエラーでCommentiaErrorを投げる', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB Error'));

      await expect((likeService as any).validateCommentExists(commentId, roomId)).rejects.toThrow(
        CommentiaError
      );
    });
  });

  describe('checkLikeLimits', () => {
    const roomId = 'room123';
    const userId = 'user123';
    const mockRoom = {
      settings: {
        maxLikesPerUser: 100,
        maxCommentsPerUser: 50,
        commentMaxLength: 500,
      },
    };

    test('制限内の場合は正常に処理される', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: mockRoom });
      dynamoMock.on(QueryCommand).resolves({ Count: 50 });

      await expect((likeService as any).checkLikeLimits(roomId, userId)).resolves.toBeUndefined();

      expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(1);

      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('UserLikesIndex');
      expect(queryCall.args[0].input.KeyConditionExpression).toBe('GSI1PK = :gsi1pk');
      expect(queryCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':gsi1pk': `USER#${userId}#ROOM#${roomId}`,
      });
    });

    test('いいね数上限に達した場合にRateLimitErrorを投げる', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: mockRoom });
      dynamoMock.on(QueryCommand).resolves({ Count: 100 });

      await expect((likeService as any).checkLikeLimits(roomId, userId)).rejects.toThrow(
        new RateLimitError('Maximum 100 likes per user allowed')
      );
    });

    test('存在しないルームでNotFoundErrorを投げる', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      await expect((likeService as any).checkLikeLimits(roomId, userId)).rejects.toThrow(
        new NotFoundError('Room not found')
      );
    });

    test('デフォルト設定を使用する', async () => {
      const roomWithoutSettings = {};
      dynamoMock.on(GetCommand).resolves({ Item: roomWithoutSettings });
      dynamoMock.on(QueryCommand).resolves({ Count: 99 });

      await expect((likeService as any).checkLikeLimits(roomId, userId)).resolves.toBeUndefined();
    });

    test('DynamoDBエラーでCommentiaErrorを投げる', async () => {
      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB Error'));

      await expect((likeService as any).checkLikeLimits(roomId, userId)).rejects.toThrow(
        CommentiaError
      );
    });
  });

  describe('validateLikeRequest', () => {
    test('有効なリクエストで正常に処理される', () => {
      const validRequest: AddLikeRequest = {
        commentId: 'comment123',
        userId: 'user123',
        roomId: 'room123',
      };

      expect(() => (likeService as any).validateLikeRequest(validRequest)).not.toThrow();
    });

    test('必須フィールドが不足している場合にValidationErrorを投げる', () => {
      const invalidRequests = [
        { commentId: '', userId: 'user123', roomId: 'room123' },
        { commentId: 'comment123', userId: '', roomId: 'room123' },
        { commentId: 'comment123', userId: 'user123', roomId: '' },
      ];

      invalidRequests.forEach((request) => {
        expect(() => (likeService as any).validateLikeRequest(request)).toThrow(ValidationError);
      });
    });
  });

  describe('validateRemoveLikeRequest', () => {
    test('有効なリクエストで正常に処理される', () => {
      const validRequest: RemoveLikeRequest = {
        commentId: 'comment123',
        userId: 'user123',
      };

      expect(() => (likeService as any).validateRemoveLikeRequest(validRequest)).not.toThrow();
    });

    test('必須フィールドが不足している場合にValidationErrorを投げる', () => {
      const invalidRequests = [
        { commentId: '', userId: 'user123' },
        { commentId: 'comment123', userId: '' },
      ];

      invalidRequests.forEach((request) => {
        expect(() => (likeService as any).validateRemoveLikeRequest(request)).toThrow(
          ValidationError
        );
      });
    });
  });
});
