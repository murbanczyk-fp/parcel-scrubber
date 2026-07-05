import { isSafeHttpUrl } from './is-safe-http-url';

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHttpUrl('https://example.com/track/123')).toBe(true);
    expect(isSafeHttpUrl('http://example.com/track/123')).toBe(true);
    expect(isSafeHttpUrl('  https://inpost.pl/sledzenie  ')).toBe(true);
  });

  it('rejects javascript and other unsafe schemes', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,hello')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects relative paths and malformed strings', () => {
    expect(isSafeHttpUrl('/relative/path')).toBe(false);
    expect(isSafeHttpUrl('not-a-url')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});
