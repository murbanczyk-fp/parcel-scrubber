import type { gmail_v1 } from 'googleapis';
import { extractMessageHeaders } from './extract-message-headers';

describe('extractMessageHeaders', () => {
  it('returns empty strings when headers are missing', () => {
    expect(extractMessageHeaders(undefined)).toEqual({
      from: '',
      date: '',
      subject: '',
    });
  });

  it('extracts From, Date, and Subject case-insensitively', () => {
    const headers: gmail_v1.Schema$MessagePartHeader[] = [
      { name: 'Subject', value: 'Your order shipped' },
      { name: 'from', value: 'shop@example.com' },
      { name: 'DATE', value: 'Mon, 9 Jun 2026 10:00:00 +0000' },
    ];

    expect(extractMessageHeaders(headers)).toEqual({
      from: 'shop@example.com',
      date: 'Mon, 9 Jun 2026 10:00:00 +0000',
      subject: 'Your order shipped',
    });
  });

  it('returns empty string for absent header names', () => {
    const headers: gmail_v1.Schema$MessagePartHeader[] = [
      { name: 'To', value: 'me@example.com' },
    ];

    expect(extractMessageHeaders(headers)).toEqual({
      from: '',
      date: '',
      subject: '',
    });
  });
});
