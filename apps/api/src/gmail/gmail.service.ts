import { Injectable } from '@nestjs/common';
import { google, type gmail_v1 } from 'googleapis';
import { buildGmailListQuery } from './build-gmail-list-query';
import { decodeMessageBody } from './decode-message-body';
import { extractMessageHeaders } from './extract-message-headers';
import { GoogleOAuthClientFactory } from './google-oauth-client.factory';
import { resolveGmailLabelId } from './resolve-gmail-label-id';
import { retryTransientGmailApiCall } from './retry-transient-gmail-api-call';
import type { GmailMessage } from './types';

const LIST_PAGE_SIZE = 100;
const MAX_MESSAGE_IDS = 500;

@Injectable()
export class GmailService {
  constructor(private readonly oauthFactory: GoogleOAuthClientFactory) {}

  async listMatchingEmailIds(
    userId: string,
    labelName: string,
    scanPeriodDays: number,
  ): Promise<string[]> {
    const gmail = await this.createGmailClient(userId);
    const labelId = await this.resolveLabelId(userId, gmail, labelName);
    if (!labelId) {
      return [];
    }

    const q = buildGmailListQuery(labelName, scanPeriodDays);
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.callGmailApi(userId, () =>
        gmail.users.messages.list({
          userId: 'me',
          q,
          maxResults: LIST_PAGE_SIZE,
          pageToken,
        }),
      );

      for (const message of response.data.messages ?? []) {
        if (message.id) {
          ids.push(message.id);
        }

        if (ids.length >= MAX_MESSAGE_IDS) {
          break;
        }
      }

      if (ids.length >= MAX_MESSAGE_IDS) {
        break;
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return ids.slice(0, MAX_MESSAGE_IDS);
  }

  async getMessage(userId: string, messageId: string): Promise<GmailMessage> {
    const gmail = await this.createGmailClient(userId);

    const response = await this.callGmailApi(userId, () =>
      gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      }),
    );

    const payload = response.data.payload;

    return {
      ...extractMessageHeaders(payload?.headers),
      body: decodeMessageBody(payload),
    };
  }

  private async createGmailClient(userId: string): Promise<gmail_v1.Gmail> {
    const auth = await this.oauthFactory.createOAuth2ClientForUser(userId);
    await this.oauthFactory.ensureAccessToken(userId, auth);
    return google.gmail({ version: 'v1', auth });
  }

  private async resolveLabelId(
    userId: string,
    gmail: gmail_v1.Gmail,
    labelName: string,
  ): Promise<string | null> {
    const response = await this.callGmailApi(userId, () =>
      gmail.users.labels.list({ userId: 'me' }),
    );

    return resolveGmailLabelId(response.data.labels, labelName);
  }

  private async callGmailApi<T>(
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return retryTransientGmailApiCall(async () => {
      try {
        return await operation();
      } catch (error) {
        return await this.oauthFactory.handleAuthFailure(userId, error);
      }
    });
  }
}
