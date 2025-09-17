import { useParticipantsStore } from '@/store/participantsStore';

export interface UserNameValidationResult {
  isValid: boolean;
  error: string | null;
  warnings: string[];
}

export interface UserNameValidationOptions {
  checkDuplicates?: boolean;
  excludeUserId?: string;
  minLength?: number;
  maxLength?: number;
}

/**
 * ユーザー名の包括的な検証を行う関数
 */
export const validateUserName = (
  userName: string,
  options: UserNameValidationOptions = {}
): UserNameValidationResult => {
  const { checkDuplicates = false, excludeUserId, minLength = 2, maxLength = 20 } = options;

  const result: UserNameValidationResult = {
    isValid: true,
    error: null,
    warnings: [],
  };

  const trimmedUserName = userName.trim();

  // 基本的なバリデーション
  if (!trimmedUserName) {
    result.isValid = false;
    result.error = 'ユーザー名を入力してください';
    return result;
  }

  if (trimmedUserName.length < minLength) {
    result.isValid = false;
    result.error = `ユーザー名は${minLength}文字以上で入力してください`;
    return result;
  }

  if (trimmedUserName.length > maxLength) {
    result.isValid = false;
    result.error = `ユーザー名は${maxLength}文字以内で入力してください`;
    return result;
  }

  // 禁止文字チェック（オプション）
  const forbiddenChars = /[<>\/\\&]/;
  if (forbiddenChars.test(trimmedUserName)) {
    result.isValid = false;
    result.error = 'ユーザー名に使用できない文字が含まれています';
    return result;
  }

  // 重複チェック
  if (checkDuplicates) {
    const store = useParticipantsStore.getState();
    const isDuplicate = store.isUserNameTaken(trimmedUserName, excludeUserId);

    if (isDuplicate) {
      result.isValid = false;
      result.error = 'このユーザー名は既に使用されています';
      return result;
    }
  }

  // 警告の追加（バリデーションは通るが注意点がある場合）
  if (trimmedUserName.length < 3) {
    result.warnings.push('短いユーザー名は他の参加者と区別しにくい可能性があります');
  }

  if (/^\d+$/.test(trimmedUserName)) {
    result.warnings.push('数字のみのユーザー名は推奨されません');
  }

  if (
    trimmedUserName.toLowerCase().includes('admin') ||
    trimmedUserName.toLowerCase().includes('bot')
  ) {
    result.warnings.push('特別な権限を示唆するユーザー名は混乱を招く可能性があります');
  }

  return result;
};

/**
 * リアルタイムでユーザー名の検証を行うフック
 */
export const useUserNameValidation = (
  userName: string,
  options: UserNameValidationOptions = {}
) => {
  const validation = validateUserName(userName, options);
  const store = useParticipantsStore();

  // 参加者リストが変更された時に再検証を促すため、
  // 参加者数を依存配列に含める
  const participantCount = store.getParticipantCount();

  return {
    ...validation,
    // 参加者数の変化を検知するための値
    _participantCount: participantCount,
  };
};

/**
 * フォーム用の検証エラーメッセージを取得する関数
 */
export const getUserNameErrorMessage = (
  validation: UserNameValidationResult
): string | undefined => {
  return validation.error || undefined;
};

/**
 * 既存の検証関数との互換性を保つためのラッパー関数
 */
export const validateFormUserName = (
  userName: string,
  checkDuplicates = false,
  excludeUserId?: string
): Record<string, string> => {
  const validation = validateUserName(userName, {
    checkDuplicates,
    ...(excludeUserId && { excludeUserId }),
  });

  const errors: Record<string, string> = {};

  if (validation.error) {
    errors.userName = validation.error;
  }

  return errors;
};

/**
 * ユーザー名の正規化（トリムと基本的なクリーンアップ）
 */
export const normalizeUserName = (userName: string): string => {
  return userName
    .trim()
    .replace(/\s+/g, ' ') // 連続する空白を単一の空白に
    .replace(/[<>\/\\&]/g, ''); // 禁止文字を除去
};

/**
 * ユーザー名の提案を生成する関数
 */
export const generateUserNameSuggestions = (baseUserName: string, maxSuggestions = 3): string[] => {
  const suggestions: string[] = [];
  const normalizedBase = normalizeUserName(baseUserName);

  if (!normalizedBase) {
    return ['ユーザー1', 'ユーザー2', 'ユーザー3'];
  }

  const store = useParticipantsStore.getState();

  // 数字サフィックスを追加
  for (let i = 1; i <= maxSuggestions + 5 && suggestions.length < maxSuggestions; i++) {
    const candidate = `${normalizedBase}${i}`;
    if (!store.isUserNameTaken(candidate)) {
      suggestions.push(candidate);
    }
  }

  // まだ足りない場合は、ランダムな文字を追加
  if (suggestions.length < maxSuggestions) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 10 && suggestions.length < maxSuggestions; i++) {
      const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
      const candidate = `${normalizedBase}${randomChar}`;
      if (!store.isUserNameTaken(candidate) && !suggestions.includes(candidate)) {
        suggestions.push(candidate);
      }
    }
  }

  return suggestions;
};
