/**
 * @jest-environment jsdom
 */
import {
  generateUserNameSuggestions,
  getUserNameErrorMessage,
  normalizeUserName,
  validateFormUserName,
  validateUserName,
} from '../userNameValidation';

// Mock the participants store
jest.mock('@/store/participantsStore', () => ({
  useParticipantsStore: {
    getState: jest.fn(() => ({
      isUserNameTaken: jest.fn(() => false),
    })),
  },
}));

// Import the mocked store for configuration
import { useParticipantsStore } from '@/store/participantsStore';

const mockedUseParticipantsStore = useParticipantsStore as jest.Mocked<typeof useParticipantsStore>;

describe('userNameValidation.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mock store
    mockedUseParticipantsStore.getState.mockReturnValue({
      isUserNameTaken: jest.fn(() => false),
      getParticipantCount: jest.fn(() => 0),
    } as any);
  });

  describe('validateUserName', () => {
    describe('基本的なバリデーション', () => {
      it('should return valid for proper user name', () => {
        const result = validateUserName('testuser');

        expect(result.isValid).toBe(true);
        expect(result.error).toBeNull();
        expect(result.warnings).toEqual([]);
      });

      it('should reject empty user name', () => {
        const result = validateUserName('');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('ユーザー名を入力してください');
      });

      it('should reject whitespace-only user name', () => {
        const result = validateUserName('   ');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('ユーザー名を入力してください');
      });

      it('should reject user name shorter than minimum length', () => {
        const result = validateUserName('a', { minLength: 2 });

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('ユーザー名は2文字以上で入力してください');
      });

      it('should reject user name longer than maximum length', () => {
        const longName = 'a'.repeat(21);
        const result = validateUserName(longName, { maxLength: 20 });

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('ユーザー名は20文字以内で入力してください');
      });

      it('should accept user name with custom length constraints', () => {
        const result = validateUserName('user', {
          minLength: 3,
          maxLength: 10,
        });

        expect(result.isValid).toBe(true);
        expect(result.error).toBeNull();
      });
    });

    describe('禁止文字チェック', () => {
      it('should reject user names with forbidden characters', () => {
        const forbiddenChars = ['<', '>', '/', '\\', '&'];

        forbiddenChars.forEach((char) => {
          const result = validateUserName(`user${char}name`);
          expect(result.isValid).toBe(false);
          expect(result.error).toBe('ユーザー名に使用できない文字が含まれています');
        });
      });

      it('should accept user names with allowed special characters', () => {
        const allowedNames = ['user_name', 'user-name', 'user.name', 'user123', 'ユーザー名'];

        allowedNames.forEach((name) => {
          const result = validateUserName(name);
          expect(result.isValid).toBe(true);
        });
      });
    });

    describe('重複チェック', () => {
      it('should reject duplicate user names when checkDuplicates is true', () => {
        // Mock store to return true for duplicate check
        mockedUseParticipantsStore.getState.mockReturnValue({
          isUserNameTaken: jest.fn(() => true),
        } as any);

        const result = validateUserName('existinguser', {
          checkDuplicates: true,
        });

        expect(result.isValid).toBe(false);
        expect(result.error).toBe('このユーザー名は既に使用されています');
      });

      it('should accept non-duplicate user names when checkDuplicates is true', () => {
        mockedUseParticipantsStore.getState.mockReturnValue({
          isUserNameTaken: jest.fn(() => false),
        } as any);

        const result = validateUserName('newuser', { checkDuplicates: true });

        expect(result.isValid).toBe(true);
        expect(result.error).toBeNull();
      });

      it('should skip duplicate check when checkDuplicates is false', () => {
        const mockIsUserNameTaken = jest.fn(() => true);
        mockedUseParticipantsStore.getState.mockReturnValue({
          isUserNameTaken: mockIsUserNameTaken,
        } as any);

        const result = validateUserName('anyuser', { checkDuplicates: false });

        expect(result.isValid).toBe(true);
        expect(mockIsUserNameTaken).not.toHaveBeenCalled();
      });

      it('should exclude specific user ID from duplicate check', () => {
        const mockIsUserNameTaken = jest.fn(() => false);
        mockedUseParticipantsStore.getState.mockReturnValue({
          isUserNameTaken: mockIsUserNameTaken,
        } as any);

        validateUserName('testuser', {
          checkDuplicates: true,
          excludeUserId: 'user123',
        });

        expect(mockIsUserNameTaken).toHaveBeenCalledWith('testuser', 'user123');
      });
    });

    describe('警告生成', () => {
      it('should warn about short user names', () => {
        const result = validateUserName('ab');

        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain(
          '短いユーザー名は他の参加者と区別しにくい可能性があります'
        );
      });

      it('should warn about numeric-only user names', () => {
        const result = validateUserName('12345');

        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain('数字のみのユーザー名は推奨されません');
      });

      it('should warn about admin-like user names', () => {
        const adminNames = ['admin', 'ADMIN', 'Administrator', 'bot', 'BOT'];

        adminNames.forEach((name) => {
          const result = validateUserName(name);
          expect(result.isValid).toBe(true);
          expect(result.warnings).toContain(
            '特別な権限を示唆するユーザー名は混乱を招く可能性があります'
          );
        });
      });

      it('should warn about partial admin-like user names', () => {
        const result = validateUserName('useradmin');

        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain(
          '特別な権限を示唆するユーザー名は混乱を招く可能性があります'
        );
      });

      it('should accumulate multiple warnings', () => {
        const result = validateUserName('12'); // short + numeric

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(2);
        expect(result.warnings).toContain(
          '短いユーザー名は他の参加者と区別しにくい可能性があります'
        );
        expect(result.warnings).toContain('数字のみのユーザー名は推奨されません');
      });
    });
  });

  describe('getUserNameErrorMessage', () => {
    it('should return error message when validation has error', () => {
      const validation = {
        isValid: false,
        error: 'Error message',
        warnings: [],
      };

      expect(getUserNameErrorMessage(validation)).toBe('Error message');
    });

    it('should return undefined when validation has no error', () => {
      const validation = { isValid: true, error: null, warnings: [] };

      expect(getUserNameErrorMessage(validation)).toBeUndefined();
    });
  });

  describe('validateFormUserName', () => {
    it('should return empty object for valid user name', () => {
      const result = validateFormUserName('validuser');

      expect(result).toEqual({});
    });

    it('should return error object for invalid user name', () => {
      const result = validateFormUserName('');

      expect(result).toEqual({
        userName: 'ユーザー名を入力してください',
      });
    });

    it('should pass checkDuplicates parameter', () => {
      const mockIsUserNameTaken = jest.fn(() => true);
      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: mockIsUserNameTaken,
      } as any);

      const result = validateFormUserName('testuser', true);

      expect(result).toEqual({
        userName: 'このユーザー名は既に使用されています',
      });
      expect(mockIsUserNameTaken).toHaveBeenCalled();
    });

    it('should pass excludeUserId parameter', () => {
      const mockIsUserNameTaken = jest.fn(() => false);
      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: mockIsUserNameTaken,
      } as any);

      validateFormUserName('testuser', true, 'user123');

      expect(mockIsUserNameTaken).toHaveBeenCalledWith('testuser', 'user123');
    });
  });

  describe('normalizeUserName', () => {
    it('should trim whitespace', () => {
      expect(normalizeUserName('  username  ')).toBe('username');
    });

    it('should replace multiple spaces with single space', () => {
      expect(normalizeUserName('user   name')).toBe('user name');
    });

    it('should remove forbidden characters', () => {
      expect(normalizeUserName('user<name>')).toBe('username');
      expect(normalizeUserName('user/name\\test&')).toBe('usernametest');
    });

    it('should handle empty string', () => {
      expect(normalizeUserName('')).toBe('');
    });

    it('should handle complex normalization', () => {
      expect(normalizeUserName('  user  <name>  ')).toBe('user name');
    });
  });

  describe('generateUserNameSuggestions', () => {
    beforeEach(() => {
      // Mock Math.random for consistent testing
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate default suggestions for empty base name', () => {
      const suggestions = generateUserNameSuggestions('');

      expect(suggestions).toEqual(['ユーザー1', 'ユーザー2', 'ユーザー3']);
    });

    it('should generate numbered suggestions', () => {
      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: jest.fn(() => false),
      } as any);

      const suggestions = generateUserNameSuggestions('user', 3);

      expect(suggestions).toEqual(['user1', 'user2', 'user3']);
    });

    it('should skip taken usernames', () => {
      const mockIsUserNameTaken = jest.fn((name: string) => {
        return name === 'user1' || name === 'user3';
      });

      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: mockIsUserNameTaken,
      } as any);

      const suggestions = generateUserNameSuggestions('user', 3);

      // Should skip user1 and user3, suggest user2, user4, user5
      expect(suggestions).toEqual(['user2', 'user4', 'user5']);
    });

    it('should add random characters when numbered suggestions are exhausted', () => {
      // Mock all numbered suggestions as taken
      const mockIsUserNameTaken = jest.fn((name: string) => {
        return /^user\d+$/.test(name); // All numbered variants are taken
      });

      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: mockIsUserNameTaken,
      } as any);

      const suggestions = generateUserNameSuggestions('user', 2);

      // Should fall back to random character suggestions
      expect(suggestions.length).toBe(2);
      expect(suggestions[0]).toMatch(/^user[A-Z]$/);
      expect(suggestions[1]).toMatch(/^user[A-Z]$/);
    });

    it('should normalize base user name', () => {
      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: jest.fn(() => false),
      } as any);

      const suggestions = generateUserNameSuggestions('  user<name>  ', 2);

      expect(suggestions).toEqual(['user name1', 'user name2']);
    });

    it('should handle custom maxSuggestions parameter', () => {
      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: jest.fn(() => false),
      } as any);

      const suggestions = generateUserNameSuggestions('user', 5);

      expect(suggestions).toHaveLength(5);
      expect(suggestions).toEqual(['user1', 'user2', 'user3', 'user4', 'user5']);
    });

    it('should avoid duplicate suggestions', () => {
      const mockIsUserNameTaken = jest.fn((name: string) => {
        // Only userN (numeric) suggestions are taken
        return /^user\d+$/.test(name);
      });

      mockedUseParticipantsStore.getState.mockReturnValue({
        isUserNameTaken: mockIsUserNameTaken,
      } as any);

      // Fix Math.random to always return same character
      jest.spyOn(Math, 'random').mockReturnValue(0); // Always returns 'A'

      const suggestions = generateUserNameSuggestions('user', 3);

      expect(suggestions).toHaveLength(1); // Only one unique suggestion 'userA'
      expect(suggestions).toEqual(['userA']);
    });
  });
});
