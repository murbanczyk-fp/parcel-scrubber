import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { GmailAuthError } from './types';

type GaxiosLikeError = {
  response?: { data?: { error?: string } };
  message?: string;
};

@Injectable()
export class GoogleOAuthClientFactory {
  private readonly logger = new Logger(GoogleOAuthClientFactory.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createOAuth2ClientForUser(userId: string): Promise<OAuth2Client> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true },
    });

    const refreshToken = user?.refreshToken?.trim();
    if (!refreshToken) {
      throw new GmailAuthError(
        'Gmail access requires Google re-authentication (no refresh token)',
      );
    }

    const client = new OAuth2Client({
      clientId: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
    });

    client.setCredentials({ refresh_token: refreshToken });

    client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        void this.persistRotatedRefreshToken(userId, tokens.refresh_token);
      }
    });

    return client;
  }

  private async persistRotatedRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist rotated refresh token for user ${userId}`,
        error,
      );
    }
  }

  async ensureAccessToken(userId: string, client: OAuth2Client): Promise<void> {
    try {
      await client.getAccessToken();
    } catch (error) {
      await this.handleAuthFailure(userId, error);
    }
  }

  async handleAuthFailure(userId: string, error: unknown): Promise<never> {
    if (isInvalidGrantError(error)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
      throw new GmailAuthError(
        'Gmail access requires Google re-authentication (token revoked or expired)',
        error,
      );
    }

    throw error;
  }
}

function isInvalidGrantError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const gaxiosError = error as GaxiosLikeError;
  if (gaxiosError.response?.data?.error === 'invalid_grant') {
    return true;
  }

  return false;
}
