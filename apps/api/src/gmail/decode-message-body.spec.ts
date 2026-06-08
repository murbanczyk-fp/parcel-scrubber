import type { gmail_v1 } from 'googleapis';
import { decodeMessageBody } from './decode-message-body';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('decodeMessageBody', () => {
  it('returns empty string for missing payload', () => {
    expect(decodeMessageBody(undefined)).toBe('');
  });

  it('decodes single-part plain text message', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: encodeBase64Url('Hello parcel') },
    };

    expect(decodeMessageBody(payload)).toBe('Hello parcel');
  });

  it('prefers plain text over html in multipart message', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: encodeBase64Url('plain body') },
        },
        {
          mimeType: 'text/html',
          body: { data: encodeBase64Url('<p>html body</p>') },
        },
      ],
    };

    expect(decodeMessageBody(payload)).toBe('plain body');
  });

  it('falls back to stripped html when plain text is absent', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: encodeBase64Url('<p>Order <b>123</b></p>') },
    };

    expect(decodeMessageBody(payload)).toBe('Order 123');
  });

  it('walks nested multipart parts', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/html',
              body: { data: encodeBase64Url('<div>Nested html</div>') },
            },
          ],
        },
      ],
    };

    expect(decodeMessageBody(payload)).toBe('Nested html');
  });

  it('returns empty string when no decodable content exists', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'application/pdf',
      body: {},
    };

    expect(decodeMessageBody(payload)).toBe('');
  });
});
