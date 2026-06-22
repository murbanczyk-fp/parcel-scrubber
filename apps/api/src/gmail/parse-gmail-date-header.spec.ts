import { parseGmailDateHeader } from './parse-gmail-date-header';

describe('parseGmailDateHeader', () => {
  it('parses Allegro-style RFC 2822 date header', () => {
    const result = parseGmailDateHeader('Mon, 9 Jun 2025 14:32:10 +0200');

    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-06-09T12:32:10.000Z');
  });

  it('parses AliExpress-style date header with day name', () => {
    const result = parseGmailDateHeader(
      'Wed, 14 May 2025 08:15:00 -0700 (PDT)',
    );

    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-05-14T15:15:00.000Z');
  });

  it('returns null for empty string', () => {
    expect(parseGmailDateHeader('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseGmailDateHeader('   ')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(parseGmailDateHeader('not-a-date')).toBeNull();
  });
});
