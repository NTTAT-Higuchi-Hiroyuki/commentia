/**
 * Simple test for utility functions
 */
import { cn } from '../utils';

describe('utils', () => {
  describe('cn', () => {
    it('should concatenate class names', () => {
      const result = cn('class1', 'class2', 'class3');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('should handle conditional classes', () => {
      const result = cn('always', true && 'conditional', false && 'never');
      expect(result).toContain('always');
      expect(result).toContain('conditional');
      expect(result).not.toContain('never');
    });

    it('should handle undefined and null values', () => {
      const result = cn('class', undefined, null, 'another');
      expect(result).toContain('class');
      expect(result).toContain('another');
    });

    it('should handle empty strings', () => {
      const result = cn('class', '', 'another');
      expect(result).toContain('class');
      expect(result).toContain('another');
    });

    it('should work with arrays', () => {
      const result = cn(['class1', 'class2'], 'class3');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('should work with objects', () => {
      const result = cn({
        active: true,
        disabled: false,
        visible: true,
      });
      expect(result).toContain('active');
      expect(result).toContain('visible');
      expect(result).not.toContain('disabled');
    });

    it('should handle complex combinations', () => {
      const result = cn(
        'base',
        { active: true, hidden: false },
        ['array1', 'array2'],
        true && 'conditional',
        undefined,
        ''
      );
      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).toContain('array1');
      expect(result).toContain('array2');
      expect(result).toContain('conditional');
      expect(result).not.toContain('hidden');
    });
  });
});
