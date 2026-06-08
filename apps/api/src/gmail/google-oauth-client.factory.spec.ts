import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleOAuthClientFactory } from './google-oauth-client.factory';
import { GmailAuthError } from './types';

const setCredentialsMock = jest.fn();
const getAccessTokenMock = jest
  .fn()
  .mockResolvedValue({ token: 'access-token' });

jest.mock('google-auth-library', () => {
  const actual = jest.requireActual<typeof import('google-auth-library')>(
    'google-auth-library',
  );

  return {
    ...actual,
    OAuth2Client: jest.fn().mockImplementation(() => {
      const listeners = new Map<string, Set<(tokens: unknown) => void>>();
      return {
        setCredentials: setCredentialsMock,
        getAccessToken: getAccessTokenMock,
        on: jest.fn((event: string, handler: (tokens: unknown) => void) => {
          const handlers = listeners.get(event) ?? new Set();
          handlers.add(handler);
          listeners.set(event, handlers);
        }),
        emitTokens: (tokens: unknown) => {
          for (const handler of listeners.get('tokens') ?? []) {
            handler(tokens);
          }
        },
      };
    }),
  };
});

describe('GoogleOAuthClientFactory', () => {
  let factory: GoogleOAuthClientFactory;
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let OAuth2ClientMock: jest.Mock;

  const userId = 'user-1';

  beforeEach(async () => {
    findUnique = jest.fn();
    update = jest.fn().mockResolvedValue({});
    OAuth2ClientMock = OAuth2Client as unknown as jest.Mock;
    OAuth2ClientMock.mockClear();
    setCredentialsMock.mockClear();
    getAccessTokenMock.mockClear();
    getAccessTokenMock.mockResolvedValue({ token: 'access-token' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthClientFactory,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique, update },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
              if (key === 'GOOGLE_CLIENT_SECRET') return 'client-secret';
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
      ],
    }).compile();

    factory = module.get(GoogleOAuthClientFactory);
  });

  describe('createOAuth2ClientForUser', () => {
    it('throws GmailAuthError when user has no refresh token', async () => {
      findUnique.mockResolvedValue({ refreshToken: null });

      await expect(
        factory.createOAuth2ClientForUser(userId),
      ).rejects.toBeInstanceOf(GmailAuthError);

      await expect(factory.createOAuth2ClientForUser(userId)).rejects.toThrow(
        /no refresh token/,
      );
    });

    it('throws GmailAuthError when refresh token is blank', async () => {
      findUnique.mockResolvedValue({ refreshToken: '   ' });

      await expect(
        factory.createOAuth2ClientForUser(userId),
      ).rejects.toBeInstanceOf(GmailAuthError);
    });

    it('creates OAuth2Client with stored refresh token', async () => {
      findUnique.mockResolvedValue({ refreshToken: 'stored-refresh' });

      await factory.createOAuth2ClientForUser(userId);

      expect(OAuth2ClientMock).toHaveBeenCalledWith({
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });
      expect(setCredentialsMock).toHaveBeenCalledWith({
        refresh_token: 'stored-refresh',
      });
    });

    it('persists rotated refresh token on tokens event', async () => {
      findUnique.mockResolvedValue({ refreshToken: 'stored-refresh' });

      const client = (await factory.createOAuth2ClientForUser(
        userId,
      )) as OAuth2Client & { emitTokens: (tokens: unknown) => void };

      client.emitTokens({ refresh_token: 'rotated-refresh' });

      await new Promise((resolve) => setImmediate(resolve));

      expect(update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { refreshToken: 'rotated-refresh' },
      });
    });
  });

  describe('handleAuthFailure', () => {
    it('clears refresh token and throws GmailAuthError on invalid_grant', async () => {
      const error = {
        response: { data: { error: 'invalid_grant' } },
      };

      await expect(
        factory.handleAuthFailure(userId, error),
      ).rejects.toBeInstanceOf(GmailAuthError);

      expect(update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { refreshToken: null },
      });
    });

    it('rethrows non-auth errors without clearing token', async () => {
      const error = new Error('network timeout');

      await expect(factory.handleAuthFailure(userId, error)).rejects.toThrow(
        'network timeout',
      );

      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('ensureAccessToken', () => {
    it('delegates invalid_grant to handleAuthFailure', async () => {
      findUnique.mockResolvedValue({ refreshToken: 'stored-refresh' });

      const client = await factory.createOAuth2ClientForUser(userId);
      getAccessTokenMock.mockRejectedValue({
        response: { data: { error: 'invalid_grant' } },
      });

      await expect(
        factory.ensureAccessToken(userId, client),
      ).rejects.toBeInstanceOf(GmailAuthError);

      expect(update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { refreshToken: null },
      });
    });
  });
});
