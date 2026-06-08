import {
  BadRequestException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { SettingsService } from '../settings/settings.service';
import { GmailTestController } from './gmail-test.controller';
import { GmailService } from './gmail.service';
import { GmailAuthError } from './types';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

describe('GmailTestController', () => {
  let controller: GmailTestController;
  let gmailService: {
    listMatchingEmailIds: jest.Mock;
    getMessageBody: jest.Mock;
  };
  let settingsService: {
    getEffectiveSettings: jest.Mock;
  };

  beforeEach(async () => {
    gmailService = {
      listMatchingEmailIds: jest.fn(),
      getMessageBody: jest.fn(),
    };
    settingsService = {
      getEffectiveSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GmailTestController],
      providers: [
        { provide: GmailService, useValue: gmailService },
        { provide: SettingsService, useValue: settingsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(GmailTestController);
  });

  it('applies JwtAuthGuard at controller level', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      GmailTestController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  describe('matchingEmailIds', () => {
    it('uses effective settings when query params are omitted', async () => {
      settingsService.getEffectiveSettings.mockResolvedValue({
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      });
      gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);

      await expect(controller.matchingEmailIds(sessionUser)).resolves.toEqual([
        'msg-1',
      ]);

      expect(gmailService.listMatchingEmailIds).toHaveBeenCalledWith(
        sessionUser.id,
        'ParcelScrubber',
        30,
      );
    });

    it('uses provided query params over settings', async () => {
      settingsService.getEffectiveSettings.mockResolvedValue({
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      });
      gmailService.listMatchingEmailIds.mockResolvedValue([]);

      await controller.matchingEmailIds(sessionUser, 'CustomLabel', '7');

      expect(gmailService.listMatchingEmailIds).toHaveBeenCalledWith(
        sessionUser.id,
        'CustomLabel',
        7,
      );
    });

    it('rejects invalid scanPeriodDays', async () => {
      settingsService.getEffectiveSettings.mockResolvedValue({
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      });

      await expect(
        controller.matchingEmailIds(sessionUser, undefined, '400'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps GmailAuthError to UnauthorizedException', async () => {
      settingsService.getEffectiveSettings.mockResolvedValue({
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      });
      gmailService.listMatchingEmailIds.mockRejectedValue(
        new GmailAuthError('re-auth required'),
      );

      await expect(
        controller.matchingEmailIds(sessionUser),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('email', () => {
    it('requires id query parameter', async () => {
      await expect(controller.email(sessionUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns message body for valid id', async () => {
      gmailService.getMessageBody.mockResolvedValue({ body: 'hello' });

      await expect(controller.email(sessionUser, 'msg-1')).resolves.toEqual({
        body: 'hello',
      });
      expect(gmailService.getMessageBody).toHaveBeenCalledWith(
        sessionUser.id,
        'msg-1',
      );
    });

    it('maps GmailAuthError to UnauthorizedException', async () => {
      gmailService.getMessageBody.mockRejectedValue(
        new GmailAuthError('re-auth required'),
      );

      await expect(
        controller.email(sessionUser, 'msg-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('authorization', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    it('returns 401 when JwtAuthGuard rejects the request', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [GmailTestController],
        providers: [
          { provide: GmailService, useValue: gmailService },
          { provide: SettingsService, useValue: settingsService },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: () => {
            throw new UnauthorizedException();
          },
        })
        .compile();

      app = module.createNestApplication();
      await app.init();

      const server = app.getHttpServer() as Server;

      await request(server).get('/test/matching-email-ids').expect(401);
      await request(server).get('/test/email?id=msg-1').expect(401);
    });
  });
});
