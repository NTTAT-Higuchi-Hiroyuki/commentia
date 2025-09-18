/**
 * Simple utility function tests that don't require complex mocking
 */

// Mock store and complex dependencies
jest.mock('@/store/participantsStore', () => ({
  useParticipantsStore: {
    getState: () => ({
      isUserNameTaken: () => false,
    }),
  },
}));

import {
  getUserNameErrorMessage,
  normalizeUserName,
  validateFormUserName,
  validateUserName,
} from '../userNameValidation';

describe('UserName Validation Utils', () => {
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

  describe('validateUserName (basic validation)', () => {
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

    it('should reject user names with forbidden characters', () => {
      const forbiddenChars = ['<', '>', '/', '\\', '&'];

      forbiddenChars.forEach((char) => {
        const result = validateUserName(`user${char}name`);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('ユーザー名に使用できない文字が含まれています');
      });
    });

    it('should generate warnings for short user names', () => {
      const result = validateUserName('ab');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('短いユーザー名は他の参加者と区別しにくい可能性があります');
    });

    it('should generate warnings for numeric-only user names', () => {
      const result = validateUserName('12345');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('数字のみのユーザー名は推奨されません');
    });

    it('should generate warnings for admin-like user names', () => {
      const adminNames = ['admin', 'ADMIN', 'Administrator', 'bot', 'BOT'];

      adminNames.forEach((name) => {
        const result = validateUserName(name);
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain(
          '特別な権限を示唆するユーザー名は混乱を招く可能性があります'
        );
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

    it('should handle long names', () => {
      const longName = 'a'.repeat(25);
      const result = validateFormUserName(longName);

      expect(result.userName).toContain('20文字以内');
    });

    it('should handle forbidden characters', () => {
      const result = validateFormUserName('test<name>');

      expect(result.userName).toBe('ユーザー名に使用できない文字が含まれています');
    });
  });
});
