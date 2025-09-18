/**
 * Simple test to verify Jest setup
 */

describe('Jest Setup', () => {
  it('should be able to run tests', () => {
    expect(true).toBe(true);
  });

  it('should handle basic math', () => {
    expect(2 + 2).toBe(4);
  });

  it('should handle string operations', () => {
    expect('hello world'.toUpperCase()).toBe('HELLO WORLD');
  });
});
