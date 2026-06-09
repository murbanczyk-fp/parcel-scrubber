import { Test, TestingModule } from '@nestjs/testing';
import { GmailService } from './gmail.service';
import { GoogleOAuthClientFactory } from './google-oauth-client.factory';
import { GmailAuthError } from './types';

const labelsListMock = jest.fn();
const messagesListMock = jest.fn();
const messagesGetMock = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(() => ({
      users: {
        labels: { list: labelsListMock },
        messages: {
          list: messagesListMock,
          get: messagesGetMock,
        },
      },
    })),
  },
}));

describe('GmailService', () => {
  let service: GmailService;
  let oauthFactory: {
    createOAuth2ClientForUser: jest.Mock;
    ensureAccessToken: jest.Mock;
    handleAuthFailure: jest.Mock;
  };

  const userId = 'user-1';

  beforeEach(async () => {
    labelsListMock.mockReset();
    messagesListMock.mockReset();
    messagesGetMock.mockReset();

    oauthFactory = {
      createOAuth2ClientForUser: jest.fn().mockResolvedValue({}),
      ensureAccessToken: jest.fn().mockResolvedValue(undefined),
      handleAuthFailure: jest.fn((_, error: unknown) => {
        throw error;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailService,
        { provide: GoogleOAuthClientFactory, useValue: oauthFactory },
      ],
    }).compile();

    service = module.get(GmailService);
  });

  describe('listMatchingEmailIds', () => {
    it('returns empty array when label name is not found', async () => {
      labelsListMock.mockResolvedValue({
        data: { labels: [{ id: 'Label_1', name: 'OtherLabel' }] },
      });

      await expect(
        service.listMatchingEmailIds(userId, 'ParcelScrubber', 30),
      ).resolves.toEqual([]);

      expect(messagesListMock).not.toHaveBeenCalled();
    });

    it('returns message ids from paginated list responses', async () => {
      labelsListMock.mockResolvedValue({
        data: {
          labels: [{ id: 'Label_1', name: 'ParcelScrubber' }],
        },
      });

      messagesListMock
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
            nextPageToken: 'page-2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: 'msg-3' }],
          },
        });

      await expect(
        service.listMatchingEmailIds(userId, 'ParcelScrubber', 30),
      ).resolves.toEqual(['msg-1', 'msg-2', 'msg-3']);

      expect(messagesListMock).toHaveBeenNthCalledWith(1, {
        userId: 'me',
        q: 'label:ParcelScrubber newer_than:30d',
        maxResults: 100,
        pageToken: undefined,
      });
      expect(messagesListMock).toHaveBeenNthCalledWith(2, {
        userId: 'me',
        q: 'label:ParcelScrubber newer_than:30d',
        maxResults: 100,
        pageToken: 'page-2',
      });
    });

    it('caps collected ids at 500', async () => {
      labelsListMock.mockResolvedValue({
        data: {
          labels: [{ id: 'Label_1', name: 'ParcelScrubber' }],
        },
      });

      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        id: `msg-${index + 1}`,
      }));
      const secondPage = Array.from({ length: 100 }, (_, index) => ({
        id: `msg-${index + 101}`,
      }));

      messagesListMock
        .mockResolvedValueOnce({
          data: { messages: firstPage, nextPageToken: 'p2' },
        })
        .mockResolvedValueOnce({
          data: { messages: secondPage, nextPageToken: 'p3' },
        })
        .mockResolvedValueOnce({
          data: {
            messages: Array.from({ length: 100 }, (_, index) => ({
              id: `msg-${index + 201}`,
            })),
            nextPageToken: 'p4',
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: Array.from({ length: 100 }, (_, index) => ({
              id: `msg-${index + 301}`,
            })),
            nextPageToken: 'p5',
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: Array.from({ length: 100 }, (_, index) => ({
              id: `msg-${index + 401}`,
            })),
            nextPageToken: 'p6',
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: 'msg-501' }],
            nextPageToken: 'p7',
          },
        });

      const ids = await service.listMatchingEmailIds(
        userId,
        'ParcelScrubber',
        30,
      );

      expect(ids).toHaveLength(500);
      expect(ids[0]).toBe('msg-1');
      expect(ids[499]).toBe('msg-500');
      expect(messagesListMock).toHaveBeenCalledTimes(5);
    });

    it('propagates GmailAuthError from oauth factory', async () => {
      oauthFactory.createOAuth2ClientForUser.mockRejectedValue(
        new GmailAuthError('re-auth required'),
      );

      await expect(
        service.listMatchingEmailIds(userId, 'ParcelScrubber', 30),
      ).rejects.toBeInstanceOf(GmailAuthError);
    });
  });

  describe('getMessage', () => {
    it('returns decoded plain text body', async () => {
      const encoded = Buffer.from('Order shipped', 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

      messagesGetMock.mockResolvedValue({
        data: {
          payload: {
            mimeType: 'text/plain',
            body: { data: encoded },
            headers: [
              { name: 'From', value: 'shop@example.com' },
              { name: 'Date', value: 'Mon, 9 Jun 2026 10:00:00 +0000' },
              { name: 'Subject', value: 'Order shipped' },
            ],
          },
        },
      });

      await expect(service.getMessage(userId, 'msg-1')).resolves.toEqual({
        from: 'shop@example.com',
        date: 'Mon, 9 Jun 2026 10:00:00 +0000',
        subject: 'Order shipped',
        body: 'Order shipped',
      });
    });

    it('falls back to stripped html when plain text is absent', async () => {
      const encoded = Buffer.from('<p>HTML <b>body</b></p>', 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

      messagesGetMock.mockResolvedValue({
        data: {
          payload: {
            mimeType: 'text/html',
            body: { data: encoded },
            headers: [
              { name: 'From', value: 'noreply@merchant.com' },
              { name: 'Subject', value: 'HTML email' },
            ],
          },
        },
      });

      await expect(service.getMessage(userId, 'msg-2')).resolves.toEqual({
        from: 'noreply@merchant.com',
        date: '',
        subject: 'HTML email',
        body: 'HTML body',
      });
    });
  });
});
